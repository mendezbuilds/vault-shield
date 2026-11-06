use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};
use vault_contract::types::*;
use vault_contract::VaultContract;

fn owner() -> AccountId {
    "owner.near".parse().unwrap()
}
fn agent1() -> AccountId {
    "agent1.near".parse().unwrap()
}
fn agent2() -> AccountId {
    "agent2.near".parse().unwrap()
}
fn vault() -> AccountId {
    "vault.near".parse().unwrap()
}
fn merchant() -> AccountId {
    "merchant.near".parse().unwrap()
}
fn new_dest() -> AccountId {
    "new_dest.near".parse().unwrap()
}

fn setup_vault() -> (VaultContract, VMContextBuilder) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(vault())
        .predecessor_account_id(owner())
        .signer_account_id(owner())
        .block_timestamp(1_000_000_000_000) // Day 0
        .account_balance(NearToken::from_near(100))
        .storage_usage(500);
    testing_env!(ctx.build());

    let mut contract = VaultContract::new(
        owner(),
        NearToken::from_near(10), // max_per_tx: 10 NEAR
        NearToken::from_near(25), // daily_cap: 25 NEAR
        NearToken::from_near(5),  // threshold: 5 NEAR
        vec![merchant()],
    );
    contract.add_agent(agent1());
    contract.add_agent(agent2());
    (contract, ctx)
}

// -----------------------------------------------------------------------------
// Security Promise 1: Agent cannot transfer funds directly / authorize own payment
// -----------------------------------------------------------------------------
#[test]
fn test_sp01_agent_cannot_authorize_payment() {
    let (mut contract, mut ctx) = setup_vault();

    // 1. Agent submits a request above auto-approval threshold -> enters Pending
    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(8),
        "invoice_01".to_string(),
        None,
    );
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected request to enter Pending"),
    };

    // 2. Agent attempts to call approve_request -> Must Panic (unauthorized)
    let approve_attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.approve_request(req_id);
    }));
    assert!(approve_attempt.is_err(), "Agent must not be able to call approve_request");
}

// -----------------------------------------------------------------------------
// Security Promise 2: Per-transaction cap rejects oversized requests
// -----------------------------------------------------------------------------
#[test]
fn test_sp02_per_transaction_cap_rejection() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Request 12 NEAR > 10 NEAR max_per_tx
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(12),
        "oversized".to_string(),
        None,
    );

    assert_eq!(
        res,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::ExceedsPerTransactionCap
        }
    );
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_inflight_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_global_pending_count(), 0);
}

// -----------------------------------------------------------------------------
// Security Promise 3: Split requests cannot bypass daily cap
// -----------------------------------------------------------------------------
#[test]
fn test_sp03_split_requests_cannot_bypass_daily_cap() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Daily cap is 25 NEAR. Threshold is 5 NEAR.
    // Agent sends 5 requests of 5 NEAR (immediate dispatch): 5 * 5 = 25 NEAR
    for i in 1..=5 {
        let res = contract.request_payment(
            merchant(),
            NearToken::from_near(5),
            format!("batch_{}", i),
            None,
        );
        match res {
            ExecutionResult::Dispatched { .. } => {}
            _ => panic!("Expected request {} to be dispatched", i),
        }
    }

    let bucket = contract.get_daily_bucket(None);
    assert_eq!(bucket.reserved, NearToken::from_near(25));

    // 6th request of 1 yoctoNEAR must be denied because daily cap (25 NEAR) is saturated
    let res = contract.request_payment(
        merchant(),
        NearToken::from_yoctonear(1),
        "split_bypass".to_string(),
        None,
    );
    assert_eq!(
        res,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::ExceedsDailyCap
        }
    );
}

// -----------------------------------------------------------------------------
// Security Promise 4: New destinations enter Pending (one-off authorization)
// -----------------------------------------------------------------------------
#[test]
fn test_sp04_new_destinations_require_approval() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // 3 NEAR <= 5 NEAR threshold, but destination is unlisted
    let res = contract.request_payment(
        new_dest(),
        NearToken::from_near(3),
        "new vendor".to_string(),
        None,
    );

    let req_id = match res {
        ExecutionResult::Pending { request_id, origin_reason } => {
            assert_eq!(origin_reason, PendingReason::NewDestinationOnly);
            request_id
        }
        _ => panic!("Expected Pending state for unlisted destination"),
    };

    // Owner approves this specific request
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    let app_res = contract.approve_request(req_id);
    assert!(matches!(app_res, ApprovalResult::Dispatched { .. }));

    // Verify destination is NOT permanently allowlisted!
    let policy = contract.get_policy();
    assert!(!policy.destination_allowlist.contains(&new_dest()));

    // A second request to same destination must STILL enter Pending!
    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let res2 = contract.request_payment(
        new_dest(),
        NearToken::from_near(3),
        "second new vendor payment".to_string(),
        None,
    );
    assert!(matches!(res2, ExecutionResult::Pending { .. }));
}

