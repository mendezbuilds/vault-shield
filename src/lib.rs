pub mod accounting;
pub mod audit;
pub mod events;
pub mod policy;
pub mod types;

use accounting::*;
use audit::{AuditBuffer, AuditEventType, CompactAuditRecord};
use events::*;
use near_sdk::near;
use near_sdk::store::LookupMap;
use near_sdk::{env, AccountId, Gas, NearToken, Promise, PromiseResult};
use policy::{SpendingPolicy, SpendingPolicyView};
use std::collections::BTreeSet;
use types::*;

#[near(contract_state)]
pub struct VaultContract {
    pub owner_id: AccountId,
    pub policy: SpendingPolicy,
    pub authorized_agents: BTreeSet<AccountId>,
    pub requests: LookupMap<u64, PaymentRequest>,
    pub pending_request_ids: Vec<u64>,
    pub reconciled_tombstones: LookupMap<u64, ReconciledTombstone>,
    pub buckets: LookupMap<u64, DailyBucket>,
    pub agent_pending_counts: LookupMap<AccountId, u64>,
    pub global_pending_count: u64,
    pub pending_reserved: NearToken,
    pub inflight_reserved: NearToken,
    pub next_request_id: u64,
    pub audit_buffer: AuditBuffer,
}

impl Default for VaultContract {
    fn default() -> Self {
        env::panic_str("Contract must be initialized with new()");
    }
}

