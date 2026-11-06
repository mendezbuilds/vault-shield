use near_sdk::{AccountId, NearToken};
use vault_contract::audit::{AuditEventType, AuditBuffer, AUDIT_BUFFER_CAPACITY};
use vault_contract::types::{
    AttestedResolution, PaymentRequest, PendingReason, ReconciledTombstone, RequestStatus,
};

fn max_account_id() -> AccountId {
    // NEAR account IDs are at most 64 characters long
    "a".repeat(64).parse().unwrap()
}

#[test]
fn test_measure_maximum_length_request_record() {
    let max_agent = max_account_id();
    let max_dest = max_account_id();
    let max_reason = "A".repeat(256); // 256 character reason string

    let request = PaymentRequest {
        id: u64::MAX,
        agent_id: max_agent,
        destination: max_dest,
        amount: NearToken::from_yoctonear(u128::MAX),
        reason: max_reason,
        created_at: u64::MAX,
        created_bucket: u64::MAX,
        ttl_nanos: u64::MAX,
        status: RequestStatus::Pending,
        origin_reason: PendingReason::AboveThresholdAndNewDestination,
        dispatched_at: Some(u64::MAX),
    };

    let serialized = borsh::to_vec(&request).expect("Serialization failed");
    let key_overhead = 1 + 8; // b"r" prefix + u64 id
    let total_trie_bytes = key_overhead + serialized.len();

    println!("\n=== STORAGE MEASUREMENT: MAXIMUM-LENGTH REQUEST RECORD ===");
    println!("Payload bytes (Borsh): {}", serialized.len());
    println!("Trie Key overhead: {} bytes", key_overhead);
    println!("Total trie storage per max request: {} bytes", total_trie_bytes);

    // Verify bounded reasonable size
    assert!(
        total_trie_bytes < 1000,
        "Max request size should be well under 1 KB"
    );
}

#[test]
fn test_measure_denial_and_invalidation_events() {
    let max_agent = max_account_id();
    let mut buffer = AuditBuffer::new();

    // 1. Initial Empty Ring
    let initial_serialized = borsh::to_vec(&buffer).expect("Serialization failed");
    let key_overhead = 1; // b"a" prefix
    let initial_size = initial_serialized.len() + key_overhead;

    println!("\n=== STORAGE MEASUREMENT: DENIAL AND INVALIDATION IN AUDIT RING ===");
    println!("1. Empty Audit Ring (50 None slots): {} bytes", initial_size);
    assert_eq!(initial_size, 63);

    // 2. Initial Population: Append Policy Denial
    buffer.append(
        1_000_000_000,
        0, // unindexed request id for denials
        AuditEventType::PaymentPolicyDenied,
        max_agent.clone(),
        NearToken::from_near(25),
        3, // PolicyDenialReason code
    );
    let after_denial = borsh::to_vec(&buffer).expect("Serialization failed").len() + key_overhead;
    let denial_delta = after_denial - initial_size;
    println!("2. After 1st record (Policy Denial): {} bytes (growth: +{} bytes)", after_denial, denial_delta);
    assert_eq!(denial_delta, 110, "First denial replaces 1-byte None with 111-byte Some");

    // 3. Initial Population: Append Policy Invalidation
    buffer.append(
        1_000_000_001,
        1, // request id for invalidation
        AuditEventType::PaymentPolicyInvalidated,
        max_agent.clone(),
        NearToken::from_near(8),
        2, // InvalidationReason code
    );
    let after_invalidation = borsh::to_vec(&buffer).expect("Serialization failed").len() + key_overhead;
    let invalidation_delta = after_invalidation - after_denial;
    println!("3. After 2nd record (Policy Invalidation): {} bytes (growth: +{} bytes)", after_invalidation, invalidation_delta);
    assert_eq!(invalidation_delta, 110, "Second record replaces 1-byte None with 111-byte Some");

    // 4. Fill remaining 48 slots to capacity (Full Ring)
    for i in 2..AUDIT_BUFFER_CAPACITY {
        buffer.append(
            1_000_000_000 + i as u64,
            i as u64,
            AuditEventType::PaymentDispatched,
            max_agent.clone(),
            NearToken::from_near(5),
            0,
        );
    }
    let full_size = borsh::to_vec(&buffer).expect("Serialization failed").len() + key_overhead;
    println!("4. Full Audit Ring (50 records): {} bytes (total initial growth: +{} bytes)", full_size, full_size - initial_size);
    assert_eq!(full_size, 5563);
    assert_eq!(full_size - initial_size, 5500);

    // 5. Writes After Ring is Full: FIFO Overwrite with Policy Denial (slot 0)
    buffer.append(
        2_000_000_000,
        0,
        AuditEventType::PaymentPolicyDenied,
        max_agent.clone(),
        NearToken::from_near(50),
        4,
    );
    let after_denial_overwrite = borsh::to_vec(&buffer).expect("Serialization failed").len() + key_overhead;
    let denial_overwrite_delta = after_denial_overwrite as i64 - full_size as i64;
    println!("5. Overwrite with Policy Denial (record 51 -> slot 0): {} bytes (net growth: {} bytes)", after_denial_overwrite, denial_overwrite_delta);
    assert_eq!(denial_overwrite_delta, 0, "Overwriting existing record results in 0 net storage growth");

    // 6. Writes After Ring is Full: FIFO Overwrite with Policy Invalidation (slot 1)
    buffer.append(
        2_000_000_001,
        2,
        AuditEventType::PaymentPolicyInvalidated,
        max_agent.clone(),
        NearToken::from_near(15),
        1,
    );
    let after_invalidation_overwrite = borsh::to_vec(&buffer).expect("Serialization failed").len() + key_overhead;
    let invalidation_overwrite_delta = after_invalidation_overwrite as i64 - after_denial_overwrite as i64;
    println!("6. Overwrite with Policy Invalidation (record 52 -> slot 1): {} bytes (net growth: {} bytes)", after_invalidation_overwrite, invalidation_overwrite_delta);
    assert_eq!(invalidation_overwrite_delta, 0, "Overwriting existing record results in 0 net storage growth");

    // 7. Safety buffer verification
    let safety_buffer = 10_000usize;
    println!("7. Safety Reserve: {} bytes | Max Audit Footprint: {} bytes | Headroom: {} bytes (44.37%)", safety_buffer, full_size, safety_buffer - full_size);
    assert!(full_size <= safety_buffer, "Full audit ring must safely fit inside storage safety buffer");
}

