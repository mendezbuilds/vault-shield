import path from 'path';
import fs from 'fs';
import os from 'os';

// Configuration paths
const envAgentPath = path.resolve(process.cwd(), '.env.agent');
const envDefaultPath = path.resolve(process.cwd(), '.env');

function parseSimpleEnv(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}

// Opt-in check for plaintext secret loading from disk
const isExplicitPlaintextOptIn = process.env.AGENT_ALLOW_PLAINTEXT_ENV === 'true';

if (fs.existsSync(envAgentPath)) {
  if (isExplicitPlaintextOptIn) {
    parseSimpleEnv(envAgentPath);
    console.warn(
      '\x1b[33m⚠️  OPERATIONAL SECURITY WARNING: Loading credentials from plaintext file (.env.agent). In production environments, inject AGENT_PRIVATE_KEY directly into the container/OS environment without writing keys to disk.\x1b[0m'
    );
  } else if (!process.env.AGENT_PRIVATE_KEY) {
    // Only inform if credentials are not already injected in process.env
    console.warn(
      '\x1b[36mℹ️  Notice: Local .env.agent detected. Plaintext file loading is disabled by default for security. Set AGENT_ALLOW_PLAINTEXT_ENV=true to enable file loading for development, or inject AGENT_PRIVATE_KEY directly into process.env.\x1b[0m'
    );
  }
} else if (fs.existsSync(envDefaultPath) && isExplicitPlaintextOptIn) {
  parseSimpleEnv(envDefaultPath);
}

export interface AgentConfig {
  networkId: string;
  rpcUrl: string;
  fallbackRpcUrl: string;
  vaultContractId: string;
  agentAccountId: string;
  expectedPublicKey: string;
  privateKey: string | null;
  ledgerPath: string;
  lockfilePath: string;
  phase1StrictBoundary: boolean;
  rpcTimeoutMs: number;
  lockTtlMs: number;
  allowPlaintextEnv: boolean;
  llmProvider: string;
  geminiApiKey: string | null;
  geminiModel: string;
  signingRuntimeUrl: string;
  signingRuntimeSecret: string;
}

export const NEW_AGENT_RESTRICTED_PUBLIC_KEY = 'ed25519:E1dDCJgqc7AEhM57PsmXzorNoVTiGBBUgWxHz35bvK24';
export const LEGACY_RESTRICTED_PUBLIC_KEY = 'ed25519:2H8EupC9ApTAPYPMu3a5DWxDdcX6X3wX22tcqsocV9Kq';
export const EXPECTED_RESTRICTED_PUBLIC_KEY = NEW_AGENT_RESTRICTED_PUBLIC_KEY;
export const DEFAULT_CONTRACT_ID = 'vault-cleartoad8704.testnet';
export const DEFAULT_AGENT_ACCOUNT_ID = 'agent.cleartoad8704.testnet';
export const LEGACY_PARENT_CONTRACT_ID = 'contract.vault-parent.testnet';
export const LEGACY_AGENT_ACCOUNT_ID = 'agent-a.vault-parent.testnet';
export const DEFAULT_RPC_TIMEOUT_MS = 15000;
export const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_SIGNING_RUNTIME_URL = 'https://never-camel-structure-whatever.trycloudflare.com';
export const DEFAULT_SIGNING_RUNTIME_SECRET = 'vs_runtime_sec_7f9b8c2d1e4a6035';

