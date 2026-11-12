/**
 * Vault Shield - AI Agent Intelligence Layer (Task 1.1)
 *
 * Implements the natural-language task runner, payment tool schema,
 * strict argument validation, and provider abstractions (Mock & Gemini).
 *
 * CRITICAL SECURITY INVARIANT:
 * The AI layer has ZERO access to private keys or direct transaction signing.
 * All payments MUST pass through validatePaymentToolArgs -> VaultAgent.requestPayment -> preflight -> restricted signer.
 */
import { RequestPaymentResult } from './agent.js';
export declare const PAYMENT_TOOL_NAME = "vault_shield_request_payment";
export declare const PAYMENT_TOOL_DESCRIPTION = "Request a secure, policy-bounded payment through the existing Vault Shield agent runtime.";
export interface ValidatedPaymentToolArgs {
    destination: string;
    amountNear: string;
    reason: string;
}
export type ValidationResult = {
    valid: true;
    data: ValidatedPaymentToolArgs;
} | {
    valid: false;
    error: string;
};
/**
 * Validates arguments for vault_shield_request_payment tool call with defense-in-depth.
 * Strict rules:
 * - Must be an object, not null or array.
 * - Allowed keys strictly: ['destination', 'amountNear', 'reason']. Reject unexpected keys!
 * - 'destination': Valid NEAR account ID (NEP-0010 syntax).
 * - 'amountNear': Positive decimal string (e.g. "0.1"). Non-numeric, zero, negative, or units rejected.
 * - 'reason': Non-empty string, max length 256.
 */
export declare function validatePaymentToolArgs(args: unknown): ValidationResult;
export type LLMDecision = {
    type: 'tool_call';
    toolName: string;
    args: Record<string, any>;
} | {
    type: 'message';
    content: string;
};
export interface LLMProvider {
    readonly name: string;
    generateDecision(taskPrompt: string): Promise<LLMDecision>;
}
/**
 * Deterministic offline provider for CI, automated testing, and reproducible demonstrations.
 */
export declare class MockLLMProvider implements LLMProvider {
    readonly name = "mock";
    private customHandler?;
    constructor(customHandler?: (prompt: string) => Promise<LLMDecision> | LLMDecision);
    setHandler(handler?: (prompt: string) => Promise<LLMDecision> | LLMDecision): void;
    generateDecision(taskPrompt: string): Promise<LLMDecision>;
}
/**
 * Live Google Gemini provider using native fetch.
 * Completely isolates the Gemini API from payment signing keys.
 */
export declare class GeminiLLMProvider implements LLMProvider {
    readonly name = "gemini";
    private apiKey;
    private model;
    private timeoutMs;
    constructor(options?: {
        apiKey?: string;
        model?: string;
        timeoutMs?: number;
    });
    generateDecision(taskPrompt: string): Promise<LLMDecision>;
}
export interface IVaultAgent {
    requestPayment(intentInput: {
        destination: string;
        amountNear: string;
        reason: string;
        ttlSeconds?: number;
        intentId?: string;
    }, options?: {
        dryRun?: boolean;
    }): Promise<RequestPaymentResult>;
    getConfig(): {
        llmProvider?: string;
        phase1StrictBoundary: boolean;
        geminiApiKey?: string | null;
        geminiModel?: string;
        [key: string]: any;
    };
}
export interface AITaskOptions {
    dryRun?: boolean;
    provider?: LLMProvider;
    providerName?: string;
}
export interface AITaskResult {
    success: boolean;
    taskPrompt: string;
    provider: string;
    decisionType: 'PAYMENT_REQUESTED' | 'NO_PAYMENT_REQUIRED' | 'PROVIDER_ERROR' | 'VALIDATION_FAILED';
    explanation?: string;
    proposedIntent?: ValidatedPaymentToolArgs;
    validationError?: string;
    paymentResult?: RequestPaymentResult;
    error?: string;
}
export declare class AITaskRunner {
    private agent;
    private defaultProvider;
    constructor(agent: IVaultAgent, provider?: LLMProvider);
    private resolveProvider;
    runTask(taskPrompt: string, options?: AITaskOptions): Promise<AITaskResult>;
}
//# sourceMappingURL=llm.d.ts.map