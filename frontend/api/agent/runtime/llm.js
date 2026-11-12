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
import { isValidNearAccountId } from './preflight.js';
import { parseNearToYocto } from './agent.js';
export const PAYMENT_TOOL_NAME = 'vault_shield_request_payment';
export const PAYMENT_TOOL_DESCRIPTION = 'Request a secure, policy-bounded payment through the existing Vault Shield agent runtime.';
/**
 * Validates arguments for vault_shield_request_payment tool call with defense-in-depth.
 * Strict rules:
 * - Must be an object, not null or array.
 * - Allowed keys strictly: ['destination', 'amountNear', 'reason']. Reject unexpected keys!
 * - 'destination': Valid NEAR account ID (NEP-0010 syntax).
 * - 'amountNear': Positive decimal string (e.g. "0.1"). Non-numeric, zero, negative, or units rejected.
 * - 'reason': Non-empty string, max length 256.
 */
export function validatePaymentToolArgs(args) {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return { valid: false, error: 'Malformed tool arguments: arguments must be a non-null object.' };
    }
    const record = args;
    // Reject unexpected fields (strict schema enforcement to block injection attempts)
    const allowedKeys = new Set(['destination', 'amountNear', 'reason']);
    const unexpectedKeys = Object.keys(record).filter(key => !allowedKeys.has(key));
    if (unexpectedKeys.length > 0) {
        return {
            valid: false,
            error: `Security violation: unexpected field(s) in payment tool arguments: [${unexpectedKeys.join(', ')}]. Only destination, amountNear, and reason are permitted.`,
        };
    }
    // Validate missing fields
    if (!('destination' in record) || record.destination === undefined || record.destination === null) {
        return { valid: false, error: 'Missing required field: "destination" is required.' };
    }
    if (!('amountNear' in record) || record.amountNear === undefined || record.amountNear === null) {
        return { valid: false, error: 'Missing required field: "amountNear" is required.' };
    }
    if (!('reason' in record) || record.reason === undefined || record.reason === null) {
        return { valid: false, error: 'Missing required field: "reason" is required.' };
    }
    // Validate destination
    if (typeof record.destination !== 'string') {
        return { valid: false, error: 'Invalid destination: destination must be a string representing a valid NEAR account ID.' };
    }
    const trimmedDest = record.destination.trim();
    if (!isValidNearAccountId(trimmedDest)) {
        return { valid: false, error: `Invalid NEAR account ID syntax for destination: "${record.destination}". Must comply with NEP-0010.` };
    }
    // Validate amountNear
    if (typeof record.amountNear !== 'string') {
        return { valid: false, error: 'Invalid amountNear: amount must be a string representing a positive decimal NEAR amount (e.g. "0.1").' };
    }
    const trimmedAmount = record.amountNear.trim();
    // Must match positive decimal format (e.g. "0.1", "1", "10.5"). Reject leading negative, letters, units, exponential notation.
    const decimalRegex = /^\d+(\.\d+)?$/;
    if (!decimalRegex.test(trimmedAmount)) {
        return { valid: false, error: `Invalid numeric format for amountNear: "${record.amountNear}". Expected positive decimal string (e.g. "0.15").` };
    }
    const numericAmount = parseFloat(trimmedAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        return { valid: false, error: `Invalid amountNear: amount must be strictly greater than zero (received "${record.amountNear}").` };
    }
    // Check yocto conversion
    try {
        const yocto = parseNearToYocto(trimmedAmount);
        if (BigInt(yocto) <= 0n) {
            return { valid: false, error: 'Invalid amountNear: yoctoNEAR conversion resulted in non-positive value.' };
        }
    }
    catch (err) {
        return { valid: false, error: `Failed to convert amountNear to yoctoNEAR: ${err.message}` };
    }
    // Validate reason
    if (typeof record.reason !== 'string') {
        return { valid: false, error: 'Invalid reason: reason must be a string.' };
    }
    const trimmedReason = record.reason.trim();
    if (trimmedReason.length === 0) {
        return { valid: false, error: 'Invalid reason: reason cannot be empty.' };
    }
    if (trimmedReason.length > 256) {
        return { valid: false, error: 'Invalid reason: reason exceeds maximum length of 256 characters.' };
    }
    return {
        valid: true,
        data: {
            destination: trimmedDest,
            amountNear: trimmedAmount,
            reason: trimmedReason,
        },
    };
}
/**
 * Deterministic offline provider for CI, automated testing, and reproducible demonstrations.
 */
