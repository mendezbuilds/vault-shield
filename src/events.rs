use crate::types::{AttestedResolution, InvalidationReason, PendingReason, PolicyDenialReason};
use near_sdk::env;
use near_sdk::serde::Serialize;
use near_sdk::{AccountId, NearToken};

pub const EVENT_STANDARD: &str = "ai-agent-vault";
pub const EVENT_VERSION: &str = "1.0.0";

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
struct EventLog<'a, T: Serialize> {
    standard: &'static str,
    version: &'static str,
    event: &'static str,
    data: &'a [T],
}

fn emit_event<T: Serialize>(event: &'static str, data: &T) {
    let log = EventLog {
        standard: EVENT_STANDARD,
        version: EVENT_VERSION,
        event,
        data: &[data],
    };
    if let Ok(json_str) = near_sdk::serde_json::to_string(&log) {
        env::log_str(&format!("EVENT_JSON:{}", json_str));
    }
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentPendingData<'a> {
    pub request_id: u64,
    pub agent_id: &'a AccountId,
    pub destination: &'a AccountId,
    pub amount: NearToken,
    pub origin_reason: PendingReason,
}

pub fn emit_payment_pending(
    request_id: u64,
    agent_id: &AccountId,
    destination: &AccountId,
    amount: NearToken,
    origin_reason: PendingReason,
) {
    emit_event(
        "payment_pending",
        &PaymentPendingData {
            request_id,
            agent_id,
            destination,
            amount,
            origin_reason,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentDispatchedData<'a> {
    pub request_id: u64,
    pub agent_id: &'a AccountId,
    pub destination: &'a AccountId,
    pub amount: NearToken,
}

pub fn emit_payment_dispatched(
    request_id: u64,
    agent_id: &AccountId,
    destination: &AccountId,
    amount: NearToken,
) {
    emit_event(
        "payment_dispatched",
        &PaymentDispatchedData {
            request_id,
            agent_id,
            destination,
            amount,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentPolicyDeniedData<'a> {
    pub agent_id: &'a AccountId,
    pub destination: &'a AccountId,
    pub amount: NearToken,
    pub reason: PolicyDenialReason,
}

pub fn emit_payment_policy_denied(
    agent_id: &AccountId,
    destination: &AccountId,
    amount: NearToken,
    reason: PolicyDenialReason,
) {
    emit_event(
        "payment_policy_denied",
        &PaymentPolicyDeniedData {
            agent_id,
            destination,
            amount,
            reason,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentApprovedData<'a> {
    pub request_id: u64,
    pub by: &'a AccountId,
}

pub fn emit_payment_approved(request_id: u64, by: &AccountId) {
    emit_event("payment_approved", &PaymentApprovedData { request_id, by });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentRejectedData<'a> {
    pub request_id: u64,
    pub by: &'a AccountId,
}

pub fn emit_payment_rejected(request_id: u64, by: &AccountId) {
    emit_event("payment_rejected", &PaymentRejectedData { request_id, by });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentPolicyInvalidatedData {
    pub request_id: u64,
    pub reason: InvalidationReason,
}

pub fn emit_payment_policy_invalidated(request_id: u64, reason: InvalidationReason) {
    emit_event(
        "payment_policy_invalidated",
        &PaymentPolicyInvalidatedData { request_id, reason },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentExpiredData {
    pub request_id: u64,
}

pub fn emit_payment_expired(request_id: u64) {
    emit_event("payment_expired", &PaymentExpiredData { request_id });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentExecutedData {
    pub request_id: u64,
}

pub fn emit_payment_executed(request_id: u64) {
    emit_event("payment_executed", &PaymentExecutedData { request_id });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentFailedData {
    pub request_id: u64,
}

pub fn emit_payment_failed(request_id: u64) {
    emit_event("payment_failed", &PaymentFailedData { request_id });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentReconciledData<'a> {
    pub request_id: u64,
    pub resolution: AttestedResolution,
    pub evidence_tx_hash: &'a str,
}

pub fn emit_payment_reconciled(
    request_id: u64,
    resolution: AttestedResolution,
    evidence_tx_hash: &str,
) {
    emit_event(
        "payment_reconciled",
        &PaymentReconciledData {
            request_id,
            resolution,
            evidence_tx_hash,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct CriticalDiscrepancyData<'a> {
    pub request_id: u64,
    pub outcome: &'a str,
    pub action: &'a str,
}

pub fn emit_critical_discrepancy(request_id: u64, outcome: &str, action: &str) {
    emit_event(
        "critical_discrepancy_detected",
        &CriticalDiscrepancyData {
            request_id,
            outcome,
            action,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct VaultAutoPausedData<'a> {
    pub reason: &'a str,
}

pub fn emit_vault_auto_paused(reason: &str) {
    emit_event("vault_auto_paused", &VaultAutoPausedData { reason });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct VaultPausedData<'a> {
    pub by: &'a AccountId,
}

pub fn emit_vault_paused(by: &AccountId) {
    emit_event("vault_paused", &VaultPausedData { by });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct VaultUnpausedData<'a> {
    pub by: &'a AccountId,
}

pub fn emit_vault_unpaused(by: &AccountId) {
    emit_event("vault_unpaused", &VaultUnpausedData { by });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentRegisteredData<'a> {
    pub agent_id: &'a AccountId,
}

pub fn emit_agent_registered(agent_id: &AccountId) {
    emit_event("agent_registered", &AgentRegisteredData { agent_id });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentRevokedData<'a> {
    pub agent_id: &'a AccountId,
}

pub fn emit_agent_revoked(agent_id: &AccountId) {
    emit_event("agent_revoked", &AgentRevokedData { agent_id });
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyUpdatedData {
    pub max_per_transaction: NearToken,
    pub daily_cap: NearToken,
    pub auto_approval_threshold: NearToken,
}

pub fn emit_policy_updated(
    max_per_transaction: NearToken,
    daily_cap: NearToken,
    auto_approval_threshold: NearToken,
) {
    emit_event(
        "policy_updated",
        &PolicyUpdatedData {
            max_per_transaction,
            daily_cap,
            auto_approval_threshold,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct DestinationAllowlistedData<'a> {
    pub destination: &'a AccountId,
}

pub fn emit_destination_allowlisted(destination: &AccountId) {
    emit_event(
        "destination_allowlisted",
        &DestinationAllowlistedData { destination },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct DestinationDelistedData<'a> {
    pub destination: &'a AccountId,
}

pub fn emit_destination_delisted(destination: &AccountId) {
    emit_event(
        "destination_delisted",
        &DestinationDelistedData { destination },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct OwnerWithdrawalData<'a> {
    pub amount: NearToken,
    pub destination: &'a AccountId,
}

pub fn emit_owner_withdrawal(amount: NearToken, destination: &AccountId) {
    emit_event(
        "owner_withdrawal",
        &OwnerWithdrawalData {
            amount,
            destination,
        },
    );
}

#[derive(Serialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct TombstonePrunedData<'a> {
    pub request_id: u64,
    pub evidence: &'a str,
}

pub fn emit_tombstone_pruned(request_id: u64, evidence: &str) {
    emit_event("tombstone_pruned", &TombstonePrunedData { request_id, evidence });
}
