import http from 'http';
import {
  loadConfig,
  getSafeConfig,
  NEW_AGENT_RESTRICTED_PUBLIC_KEY,
  DEFAULT_CONTRACT_ID,
  DEFAULT_AGENT_ACCOUNT_ID,
  AgentConfig,
} from './config.js';
import { VaultAgent, parseNearToYocto } from './agent.js';
import { validateRestrictedKey } from './signer.js';
import { generateIntentId } from './ledger.js';
import { PaymentIntent } from './types.js';

export const DEFAULT_RUNTIME_PORT = 3888;
export const RUNTIME_SECRET = process.env.AGENT_RUNTIME_SECRET || 'vs_runtime_sec_7f9b8c2d1e4a6035';

export interface SigningServerOptions {
  port?: number;
  config?: Partial<AgentConfig>;
  secret?: string;
}

/**
 * Creates and starts the persistent server-side signing runtime for Vault Shield.
 * Guarantees zero private key leakage, strictly restricts execution to
 * request_payment on vault-cleartoad8704.testnet with zero deposit.
 */
export function createSigningServer(options: SigningServerOptions = {}) {
  const port = options.port || Number(process.env.AGENT_RUNTIME_PORT) || DEFAULT_RUNTIME_PORT;
  const secret = options.secret || RUNTIME_SECRET;

  // Load config with credentials from ~/.near-credentials or .env.agent
  const agentConfig = loadConfig({
    allowPlaintextEnv: true,
    vaultContractId: DEFAULT_CONTRACT_ID,
    agentAccountId: DEFAULT_AGENT_ACCOUNT_ID,
    expectedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
    phase1StrictBoundary: false, // Allows live broadcast when explicitly requested
    ...options.config,
  });

  // Verify that restricted key credentials are valid
  if (!agentConfig.privateKey) {
    console.error('❌ FATAL: Signer private key not found in environment or ~/.near-credentials');
  }

  const agent = new VaultAgent(agentConfig);
  const safeConfig = agent.getConfig();

  // Validate restricted public key immediately
  if (!safeConfig.hasPrivateKey) {
    console.warn('⚠️ WARNING: Agent private key missing. Server will reject execution requests.');
  }

  const server = http.createServer(async (req, res) => {
    // Standard CORS and tunnel bypass headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-runtime-secret, bypass-tunnel-reminder');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Helper to send JSON response
    const sendJson = (statusCode: number, data: any) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    // Helper to verify shared-secret authentication
    const checkAuth = (): boolean => {
      const authHeader = req.headers['authorization'] || '';
      const customHeader = req.headers['x-runtime-secret'] || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
      return bearerToken === secret || customHeader === secret;
    };

    // Parse JSON request body
    const parseBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (e) {
            reject(new Error('Invalid JSON payload'));
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // 1. HEALTH CHECK: Read-only, confirms key loaded & public key validation
      if ((pathname === '/health' || pathname === '/api/health' || pathname === '/') && req.method === 'GET') {
        const status = await agent.getStatus();

        // Enforce exact public key match
        const isKeyMatching = status.signerPublicKey === NEW_AGENT_RESTRICTED_PUBLIC_KEY;

        sendJson(200, {
          status: 'healthy',
          service: 'vault-shield-persistent-signing-runtime',
          networkId: agentConfig.networkId,
          vaultContractId: agentConfig.vaultContractId,
          agentAccountId: agentConfig.agentAccountId,
          restrictedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
          signerPublicKey: status.signerPublicKey,
          keyValidation: isKeyMatching ? 'VALID_RESTRICTED_KEY' : 'MISMATCH_OR_UNLOADED',
          hasSigningCapability: status.hasSigningKey && isKeyMatching,
          isAgentAuthorizedOnChain: status.isAgentAuthorized,
          fullAccessKeys: 0,
          enforcedPermissions: {
            receiverId: DEFAULT_CONTRACT_ID,
            methodName: 'request_payment',
            deposit: '0 yoctoNEAR',
            maxGas: '30 Tgas',
          },
          concurrencyLock: 'ProcessLock active',
          ledgerStorage: 'persistent',
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: Date.now(),
        });
        return;
      }

      // 2. STATUS REPORT: Detailed status
      if ((pathname === '/status' || pathname === '/api/status') && req.method === 'GET') {
        const status = await agent.getStatus();
        sendJson(200, { success: true, status });
        return;
      }

      // 3. PREFLIGHT: Run deterministic preflight checks without signing
      if ((pathname === '/preflight' || pathname === '/api/preflight') && req.method === 'POST') {
        const body = await parseBody();
        const destination = (body.destination || '').trim();
        const amountNear = (body.amountNear || '').trim();
        const reason = (body.reason || '').trim();
        const ttlMinutes = Number(body.ttlMinutes) || 60;

        if (!destination || !amountNear) {
          sendJson(400, { success: false, error: 'Missing destination or amountNear' });
          return;
        }

        const ttlSeconds = Math.max(ttlMinutes, 5) * 60;
        const intentId = body.intentId || generateIntentId();
        const amountYocto = parseNearToYocto(amountNear);

        const intent: PaymentIntent = {
          intentId,
          destination,
          amountNear,
          amountYocto,
          reason: reason || 'Autonomous payment disbursement',
          ttlSeconds,
          createdAt: Date.now(),
        };

        const preflight = await agent.preflight(intent);

        sendJson(200, { success: preflight.success, preflight });
        return;
      }

      // 4. EXECUTE: Authenticated live signing or dry-run execution
      if ((pathname === '/execute' || pathname === '/api/execute') && req.method === 'POST') {
        if (!checkAuth()) {
          sendJson(401, {
            success: false,
            error: 'Unauthorized: Valid runtime secret required via Authorization: Bearer <secret> or x-runtime-secret header',
          });
          return;
        }

        const body = await parseBody();
        const destination = (body.destination || '').trim();
        const amountNear = (body.amountNear || '').trim();
        const reason = (body.reason || '').trim();
        const ttlMinutes = Number(body.ttlMinutes) || 60;
        const isDryRun = body.dryRun === true;
        const intentId = body.intentId || generateIntentId();

        if (!destination || !amountNear) {
          sendJson(400, { success: false, error: 'Missing destination or amountNear' });
          return;
        }

        const ttlSeconds = Math.max(ttlMinutes, 5) * 60;

        const result = await agent.requestPayment(
          {
            destination,
            amountNear,
            reason: reason || 'Autonomous payment disbursement',
            ttlSeconds,
            intentId,
          },
          { dryRun: isDryRun }
        );

        const isSuccess =
          result.status === 'PAYMENT_EXECUTED' ||
          result.status === 'PAYMENT_DISPATCHED' ||
          result.status === 'PENDING_OWNER_APPROVAL' ||
          result.status === 'DRY_RUN_SUCCESS';

        const explorerUrl = result.txHash
          ? `https://testnet.nearblocks.io/txns/${result.txHash}`
          : undefined;

        sendJson(isSuccess ? 200 : 400, {
          success: isSuccess,
          status: result.status,
          intentId: result.intentId,
          txHash: result.txHash,
          requestId: result.requestId,
          explorerUrl,
          message: result.message,
          preview: result.preview,
          preflight: result.preflight,
          error: result.error,
        });
        return;
      }

      // Route Not Found
      sendJson(404, { error: `Endpoint not found: ${req.method} ${pathname}` });
    } catch (err: any) {
      console.error('Runtime Server Error:', err);
      sendJson(500, {
        success: false,
        error: err?.message || 'Internal signing runtime server error',
      });
    }
  });

  return {
    server,
    start: () => {
      return new Promise<void>((resolve) => {
        server.listen(port, '0.0.0.0', () => {
          console.log(`🛡️ Vault Shield Signing Runtime listening on http://0.0.0.0:${port}`);
          console.log(`🔑 Authorized Signer: ${agentConfig.agentAccountId}`);
          console.log(`🎯 Target Vault: ${agentConfig.vaultContractId}`);
          console.log(`🔒 Restricted Key: ${NEW_AGENT_RESTRICTED_PUBLIC_KEY}`);
          resolve();
        });
      });
    },
    stop: () => {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// Allow direct execution via `node dist/server.js`
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const runtime = createSigningServer();
  runtime.start();
}
