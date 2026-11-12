import { ExecutionRecord, PaymentIntent, TransactionOutcomeStatus } from './types.js';
export interface LockMetadata {
    pid: number;
    createdAt: string;
    timestamp: number;
    hostname: string;
    platform: string;
    nodeVersion: string;
}
/**
 * Process-level concurrency lock using an atomic filesystem flag.
 * Prevents multiple local agent runtime instances from stepping on nonces.
 * Supports robust stale-lock recovery with process liveness and Lock TTL checks.
 */
export declare class ProcessLock {
    private lockfilePath;
    private lockTtlMs;
    private isLocked;
    private fd;
    private exitHandler;
    constructor(lockfilePath: string, lockTtlMs?: number);
    acquire(): void;
    release(): void;
}
/**
 * Generates a unique, high-entropy intent identifier.
 */
export declare function generateIntentId(prefix?: string): string;
/**
 * Persistent local execution ledger.
 *
 * NOTE ON SECURITY ARCHITECTURE:
 * Local intent IDs guarantee client-side idempotency and prevent duplicate task initiation within
 * the runtime. On-chain replay protection is separately and strictly enforced by NEAR access-key
 * monotonic nonces at the consensus layer.
 */
export declare class ExecutionLedger {
    private ledgerPath;
    private records;
    constructor(ledgerPath: string);
    private load;
    private save;
    getRecord(intentId: string): ExecutionRecord | null;
    getAllRecords(): ExecutionRecord[];
    /**
     * Clears in-memory cache and reloads records directly from disk.
     */
    reload(): void;
    /**
     * Checks whether a task with this intent ID has already been executed or is actively processing.
     */
    hasDuplicate(intentId: string): boolean;
    /**
     * Initializes or updates an intent record before or during execution.
     */
    recordIntent(intent: PaymentIntent, initialStatus: TransactionOutcomeStatus, txHash?: string): ExecutionRecord;
    /**
     * Updates an existing ledger record with verified outcome details.
     */
    updateRecord(intentId: string, updates: Partial<ExecutionRecord>): ExecutionRecord;
    /**
     * Returns records that experienced ambiguous RPC outcomes and require reconciliation.
     */
    getPendingReconciliations(): ExecutionRecord[];
}
//# sourceMappingURL=ledger.d.ts.map