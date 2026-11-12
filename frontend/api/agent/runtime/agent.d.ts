import { AgentConfig, getSafeConfig } from './config.js';
import { PaymentIntent, PreflightResult, TransactionOutcomeStatus, ReconciliationResult } from './types.js';
import { ContractViewProvider } from './preflight.js';
import { AgentSigner, SignedPayloadPreview } from './signer.js';
import { ExecutionLedger } from './ledger.js';
import { AITaskOptions, AITaskResult } from './llm.js';
export interface AgentStatusReport {
    agentAccountId: string;
    vaultContractId: string;
    networkId: string;
    expectedPublicKey: string;
    signerPublicKey: string | null;
    hasSigningKey: boolean;
    isAgentAuthorized: boolean;
    isVaultPaused: boolean;
    availableLiquidNear: string;
    dailyCapNear: string;
    dailySpentNear: string;
    dailyReservedNear: string;
    maxPerTxNear: string;
    autoApprovalThresholdNear: string;
    destinationAllowlist: string[];
    agentPendingCount: number;
    globalPendingCount: number;
}
export interface RequestPaymentResult {
    status: TransactionOutcomeStatus;
    intentId: string;
    txHash?: string;
    requestId?: number;
    preview?: SignedPayloadPreview;
    preflight: PreflightResult;
    message: string;
    error?: string;
}
/**
 * Converts a decimal NEAR string into exact yoctoNEAR string.
 */
export declare function parseNearToYocto(nearAmount: string): string;
/**
 * Converts a yoctoNEAR string into a human-readable NEAR string.
 */
export declare function formatYoctoToNear(yoctoAmount: string, decimals?: number): string;
/**
 * Main coordinator for the Alpha Autonomous Agent Runtime.
 */
export declare class VaultAgent {
    private config;
    private viewProvider;
    private signer;
    private ledger;
    private lock;
    constructor(customConfig?: Partial<AgentConfig>, customViewProvider?: ContractViewProvider, customSigner?: AgentSigner);
    getConfig(): ReturnType<typeof getSafeConfig>;
    /**
     * Retrieves full status of agent permissions, access key, and vault policy metrics.
     */
    getStatus(): Promise<AgentStatusReport>;
    /**
     * Runs an advisory pre-flight check without acquiring locks or initiating signing.
     */
    preflight(intent: PaymentIntent): Promise<PreflightResult>;
    /**
     * Executes a natural-language task using the AI intelligence layer.
     * Interprets task via configured LLM provider, validates proposed payment parameters,
     * and routes through the standard requestPayment pipeline.
     *
     * SECURITY GUARANTEE:
     * The AI layer NEVER accesses private keys or signing logic directly.
     */
    runTask(taskPrompt: string, options?: AITaskOptions): Promise<AITaskResult>;
    /**
     * Handles payment request execution lifecycle:
     * 1. Concurrency lock acquisition with stale-lock recovery
     * 2. Idempotency deduplication
     * 3. Advisory pre-flight simulation
     * 4. Dry-run payload preview OR live broadcast (gated by Phase 1 boundary)
     * 5. Two-stage transaction construction with hash persistence BEFORE broadcast
     * 6. Receipt inspection and status determination
     * 7. Lock release
     */
    requestPayment(intentInput: {
        destination: string;
        amountNear: string;
        reason: string;
        ttlSeconds?: number;
        intentId?: string;
    }, options?: {
        dryRun?: boolean;
    }): Promise<RequestPaymentResult>;
    /**
     * Queries on-chain request view and tombstone to determine the exact terminal state.
     * Maps all 8 frozen contract RequestStatus variants and tombstone resolutions.
     * Fails closed on missing, malformed, or unexpected responses.
     */
    resolveOnChainRequestStatus(requestId: number): Promise<{
        status: TransactionOutcomeStatus;
        updated: boolean;
        message: string;
    }>;
    /**
     * Reconciles ambiguous or in-flight transaction records against NEAR RPC.
     * Acquired under single-instance process lock to prevent concurrent races.
     * NEVER blindly rebuilds or rebroadcasts transactions.
     */
    reconcilePending(targetIntentId?: string): Promise<ReconciliationResult[]>;
    /**
     * Distinguishes exact contract return values and execution receipts.
     * Correctly maps Dispatched to an interim state rather than premature execution.
     */
    parseExecutionOutcome(rawOutcome: any): {
        status: TransactionOutcomeStatus;
        requestId?: number;
        originReason?: any;
        policyDenialReason?: any;
        message: string;
        errorMessage?: string;
    };
    getLedger(): ExecutionLedger;
    getViewProvider(): ContractViewProvider;
}
//# sourceMappingURL=agent.d.ts.map