use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};
use vault_contract::accounting::*;
use vault_contract::types::*;
use vault_contract::VaultContract;

fn owner() -> AccountId {
    "owner.near".parse().unwrap()
}
fn agent_a() -> AccountId {
    "agent_a.near".parse().unwrap()
}
fn agent_b() -> AccountId {
    "agent_b.near".parse().unwrap()
}
fn vault() -> AccountId {
    "vault.near".parse().unwrap()
}
fn merchant() -> AccountId {
    "merchant.near".parse().unwrap()
}
fn external_dest() -> AccountId {
    "external.near".parse().unwrap()
}

fn setup_adversarial_vault(
    balance_near: u128,
    storage_usage_bytes: u64,
) -> (VaultContract, VMContextBuilder) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(vault())
        .predecessor_account_id(owner())
        .signer_account_id(owner())
        .block_timestamp(1_000_000_000_000) // Day 0
        .account_balance(NearToken::from_near(balance_near))
        .storage_usage(storage_usage_bytes);
    testing_env!(ctx.build());

    let mut contract = VaultContract::new(
        owner(),
        NearToken::from_near(20), // max_per_tx: 20 NEAR
        NearToken::from_near(50), // daily_cap: 50 NEAR
        NearToken::from_near(5),  // threshold: 5 NEAR
        vec![merchant()],
    );
    contract.add_agent(agent_a());
    contract.add_agent(agent_b());
    (contract, ctx)
}

// -----------------------------------------------------------------------------
// Adversarial Case 1: Insufficient physical balance at Pending admission
// -----------------------------------------------------------------------------
#[test]
fn test_adv01_insufficient_physical_balance_at_pending_admission() {
    // Vault balance: 10 NEAR.
    // storage_usage: 500 bytes. byte_cost: 10^19 yocto/byte (0.00001 NEAR/byte).
    // total storage bytes: 500 + 10,000 = 10,500 bytes ~= 0.105 NEAR.
    // Let's create an artificial scenario where available liquid balance is low:
    // Balance = 1 NEAR, storage_reserve ~= 0.105 NEAR -> protected ~= 0.895 NEAR.
    let (mut contract, mut ctx) = setup_adversarial_vault(1, 500);

    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());

    // Agent attempts to queue a 2 NEAR request (above threshold, so would be Pending)
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(2),
        "unbacked pending attempt".to_string(),
        None,
    );

    // Must be DENIED due to InsufficientLiquidBalance!
    assert_eq!(
        res,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::InsufficientLiquidBalance
        }
    );
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_global_pending_count(), 0);
}

// -----------------------------------------------------------------------------
// Adversarial Case 2: Owner withdrawal attempting to consume reserved funds
// -----------------------------------------------------------------------------
#[test]
fn test_adv02_withdrawal_attempting_to_consume_reserved_funds() {
    let (mut contract, mut ctx) = setup_adversarial_vault(50, 500);

    // Queue 30 NEAR across two requests (threshold 5 NEAR, so each 15 NEAR is Pending)
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let r1 = contract.request_payment(merchant(), NearToken::from_near(15), "r1".to_string(), None);
    assert!(matches!(r1, ExecutionResult::Pending { .. }));

    ctx.predecessor_account_id(agent_b());
    testing_env!(ctx.build());
    let r2 = contract.request_payment(merchant(), NearToken::from_near(15), "r2".to_string(), None);
    assert!(matches!(r2, ExecutionResult::Pending { .. }));

    assert_eq!(contract.get_pending_reserved(), NearToken::from_near(30));
    let _available = contract.get_available_liquid_balance();
    // Available = 50 - ~0.105 (storage reserve) - 30 = ~19.895 NEAR.

    // Owner attempts to withdraw 25 NEAR (exceeding available liquid balance)
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    let withdraw_attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = contract.withdraw(NearToken::from_near(25), owner());
    }));
    assert!(withdraw_attempt.is_err(), "Withdrawal exceeding available balance must panic");

    // But owner CAN withdraw within available liquid balance (e.g. 10 NEAR)
    let safe_withdraw = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = contract.withdraw(NearToken::from_near(10), owner());
    }));
    assert!(safe_withdraw.is_ok(), "Withdrawal within available balance must succeed");
}

