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
export declare const NEW_AGENT_RESTRICTED_PUBLIC_KEY = "ed25519:E1dDCJgqc7AEhM57PsmXzorNoVTiGBBUgWxHz35bvK24";
export declare const LEGACY_RESTRICTED_PUBLIC_KEY = "ed25519:2H8EupC9ApTAPYPMu3a5DWxDdcX6X3wX22tcqsocV9Kq";
export declare const EXPECTED_RESTRICTED_PUBLIC_KEY = "ed25519:E1dDCJgqc7AEhM57PsmXzorNoVTiGBBUgWxHz35bvK24";
export declare const DEFAULT_CONTRACT_ID = "vault-cleartoad8704.testnet";
export declare const DEFAULT_AGENT_ACCOUNT_ID = "agent.cleartoad8704.testnet";
export declare const LEGACY_PARENT_CONTRACT_ID = "contract.vault-parent.testnet";
export declare const LEGACY_AGENT_ACCOUNT_ID = "agent-a.vault-parent.testnet";
export declare const DEFAULT_RPC_TIMEOUT_MS = 15000;
export declare const DEFAULT_LOCK_TTL_MS: number;
export declare const DEFAULT_SIGNING_RUNTIME_URL = "https://never-camel-structure-whatever.trycloudflare.com";
export declare const DEFAULT_SIGNING_RUNTIME_SECRET = "vs_runtime_sec_7f9b8c2d1e4a6035";
export declare function loadConfig(overrides?: Partial<AgentConfig>): AgentConfig;
/**
 * Returns a sanitized copy of configuration safe for logging or terminal display.
 * Strictly guarantees that private keys and sensitive credentials are never serialized or leaked.
 */
export declare function getSafeConfig(config: AgentConfig): Omit<AgentConfig, 'privateKey' | 'geminiApiKey' | 'signingRuntimeSecret'> & {
    hasPrivateKey: boolean;
    hasGeminiApiKey: boolean;
    hasSigningRuntimeSecret: boolean;
};
//# sourceMappingURL=config.d.ts.map