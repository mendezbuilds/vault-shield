/**
 * Vault Shield - Alpha Autonomous Agent Runtime Types
 * Strictly mirrors the Phase 1 Rust Smart Contract Interface (commit cc7760b)
 */
export const MIN_TTL_NANOS = 5 * 60 * 1_000_000_000; // 5 minutes
export const MAX_TTL_NANOS = 24 * 60 * 60 * 1_000_000_000; // 24 hours
export const DEFAULT_TTL_NANOS = 60 * 60 * 1_000_000_000; // 1 hour
export const MAX_GLOBAL_PENDING = 32;
export const MAX_AGENT_PENDING = 2;
//# sourceMappingURL=types.js.map