// -----------------------------------------------------------------------------
// Adversarial Case 3: Approval after physical balance or storage reserve changes
// -----------------------------------------------------------------------------
#[test]
fn test_adv03_approval_after_physical_balance_or_storage_reserve_changes() {
    let (mut contract, mut ctx) = setup_adversarial_vault(12, 500);

    // Queue 10 NEAR request
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(
        merchant(),
        NearToken::from_near(10),
        "request".to_string(),
        None,
    );
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected Pending"),
    };
    assert_eq!(contract.get_pending_reserved(), NearToken::from_near(10));

    // Simulate intervening state expansion or physical balance drop:
    // Balance drops to 10 NEAR while storage usage rises to 100_000 bytes (storage reserve = 1.1 NEAR)
    // Physical liquid = 10 - 1.1 = 8.9 NEAR < 10 NEAR request amount!
    ctx.account_balance(NearToken::from_near(10))
        .storage_usage(100_000);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    // Owner attempts approval: Revalidation MUST fail cleanly without panic!
    let app_res = contract.approve_request(req_id);
    assert_eq!(
        app_res,
        ApprovalResult::Invalidated {
            reason: InvalidationReason::InsufficientLiquidBalance
        }
    );

    // Status is Rejected, reservation released!
    let req = contract.get_request(req_id).unwrap();
    assert_eq!(req.status, RequestStatus::Rejected);
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_global_pending_count(), 0);
}

// -----------------------------------------------------------------------------
// Adversarial Case 4: Multiple Pending reservations with insufficient protected balance
// -----------------------------------------------------------------------------
#[test]
fn test_adv04_multiple_pending_insufficient_protected_balance() {
    let (mut contract, mut ctx) = setup_adversarial_vault(20, 500);

    // Request 1: 10 NEAR Pending
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let r1 = contract.request_payment(merchant(), NearToken::from_near(10), "r1".to_string(), None);
    assert!(matches!(r1, ExecutionResult::Pending { .. }));

    // Request 2: 9 NEAR Pending (available was ~19.895 - 10 = ~9.895 NEAR)
    ctx.predecessor_account_id(agent_b());
    testing_env!(ctx.build());
    let r2 = contract.request_payment(merchant(), NearToken::from_near(9), "r2".to_string(), None);
    assert!(matches!(r2, ExecutionResult::Pending { .. }));

    // Request 3: 2 NEAR -> Insufficient liquid balance (available is < 1 NEAR)
    let r3 = contract.request_payment(merchant(), NearToken::from_near(2), "r3".to_string(), None);
    assert_eq!(
        r3,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::InsufficientLiquidBalance
        }
    );
}

// -----------------------------------------------------------------------------
// Adversarial Case 5: Callback-before-refund receipt ordering
// -----------------------------------------------------------------------------
#[test]
fn test_adv05_callback_before_refund_ordering() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    // Agent dispatches 4 NEAR immediately
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(4), "disp".to_string(), None);
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    // Upon promise dispatch, 4 NEAR physically left vault: balance is now 96 NEAR
    ctx.account_balance(NearToken::from_near(96));
    testing_env!(ctx.build());

    // 1. Callback receipt executes BEFORE refund receipt: reads PromiseResult::Failed
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    let ok = contract.on_transfer_complete(req_id);
    assert!(!ok);

    // Accounting counters are released
    assert_eq!(contract.get_inflight_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_daily_bucket(None).reserved, NearToken::from_yoctonear(0));

    // CRITICAL SOLVENCY INVARIANT: Available liquid balance is based on physical balance (96 NEAR),
    // NOT the phantom 100 NEAR! Missing refund cannot be spent.
    let available_before_refund = contract.get_available_liquid_balance();
    assert!(available_before_refund.as_yoctonear() <= NearToken::from_near(96).as_yoctonear());

    // 2. Protocol refund receipt executes on vault shard: account_balance increases back to 100 NEAR
    ctx.account_balance(NearToken::from_near(100));
    testing_env!(ctx.build());

    // Available liquid balance now expands safely to reflect physical refund
    let available_after_refund = contract.get_available_liquid_balance();
    assert!(available_after_refund.as_yoctonear() > NearToken::from_near(99).as_yoctonear());
}

