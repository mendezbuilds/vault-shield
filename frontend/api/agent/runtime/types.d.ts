/**
 * Vault Shield - Alpha Autonomous Agent Runtime Types
 * Strictly mirrors the Phase 1 Rust Smart Contract Interface (commit cc7760b)
 */
export declare const MIN_TTL_NANOS: number;
export declare const MAX_TTL_NANOS: number;
export declare const DEFAULT_TTL_NANOS: number;
export declare const MAX_GLOBAL_PENDING = 32;
export declare const MAX_AGENT_PENDING = 2;
export type RequestStatus = 'Pending' | 'InFlight' | 'Executed' | 'Failed' | 'Rejected' | 'Expired' | 'ReconciledExecuted' | 'ReconciledFailed';
export type PendingReason = 'None' | 'NewDestinationOnly' | 'AboveThresholdOnly' | 'AboveThresholdAndNewDestination';
export type PolicyDenialReason = 'VaultPaused' | 'AgentNotAuthorized' | 'ExceedsPerTransactionCap' | 'ExceedsDailyCap' | 'InsufficientLiquidBalance' | 'GlobalQueueLimitExceeded' | 'AgentQueueLimitExceeded' | 'InvalidTtl';
export type InvalidationReason = 'VaultPaused' | 'AgentRevoked' | 'ExceedsPerTransactionCap' | 'ExceedsDailyCap' | 'InsufficientLiquidBalance' | 'DestinationDelisted';
export interface SpendingPolicyView {
    max_per_transaction: string;
    daily_cap: string;
    auto_approval_threshold: string;
    destination_allowlist: string[];
    is_paused: boolean;
}
export interface DailyBucketView {
    bucket_index: number;
    spent: string;
    reserved: string;
    last_updated_at: number;
}
export interface PaymentRequestView {
    id: number;
    agent_id: string;
    destination: string;
    amount: string;
    reason: string;
    created_at: number;
    created_bucket: number;
    ttl_nanos: number;
    status: RequestStatus;
    origin_reason: PendingReason;
    dispatched_at?: number | null;
}
export interface ReconciledTombstoneView {
    request_id: number;
    original_bucket: number;
    amount: string;
    attested_resolution: 'Executed' | 'Failed';
    reconciled_at: number;
    evidence_tx_hash: string;
}
export type ExecutionResult = {
    Dispatched: {
        request_id: number;
    };
} | {
    Pending: {
        request_id: number;
        origin_reason: PendingReason;
    };
} | {
    Denied: {
        reason: PolicyDenialReason;
    };
};
export interface RequestPaymentArgs {
    destination: string;
    amount: string;
    reason: string;
    ttl_nanos?: number | null;
}
export interface PaymentIntent {
    intentId: string;
    destination: string;
    amountNear: string;
    amountYocto: string;
    reason: string;
    ttlSeconds?: number;
    createdAt: number;
}
export interface PreflightCheckItem {
    check: string;
    passed: boolean;
    detail: string;
}
export interface PreflightResult {
    success: boolean;
    checks: PreflightCheckItem[];
    predictedRouting?: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
    predictedReason?: PendingReason | PolicyDenialReason;
    error?: string;
    vaultState?: {
        isPaused: boolean;
        isAgentAuthorized: boolean;
        availableLiquidYocto: string;
        agentPendingCount: number;
        globalPendingCount: number;
        dailySpentYocto: string;
        dailyReservedYocto: string;
        dailyCapYocto: string;
        maxPerTxYocto: string;
        autoApprovalThresholdYocto: string;
        isDestinationAllowlisted: boolean;
    };
}
export type TransactionOutcomeStatus = 'LOCAL_PREFLIGHT_REJECTED' | 'DRY_RUN_SUCCESS' | 'TRANSACTION_BROADCAST_PENDING' | 'PAYMENT_DISPATCHED' | 'PENDING_OWNER_APPROVAL' | 'PAYMENT_EXECUTED' | 'DOWNSTREAM_TRANSFER_FAILED' | 'REQUEST_REJECTED' | 'REQUEST_EXPIRED' | 'CONTRACT_DENIED' | 'UNKNOWN_UNRESOLVED';
export interface ExecutionRecord {
    intentId: string;
    status: TransactionOutcomeStatus;
    destination: string;
    amountNear: string;
    amountYocto: string;
    reason: string;
    txHash?: string;
    requestId?: number;
    originReason?: PendingReason;
    policyDenialReason?: PolicyDenialReason;
    errorMessage?: string;
    timestamp: number;
    lastReconciledAt?: number;
}
export interface ReconciliationResult {
    intentId: string;
    txHash?: string;
    previousStatus: TransactionOutcomeStatus;
    newStatus: TransactionOutcomeStatus;
    message: string;
    updated: boolean;
    requestId?: number;
}
//# sourceMappingURL=types.d.ts.map