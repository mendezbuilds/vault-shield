import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
export class ApiTokenManager {
  private tokens: Map<string, AgentApiToken> = new Map();
  private rateLimitWindow = new Map<string, { count: number; resetAt: number }>();

  constructor(private storagePath: string) {
    this.load();
    this.ensureBootstrapTokens();
  }

  public reload(): void {
    this.tokens.clear();
    this.load();
    this.ensureBootstrapTokens();
  }

  private load(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const items: AgentApiToken[] = JSON.parse(raw);
        for (const item of items) {
          this.tokens.set(item.tokenId, item);
        }
      }
    } catch (err: any) {
      console.warn(`[ApiTokenManager] Could not load tokens from ${this.storagePath}: ${err.message}`);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const items = Array.from(this.tokens.values());
      const tempPath = `${this.storagePath}.${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), 'utf8');

      try {
        fs.renameSync(tempPath, this.storagePath);
      } catch {
        fs.copyFileSync(tempPath, this.storagePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } catch (err: any) {
      console.error(`[ApiTokenManager] Failed to persist tokens: ${err.message}`);
    }
  }

  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  }

  /**
   * Ensures at least one active standard external agent credential exists for testing & demo.
   * Bootstrap token: "vsa_live_demo_external_agent_token_2026_sec"
   */
  private ensureBootstrapTokens(): void {
    const bootstrapTokens = [
      {
        tokenId: 'tok_bootstrap_agent_01',
        token: 'vsa_live_demo_external_agent_token_2026_sec',
        agentName: 'Verified External AI Agent (Autonomous Worker)',
        tokenPrefix: 'vsa_live_demo..._sec',
      },
      {
        tokenId: 'tok_bootstrap_agent_cleartoad',
        token: 'vsa_live_agent_cleartoad8704_sec_99182a',
        agentName: 'agent.cleartoad8704.testnet',
        tokenPrefix: 'vsa_live_cleartoad..._sec',
      },
    ];

    let mutated = false;
    for (const b of bootstrapTokens) {
      const hash = this.hashToken(b.token);
      const existing = Array.from(this.tokens.values()).find(t => t.tokenHash === hash);
      if (!existing) {
        this.tokens.set(b.tokenId, {
          tokenId: b.tokenId,
          agentName: b.agentName,
          tokenHash: hash,
          tokenPrefix: b.tokenPrefix,
          createdAt: 1731175200000,
          expiresAt: null,
          revoked: false,
          revokedAt: null,
          permissions: ['submit_intent', 'query_intent'],
          rateLimitPerMin: 60,
        });
        mutated = true;
      }
    }
    if (mutated) this.save();
  }

  /**
   * Generates a new cryptographic API token for an external agent.
   * Returns the raw token ONCE. Only the SHA-256 hash is persisted.
   */
  public createToken(params: {
    agentName: string;
    expiresInMs?: number;
    permissions?: string[];
    rateLimitPerMin?: number;
  }): { token: string; record: AgentApiToken } {
    this.reload();
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawToken = `vsa_live_${randomHex}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenId = `tok_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tokenPrefix = `${rawToken.slice(0, 12)}...${rawToken.slice(-4)}`;

    const record: AgentApiToken = {
      tokenId,
      agentName: params.agentName.trim(),
      tokenHash,
      tokenPrefix,
      createdAt: Date.now(),
      expiresAt: params.expiresInMs ? Date.now() + params.expiresInMs : null,
      revoked: false,
      revokedAt: null,
      permissions: params.permissions || ['submit_intent', 'query_intent'],
      rateLimitPerMin: params.rateLimitPerMin || 60,
    };

    this.tokens.set(tokenId, record);
    this.save();

    return { token: rawToken, record };
  }

  /**
   * Revokes a token immediately.
   */
  public revokeToken(tokenId: string): boolean {
    this.reload();
    const record = this.tokens.get(tokenId);
    if (!record) return false;

    record.revoked = true;
    record.revokedAt = Date.now();
    this.save();
    return true;
  }

  /**
   * Validates a raw Bearer token against stored token hashes with timing-safe comparison.
   */
  public validateToken(rawToken: string): TokenValidationResult {
    this.reload();
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, error: 'Missing or malformed Authorization token.', statusCode: 401 };
    }

    const trimmed = rawToken.trim();
    const candidateHash = this.hashToken(trimmed);
    const candidateHashBuffer = Buffer.from(candidateHash, 'hex');

    for (const record of this.tokens.values()) {
      const storedHashBuffer = Buffer.from(record.tokenHash, 'hex');
      if (
        storedHashBuffer.length === candidateHashBuffer.length &&
        crypto.timingSafeEqual(storedHashBuffer, candidateHashBuffer)
      ) {
        if (record.revoked) {
          return {
            valid: false,
            error: 'API Token has been revoked by the Vault Owner.',
            statusCode: 403,
            token: record,
          };
        }

        if (record.expiresAt && Date.now() > record.expiresAt) {
          return {
            valid: false,
            error: 'API Token has expired.',
            statusCode: 401,
            token: record,
          };
        }

        // Rate limit check per token
        const rateCheck = this.checkRateLimit(record.tokenId, record.rateLimitPerMin);
        if (!rateCheck.allowed) {
          return {
            valid: false,
            error: `API Rate limit exceeded for this agent credential (${record.rateLimitPerMin} req/min). Try again in ${Math.ceil(rateCheck.resetInMs / 1000)}s.`,
            statusCode: 429,
            token: record,
          };
        }

        return { valid: true, token: record };
      }
    }

    return { valid: false, error: 'Invalid API credential. Access denied.', statusCode: 401 };
  }

  private checkRateLimit(tokenId: string, limitPerMin: number): { allowed: boolean; resetInMs: number } {
    const now = Date.now();
    const windowMs = 60_000;
    let entry = this.rateLimitWindow.get(tokenId);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      this.rateLimitWindow.set(tokenId, entry);
      return { allowed: true, resetInMs: windowMs };
    }

    if (entry.count >= limitPerMin) {
      return { allowed: false, resetInMs: Math.max(0, entry.resetAt - now) };
    }

    entry.count++;
    return { allowed: true, resetInMs: Math.max(0, entry.resetAt - now) };
  }

  public listTokens(): Omit<AgentApiToken, 'tokenHash'>[] {
    this.reload();
    return Array.from(this.tokens.values()).map(({ tokenHash, ...safe }) => safe);
  }

  public getToken(tokenId: string): Omit<AgentApiToken, 'tokenHash'> | null {
    this.reload();
    const t = this.tokens.get(tokenId);
    if (!t) return null;
    const { tokenHash, ...safe } = t;
    return safe;
  }
}
