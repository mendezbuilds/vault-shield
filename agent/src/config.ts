import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Look for .env.agent first, then .env
const envAgentPath = path.resolve(process.cwd(), '.env.agent');
const envDefaultPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envAgentPath)) {
  dotenv.config({ path: envAgentPath });
} else if (fs.existsSync(envDefaultPath)) {
  dotenv.config({ path: envDefaultPath });
} else {
  dotenv.config();
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
}

export const EXPECTED_RESTRICTED_PUBLIC_KEY = 'ed25519:2H8EupC9ApTAPYPMu3a5DWxDdcX6X3wX22tcqsocV9Kq';
export const DEFAULT_CONTRACT_ID = 'contract.vault-parent.testnet';
export const DEFAULT_AGENT_ACCOUNT_ID = 'agent-a.vault-parent.testnet';

export function loadConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const networkId = overrides.networkId || process.env.NEAR_NETWORK_ID || 'testnet';
  const rpcUrl = overrides.rpcUrl || process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
  const fallbackRpcUrl = overrides.fallbackRpcUrl || process.env.NEAR_FALLBACK_RPC_URL || 'https://test.rpc.fastnear.com';
  const vaultContractId = overrides.vaultContractId || process.env.VAULT_CONTRACT_ID || DEFAULT_CONTRACT_ID;
  const agentAccountId = overrides.agentAccountId || process.env.AGENT_ACCOUNT_ID || DEFAULT_AGENT_ACCOUNT_ID;
  const expectedPublicKey = overrides.expectedPublicKey || process.env.AGENT_EXPECTED_PUBLIC_KEY || EXPECTED_RESTRICTED_PUBLIC_KEY;
  const privateKey = overrides.privateKey !== undefined ? overrides.privateKey : (process.env.AGENT_PRIVATE_KEY || null);
  const ledgerPath = overrides.ledgerPath || process.env.AGENT_LEDGER_PATH || path.resolve(process.cwd(), 'data', 'ledger.json');
  const lockfilePath = overrides.lockfilePath || process.env.AGENT_LOCKFILE_PATH || path.resolve(process.cwd(), '.agent.lock');
  const phase1StrictBoundary = overrides.phase1StrictBoundary !== undefined
    ? overrides.phase1StrictBoundary
    : process.env.AGENT_PHASE1_STRICT_BOUNDARY !== 'false';

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
  };
}

/**
 * Returns a sanitized copy of configuration safe for logging or terminal display.
 * Strictly guarantees that private keys and sensitive credentials are never serialized or leaked.
 */
export function getSafeConfig(config: AgentConfig): Omit<AgentConfig, 'privateKey'> & { hasPrivateKey: boolean } {
  const { privateKey, ...safe } = config;
  return {
    ...safe,
    hasPrivateKey: Boolean(privateKey && privateKey.trim().length > 0),
  };
}
