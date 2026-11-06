pub const NANOS_PER_DAY: u64 = 86_400 * 1_000_000_000;
pub const STORAGE_SAFETY_BUFFER_BYTES: u64 = 10_000;
pub const MIN_TTL_NANOS: u64 = 5 * 60 * 1_000_000_000; // 5 minutes
pub const MAX_TTL_NANOS: u64 = 24 * 60 * 60 * 1_000_000_000; // 24 hours
pub const DEFAULT_TTL_NANOS: u64 = 60 * 60 * 1_000_000_000; // 1 hour
pub const RECONCILIATION_TIMEOUT_NANOS: u64 = 24 * 60 * 60 * 1_000_000_000; // 24 hours
pub const EMPTY_BUCKET_RETENTION_NANOS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000; // 7 days
pub const MAX_GLOBAL_PENDING: u64 = 32;
pub const MAX_AGENT_PENDING: u64 = 2;

#[inline]
pub fn daily_bucket_index(timestamp_ns: u64) -> u64 {
    timestamp_ns / NANOS_PER_DAY
}

#[inline]
pub fn calculate_storage_reserve_requirement(
    storage_usage_bytes: u64,
    byte_cost_yocto: u128,
) -> u128 {
    let total_bytes = storage_usage_bytes
        .checked_add(STORAGE_SAFETY_BUFFER_BYTES)
        .expect("Storage byte overflow");
    (total_bytes as u128)
        .checked_mul(byte_cost_yocto)
        .expect("Storage cost overflow")
}

#[inline]
pub fn calculate_protected_balance(
    account_balance_yocto: u128,
    storage_reserve_yocto: u128,
) -> u128 {
    account_balance_yocto.saturating_sub(storage_reserve_yocto)
}

#[inline]
pub fn calculate_available_liquid_balance(
    protected_balance_yocto: u128,
    pending_reserved_yocto: u128,
) -> u128 {
    protected_balance_yocto.saturating_sub(pending_reserved_yocto)
}

