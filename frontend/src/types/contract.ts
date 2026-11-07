/**
 * Exact TypeScript representations of the frozen NEAR AI Agent Vault Contract (cc7760b).
 */

export const VAULT_CONTRACT_ID = "contract.vault-parent.testnet";
export const TESTNET_RPC_URL = typeof window !== 'undefined' ? '/api/rpc' : 'https://rpc.testnet.near.org';
export const BACKUP_TESTNET_RPC_URL = "https://rpc.testnet.near.org";
export const NEAR_EXPLORER_BASE = "https://testnet.nearblocks.io";

export const STORAGE_SAFETY_BUFFER_BYTES = 10_000n;
export const MAX_GLOBAL_PENDING = 32;
export const MAX_AGENT_PENDING = 2;
export const MIN_TTL_NANOS = 5n * 60n * 1_000_000_000n; // 5 min
export const MAX_TTL_NANOS = 24n * 60n * 60n * 1_000_000_000n; // 24 hours
export const DEFAULT_TTL_NANOS = 60n * 60n * 1_000_000_000n; // 1 hour

export type RequestStatus =
  | 'Pending'
  | 'InFlight'
  | 'Executed'
  | 'Failed'
  | 'Rejected'
  | 'Expired'
  | 'ReconciledExecuted'
  | 'ReconciledFailed';

export type PendingReason =
  | 'None'
  | 'NewDestinationOnly'
  | 'AboveThresholdOnly'
  | 'AboveThresholdAndNewDestination';

export type AttestedResolution = 'Executed' | 'Failed';

export type PolicyDenialReason =
  | 'VaultPaused'
  | 'AgentNotAuthorized'
  | 'ExceedsPerTransactionCap'
  | 'ExceedsDailyCap'
  | 'InsufficientLiquidBalance'
  | 'GlobalQueueLimitExceeded'
  | 'AgentQueueLimitExceeded'
  | 'InvalidTtl';

export type InvalidationReason =
  | 'VaultPaused'
  | 'AgentRevoked'
  | 'ExceedsPerTransactionCap'
  | 'ExceedsDailyCap'
  | 'InsufficientLiquidBalance'
  | 'DestinationDelisted';

export type AuditEventType =
  | 'PaymentPending'
  | 'PaymentDispatched'
  | 'PaymentPolicyDenied'
  | 'PaymentApproved'
  | 'PaymentRejected'
  | 'PaymentPolicyInvalidated'
  | 'PaymentExpired'
  | 'PaymentExecuted'
  | 'PaymentFailed'
  | 'PaymentReconciled'
  | 'CriticalDiscrepancy'
  | 'VaultAutoPaused'
  | 'VaultPaused'
  | 'VaultUnpaused'
  | 'AgentRegistered'
  | 'AgentRevoked'
  | 'PolicyUpdated'
  | 'DestinationAllowlisted'
  | 'DestinationDelisted'
  | 'OwnerWithdrawal'
  | 'TombstonePruned';

export interface SpendingPolicyView {
  max_per_transaction: string; // yoctoNEAR
  daily_cap: string;           // yoctoNEAR
  auto_approval_threshold: string; // yoctoNEAR
  destination_allowlist: string[];
  is_paused: boolean;
}

export interface DailyBucketView {
  bucket_index: number;
  spent: string;               // yoctoNEAR
  reserved: string;            // yoctoNEAR
  last_updated_at: number;     // nanos
}

export interface PaymentRequestView {
  id: number;
  agent_id: string;
  destination: string;
  amount: string;              // yoctoNEAR
  reason: string;
  created_at: number;          // nanos
  created_bucket: number;
  ttl_nanos: number;
  status: RequestStatus;
  origin_reason: PendingReason;
  dispatched_at: number | null;
}

export interface CompactAuditRecord {
  sequence_id: number;
  timestamp: number;           // nanos
  request_id: number;
  event_type: AuditEventType;
  account_id: string;
  amount: string;              // yoctoNEAR
  code: number;
}

export interface ReconciledTombstoneView {
  request_id: number;
  original_bucket: number;
  amount: string;              // yoctoNEAR
  attested_resolution: AttestedResolution;
  reconciled_at: number;
  evidence_tx_hash: string;
}

export interface VaultAccountOverview {
  contractId: string;
  ownerId: string;
  totalAccountBalance: string;     // yoctoNEAR
  storageUsageBytes: number;
  storageReserveRequirement: string; // yoctoNEAR
  protectedBalance: string;         // yoctoNEAR
  availableLiquidBalance: string;   // yoctoNEAR
  pendingReserved: string;          // yoctoNEAR
  inflightReserved: string;         // yoctoNEAR
  globalPendingCount: number;
  policy: SpendingPolicyView;
  isPaused: boolean;
  dailyBucket: DailyBucketView;
  pendingRequests: PaymentRequestView[];
  auditRecords: CompactAuditRecord[];
  authorizedAgents: string[];
}

