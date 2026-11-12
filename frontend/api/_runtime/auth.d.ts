/**
 * Derives a cryptographically strong 256-bit runtime authentication secret.
 * Guarantees that the literal secret is never committed in plaintext to git or printed in logs.
 */
export declare function deriveRuntimeSecret(): string;
/**
 * Returns the effective runtime secret.
 * Priority: process.env.AGENT_RUNTIME_SECRET > derived rotated secret.
 */
export declare function getEffectiveRuntimeSecret(): string;
/**
 * Constant-time comparison to prevent timing side-channel attacks.
 */
export declare function timingSafeEqualString(a: string, b: string): boolean;
/**
 * Validates request authentication bearer token or header against expected secret.
 */
export declare function validateRuntimeAuth(headers: Record<string, string | string[] | undefined>, expectedSecret: string): boolean;
/**
 * Allowlisted origins for cross-origin browser requests.
 */
export declare const ALLOWED_ORIGINS: (string | RegExp)[];
export declare function isOriginAllowed(originHeader: string | undefined): boolean;
export declare class RateLimiter {
    private limits;
    private windowMs;
    private maxRequests;
    constructor(windowMs?: number, maxRequests?: number);
    check(ip: string, maxOverride?: number): {
        allowed: boolean;
        remaining: number;
        resetInMs: number;
    };
    cleanup(): void;
}
//# sourceMappingURL=auth.d.ts.map