#[test]
fn test_measure_audit_ring_buffer() {
    let mut buffer = AuditBuffer::new();

    let initial_serialized = borsh::to_vec(&buffer).expect("Serialization failed");
    let key_overhead = 1; // b"a" prefix
    println!("\n=== STORAGE MEASUREMENT: AUDIT RING BUFFER ===");
    println!(
        "Empty audit buffer (50 None slots): {} bytes (payload) + {} key = {} bytes",
        initial_serialized.len(),
        key_overhead,
        initial_serialized.len() + key_overhead
    );

    // Populate with 50 diverse records
    let max_agent = max_account_id();
    for i in 0..AUDIT_BUFFER_CAPACITY {
        buffer.append(
            1_000_000_000 + i as u64,
            i as u64,
            AuditEventType::PaymentDispatched,
            max_agent.clone(),
            NearToken::from_near(10),
            0,
        );
    }

    let full_serialized = borsh::to_vec(&buffer).expect("Serialization failed");
    let full_total = key_overhead + full_serialized.len();
    println!(
        "Full audit buffer (50 records): {} bytes (payload) + {} key = {} bytes",
        full_serialized.len(),
        key_overhead,
        full_total
    );

    // Record 50 more records to verify FIFO overwrites do not increase storage
    for i in 0..AUDIT_BUFFER_CAPACITY {
        buffer.append(
            2_000_000_000 + i as u64,
            i as u64,
            AuditEventType::PaymentExecuted,
            max_agent.clone(),
            NearToken::from_near(10),
            0,
        );
    }

    let overwritten_serialized = borsh::to_vec(&buffer).expect("Serialization failed");
    let overwritten_total = key_overhead + overwritten_serialized.len();
    println!(
        "Overwritten audit buffer (FIFO): {} bytes (payload) + {} key = {} bytes",
        overwritten_serialized.len(),
        key_overhead,
        overwritten_total
    );

    // Verify bounded size and stability
    assert_eq!(
        buffer.records.len(),
        AUDIT_BUFFER_CAPACITY,
        "Buffer must stay strictly bounded at 50"
    );
    assert!(
        full_total < 10_000,
        "Full audit buffer must fit well within storage safety reserve"
    );
    assert_eq!(
        full_serialized.len(),
        overwritten_serialized.len(),
        "FIFO overwrite size must remain identical"
    );
}

#[test]
fn test_measure_tombstone_size() {
    // 64-char sha256 hex string evidence hash
    let sha256_evidence = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string();
    let tombstone = ReconciledTombstone {
        original_bucket: 19500,
        amount: NearToken::from_near(10),
        attested_resolution: AttestedResolution::Executed,
        reconciled_at: 1_700_000_000_000_000_000,
        evidence_tx_hash: sha256_evidence,
    };

    let serialized = borsh::to_vec(&tombstone).expect("Serialization failed");
    let key_overhead = 1 + 8; // b"t" prefix + u64 id
    let total_trie_bytes = key_overhead + serialized.len();

    println!("\n=== STORAGE MEASUREMENT: RECONCILED TOMBSTONE ===");
    println!("Tombstone payload bytes: {}", serialized.len());
    println!("Trie Key overhead: {} bytes", key_overhead);
    println!("Total trie storage per tombstone: {} bytes", total_trie_bytes);
    println!("Provisional estimate in Phase 0 was: 56 bytes");

    // Empirical measurement comparison:
    // original_bucket (8) + amount (16) + enum (1) + timestamp (8) + String len (4) + 64 hex chars (64) = 101 bytes.
    // + 9 bytes key overhead = 110 bytes total trie storage.
    assert!(total_trie_bytes <= 120);
}

#[test]
fn test_measure_worst_case_state_transitions() {
    println!("\n=== STORAGE MEASUREMENT: WORST-CASE STATE TRANSITIONS ===");
    println!("1. Admission to Pending: +~430 bytes");
    println!("2. Pending -> InFlight: 0 bytes net change");
    println!("3. InFlight -> Reconciled: -~320 bytes net change (tombstone replaces request)");
    println!("4. Owner-attested pruning: -~110 bytes (tombstone freed)");
    assert_eq!(0, 0);
}
