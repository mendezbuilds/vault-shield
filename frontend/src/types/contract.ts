/**
 * Exact TypeScript representations of the frozen NEAR AI Agent Vault Contract (cc7760b).
 */

export const VAULT_CONTRACT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAULT_CONTRACT_ID) ||
  "vault-cleartoad8704.testnet";

export const EXPECTED_OWNER_ID =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_OWNER_ID) ||
  "cleartoad8704.testnet";

export const FROZEN_WASM_CODE_HASH = "BYyC6N382AZAVy9VUR1vGD9EmpnXq6Qpbww6f6BRXhsb";
export const FROZEN_WASM_SHA256 = "9cc568f54d3b8d527c3eb3e077dea4df7c0ab3e02a0c5fbe63507b89eaf722c6";

export const TESTNET_RPC_URL = typeof window !== 'undefined' ? '/api/rpc' : 'https://rpc.testnet.near.org';
export const BACKUP_TESTNET_RPC_URL = "https://rpc.testnet.near.org";
export const NEAR_EXPLORER_BASE = "https://testnet.nearblocks.io";

export const MAX_PROTOCOL_GAS = 300_000_000_000_000n; // 300 Tgas protocol limit
export const STORAGE_SAFETY_BUFFER_BYTES = 10_000n;
export const MAX_GLOBAL_PENDING = 32;
export const MAX_AGENT_PENDING = 2;
export const MIN_TTL_NANOS = 5n * 60n * 1_000_000_000n; // 5 min
export const MAX_TTL_NANOS = 24n * 60n * 60n * 1_000_000_000n; // 24 hours
export const DEFAULT_TTL_NANOS = 60n * 60n * 1_000_000_000n; // 1 hour

/**
 * Method-specific gas allocations adhering to NEAR protocol limits and callback requirements:
 * - withdraw: 50 Tgas (Promise::transfer)
 * - approve_request: 60 Tgas (includes 15 Tgas for on_transfer_complete callback)
 * - request_payment: 60 Tgas (includes 15 Tgas for on_transfer_complete callback on auto-approval)
 * - set_policy, add_agent, revoke_agent, add_destination, remove_destination: 40 Tgas
 * - pause, unpause: 30 Tgas
 * - reject_request, expire_request: 40 Tgas
 * - reconcile_stuck_request: 50 Tgas
 * - prune_reconciled_tombstone: 40 Tgas
 */
export const DEFAULT_METHOD_GAS: Record<string, string> = {
  pause: '30000000000000',                      // 30 Tgas
  unpause: '30000000000000',                    // 30 Tgas
  set_policy: '40000000000000',                 // 40 Tgas
  add_destination: '40000000000000',            // 40 Tgas
  remove_destination: '40000000000000',         // 40 Tgas
  add_agent: '40000000000000',                  // 40 Tgas
  revoke_agent: '40000000000000',               // 40 Tgas
  withdraw: '50000000000000',                   // 50 Tgas
  request_payment: '60000000000000',            // 60 Tgas
  approve_request: '60000000000000',            // 60 Tgas
  reject_request: '40000000000000',             // 40 Tgas
  expire_request: '40000000000000',             // 40 Tgas
  reconcile_stuck_request: '50000000000000',    // 50 Tgas
  prune_reconciled_tombstone: '40000000000000', // 40 Tgas
};

export interface StagedTransaction {
  network: string;
  signerId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, any>;
  depositYocto: string;
  depositNear: string;
  gasUnits: string;
  gasTgas: string;
}

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
  isDeployed: boolean;
  isInitialized: boolean;
  codeHashMatches: boolean;
}
