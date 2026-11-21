import { StoredIntent, IntentLifecycleStatus, IntentSource } from './types.js';
import { VaultAgent } from './agent.js';
export interface SubmitIntentInput {
    destination: string;
    amountNear: string;
    reason?: string;
    ttlMinutes?: number;
    source: IntentSource;
    agentId?: string;
    rawPrompt?: string;
    idempotencyKey?: string;
    createdAt?: number;
    intentId?: string;
}
export interface IntentQueryFilters {
    status?: IntentLifecycleStatus | 'ALL';
    source?: IntentSource | 'ALL';
    search?: string;
    limit?: number;
    offset?: number;
}
/**
 * Persistent Intent Queue and Lifecycle Orchestrator for Vault Shield.
 * Guarantees crash-resilient persistence, strict handoff vs vault TTL separation,
 * append-only audit trail logging, and seamless routing into VaultAgent runtime.
 */
export declare class IntentQueue {
    private storagePath;
    private intents;
    private idempotencyIndex;
    constructor(storagePath: string);
    reload(): void;
    private load;
    private save;
    /**
     * Evaluates external handoff deadlines for uningested intents.
     * If an intent remains in 'RECEIVED' state and exceeds 300s window, transitions to HANDOFF_EXPIRED.
     */
    checkHandoffExpiries(): void;
    /**
     * Submits a new payment intent into the persistent queue in state RECEIVED.
     * Enforces idempotency protection, NEP-0010 syntax check, and assigns distinct 300s handoff deadline.
     */
    submitIntent(input: SubmitIntentInput): {
        intent: StoredIntent;
        isDuplicate: boolean;
    };
    /**
     * Processes an intent through the full VaultAgent runtime pipeline:
     * RECEIVED -> INGESTED -> VALIDATING -> PREFLIGHT -> AWAITING_APPROVAL / DISPATCHED -> COMPLETED / FAILED / EXPIRED.
     */
    processIntent(intentId: string, agent: VaultAgent, options?: {
        dryRun?: boolean;
    }): Promise<StoredIntent>;
    /**
     * Reconciles active intents against on-chain status and evaluates the Vault Payment TTL.
     */
    reconcileIntents(agent: VaultAgent): Promise<void>;
    getIntent(intentId: string): StoredIntent | null;
    listIntents(filters?: IntentQueryFilters): {
        intents: StoredIntent[];
        total: number;
    };
}
//# sourceMappingURL=intentQueue.d.ts.map