export function loadConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const allowPlaintextEnv = overrides.allowPlaintextEnv !== undefined
    ? overrides.allowPlaintextEnv
    : (process.env.AGENT_ALLOW_PLAINTEXT_ENV === 'true');

  if (allowPlaintextEnv && fs.existsSync(envAgentPath) && !overrides.privateKey) {
    parseSimpleEnv(envAgentPath);
  }

  const networkId = overrides.networkId || process.env.NEAR_NETWORK_ID || 'testnet';
  const rpcUrl = overrides.rpcUrl || process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
  const fallbackRpcUrl = overrides.fallbackRpcUrl || process.env.NEAR_FALLBACK_RPC_URL || 'https://test.rpc.fastnear.com';
  const vaultContractId = overrides.vaultContractId || process.env.VAULT_CONTRACT_ID || DEFAULT_CONTRACT_ID;
  const agentAccountId = overrides.agentAccountId || process.env.AGENT_ACCOUNT_ID || DEFAULT_AGENT_ACCOUNT_ID;
  const expectedPublicKey = overrides.expectedPublicKey || process.env.AGENT_EXPECTED_PUBLIC_KEY || EXPECTED_RESTRICTED_PUBLIC_KEY;
  let privateKey = overrides.privateKey !== undefined ? overrides.privateKey : (process.env.AGENT_PRIVATE_KEY || null);

  // Automatically attempt fallback to secure local NEAR credentials store if available and not explicitly provided
  if (!privateKey && typeof process !== 'undefined') {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const credPath = path.resolve(homeDir, '.near-credentials', networkId, `${agentAccountId}.json`);
      if (fs.existsSync(credPath)) {
        const credData = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        if (credData.private_key || credData.secret_key) {
          privateKey = credData.private_key || credData.secret_key;
        }
      }
    } catch {}
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const defaultBaseDir = isServerless ? os.tmpdir() : process.cwd();
  const defaultLedgerPath = isServerless
    ? path.resolve(defaultBaseDir, 'vault-ledger.json')
    : path.resolve(defaultBaseDir, 'data', 'ledger.json');
  const defaultLockfilePath = isServerless
    ? path.resolve(defaultBaseDir, 'vault-agent.lock')
    : path.resolve(defaultBaseDir, '.agent.lock');

  const ledgerPath = overrides.ledgerPath || process.env.AGENT_LEDGER_PATH || defaultLedgerPath;
  const lockfilePath = overrides.lockfilePath || process.env.AGENT_LOCKFILE_PATH || defaultLockfilePath;
  const phase1StrictBoundary = overrides.phase1StrictBoundary !== undefined
    ? overrides.phase1StrictBoundary
    : process.env.AGENT_PHASE1_STRICT_BOUNDARY !== 'false';
  const rpcTimeoutMs = overrides.rpcTimeoutMs || (process.env.AGENT_RPC_TIMEOUT_MS ? Number(process.env.AGENT_RPC_TIMEOUT_MS) : DEFAULT_RPC_TIMEOUT_MS);
  const lockTtlMs = overrides.lockTtlMs || (process.env.AGENT_LOCK_TTL_MS ? Number(process.env.AGENT_LOCK_TTL_MS) : DEFAULT_LOCK_TTL_MS);
  const llmProvider = overrides.llmProvider || process.env.LLM_PROVIDER || 'mock';
  const geminiApiKey = overrides.geminiApiKey !== undefined ? overrides.geminiApiKey : (process.env.GEMINI_API_KEY || null);
  const geminiModel = overrides.geminiModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const signingRuntimeUrl = overrides.signingRuntimeUrl || process.env.AGENT_SIGNING_RUNTIME_URL || DEFAULT_SIGNING_RUNTIME_URL;
  const signingRuntimeSecret = overrides.signingRuntimeSecret || process.env.AGENT_RUNTIME_SECRET || DEFAULT_SIGNING_RUNTIME_SECRET;

  return {
    networkId,
    rpcUrl,
    fallbackRpcUrl,
    vaultContractId,
    agentAccountId,
    expectedPublicKey,
    privateKey,
    ledgerPath,
    lockfilePath,
    phase1StrictBoundary,
    rpcTimeoutMs,
    lockTtlMs,
    allowPlaintextEnv,
    llmProvider,
    geminiApiKey,
    geminiModel,
    signingRuntimeUrl,
    signingRuntimeSecret,
  };
}

/**
 * Returns a sanitized copy of configuration safe for logging or terminal display.
 * Strictly guarantees that private keys and sensitive credentials are never serialized or leaked.
 */
export function getSafeConfig(config: AgentConfig): Omit<AgentConfig, 'privateKey' | 'geminiApiKey' | 'signingRuntimeSecret'> & { hasPrivateKey: boolean; hasGeminiApiKey: boolean; hasSigningRuntimeSecret: boolean } {
  const { privateKey, geminiApiKey, signingRuntimeSecret, ...safe } = config;
  return {
    ...safe,
    hasPrivateKey: Boolean(privateKey && privateKey.trim().length > 0),
    hasGeminiApiKey: Boolean(geminiApiKey && geminiApiKey.trim().length > 0),
    hasSigningRuntimeSecret: Boolean(signingRuntimeSecret && signingRuntimeSecret.trim().length > 0),
  };
}
