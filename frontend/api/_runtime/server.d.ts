import http from 'http';
import { AgentConfig } from './config.js';
export declare const DEFAULT_RUNTIME_PORT = 3888;
export declare const RUNTIME_SECRET: string;
export interface SigningServerOptions {
    port?: number;
    config?: Partial<AgentConfig>;
    secret?: string;
    rateLimitMaxRequests?: number;
}
/**
 * Creates and starts the persistent server-side signing runtime for Vault Shield.
 * Guarantees zero private key leakage, timing-safe authentication, strict origin
 * filtering, rate limiting, and restricts execution strictly to
 * request_payment on vault-cleartoad8704.testnet with zero deposit.
 */
export declare function createSigningServer(options?: SigningServerOptions): {
    server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map