// -----------------------------------------------------------------------------
// Adversarial Case 6: Refund-before-callback receipt ordering
// -----------------------------------------------------------------------------
#[test]
fn test_adv06_refund_before_callback_ordering() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    // Agent dispatches 4 NEAR immediately
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(4), "disp".to_string(), None);
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    // 1. Protocol refund arrives FIRST: account balance returns to 100 NEAR
    ctx.account_balance(NearToken::from_near(100));
    testing_env!(ctx.build());

    // InFlight reservation still holds +4 NEAR (contract hasn't processed callback yet)
    assert_eq!(contract.get_inflight_reserved(), NearToken::from_near(4));
    assert_eq!(contract.get_daily_bucket(None).reserved, NearToken::from_near(4));

    // 2. Callback executes: PromiseResult::Failed
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    contract.on_transfer_complete(req_id);

    // Inflight reservation released cleanly
    assert_eq!(contract.get_inflight_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_daily_bucket(None).reserved, NearToken::from_yoctonear(0));
}

// -----------------------------------------------------------------------------
// Adversarial Case 7: Per-agent queue exhaustion
// -----------------------------------------------------------------------------
#[test]
fn test_adv07_per_agent_queue_exhaustion() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());

    contract.request_payment(merchant(), NearToken::from_near(6), "p1".to_string(), None);
    contract.request_payment(merchant(), NearToken::from_near(6), "p2".to_string(), None);

    // 3rd from Agent A is denied
    let r3 = contract.request_payment(merchant(), NearToken::from_near(6), "p3".to_string(), None);
    assert_eq!(
        r3,
        ExecutionResult::Denied {
            reason: PolicyDenialReason::AgentQueueLimitExceeded
        }
    );

    // Agent B can still submit
    ctx.predecessor_account_id(agent_b());
    testing_env!(ctx.build());
    let r4 = contract.request_payment(merchant(), NearToken::from_near(6), "p4".to_string(), None);
    assert!(matches!(r4, ExecutionResult::Pending { .. }));
}

// -----------------------------------------------------------------------------
// Adversarial Case 8: Combined new-destination and above-threshold approval
// -----------------------------------------------------------------------------
#[test]
fn test_adv08_combined_new_dest_and_above_threshold() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());

    // Amount = 8 NEAR (> 5 NEAR threshold) AND destination unlisted
    let res = contract.request_payment(
        external_dest(),
        NearToken::from_near(8),
        "combined".to_string(),
        None,
    );

    let req_id = match res {
        ExecutionResult::Pending { request_id, origin_reason } => {
            assert_eq!(origin_reason, PendingReason::AboveThresholdAndNewDestination);
            request_id
        }
        _ => panic!("Expected Pending with AboveThresholdAndNewDestination"),
    };

    // Owner approves
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    let app_res = contract.approve_request(req_id);
    assert!(matches!(app_res, ApprovalResult::Dispatched { .. }));

    // External dest NOT permanently allowlisted
    assert!(!contract.get_policy().destination_allowlist.contains(&external_dest()));
}

// -----------------------------------------------------------------------------
// Adversarial Case 9: Destination delisting after request submission
// -----------------------------------------------------------------------------
#[test]
fn test_adv09_destination_delisting_after_submission() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    // merchant.near is allowlisted. Submit 8 NEAR (> 5 NEAR threshold). OriginReason = AboveThresholdOnly
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(8), "above_th".to_string(), None);
    let req_id = match res {
        ExecutionResult::Pending { request_id, origin_reason } => {
            assert_eq!(origin_reason, PendingReason::AboveThresholdOnly);
            request_id
        }
        _ => panic!("Expected Pending"),
    };

    // Intervening Action: Owner delists merchant.near!
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    contract.remove_destination(merchant());
    assert!(!contract.get_policy().destination_allowlist.contains(&merchant()));

    // Owner attempts approval: Revalidation MUST detect delisted destination and reject!
    let app_res = contract.approve_request(req_id);
    assert_eq!(
        app_res,
        ApprovalResult::Invalidated {
            reason: InvalidationReason::DestinationDelisted
        }
    );

    let req = contract.get_request(req_id).unwrap();
    assert_eq!(req.status, RequestStatus::Rejected);
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
}

