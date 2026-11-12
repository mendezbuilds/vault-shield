import { SpendingPolicyView, DailyBucketView, PreflightResult, PaymentRequestView, ReconciledTombstoneView, PaymentIntent } from './types.js';
import { AgentConfig } from './config.js';
export interface ContractViewProvider {
    isPaused(): Promise<boolean>;
    isAgentAuthorized(agentId: string): Promise<boolean>;
    getPolicy(): Promise<SpendingPolicyView>;
    getDailyBucket(dayIndex?: number): Promise<DailyBucketView>;
    getAvailableLiquidBalance(): Promise<string>;
    getAgentPendingCount(agentId: string): Promise<number>;
    getGlobalPendingCount(): Promise<number>;
    getRequest(requestId: number): Promise<PaymentRequestView | null>;
    getTombstone?(requestId: number): Promise<ReconciledTombstoneView | null>;
    getTransactionStatus?(txHash: string, signerAccountId: string): Promise<any>;
    getOwner?(): Promise<string>;
}
/**
 * Standard RPC-based contract view provider using JSON-RPC query:call_function.
 * Enforces configurable bounded timeouts and fail-closed error handling.
 */
export declare class NearRpcContractViewProvider implements ContractViewProvider {
    private rpcUrl;
    private fallbackRpcUrl;
    private contractId;
    private timeoutMs;
    constructor(rpcUrl: string, fallbackRpcUrl: string, contractId: string, timeoutMs?: number);
    private callViewMethod;
    isPaused(): Promise<boolean>;
    isAgentAuthorized(agentId: string): Promise<boolean>;
    getPolicy(): Promise<SpendingPolicyView>;
    getDailyBucket(dayIndex?: number): Promise<DailyBucketView>;
    getAvailableLiquidBalance(): Promise<string>;
    getAgentPendingCount(agentId: string): Promise<number>;
    getGlobalPendingCount(): Promise<number>;
    getOwner(): Promise<string>;
    getRequest(requestId: number): Promise<PaymentRequestView | null>;
    getTombstone(requestId: number): Promise<ReconciledTombstoneView | null>;
    getTransactionStatus(txHash: string, signerAccountId: string): Promise<any>;
}
/**
 * Validates NEAR account ID syntax according to NEP-0010.
 */
export declare function isValidNearAccountId(accountId: string): boolean;
/**
 * Executes a comprehensive, read-only pre-flight advisory check against the live vault contract.
 * Fails closed if any invariant check fails or if RPC state cannot be retrieved.
 */
export declare function executePreflight(intent: PaymentIntent, config: AgentConfig, viewProvider?: ContractViewProvider): Promise<PreflightResult>;
//# sourceMappingURL=preflight.d.ts.map