export class MockLLMProvider {
    name = 'mock';
    customHandler;
    constructor(customHandler) {
        this.customHandler = customHandler;
    }
    setHandler(handler) {
        this.customHandler = handler;
    }
    async generateDecision(taskPrompt) {
        if (this.customHandler) {
            return await this.customHandler(taskPrompt);
        }
        const trimmed = taskPrompt.trim();
        // Simulation triggers for testing error handling
        if (trimmed.includes('SIMULATE_NETWORK_FAILURE') || trimmed.includes('simulate_network_failure')) {
            throw new Error('Simulated network connection failure to LLM endpoint');
        }
        if (trimmed.includes('SIMULATE_MALFORMED_ARGS') || trimmed.includes('simulate_malformed_args')) {
            return {
                type: 'tool_call',
                toolName: PAYMENT_TOOL_NAME,
                args: {
                    wrongField: 'unexpected',
                    amountNear: 0.1, // invalid type
                },
            };
        }
        if (trimmed.includes('SIMULATE_UNKNOWN_TOOL') || trimmed.includes('simulate_unknown_tool')) {
            return {
                type: 'tool_call',
                toolName: 'unauthorized_arbitrary_call',
                args: {},
            };
        }
        // Check for adversarial prompt injection (Requirement 6.7)
        const isOverrideOrTransfer = trimmed.toLowerCase().includes('override') ||
            trimmed.toLowerCase().includes('attacker') ||
            trimmed.toLowerCase().includes('ignore');
        // Extract NEAR amount: "0.1 NEAR", "0.1NEAR", "50 NEAR", "50.0 NEAR"
        const amountMatch = trimmed.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:NEAR|near|N)\b/);
        // Extract destination candidates across all to/from/recipient/destination keywords
        const destMatches = Array.from(trimmed.matchAll(/\b(?:to|from|recipient|destination)\s+([a-zA-Z0-9._-]+)/gi));
        let destination = null;
        // Prefer candidate that passes NEAR account ID syntax validation
        for (const m of destMatches) {
            const candidate = m[1].replace(/[.,;:!?]+$/, '').trim();
            if (isValidNearAccountId(candidate)) {
                destination = candidate;
                break;
            }
        }
        // If no candidate passes syntax (e.g. testing invalid destination syntax), take non-article candidate
        if (!destination && destMatches.length > 0) {
            const nonArticle = destMatches.find(m => !['a', 'an', 'the'].includes(m[1].toLowerCase()));
            destination = (nonArticle || destMatches[0])[1].replace(/[.,;:!?]+$/, '').trim();
        }
        if (destination && amountMatch) {
            const amountNear = amountMatch[1].trim();
            // Clean reason extraction
            let reason = 'AI Agent Task Payment';
            const worthOfMatch = trimmed.match(/worth\s+of\s+([^.,\n]+)/i);
            const isForAmount = /\bfor\s+[0-9]/i.test(trimmed);
            const forMatch = !isForAmount ? trimmed.match(/\b(?:for|reason:?)\s+([^.,\n]+)/i) : null;
            const actionMatch = trimmed.match(/^(?:purchase|subscribe(?:\s+to)?|pay(?:\s+for)?|procure)\s+([^.,\n]+?)(?:\s+from|\s+to|\s+for|\s+[0-9]|$)/i);
            if (worthOfMatch) {
                reason = worthOfMatch[1].trim();
            }
            else if (forMatch) {
                reason = forMatch[1].trim();
            }
            else if (actionMatch) {
                reason = actionMatch[1].trim();
            }
            else if (isOverrideOrTransfer) {
                reason = 'Adversarial instruction payment';
            }
            return {
                type: 'tool_call',
                toolName: PAYMENT_TOOL_NAME,
                args: {
                    destination,
                    amountNear,
                    reason,
                },
            };
        }
        // Default: task without payment requirement
        return {
            type: 'message',
            content: `Analyzed task: "${taskPrompt}". No financial transaction or payment was identified in this instruction.`,
        };
    }
}
/**
 * Live Google Gemini provider using native fetch.
 * Completely isolates the Gemini API from payment signing keys.
 */