// -----------------------------------------------------------------------------
// Adversarial Case 10: Late callback after more than 30 days (> 45 days)
// -----------------------------------------------------------------------------
#[test]
fn test_adv10_late_callback_after_extended_period() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    // Immediate dispatch of 4 NEAR at T0
    let t0 = 1_000_000_000_000u64;
    ctx.block_timestamp(t0);
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(4), "stuck_test".to_string(), None);
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    // Advance time past 24-hour reconciliation timeout (86,400s)
    let t_reconcile = t0 + RECONCILIATION_TIMEOUT_NANOS + 1_000_000_000;
    ctx.block_timestamp(t_reconcile);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    // Owner reconciles as Failed (believing transfer timed out)
    contract.reconcile_stuck_request(req_id, AttestedResolution::Failed, "tx_hash_123".to_string());
    assert!(contract.get_tombstone(req_id).is_some());

    // Advance time by 45 days (45 * 86,400s)
    let t_late = t_reconcile + 45 * 86_400 * 1_000_000_000;
    ctx.block_timestamp(t_late);

    // Tombstone must STILL be in storage! (Indefinite retention)
    assert!(contract.get_tombstone(req_id).is_some(), "Tombstone must not be auto-deleted");

    // Delayed callback arrives returning Successful (transfer actually went through!)
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );

    let ok = contract.on_transfer_complete(req_id);
    assert!(ok);

    // CRITICAL DISCREPANCY DETECTED:
    // 1. Vault is automatically PAUSED!
    assert!(contract.is_paused(), "Vault must auto-pause on discrepancy");

    // 2. Spent is debited in original bucket
    let original_bucket = contract.get_daily_bucket(Some(daily_bucket_index(t0)));
    assert_eq!(original_bucket.spent, NearToken::from_near(4));

    // 3. Tombstone is consumed
    assert!(contract.get_tombstone(req_id).is_none());
}

// -----------------------------------------------------------------------------
// Adversarial Case 11: Tombstone retention and owner-attested pruning
// -----------------------------------------------------------------------------
#[test]
fn test_adv11_tombstone_retention_and_owner_attested_pruning() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    let t0 = 1_000_000_000_000u64;
    ctx.block_timestamp(t0);
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(4), "reconcile_test".to_string(), None);
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    let t_reconcile = t0 + RECONCILIATION_TIMEOUT_NANOS + 1_000_000_000;
    ctx.block_timestamp(t_reconcile);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    contract.reconcile_stuck_request(req_id, AttestedResolution::Executed, "tx_hash_abc".to_string());
    assert!(contract.get_tombstone(req_id).is_some());

    // Non-owner cannot prune
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let non_owner_prune = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.prune_reconciled_tombstone(req_id, "evidence_link".to_string());
    }));
    assert!(non_owner_prune.is_err(), "Non-owner cannot prune tombstone");

    // Owner prunes with evidence
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    contract.prune_reconciled_tombstone(req_id, "receipt_confirmed_final".to_string());
    assert!(contract.get_tombstone(req_id).is_none());
}

// -----------------------------------------------------------------------------
// Adversarial Case 12: Reservation release exactly once
// -----------------------------------------------------------------------------
#[test]
fn test_adv12_reservation_release_exactly_once() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(8), "pending".to_string(), None);
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected Pending"),
    };

    assert_eq!(contract.get_pending_reserved(), NearToken::from_near(8));
    assert_eq!(contract.get_global_pending_count(), 1);

    // Owner rejects
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());
    contract.reject_request(req_id);

    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_global_pending_count(), 0);

    // Attempting duplicate rejection or approval must panic (not double-decrement!)
    let dup_reject = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.reject_request(req_id);
    }));
    assert!(dup_reject.is_err());

    let dup_approve = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.approve_request(req_id);
    }));
    assert!(dup_approve.is_err());

    // Counters remain exactly zero, no underflow
    assert_eq!(contract.get_pending_reserved(), NearToken::from_yoctonear(0));
    assert_eq!(contract.get_global_pending_count(), 0);
}

