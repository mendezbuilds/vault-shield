use near_sdk::near;
use near_sdk::{AccountId, NearToken};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestStatus {
    Pending,
    InFlight,
    Executed,
    Failed,
    Rejected,
    Expired,
    ReconciledExecuted,
    ReconciledFailed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PendingReason {
    None,
    NewDestinationOnly,
    AboveThresholdOnly,
    AboveThresholdAndNewDestination,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttestedResolution {
    Executed,
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyDenialReason {
    VaultPaused,
    AgentNotAuthorized,
    ExceedsPerTransactionCap,
    ExceedsDailyCap,
    InsufficientLiquidBalance,
    GlobalQueueLimitExceeded,
    AgentQueueLimitExceeded,
    InvalidTtl,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvalidationReason {
    VaultPaused,
    AgentRevoked,
    ExceedsPerTransactionCap,
    ExceedsDailyCap,
    InsufficientLiquidBalance,
    DestinationDelisted,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ExecutionResult {
    Pending {
        request_id: u64,
        origin_reason: PendingReason,
    },
    Dispatched {
        request_id: u64,
    },
    Denied {
        reason: PolicyDenialReason,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApprovalResult {
    Dispatched {
        request_id: u64,
    },
    Invalidated {
        reason: InvalidationReason,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DailyBucket {
    pub spent: NearToken,
    pub reserved: NearToken,
    pub last_updated_at: u64,
}

impl Default for DailyBucket {
    fn default() -> Self {
        Self {
            spent: NearToken::from_yoctonear(0),
            reserved: NearToken::from_yoctonear(0),
            last_updated_at: 0,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DailyBucketView {
    pub bucket_index: u64,
    pub spent: NearToken,
    pub reserved: NearToken,
    pub last_updated_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaymentRequest {
    pub id: u64,
    pub agent_id: AccountId,
    pub destination: AccountId,
    pub amount: NearToken,
    pub reason: String,
    pub created_at: u64,
    pub created_bucket: u64,
    pub ttl_nanos: u64,
    pub status: RequestStatus,
    pub origin_reason: PendingReason,
    pub dispatched_at: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaymentRequestView {
    pub id: u64,
    pub agent_id: AccountId,
    pub destination: AccountId,
    pub amount: NearToken,
    pub reason: String,
    pub created_at: u64,
    pub created_bucket: u64,
    pub ttl_nanos: u64,
    pub status: RequestStatus,
    pub origin_reason: PendingReason,
    pub dispatched_at: Option<u64>,
}

impl From<&PaymentRequest> for PaymentRequestView {
    fn from(r: &PaymentRequest) -> Self {
        Self {
            id: r.id,
            agent_id: r.agent_id.clone(),
            destination: r.destination.clone(),
            amount: r.amount,
            reason: r.reason.clone(),
            created_at: r.created_at,
            created_bucket: r.created_bucket,
            ttl_nanos: r.ttl_nanos,
            status: r.status,
            origin_reason: r.origin_reason,
            dispatched_at: r.dispatched_at,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReconciledTombstone {
    pub original_bucket: u64,
    pub amount: NearToken,
    pub attested_resolution: AttestedResolution,
    pub reconciled_at: u64,
    pub evidence_tx_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReconciledTombstoneView {
    pub request_id: u64,
    pub original_bucket: u64,
    pub amount: NearToken,
    pub attested_resolution: AttestedResolution,
    pub reconciled_at: u64,
    pub evidence_tx_hash: String,
}
