import { AgentApiToken } from './types.js';
export interface TokenValidationResult {
    valid: boolean;
    token?: AgentApiToken;
    error?: string;
    statusCode?: number;
}
/**
 * Manages external AI agent API credentials with SHA-256 token hashing,
 * server-side revocation, rate limiting, and persistent JSON storage.
 */
export declare class ApiTokenManager {
    private storagePath;
    private tokens;
    private rateLimitWindow;
    constructor(storagePath: string);
    reload(): void;
    private load;
    private save;
    hashToken(rawToken: string): string;
    /**
     * Ensures at least one active standard external agent credential exists for testing & demo.
     * Bootstrap token: "vsa_live_demo_external_agent_token_2026_sec"
     */
    private ensureBootstrapTokens;
    /**
     * Generates a new cryptographic API token for an external agent.
     * Returns the raw token ONCE. Only the SHA-256 hash is persisted.
     */
    createToken(params: {
        agentName: string;
        expiresInMs?: number;
        permissions?: string[];
        rateLimitPerMin?: number;
    }): {
        token: string;
        record: AgentApiToken;
    };
    /**
     * Revokes a token immediately.
     */
    revokeToken(tokenId: string): boolean;
    /**
     * Validates a raw Bearer token against stored token hashes with timing-safe comparison.
     */
    validateToken(rawToken: string): TokenValidationResult;
    private checkRateLimit;
    listTokens(): Omit<AgentApiToken, 'tokenHash'>[];
    getToken(tokenId: string): Omit<AgentApiToken, 'tokenHash'> | null;
}
//# sourceMappingURL=apiTokens.d.ts.map