// -----------------------------------------------------------------------------
// Adversarial Case 13: Late fail after reconcile executed
// -----------------------------------------------------------------------------
#[test]
fn test_adv13_late_fail_after_reconcile_executed() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    let t0 = 1_000_000_000_000u64;
    ctx.block_timestamp(t0);
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());
    let res = contract.request_payment(merchant(), NearToken::from_near(4), "reconcile_test".to_string(), None);
    let req_id = match res {
        ExecutionResult::Dispatched { request_id } => request_id,
        _ => panic!("Expected Dispatched"),
    };

    let t_reconcile = t0 + RECONCILIATION_TIMEOUT_NANOS + 1_000_000_000;
    ctx.block_timestamp(t_reconcile);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    // Reconcile as Executed (spent increases by 4 NEAR)
    contract.reconcile_stuck_request(req_id, AttestedResolution::Executed, "tx_hash_xyz".to_string());
    let bucket_after_rec = contract.get_daily_bucket(Some(daily_bucket_index(t0)));
    assert_eq!(bucket_after_rec.spent, NearToken::from_near(4));

    // Delayed callback reports Failed!
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );

    let ok = contract.on_transfer_complete(req_id);
    assert!(!ok);

    // CRITICAL DISCREPANCY:
    // 1. Vault auto-paused!
    assert!(contract.is_paused());

    // 2. Conservative hold: spent is NOT rolled back silently
    let bucket_final = contract.get_daily_bucket(Some(daily_bucket_index(t0)));
    assert_eq!(bucket_final.spent, NearToken::from_near(4));

    // 3. Tombstone consumed
    assert!(contract.get_tombstone(req_id).is_none());
}

// -----------------------------------------------------------------------------
// Adversarial Case 14: Midnight rollover original bucket retention
// -----------------------------------------------------------------------------
#[test]
fn test_adv14_midnight_rollover_original_bucket_consumption() {
    let (mut contract, mut ctx) = setup_adversarial_vault(100, 500);

    // Day 0: 23:59:50 UTC (e.g. 86,390 seconds into day 0)
    let t_day0 = 86_390 * 1_000_000_000u64;
    ctx.block_timestamp(t_day0);
    ctx.predecessor_account_id(agent_a());
    testing_env!(ctx.build());

    let res = contract.request_payment(merchant(), NearToken::from_near(8), "midnight req".to_string(), None);
    let req_id = match res {
        ExecutionResult::Pending { request_id, .. } => request_id,
        _ => panic!("Expected Pending"),
    };

    assert_eq!(contract.get_daily_bucket(Some(0)).reserved, NearToken::from_near(8));

    // Rollover to Day 1: 00:05:00 UTC (86,700 seconds)
    let t_day1 = 86_700 * 1_000_000_000u64;
    ctx.block_timestamp(t_day1);
    ctx.predecessor_account_id(owner());
    testing_env!(ctx.build());

    // Owner approves on Day 1
    let app_res = contract.approve_request(req_id);
    assert!(matches!(app_res, ApprovalResult::Dispatched { .. }));

    // Callback succeeds on Day 1
    ctx.predecessor_account_id(vault());
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    contract.on_transfer_complete(req_id);

    // MASTER INVARIANT: Day 0 spent MUST increase by 8 NEAR!
    let day0_bucket = contract.get_daily_bucket(Some(0));
    assert_eq!(day0_bucket.spent, NearToken::from_near(8));
    assert_eq!(day0_bucket.reserved, NearToken::from_near(0));

    // Day 1 bucket MUST remain 0 spent and 0 reserved!
    let day1_bucket = contract.get_daily_bucket(Some(1));
    assert_eq!(day1_bucket.spent, NearToken::from_near(0));
    assert_eq!(day1_bucket.reserved, NearToken::from_near(0));
}