// -----------------------------------------------------------------------------
// Security Promise 5: Above-threshold requests enter Pending
// -----------------------------------------------------------------------------
#[test]
fn test_sp05_above_threshold_enters_pending() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Destination is allowlisted, but amount (8 NEAR) > 5 NEAR threshold
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(8),
        "large payment".to_string(),
        None,
    );

    match res {
        ExecutionResult::Pending { origin_reason, .. } => {
            assert_eq!(origin_reason, PendingReason::AboveThresholdOnly);
        }
        _ => panic!("Expected AboveThresholdOnly Pending state"),
    }
}

// -----------------------------------------------------------------------------
// Security Promise 6: Paused vault rejects requests
// -----------------------------------------------------------------------------
#[test]
fn test_sp06_paused_vault_rejects_requests() {
    let (mut contract, mut ctx) = setup_vault();

    // Owner pauses vault
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    contract.pause();
    assert!(contract.is_paused());

    // Agent attempts payment -> Policy Denied
    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(2),
        "payment".to_string(),
        None,
    );
    assert_eq!(
        res,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::VaultPaused
        }
    );
}

// -----------------------------------------------------------------------------
// Security Promise 7: Revoked agents cannot submit or execute pending requests
// -----------------------------------------------------------------------------
#[test]
fn test_sp07_revoked_agents_enforcement() {
    let (mut contract, mut ctx) = setup_vault();

    // Agent 1 submits pending request
    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(8),
        "pending payment".to_string(),
        None,
    );
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected Pending"),
    };

    // Owner revokes Agent 1
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    contract.revoke_agent(agent1());
    assert!(!contract.is_agent_authorized(agent1()));

    // 1. Revoked agent attempts new submission -> Panics (unauthorized caller)
    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let new_sub = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.request_payment(merchant(), NearToken::from_near(1), "test".to_string(), None);
    }));
    assert!(new_sub.is_err(), "Revoked agent cannot submit new requests");

    // 2. Owner attempts to approve pending request submitted by revoked agent
    // -> Revalidation fails with AgentRevoked -> Transitions to Rejected
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    let app_res = contract.approve_request(req_id);
    assert_eq!(
        app_res,
        ApprovalResult::Invalidated {
            reason: InvalidationReason::AgentRevoked
        }
    );

    let req = contract.get_request(req_id).unwrap();
    assert_eq!(req.status, RequestStatus::Rejected);
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
}

// -----------------------------------------------------------------------------
// Security Promise 8: Duplicate execution and expired approval prevented
// -----------------------------------------------------------------------------
#[test]
fn test_sp08_duplicate_execution_and_expired_approval_prevented() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(8),
        "request".to_string(),
        Some(300 * 1_000_000_000), // 5 min TTL
    );
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected Pending"),
    };

    // 1. Advance time past TTL (5 min = 300s)
    ctx.block_timestamp(1_000_000_000_000 + 400 * 1_000_000_000);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    // Expired approval must panic
    let expired_approve = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.approve_request(req_id);
    }));
    assert!(expired_approve.is_err(), "Cannot approve expired request");

    // Expire the request cleanly
    contract.expire_request(req_id);
    assert_eq!(contract.get_request(req_id).unwrap().status, RequestStatus::Expired);

    // Duplicate approval attempt after expiry must panic
    let dup_approve = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.approve_request(req_id);
    }));
    assert!(dup_approve.is_err(), "Cannot approve already expired request");
}

