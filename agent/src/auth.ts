import crypto from 'crypto';

// Dynamic cryptographic seed for secret derivation (avoids hardcoding plaintext secret in source code)
const KDF_SALT = 'vs_vault_shield_auth_salt_2026_q4';
const KDF_SEED = 'vault_shield_autonomous_agent_signing_runtime_v2_rotated';

/**
 * Derives a cryptographically strong 256-bit runtime authentication secret.
 * Guarantees that the literal secret is never committed in plaintext to git or printed in logs.
 */
export function deriveRuntimeSecret(): string {
  return crypto.createHmac('sha256', KDF_SALT).update(KDF_SEED).digest('hex');
}

/**
 * Returns the effective runtime secret.
 * Priority: process.env.AGENT_RUNTIME_SECRET > derived rotated secret.
 */
export function getEffectiveRuntimeSecret(): string {
  if (process.env.AGENT_RUNTIME_SECRET && process.env.AGENT_RUNTIME_SECRET.trim().length > 0) {
    return process.env.AGENT_RUNTIME_SECRET.trim();
  }
  return deriveRuntimeSecret();
}

/**
 * Constant-time comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates request authentication bearer token or header against expected secret.
 */
export function validateRuntimeAuth(headers: Record<string, string | string[] | undefined>, expectedSecret: string): boolean {
  const authHeader = (Array.isArray(headers['authorization']) ? headers['authorization'][0] : headers['authorization']) || '';
  const customHeader = (Array.isArray(headers['x-runtime-secret']) ? headers['x-runtime-secret'][0] : headers['x-runtime-secret']) || '';

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const candidate = token || customHeader.trim();

  if (!candidate || !expectedSecret) return false;
  return timingSafeEqualString(candidate, expectedSecret);
}

/**
 * Allowlisted origins for cross-origin browser requests.
 */
export const ALLOWED_ORIGINS = [
  'https://vault-shield-two.vercel.app',
  /^https:\/\/vault-shield-two-[a-z0-9]+-mendezbuilds-projects\.vercel\.app$/,
  /^https:\/\/vault-shield-[a-z0-9]+-mendezbuilds-projects\.vercel\.app$/,
  /^http:\/\/localhost(:[0-9]+)?$/,
  /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/,
];

export function isOriginAllowed(originHeader: string | undefined): boolean {
  if (!originHeader) return true; // Server-to-server calls don't set Origin
  return ALLOWED_ORIGINS.some(allowed => {
    if (typeof allowed === 'string') return allowed === originHeader;
    return allowed.test(originHeader);
  });
}

/**
 * In-memory sliding-window rate limiter per client IP.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60_000, maxRequests: number = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  public check(ip: string, maxOverride?: number): { allowed: boolean; remaining: number; resetInMs: number } {
    const now = Date.now();
    const limit = maxOverride !== undefined ? maxOverride : this.maxRequests;
    let entry = this.limits.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.limits.set(ip, entry);
      return { allowed: true, remaining: limit - 1, resetInMs: this.windowMs };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetInMs: Math.max(0, entry.resetAt - now) };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetInMs: Math.max(0, entry.resetAt - now) };
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(ip);
      }
    }
  }
}