export class GeminiLLMProvider {
    name = 'gemini';
    apiKey;
    model;
    timeoutMs;
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
        this.model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        this.timeoutMs = options.timeoutMs || 15000;
        if (!this.apiKey) {
            throw new Error('Gemini API key is missing. Set GEMINI_API_KEY environment variable or pass apiKey in options.');
        }
    }
    async generateDecision(taskPrompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Gemini API call timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: taskPrompt }],
                        },
                    ],
                    systemInstruction: {
                        parts: [
                            {
                                text: 'You are Vault Shield Agent Alpha, an autonomous AI assistant operating under strict financial security constraints. ' +
                                    'When a user task requires payment or transferring funds, you MUST invoke the `vault_shield_request_payment` tool with valid parameters. ' +
                                    'You NEVER have direct wallet access, private keys, or signing power. ' +
                                    'If no payment is required, explain why in a concise message.',
                            },
                        ],
                    },
                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: PAYMENT_TOOL_NAME,
                                    description: PAYMENT_TOOL_DESCRIPTION,
                                    parameters: {
                                        type: 'OBJECT',
                                        properties: {
                                            destination: {
                                                type: 'STRING',
                                                description: 'Valid recipient NEAR account ID (e.g. merchant.vault-parent.testnet)',
                                            },
                                            amountNear: {
                                                type: 'STRING',
                                                description: 'Positive decimal NEAR amount represented as a string (e.g. "0.1")',
                                            },
                                            reason: {
                                                type: 'STRING',
                                                description: 'Concise explanation of the intended payment',
                                            },
                                        },
                                        required: ['destination', 'amountNear', 'reason'],
                                    },
                                },
                            ],
                        },
                    ],
                    toolConfig: {
                        functionCallingConfig: {
                            mode: 'AUTO',
                        },
                    },
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                let errBody = '';
                try {
                    const errJson = await response.json();
                    errBody = errJson?.error?.message || JSON.stringify(errJson);
                }
                catch {
                    errBody = await response.text();
                }
                // Sanitize error: never leak API key!
                const sanitizedErr = errBody.split(this.apiKey).join('[REDACTED_API_KEY]');
                throw new Error(`Gemini API returned error ${response.status}: ${sanitizedErr}`);
            }
            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate || !candidate.content || !candidate.content.parts) {
                throw new Error('Gemini API returned empty candidate response');
            }
            for (const part of candidate.content.parts) {
                if (part.functionCall) {
                    return {
                        type: 'tool_call',
                        toolName: part.functionCall.name,
                        args: part.functionCall.args || {},
                    };
                }
            }
            const text = candidate.content.parts.map((p) => p.text || '').join('').trim();
            return {
                type: 'message',
                content: text || 'No payment required.',
            };
        }
        catch (err) {
            let safeMsg = err?.message || String(err);
            if (this.apiKey) {
                safeMsg = safeMsg.split(this.apiKey).join('[REDACTED_API_KEY]');
            }
            throw new Error(`Gemini provider failure: ${safeMsg}`);
        }
        finally {
            clearTimeout(timer);
        }
    }
}
export class AITaskRunner {
    agent;
    defaultProvider;
    constructor(agent, provider) {
        this.agent = agent;
        this.defaultProvider = provider || this.resolveProvider();
    }
    resolveProvider(providerName) {
        const config = this.agent.getConfig();
        const name = providerName || config.llmProvider || process.env.LLM_PROVIDER || 'mock';
        if (name.toLowerCase() === 'gemini') {
            return new GeminiLLMProvider({
                apiKey: config.geminiApiKey || process.env.GEMINI_API_KEY || undefined,
                model: config.geminiModel || process.env.GEMINI_MODEL || undefined,
            });
        }
        return new MockLLMProvider();
    }
    async runTask(taskPrompt, options = {}) {
        const provider = options.provider ||
            (options.providerName ? this.resolveProvider(options.providerName) : this.defaultProvider);
        // 1. Send task to configured LLM provider
        let decision;
        try {
            decision = await provider.generateDecision(taskPrompt);
        }
        catch (err) {
            return {
                success: false,
                taskPrompt,
                provider: provider.name,
                decisionType: 'PROVIDER_ERROR',
                error: `LLM provider execution failed: ${err?.message || err}`,
            };
        }
        // 2. Handle no-payment decision
        if (decision.type === 'message') {
            return {
                success: true,
                taskPrompt,
                provider: provider.name,
                decisionType: 'NO_PAYMENT_REQUIRED',
                explanation: decision.content,
            };
        }
        // 3. Handle tool call decision
        if (decision.type === 'tool_call') {
            if (decision.toolName !== PAYMENT_TOOL_NAME) {
                return {
                    success: false,
                    taskPrompt,
                    provider: provider.name,
                    decisionType: 'VALIDATION_FAILED',
                    validationError: `Unauthorized tool call: expected "${PAYMENT_TOOL_NAME}", received "${decision.toolName}".`,
                    error: `AI requested an unauthorized or unknown tool: "${decision.toolName}".`,
                };
            }
            // 4. Validate tool arguments strictly
            const validation = validatePaymentToolArgs(decision.args);
            if (!validation.valid) {
                return {
                    success: false,
                    taskPrompt,
                    provider: provider.name,
                    decisionType: 'VALIDATION_FAILED',
                    validationError: validation.error,
                    error: `Tool argument validation failed: ${validation.error}`,
                };
            }
            // 5. Delegate validated intent to existing VaultAgent pipeline
            const validatedIntent = validation.data;
            const paymentResult = await this.agent.requestPayment({
                destination: validatedIntent.destination,
                amountNear: validatedIntent.amountNear,
                reason: validatedIntent.reason,
            }, options.dryRun !== undefined ? { dryRun: options.dryRun } : {});
            const isSuccess = paymentResult.status === 'DRY_RUN_SUCCESS' ||
                paymentResult.status === 'PAYMENT_EXECUTED' ||
                paymentResult.status === 'PAYMENT_DISPATCHED' ||
                paymentResult.status === 'PENDING_OWNER_APPROVAL';
            return {
                success: isSuccess,
                taskPrompt,
                provider: provider.name,
                decisionType: 'PAYMENT_REQUESTED',
                proposedIntent: validatedIntent,
                paymentResult,
                error: isSuccess ? undefined : paymentResult.error || paymentResult.message,
            };
        }
        return {
            success: false,
            taskPrompt,
            provider: provider.name,
            decisionType: 'PROVIDER_ERROR',
            error: 'Unexpected decision format from LLM provider.',
        };
    }
}
//# sourceMappingURL=llm.js.map