#[near]
impl VaultContract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        max_per_transaction: NearToken,
        daily_cap: NearToken,
        auto_approval_threshold: NearToken,
        destination_allowlist: Vec<AccountId>,
    ) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        let policy = SpendingPolicy::new(
            max_per_transaction,
            daily_cap,
            auto_approval_threshold,
            destination_allowlist,
        );

        Self {
            owner_id,
            policy,
            authorized_agents: BTreeSet::new(),
            requests: LookupMap::new(b"r"),
            pending_request_ids: Vec::new(),
            reconciled_tombstones: LookupMap::new(b"t"),
            buckets: LookupMap::new(b"b"),
            agent_pending_counts: LookupMap::new(b"a"),
            global_pending_count: 0,
            pending_reserved: NearToken::from_yoctonear(0),
            inflight_reserved: NearToken::from_yoctonear(0),
            next_request_id: 1,
            audit_buffer: AuditBuffer::new(),
        }
    }

    // -------------------------------------------------------------------------
    // Administrative Operations (Owner Only)
    // -------------------------------------------------------------------------

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Owner authorization required"
        );
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.policy.set_paused(true);
        emit_vault_paused(&self.owner_id);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::VaultPaused,
            self.owner_id.clone(),
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.policy.set_paused(false);
        emit_vault_unpaused(&self.owner_id);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::VaultUnpaused,
            self.owner_id.clone(),
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn add_agent(&mut self, agent_id: AccountId) {
        self.assert_owner();
        self.authorized_agents.insert(agent_id.clone());
        emit_agent_registered(&agent_id);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::AgentRegistered,
            agent_id,
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn revoke_agent(&mut self, agent_id: AccountId) {
        self.assert_owner();
        self.authorized_agents.remove(&agent_id);
        emit_agent_revoked(&agent_id);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::AgentRevoked,
            agent_id,
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn set_policy(
        &mut self,
        max_per_transaction: NearToken,
        daily_cap: NearToken,
        auto_approval_threshold: NearToken,
    ) {
        self.assert_owner();
        self.policy
            .update_limits(max_per_transaction, daily_cap, auto_approval_threshold);
        emit_policy_updated(max_per_transaction, daily_cap, auto_approval_threshold);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::PolicyUpdated,
            self.owner_id.clone(),
            max_per_transaction,
            0,
        );
    }

    pub fn add_destination(&mut self, destination: AccountId) {
        self.assert_owner();
        self.policy.add_destination(destination.clone());
        emit_destination_allowlisted(&destination);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::DestinationAllowlisted,
            destination,
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn remove_destination(&mut self, destination: AccountId) {
        self.assert_owner();
        self.policy.remove_destination(&destination);
        emit_destination_delisted(&destination);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::DestinationDelisted,
            destination,
            NearToken::from_yoctonear(0),
            0,
        );
    }

    pub fn withdraw(&mut self, amount: NearToken, destination: AccountId) -> Promise {
        self.assert_owner();
        let available = self.get_available_liquid_balance();
        assert!(
            amount.as_yoctonear() <= available.as_yoctonear(),
            "Withdrawal exceeds available liquid balance; pending reservations and storage reserve are protected"
        );

        emit_owner_withdrawal(amount, &destination);
        self.audit_buffer.append(
            env::block_timestamp(),
            0,
            AuditEventType::OwnerWithdrawal,
            destination.clone(),
            amount,
            0,
        );

        Promise::new(destination).transfer(amount)
    }

    // -------------------------------------------------------------------------
    // Payment Request Submission (Agent / Owner)
    // -------------------------------------------------------------------------

    pub fn request_payment(
        &mut self,
        destination: AccountId,
        amount: NearToken,
        reason: String,
        ttl_nanos: Option<u64>,
    ) -> ExecutionResult {
        let caller = env::predecessor_account_id();
        assert!(
            caller == self.owner_id || self.authorized_agents.contains(&caller),
            "Unauthorized caller: predecessor is neither owner nor authorized agent"
        );
        assert!(amount.as_yoctonear() > 0, "Amount must be greater than zero");

        let effective_ttl = ttl_nanos.unwrap_or(DEFAULT_TTL_NANOS);
        let now = env::block_timestamp();
        let current_bucket_idx = daily_bucket_index(now);

        // TTL bounds check
        if effective_ttl < MIN_TTL_NANOS || effective_ttl > MAX_TTL_NANOS {
            let denial_reason = PolicyDenialReason::InvalidTtl;
            emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
            self.audit_buffer.append(
                now,
                0,
                AuditEventType::PaymentPolicyDenied,
                caller,
                amount,
                denial_reason as u8,
            );
            return ExecutionResult::Denied {
                reason: denial_reason,
            };
        }

        // Hard policy checks
        if self.policy.is_paused {
            let denial_reason = PolicyDenialReason::VaultPaused;
            emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
            self.audit_buffer.append(
                now,
                0,
                AuditEventType::PaymentPolicyDenied,
                caller,
                amount,
                denial_reason as u8,
            );
            return ExecutionResult::Denied {
                reason: denial_reason,
            };
        }

        if amount.as_yoctonear() > self.policy.max_per_transaction.as_yoctonear() {
            let denial_reason = PolicyDenialReason::ExceedsPerTransactionCap;
            emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
            self.audit_buffer.append(
                now,
                0,
                AuditEventType::PaymentPolicyDenied,
                caller,
                amount,
                denial_reason as u8,
            );
            return ExecutionResult::Denied {
                reason: denial_reason,
            };
        }

        let mut current_bucket = self
            .buckets
            .get(&current_bucket_idx)
            .cloned()
            .unwrap_or_default();

        let total_commitment = current_bucket
            .spent
            .as_yoctonear()
            .checked_add(current_bucket.reserved.as_yoctonear())
            .and_then(|sum| sum.checked_add(amount.as_yoctonear()))
            .expect("Daily commitment calculation overflow");

        if total_commitment > self.policy.daily_cap.as_yoctonear() {
            let denial_reason = PolicyDenialReason::ExceedsDailyCap;
            emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
            self.audit_buffer.append(
                now,
                0,
                AuditEventType::PaymentPolicyDenied,
                caller,
                amount,
                denial_reason as u8,
            );
            return ExecutionResult::Denied {
                reason: denial_reason,
            };
        }

        let liquid_balance = self.get_available_liquid_balance();
        if amount.as_yoctonear() > liquid_balance.as_yoctonear() {
            let denial_reason = PolicyDenialReason::InsufficientLiquidBalance;
            emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
            self.audit_buffer.append(
                now,
                0,
                AuditEventType::PaymentPolicyDenied,
                caller,
                amount,
                denial_reason as u8,
            );
            return ExecutionResult::Denied {
                reason: denial_reason,
            };
        }

        // Routing evaluation
        let dest_allowlisted = self.policy.is_destination_allowlisted(&destination);
        let below_threshold =
            amount.as_yoctonear() <= self.policy.auto_approval_threshold.as_yoctonear();

        if dest_allowlisted && below_threshold {
            // Immediate InFlight Dispatch
            let request_id = self.next_request_id;
            self.next_request_id = self
                .next_request_id
                .checked_add(1)
                .expect("Request ID overflow");

            current_bucket.reserved = NearToken::from_yoctonear(
                current_bucket
                    .reserved
                    .as_yoctonear()
                    .checked_add(amount.as_yoctonear())
                    .expect("Bucket reserved overflow"),
            );
            current_bucket.last_updated_at = now;
            self.buckets.insert(current_bucket_idx, current_bucket);

            self.inflight_reserved = NearToken::from_yoctonear(
                self.inflight_reserved
                    .as_yoctonear()
                    .checked_add(amount.as_yoctonear())
                    .expect("Inflight reserved overflow"),
            );

            let request = PaymentRequest {
                id: request_id,
                agent_id: caller.clone(),
                destination: destination.clone(),
                amount,
                reason,
                created_at: now,
                created_bucket: current_bucket_idx,
                ttl_nanos: effective_ttl,
                status: RequestStatus::InFlight,
                origin_reason: PendingReason::None,
                dispatched_at: Some(now),
            };
            self.requests.insert(request_id, request);

            emit_payment_dispatched(request_id, &caller, &destination, amount);
            self.audit_buffer.append(
                now,
                request_id,
                AuditEventType::PaymentDispatched,
                caller,
                amount,
                0,
            );

            let _ = Promise::new(destination)
                .transfer(amount)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(15))
                        .on_transfer_complete(request_id),
                );

            ExecutionResult::Dispatched { request_id }
        } else {
            // Admission control for Pending Queue
            if self.global_pending_count >= MAX_GLOBAL_PENDING {
                let denial_reason = PolicyDenialReason::GlobalQueueLimitExceeded;
                emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
                self.audit_buffer.append(
                    now,
                    0,
                    AuditEventType::PaymentPolicyDenied,
                    caller,
                    amount,
                    denial_reason as u8,
                );
                return ExecutionResult::Denied {
                    reason: denial_reason,
                };
            }

            let agent_count = self.agent_pending_counts.get(&caller).copied().unwrap_or(0);
            if agent_count >= MAX_AGENT_PENDING {
                let denial_reason = PolicyDenialReason::AgentQueueLimitExceeded;
                emit_payment_policy_denied(&caller, &destination, amount, denial_reason);
                self.audit_buffer.append(
                    now,
                    0,
                    AuditEventType::PaymentPolicyDenied,
                    caller,
                    amount,
                    denial_reason as u8,
                );
                return ExecutionResult::Denied {
                    reason: denial_reason,
                };
            }

            let origin_reason = match (!dest_allowlisted, !below_threshold) {
                (true, true) => PendingReason::AboveThresholdAndNewDestination,
                (true, false) => PendingReason::NewDestinationOnly,
                (false, true) => PendingReason::AboveThresholdOnly,
                (false, false) => PendingReason::None,
            };

            let request_id = self.next_request_id;
            self.next_request_id = self
                .next_request_id
                .checked_add(1)
                .expect("Request ID overflow");

            current_bucket.reserved = NearToken::from_yoctonear(
                current_bucket
                    .reserved
                    .as_yoctonear()
                    .checked_add(amount.as_yoctonear())
                    .expect("Bucket reserved overflow"),
            );
            current_bucket.last_updated_at = now;
            self.buckets.insert(current_bucket_idx, current_bucket);

            self.pending_reserved = NearToken::from_yoctonear(
                self.pending_reserved
                    .as_yoctonear()
                    .checked_add(amount.as_yoctonear())
                    .expect("Pending reserved overflow"),
            );

            self.global_pending_count = self
                .global_pending_count
                .checked_add(1)
                .expect("Pending count overflow");
            self.agent_pending_counts
                .insert(caller.clone(), agent_count.checked_add(1).expect("Overflow"));
            self.pending_request_ids.push(request_id);

            let request = PaymentRequest {
                id: request_id,
                agent_id: caller.clone(),
                destination: destination.clone(),
                amount,
                reason,
                created_at: now,
                created_bucket: current_bucket_idx,
                ttl_nanos: effective_ttl,
                status: RequestStatus::Pending,
                origin_reason,
                dispatched_at: None,
            };
            self.requests.insert(request_id, request);

            emit_payment_pending(request_id, &caller, &destination, amount, origin_reason);
            self.audit_buffer.append(
                now,
                request_id,
                AuditEventType::PaymentPending,
                caller,
                amount,
                origin_reason as u8,
            );

            ExecutionResult::Pending {
                request_id,
                origin_reason,
            }
        }
    }

    // -------------------------------------------------------------------------
    // Approval and Rejection (Owner Only)
    // -------------------------------------------------------------------------

    pub fn approve_request(&mut self, request_id: u64) -> ApprovalResult {
        self.assert_owner();
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("Request not found");
        assert_eq!(request.status, RequestStatus::Pending, "Request not pending");

        let now = env::block_timestamp();
        assert!(
            now < request.created_at.saturating_add(request.ttl_nanos),
            "Request has expired; cannot approve"
        );

        let mut original_bucket = self
            .buckets
            .get(&request.created_bucket)
            .cloned()
            .unwrap_or_default();

        // Approval-time policy revalidation
        let mut invalidation_reason: Option<InvalidationReason> = None;

        if self.policy.is_paused {
            invalidation_reason = Some(InvalidationReason::VaultPaused);
        } else if !self.authorized_agents.contains(&request.agent_id)
            && request.agent_id != self.owner_id
        {
            invalidation_reason = Some(InvalidationReason::AgentRevoked);
        } else if request.amount.as_yoctonear() > self.policy.max_per_transaction.as_yoctonear() {
            invalidation_reason = Some(InvalidationReason::ExceedsPerTransactionCap);
        } else {
            let total_bucket_commitment = original_bucket
                .spent
                .as_yoctonear()
                .checked_add(original_bucket.reserved.as_yoctonear())
                .expect("Overflow");
            if total_bucket_commitment > self.policy.daily_cap.as_yoctonear() {
                invalidation_reason = Some(InvalidationReason::ExceedsDailyCap);
            } else {
                let storage_reserve = calculate_storage_reserve_requirement(
                    env::storage_usage(),
                    env::storage_byte_cost().as_yoctonear(),
                );
                let physical_liquid = env::account_balance()
                    .as_yoctonear()
                    .saturating_sub(storage_reserve);
                if physical_liquid < request.amount.as_yoctonear() {
                    invalidation_reason = Some(InvalidationReason::InsufficientLiquidBalance);
                } else if request.origin_reason == PendingReason::AboveThresholdOnly
                    && !self.policy.is_destination_allowlisted(&request.destination)
                {
                    invalidation_reason = Some(InvalidationReason::DestinationDelisted);
                }
            }
        }

        if let Some(reason) = invalidation_reason {
            // Revalidation failed: Reject & release reservation
            request.status = RequestStatus::Rejected;
            self.requests.insert(request_id, request.clone());

            self.pending_reserved = NearToken::from_yoctonear(
                self.pending_reserved
                    .as_yoctonear()
                    .checked_sub(request.amount.as_yoctonear())
                    .expect("Pending underflow"),
            );

            original_bucket.reserved = NearToken::from_yoctonear(
                original_bucket
                    .reserved
                    .as_yoctonear()
                    .checked_sub(request.amount.as_yoctonear())
                    .expect("Bucket reserved underflow"),
            );
            original_bucket.last_updated_at = now;
            self.buckets.insert(request.created_bucket, original_bucket);

            self.global_pending_count = self
                .global_pending_count
                .checked_sub(1)
                .expect("Underflow");
            self.decrement_agent_pending(&request.agent_id);
            self.pending_request_ids.retain(|&id| id != request_id);

            emit_payment_policy_invalidated(request_id, reason);
            emit_payment_rejected(request_id, &self.owner_id);
            self.audit_buffer.append(
                now,
                request_id,
                AuditEventType::PaymentPolicyInvalidated,
                request.agent_id.clone(),
                request.amount,
                reason as u8,
            );

            ApprovalResult::Invalidated { reason }
        } else {
            // Revalidation passed: Shift reservation Pending -> InFlight & dispatch
            request.status = RequestStatus::InFlight;
            request.dispatched_at = Some(now);
            self.requests.insert(request_id, request.clone());

            self.pending_reserved = NearToken::from_yoctonear(
                self.pending_reserved
                    .as_yoctonear()
                    .checked_sub(request.amount.as_yoctonear())
                    .expect("Pending underflow"),
            );
            self.inflight_reserved = NearToken::from_yoctonear(
                self.inflight_reserved
                    .as_yoctonear()
                    .checked_add(request.amount.as_yoctonear())
                    .expect("Inflight overflow"),
            );

            self.global_pending_count = self
                .global_pending_count
                .checked_sub(1)
                .expect("Underflow");
            self.decrement_agent_pending(&request.agent_id);
            self.pending_request_ids.retain(|&id| id != request_id);

            emit_payment_approved(request_id, &self.owner_id);
            emit_payment_dispatched(
                request_id,
                &request.agent_id,
                &request.destination,
                request.amount,
            );
            self.audit_buffer.append(
                now,
                request_id,
                AuditEventType::PaymentApproved,
                self.owner_id.clone(),
                request.amount,
                0,
            );

            let _ = Promise::new(request.destination)
                .transfer(request.amount)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(15))
                        .on_transfer_complete(request_id),
                );

            ApprovalResult::Dispatched { request_id }
        }
    }

    pub fn reject_request(&mut self, request_id: u64) {
        self.assert_owner();
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("Request not found");
        assert_eq!(request.status, RequestStatus::Pending, "Request not pending");

        let now = env::block_timestamp();
        request.status = RequestStatus::Rejected;
        self.requests.insert(request_id, request.clone());

        self.pending_reserved = NearToken::from_yoctonear(
            self.pending_reserved
                .as_yoctonear()
                .checked_sub(request.amount.as_yoctonear())
                .expect("Pending underflow"),
        );

        let mut bucket = self
            .buckets
            .get(&request.created_bucket)
            .cloned()
            .unwrap_or_default();
        bucket.reserved = NearToken::from_yoctonear(
            bucket
                .reserved
                .as_yoctonear()
                .checked_sub(request.amount.as_yoctonear())
                .expect("Bucket underflow"),
        );
        bucket.last_updated_at = now;
        self.buckets.insert(request.created_bucket, bucket);

        self.global_pending_count = self
            .global_pending_count
            .checked_sub(1)
            .expect("Underflow");
        self.decrement_agent_pending(&request.agent_id);
        self.pending_request_ids.retain(|&id| id != request_id);

        emit_payment_rejected(request_id, &self.owner_id);
        self.audit_buffer.append(
            now,
            request_id,
            AuditEventType::PaymentRejected,
            self.owner_id.clone(),
            request.amount,
            0,
        );
    }

    // -------------------------------------------------------------------------
    // Permissionless Expiry
    // -------------------------------------------------------------------------

    pub fn expire_request(&mut self, request_id: u64) {
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("Request not found");
        assert_eq!(request.status, RequestStatus::Pending, "Request not pending");

        let now = env::block_timestamp();
        assert!(
            now >= request.created_at.saturating_add(request.ttl_nanos),
            "Request has not expired yet"
        );

        request.status = RequestStatus::Expired;
        self.requests.insert(request_id, request.clone());

        self.pending_reserved = NearToken::from_yoctonear(
            self.pending_reserved
                .as_yoctonear()
                .checked_sub(request.amount.as_yoctonear())
                .expect("Pending underflow"),
        );

        let mut bucket = self
            .buckets
            .get(&request.created_bucket)
            .cloned()
            .unwrap_or_default();
        bucket.reserved = NearToken::from_yoctonear(
            bucket
                .reserved
                .as_yoctonear()
                .checked_sub(request.amount.as_yoctonear())
                .expect("Bucket underflow"),
        );
        bucket.last_updated_at = now;
        self.buckets.insert(request.created_bucket, bucket);

        self.global_pending_count = self
            .global_pending_count
            .checked_sub(1)
            .expect("Underflow");
        self.decrement_agent_pending(&request.agent_id);
        self.pending_request_ids.retain(|&id| id != request_id);

        emit_payment_expired(request_id);
        self.audit_buffer.append(
            now,
            request_id,
            AuditEventType::PaymentExpired,
            env::predecessor_account_id(),
            request.amount,
            0,
        );
    }

    // -------------------------------------------------------------------------
    // Private Callback for Async Transfer Promise
    // -------------------------------------------------------------------------

    #[private]
    pub fn on_transfer_complete(&mut self, request_id: u64) -> bool {
        let now = env::block_timestamp();
        #[allow(deprecated)]
        let result = env::promise_result(0);

        if let Some(mut request) = self.requests.get(&request_id).cloned() {
            if request.status == RequestStatus::InFlight {
                match result {
                    PromiseResult::Successful(_) => {
                        request.status = RequestStatus::Executed;
                        self.requests.insert(request_id, request.clone());

                        self.inflight_reserved = NearToken::from_yoctonear(
                            self.inflight_reserved
                                .as_yoctonear()
                                .checked_sub(request.amount.as_yoctonear())
                                .expect("Inflight underflow"),
                        );

                        let mut bucket = self
                            .buckets
                            .get(&request.created_bucket)
                            .cloned()
                            .unwrap_or_default();
                        bucket.reserved = NearToken::from_yoctonear(
                            bucket
                                .reserved
                                .as_yoctonear()
                                .checked_sub(request.amount.as_yoctonear())
                                .expect("Bucket reserved underflow"),
                        );
                        bucket.spent = NearToken::from_yoctonear(
                            bucket
                                .spent
                                .as_yoctonear()
                                .checked_add(request.amount.as_yoctonear())
                                .expect("Bucket spent overflow"),
                        );
                        bucket.last_updated_at = now;
                        self.buckets.insert(request.created_bucket, bucket);

                        emit_payment_executed(request_id);
                        self.audit_buffer.append(
                            now,
                            request_id,
                            AuditEventType::PaymentExecuted,
                            request.destination,
                            request.amount,
                            0,
                        );
                        return true;
                    }
                    PromiseResult::Failed => {
                        request.status = RequestStatus::Failed;
                        self.requests.insert(request_id, request.clone());

                        self.inflight_reserved = NearToken::from_yoctonear(
                            self.inflight_reserved
                                .as_yoctonear()
                                .checked_sub(request.amount.as_yoctonear())
                                .expect("Inflight underflow"),
                        );

                        let mut bucket = self
                            .buckets
                            .get(&request.created_bucket)
                            .cloned()
                            .unwrap_or_default();
                        bucket.reserved = NearToken::from_yoctonear(
                            bucket
                                .reserved
                                .as_yoctonear()
                                .checked_sub(request.amount.as_yoctonear())
                                .expect("Bucket reserved underflow"),
                        );
                        bucket.last_updated_at = now;
                        self.buckets.insert(request.created_bucket, bucket);

                        emit_payment_failed(request_id);
                        self.audit_buffer.append(
                            now,
                            request_id,
                            AuditEventType::PaymentFailed,
                            request.destination,
                            request.amount,
                            0,
                        );
                        return false;
                    }
                }
            }
        }

        // Check if this request was previously reconciled (Late Callback Scenario)
        if let Some(tombstone) = self.reconciled_tombstones.get(&request_id).cloned() {
            match (tombstone.attested_resolution, result) {
                (AttestedResolution::Failed, PromiseResult::Successful(_)) => {
                    // Late Success after ReconcileFailed: CRITICAL DISCREPANCY!
                    let mut bucket = self
                        .buckets
                        .get(&tombstone.original_bucket)
                        .cloned()
                        .unwrap_or_default();
                    bucket.spent = NearToken::from_yoctonear(
                        bucket
                            .spent
                            .as_yoctonear()
                            .checked_add(tombstone.amount.as_yoctonear())
                            .expect("Bucket spent overflow"),
                    );
                    bucket.last_updated_at = now;
                    self.buckets.insert(tombstone.original_bucket, bucket);

                    self.policy.set_paused(true);
                    emit_critical_discrepancy(
                        request_id,
                        "UnexpectedTransferSuccess",
                        "VaultAutoPaused",
                    );
                    emit_vault_auto_paused("ReconciliationDiscrepancy");

                    self.audit_buffer.append(
                        now,
                        request_id,
                        AuditEventType::CriticalDiscrepancy,
                        env::current_account_id(),
                        tombstone.amount,
                        1,
                    );

                    self.reconciled_tombstones.remove(&request_id);
                    return true;
                }
                (AttestedResolution::Executed, PromiseResult::Failed) => {
                    // Late Fail after ReconcileExecuted: CRITICAL DISCREPANCY!
                    self.policy.set_paused(true);
                    emit_critical_discrepancy(
                        request_id,
                        "UnexpectedTransferRefund",
                        "VaultAutoPaused",
                    );
                    emit_vault_auto_paused("ReconciliationDiscrepancy");

                    self.audit_buffer.append(
                        now,
                        request_id,
                        AuditEventType::CriticalDiscrepancy,
                        env::current_account_id(),
                        tombstone.amount,
                        2,
                    );

                    self.reconciled_tombstones.remove(&request_id);
                    return false;
                }
                _ => {
                    // Consistent outcome: consume tombstone
                    self.reconciled_tombstones.remove(&request_id);
                    return true;
                }
            }
        }

        false
    }

    // -------------------------------------------------------------------------
    // Reconciliation & Tombstone Management (Owner Only)
    // -------------------------------------------------------------------------

    pub fn reconcile_stuck_request(
        &mut self,
        request_id: u64,
        attested_resolution: AttestedResolution,
        evidence_tx_hash: String,
    ) {
        self.assert_owner();
        let mut request = self
            .requests
            .get(&request_id)
            .cloned()
            .expect("Request not found");
        assert_eq!(
            request.status,
            RequestStatus::InFlight,
            "Only InFlight requests can be reconciled"
        );

        let now = env::block_timestamp();
        let dispatched_at = request
            .dispatched_at
            .expect("InFlight request missing dispatched_at");
        assert!(
            now >= dispatched_at.saturating_add(RECONCILIATION_TIMEOUT_NANOS),
            "Reconciliation timeout not reached"
        );

        match attested_resolution {
            AttestedResolution::Executed => {
                request.status = RequestStatus::ReconciledExecuted;
                self.inflight_reserved = NearToken::from_yoctonear(
                    self.inflight_reserved
                        .as_yoctonear()
                        .checked_sub(request.amount.as_yoctonear())
                        .expect("Underflow"),
                );

                let mut bucket = self
                    .buckets
                    .get(&request.created_bucket)
                    .cloned()
                    .unwrap_or_default();
                bucket.reserved = NearToken::from_yoctonear(
                    bucket
                        .reserved
                        .as_yoctonear()
                        .checked_sub(request.amount.as_yoctonear())
                        .expect("Underflow"),
                );
                bucket.spent = NearToken::from_yoctonear(
                    bucket
                        .spent
                        .as_yoctonear()
                        .checked_add(request.amount.as_yoctonear())
                        .expect("Overflow"),
                );
                bucket.last_updated_at = now;
                self.buckets.insert(request.created_bucket, bucket);
            }
            AttestedResolution::Failed => {
                request.status = RequestStatus::ReconciledFailed;
                self.inflight_reserved = NearToken::from_yoctonear(
                    self.inflight_reserved
                        .as_yoctonear()
                        .checked_sub(request.amount.as_yoctonear())
                        .expect("Underflow"),
                );

                let mut bucket = self
                    .buckets
                    .get(&request.created_bucket)
                    .cloned()
                    .unwrap_or_default();
                bucket.reserved = NearToken::from_yoctonear(
                    bucket
                        .reserved
                        .as_yoctonear()
                        .checked_sub(request.amount.as_yoctonear())
                        .expect("Underflow"),
                );
                bucket.last_updated_at = now;
                self.buckets.insert(request.created_bucket, bucket);
            }
        }

        let tombstone = ReconciledTombstone {
            original_bucket: request.created_bucket,
            amount: request.amount,
            attested_resolution,
            reconciled_at: now,
            evidence_tx_hash: evidence_tx_hash.clone(),
        };
        self.reconciled_tombstones.insert(request_id, tombstone);

        // Remove from active requests map, retaining the tombstone
        self.requests.remove(&request_id);

        emit_payment_reconciled(request_id, attested_resolution, &evidence_tx_hash);
        self.audit_buffer.append(
            now,
            request_id,
            AuditEventType::PaymentReconciled,
            self.owner_id.clone(),
            request.amount,
            attested_resolution as u8,
        );
    }

    pub fn prune_reconciled_tombstone(
        &mut self,
        request_id: u64,
        verification_evidence: String,
    ) {
        self.assert_owner();
        let tombstone = self
            .reconciled_tombstones
            .get(&request_id)
            .cloned()
            .expect("Tombstone not found");
        self.reconciled_tombstones.remove(&request_id);

        let now = env::block_timestamp();
        emit_tombstone_pruned(request_id, &verification_evidence);
        self.audit_buffer.append(
            now,
            request_id,
            AuditEventType::TombstonePruned,
            self.owner_id.clone(),
            tombstone.amount,
            0,
        );
    }

    // -------------------------------------------------------------------------
    // Helper & Internal Methods
    // -------------------------------------------------------------------------

    fn decrement_agent_pending(&mut self, agent_id: &AccountId) {
        if let Some(count) = self.agent_pending_counts.get(agent_id).copied() {
            if count <= 1 {
                self.agent_pending_counts.remove(agent_id);
            } else {
                self.agent_pending_counts.insert(agent_id.clone(), count - 1);
            }
        }
    }

    // -------------------------------------------------------------------------
    // View Methods
    // -------------------------------------------------------------------------

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.policy.is_paused
    }

    pub fn is_agent_authorized(&self, agent_id: AccountId) -> bool {
        self.authorized_agents.contains(&agent_id)
    }

    pub fn get_policy(&self) -> SpendingPolicyView {
        self.policy.to_view()
    }

    pub fn get_storage_reserve_requirement(&self) -> NearToken {
        let cost_yocto = calculate_storage_reserve_requirement(
            env::storage_usage(),
            env::storage_byte_cost().as_yoctonear(),
        );
        NearToken::from_yoctonear(cost_yocto)
    }

    pub fn get_protected_balance(&self) -> NearToken {
        let storage_reserve = self.get_storage_reserve_requirement();
        let protected =
            calculate_protected_balance(env::account_balance().as_yoctonear(), storage_reserve.as_yoctonear());
        NearToken::from_yoctonear(protected)
    }

    pub fn get_available_liquid_balance(&self) -> NearToken {
        let protected = self.get_protected_balance();
        let available = calculate_available_liquid_balance(
            protected.as_yoctonear(),
            self.pending_reserved.as_yoctonear(),
        );
        NearToken::from_yoctonear(available)
    }

    pub fn get_pending_reserved(&self) -> NearToken {
        self.pending_reserved
    }

    pub fn get_inflight_reserved(&self) -> NearToken {
        self.inflight_reserved
    }

    pub fn get_global_pending_count(&self) -> u64 {
        self.global_pending_count
    }

    pub fn get_agent_pending_count(&self, agent_id: AccountId) -> u64 {
        self.agent_pending_counts.get(&agent_id).copied().unwrap_or(0)
    }

    pub fn get_daily_bucket(&self, day_index: Option<u64>) -> DailyBucketView {
        let idx = day_index.unwrap_or_else(|| daily_bucket_index(env::block_timestamp()));
        let bucket = self.buckets.get(&idx).cloned().unwrap_or_default();
        DailyBucketView {
            bucket_index: idx,
            spent: bucket.spent,
            reserved: bucket.reserved,
            last_updated_at: bucket.last_updated_at,
        }
    }

    pub fn get_request(&self, request_id: u64) -> Option<PaymentRequestView> {
        self.requests.get(&request_id).map(|r| r.into())
    }

    pub fn get_pending_requests(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<PaymentRequestView> {
        let start = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(32) as usize;
        self.pending_request_ids
            .iter()
            .skip(start)
            .take(lim)
            .filter_map(|&id| self.requests.get(&id).map(|r| r.into()))
            .collect()
    }

    pub fn get_tombstone(&self, request_id: u64) -> Option<ReconciledTombstoneView> {
        self.reconciled_tombstones.get(&request_id).map(|t| ReconciledTombstoneView {
            request_id,
            original_bucket: t.original_bucket,
            amount: t.amount,
            attested_resolution: t.attested_resolution,
            reconciled_at: t.reconciled_at,
            evidence_tx_hash: t.evidence_tx_hash.clone(),
        })
    }

    pub fn get_audit_records(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<CompactAuditRecord> {
        self.audit_buffer.get_recent_records(from_index, limit)
    }
}