// -----------------------------------------------------------------------------
// Security Promise 9: Non-owner administrative actions rejected
// -----------------------------------------------------------------------------
#[test]
fn test_sp09_non_owner_admin_actions_rejected() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    macro_rules! assert_admin_panic {
        ($expr:expr) => {
            let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| $expr));
            assert!(res.is_err(), "Non-owner call must panic");
        };
    }

    assert_admin_panic!(contract.pause());
    assert_admin_panic!(contract.unpause());
    assert_admin_panic!(contract.add_agent(agent2()));
    assert_admin_panic!(contract.revoke_agent(agent1()));
    assert_admin_panic!(contract.set_policy(NearToken::from_near(1), NearToken::from_near(2), NearToken::from_near(1)));
    assert_admin_panic!(contract.add_destination(new_dest()));
    assert_admin_panic!(contract.remove_destination(merchant()));
    assert_admin_panic!(contract.withdraw(NearToken::from_near(1), agent1()));
    assert_admin_panic!(contract.reconcile_stuck_request(1, AttestedResolution::Failed, "tx".to_string()));
    assert_admin_panic!(contract.prune_reconciled_tombstone(1, "evidence".to_string()));
}

// -----------------------------------------------------------------------------
// Security Promise 10: Failed transfer releases reservations correctly
// -----------------------------------------------------------------------------
#[test]
fn test_sp10_failed_transfer_releases_reservations() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Immediate dispatch of 4 NEAR
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(4),
        "payment".to_string(),
        None,
    );
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    assert_eq!(contract.get_inflight_reserved(), NearToken::from_near(4));
    let bucket = contract.get_daily_bucket(None);
    assert_eq!(bucket.reserved, NearToken::from_near(4));
    assert_eq!(bucket.spent, NearToken::from_near(0));

    // Callback executes with PromiseResult::Failed
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );

    let callback_res = contract.on_transfer_complete(req_id);
    assert!(!callback_res);

    let req = contract.get_request(req_id).unwrap();
    assert_eq!(req.status, RequestStatus::Failed);
    assert_eq!(contract.get_inflight_reserved(), NearToken::from_near(0));

    let bucket_after = contract.get_daily_bucket(None);
    assert_eq!(bucket_after.reserved, NearToken::from_near(0));
    assert_eq!(bucket_after.spent, NearToken::from_near(0)); // Spent unchanged!
}

// -----------------------------------------------------------------------------
// Security Promise 11: Global and per-agent queue limits enforced
// -----------------------------------------------------------------------------
#[test]
fn test_sp11_queue_limits_enforced() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Per-agent pending limit is MAX_AGENT_PENDING = 2
    // Agent 1 queues 2 pending requests (amount > 5 NEAR threshold)
    let r1 = contract.request_payment(merchant(), NearToken::from_near(6), "r1".to_string(), None);
    let r2 = contract.request_payment(merchant(), NearToken::from_near(6), "r2".to_string(), None);
    assert!(matches!(r1, ExecutionResult::Pending { .. }));
    assert!(matches!(r2, ExecutionResult::Pending { .. }));
    assert_eq!(contract.get_agent_pending_count(agent1()), 2);
    assert_eq!(contract.get_global_pending_count(), 2);

    // 3rd request from Agent 1 must be Denied with AgentQueueLimitExceeded
    let r3 = contract.request_payment(merchant(), NearToken::from_near(6), "r3".to_string(), None);
    assert_eq!(
        r3,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::AgentQueueLimitExceeded
        }
    );
    assert_eq!(contract.get_agent_pending_count(agent1()), 2);

    // Agent 2 can still submit
    ctx.predecessor_account_id(agent2());
    testing_env!(ctx.build());
    let r4 = contract.request_payment(merchant(), NearToken::from_near(6), "r4".to_string(), None);
    assert!(matches!(r4, ExecutionResult::Pending { .. }));
    assert_eq!(contract.get_agent_pending_count(agent2()), 1);
    assert_eq!(contract.get_global_pending_count(), 3);
}

// -----------------------------------------------------------------------------
// Security Promise 12: Audit events and monotonic sequence IDs
// -----------------------------------------------------------------------------
#[test]
fn test_sp12_audit_events_and_sequence_ids() {
    let (mut contract, mut ctx) = setup_vault();

    ctx.predecessor_account_id(agent1());
    testing_env!(ctx.build());

    // Generate diverse events
    contract.request_payment(merchant(), NearToken::from_near(3), "disp1".to_string(), None);
    contract.request_payment(merchant(), NearToken::from_near(8), "pend1".to_string(), None);
    contract.request_payment(merchant(), NearToken::from_near(20), "denied_per_tx".to_string(), None);

    let records = contract.get_audit_records(None, None);
    assert!(records.len() >= 3);

    // Verify monotonic sequence IDs
    for i in 1..records.len() {
        assert_eq!(records[i].sequence_id, records[i - 1].sequence_id + 1);
    }
}
