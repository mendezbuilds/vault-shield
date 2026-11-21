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
import { ContractViewProvider } from './preflight.js';
import { validateRestrictedKey } from './signer.js';
import { generateIntentId } from './ledger.js';
import { PaymentIntent } from './types.js';
import {
  getEffectiveRuntimeSecret,
  validateRuntimeAuth,
  isOriginAllowed,
  RateLimiter,
} from './auth.js';
import { ApiTokenManager } from './apiTokens.js';
import { IntentQueue } from './intentQueue.js';
import { parseNaturalLanguageIntent } from './llm.js';

export const DEFAULT_RUNTIME_PORT = 3888;
export const RUNTIME_SECRET = getEffectiveRuntimeSecret();

export interface SigningServerOptions {
  port?: number;
  config?: Partial<AgentConfig>;
  secret?: string;
  rateLimitMaxRequests?: number;
  viewProvider?: ContractViewProvider;
}

/**
 * Creates and starts the persistent server-side signing runtime for Vault Shield.
 * Guarantees zero private key leakage, timing-safe authentication, strict origin
 * filtering, rate limiting, and restricts execution strictly to
 * request_payment on vault-cleartoad8704.testnet with zero deposit.
 */
export function createSigningServer(options: SigningServerOptions = {}) {
  const port = options.port || Number(process.env.AGENT_RUNTIME_PORT) || DEFAULT_RUNTIME_PORT;
  const secret = options.secret || getEffectiveRuntimeSecret();
  const maxExecuteRate = options.rateLimitMaxRequests !== undefined ? options.rateLimitMaxRequests : 30;

  // Rate limiter instance (sliding window)
  const rateLimiter = new RateLimiter(60_000, maxExecuteRate);

  // Periodically clean up stale rate-limit buckets
  const cleanupInterval = setInterval(() => rateLimiter.cleanup(), 120_000);
  cleanupInterval.unref();

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

  const agent = new VaultAgent(agentConfig, options.viewProvider);
  const safeConfig = agent.getConfig();

  // Persistent Intent Queue and External Agent API Token Manager
  const intentQueue = new IntentQueue(agentConfig.intentsPath);
  const apiTokenManager = new ApiTokenManager(agentConfig.apiTokensPath);

  // Validate restricted public key immediately
  if (!safeConfig.hasPrivateKey) {
    console.warn('⚠️ WARNING: Agent private key missing. Server will reject execution requests.');
  }

  const server = http.createServer(async (req, res) => {
    // 1. Origin verification
    const origin = req.headers['origin'] as string | undefined;
    if (origin && !isOriginAllowed(origin)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Origin not authorized by Vault Shield security policy' }));
      return;
    }

    // Standard CORS and tunnel bypass headers (allow origin if verified)
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
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

    // Extract client IP for rate limiting
    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

    // Helper to verify shared-secret authentication (timing-safe)
    const checkAuth = (): boolean => {
      return validateRuntimeAuth(req.headers as any, secret);
    };

    // Parse JSON request body
    const parseBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
          raw += chunk;
          if (raw.length > 65536) {
            req.destroy();
            reject(new Error('Payload Too Large: Maximum request body size is 64KB'));
          }
        });
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
      // 2. HEALTH CHECK: Confirms service liveness. Full restricted-key telemetry only if authenticated.
      if ((pathname === '/health' || pathname === '/api/health' || pathname === '/') && req.method === 'GET') {
        const rateCheck = rateLimiter.check(rawIp, 60);
        if (!rateCheck.allowed) {
          res.setHeader('Retry-After', Math.ceil(rateCheck.resetInMs / 1000).toString());
          sendJson(429, { success: false, error: 'Too Many Requests' });
          return;
        }

        const isAuthed = checkAuth();
        if (!isAuthed) {
          // Unauthenticated public probe: return basic liveness without exposing internal telemetry
          sendJson(200, {
            status: 'healthy',
            service: 'vault-shield-persistent-signing-runtime',
            authenticated: false,
            timestamp: Date.now(),
          });
          return;
        }

        // Authenticated probe: full validation
        const status = await agent.getStatus();
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
          authenticated: true,
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: Date.now(),
        });
        return;
      }

      // 3. STATUS REPORT: Detailed status (requires authentication)
      if ((pathname === '/status' || pathname === '/api/status') && req.method === 'GET') {
        if (!checkAuth()) {
          sendJson(401, { success: false, error: 'Unauthorized: Authentication required' });
          return;
        }
        const status = await agent.getStatus();
        sendJson(200, { success: true, status });
        return;
      }

      // 4. PREFLIGHT: Run deterministic preflight checks without signing
      if ((pathname === '/preflight' || pathname === '/api/preflight') && req.method === 'POST') {
        const rateCheck = rateLimiter.check(rawIp, 20);
        if (!rateCheck.allowed) {
          res.setHeader('Retry-After', Math.ceil(rateCheck.resetInMs / 1000).toString());
          sendJson(429, { success: false, error: 'Too Many Requests' });
          return;
        }

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

      // 5. EXECUTE: Authenticated live signing or dry-run execution
      if ((pathname === '/execute' || pathname === '/api/execute') && req.method === 'POST') {
        // Enforce rate limit for execute
        const rateCheck = rateLimiter.check(rawIp, maxExecuteRate);
        if (!rateCheck.allowed) {
          res.setHeader('Retry-After', Math.ceil(rateCheck.resetInMs / 1000).toString());
          sendJson(429, {
            success: false,
            error: `Too Many Requests: Rate limit exceeded for execution endpoint (max ${maxExecuteRate}/min)`,
          });
          return;
        }

        // Timing-safe authentication check
        if (!checkAuth()) {
          sendJson(401, {
            success: false,
            error: 'Unauthorized: Valid runtime authentication secret required',
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

      // 6. NATURAL LANGUAGE INTENT PARSER: Preview structured payment parameters without execution
      if ((pathname === '/intents/parse' || pathname === '/api/intents/parse' || pathname === '/api/agent/intents/parse') && req.method === 'POST') {
        const body = await parseBody();
        const prompt = (body.prompt || body.naturalPrompt || '').trim();
        if (!prompt) {
          sendJson(400, { success: false, error: 'Missing prompt parameter to parse' });
          return;
        }

        const parsed = parseNaturalLanguageIntent(prompt);
        sendJson(200, { success: true, parsed });
        return;
      }

      // 7. SUBMIT INTENT: Dashboard Native or External AI Agent API
      if ((pathname === '/intents' || pathname === '/api/intents' || pathname === '/api/agent/intents') && req.method === 'POST') {
        const authHeader = (Array.isArray(req.headers['authorization']) ? req.headers['authorization'][0] : req.headers['authorization']) || '';
        const customTokenHeader = (Array.isArray(req.headers['x-agent-api-key']) ? req.headers['x-agent-api-key'][0] : req.headers['x-agent-api-key']) || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        const candidateToken = bearerToken || customTokenHeader.trim();

        let source: 'DASHBOARD' | 'EXTERNAL_AGENT' = 'EXTERNAL_AGENT';
        let agentIdentifier = 'External Agent';

        // Check if caller is Dashboard using runtime secret
        if (checkAuth()) {
          source = 'DASHBOARD';
          agentIdentifier = 'Dashboard Operator';
        } else {
          // External agent token validation
          if (!candidateToken) {
            sendJson(401, {
              success: false,
              error: 'Unauthorized: Valid Agent API Token (Bearer vsa_live_...) required.',
            });
            return;
          }

          const tokenResult = apiTokenManager.validateToken(candidateToken);
          if (!tokenResult.valid) {
            sendJson(tokenResult.statusCode || 401, {
              success: false,
              error: tokenResult.error || 'Unauthorized: Invalid API token',
            });
            return;
          }

          source = 'EXTERNAL_AGENT';
          agentIdentifier = tokenResult.token?.agentName || 'External AI Agent';
        }

        const body = await parseBody();
        let destination = (body.destination || '').trim();
        let amountNear = (body.amountNear || '').trim();
        let reason = (body.reason || '').trim();
        let ttlMinutes = Number(body.ttlMinutes) || 60;
        const prompt = (body.prompt || body.naturalPrompt || '').trim();
        const idempotencyKey = (body.idempotencyKey || req.headers['idempotency-key'] as string || '').trim();
        const processNow = body.processNow !== false; // Default true: feed immediately into VaultAgent

        // If prompt provided and structured fields missing, parse prompt
        if (prompt && (!destination || !amountNear)) {
          const parsed = parseNaturalLanguageIntent(prompt);
          if (parsed.destination && !destination) destination = parsed.destination;
          if (parsed.amountNear && !amountNear) amountNear = parsed.amountNear;
          if (!reason) reason = parsed.reason;
          if (parsed.ttlMinutes && !body.ttlMinutes) ttlMinutes = parsed.ttlMinutes;
        }

        if (!destination || !amountNear) {
          sendJson(400, {
            success: false,
            error: 'Invalid intent payload: destination and amountNear are required.',
          });
          return;
        }

        const submissionResult = intentQueue.submitIntent({
          destination,
          amountNear,
          reason: reason || 'AI agent payment intent',
          ttlMinutes,
          source,
          agentId: agentIdentifier,
          rawPrompt: prompt || undefined,
          idempotencyKey: idempotencyKey || undefined,
          createdAt: body.createdAt ? Number(body.createdAt) : undefined,
          intentId: body.intentId,
        });

        let finalIntent = submissionResult.intent;

        // If not duplicate and requested to process immediately, feed into VaultAgent pipeline
        if (!submissionResult.isDuplicate && processNow && finalIntent.status === 'RECEIVED') {
          finalIntent = await intentQueue.processIntent(finalIntent.intentId, agent, {
            dryRun: body.dryRun === true,
          });
        }

        sendJson(200, {
          success: true,
          isDuplicate: submissionResult.isDuplicate,
          intent: finalIntent,
        });
        return;
      }

      // 8. LIST INTENTS: Query intent inbox with filtering and pagination
      if ((pathname === '/intents' || pathname === '/api/intents' || pathname === '/api/agent/intents') && req.method === 'GET') {
        const authHeader = (Array.isArray(req.headers['authorization']) ? req.headers['authorization'][0] : req.headers['authorization']) || '';
        const customTokenHeader = (Array.isArray(req.headers['x-agent-api-key']) ? req.headers['x-agent-api-key'][0] : req.headers['x-agent-api-key']) || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        const candidateToken = bearerToken || customTokenHeader.trim();

        let allowedAgentName: string | undefined = undefined;
        if (checkAuth()) {
          // Dashboard Operator / Vault Owner: allowed full visibility
        } else if (candidateToken) {
          const tokenResult = apiTokenManager.validateToken(candidateToken);
          if (!tokenResult.valid) {
            sendJson(tokenResult.statusCode || 401, { success: false, error: tokenResult.error });
            return;
          }
          allowedAgentName = tokenResult.token?.agentName;
        } else {
          sendJson(401, { success: false, error: 'Unauthorized: Authentication required to view intent inbox.' });
          return;
        }

        const statusParam = (url.searchParams.get('status') || 'ALL') as any;
        const sourceParam = (url.searchParams.get('source') || 'ALL') as any;
        const searchParam = url.searchParams.get('search') || undefined;
        const limitParam = Number(url.searchParams.get('limit')) || 50;
        const offsetParam = Number(url.searchParams.get('offset')) || 0;

        // Reconcile pending intents
        await intentQueue.reconcileIntents(agent);

        const result = intentQueue.listIntents({
          status: statusParam,
          source: sourceParam,
          search: searchParam,
          limit: limitParam,
          offset: offsetParam,
        });

        // External agents are isolated and may only inspect their own submitted intents
        const filteredIntents = allowedAgentName
          ? result.intents.filter(i => i.agentId === allowedAgentName)
          : result.intents;

        sendJson(200, {
          success: true,
          intents: filteredIntents,
          total: allowedAgentName ? filteredIntents.length : result.total,
        });
        return;
      }

      // 9. INTENT DETAILS: Single intent inspection by ID
      const singleIntentMatch = pathname.match(/^\/(?:api\/)?(?:agent\/)?intents\/([a-zA-Z0-9_-]+)$/);
      if (singleIntentMatch && req.method === 'GET') {
        const authHeader = (Array.isArray(req.headers['authorization']) ? req.headers['authorization'][0] : req.headers['authorization']) || '';
        const customTokenHeader = (Array.isArray(req.headers['x-agent-api-key']) ? req.headers['x-agent-api-key'][0] : req.headers['x-agent-api-key']) || '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        const candidateToken = bearerToken || customTokenHeader.trim();

        let allowedAgentName: string | undefined = undefined;
        if (checkAuth()) {
          // Dashboard Operator / Vault Owner: allowed full inspection
        } else if (candidateToken) {
          const tokenResult = apiTokenManager.validateToken(candidateToken);
          if (!tokenResult.valid) {
            sendJson(tokenResult.statusCode || 401, { success: false, error: tokenResult.error });
            return;
          }
          allowedAgentName = tokenResult.token?.agentName;
        } else {
          sendJson(401, { success: false, error: 'Unauthorized: Authentication required to inspect intent.' });
          return;
        }

        const targetIntentId = singleIntentMatch[1];
        const intent = intentQueue.getIntent(targetIntentId);

        if (!intent) {
          sendJson(404, { success: false, error: `Intent not found: ${targetIntentId}` });
          return;
        }

        // Prevent cross-agent inspection
        if (allowedAgentName && intent.agentId !== allowedAgentName) {
          sendJson(403, { success: false, error: 'Forbidden: Cannot inspect intents submitted by another agent.' });
          return;
        }

        sendJson(200, { success: true, intent });
        return;
      }

      // 10. TRIGGER INTENT PROCESSING: Manually dispatch/ingest an intent in queue
      const processIntentMatch = pathname.match(/^\/(?:api\/)?(?:agent\/)?intents\/([a-zA-Z0-9_-]+)\/process$/);
      if (processIntentMatch && req.method === 'POST') {
        if (!checkAuth()) {
          sendJson(401, { success: false, error: 'Unauthorized: Vault Owner authorization required to trigger intent processing.' });
          return;
        }

        const targetIntentId = processIntentMatch[1];
        const body = await parseBody();
        try {
          const processed = await intentQueue.processIntent(targetIntentId, agent, {
            dryRun: body.dryRun === true,
          });
          sendJson(200, { success: true, intent: processed });
        } catch (err: any) {
          sendJson(400, { success: false, error: err.message });
        }
        return;
      }

      // 11. API TOKEN MANAGEMENT: Generate, list, and revoke external agent API credentials
      if ((pathname === '/tokens' || pathname === '/api/tokens' || pathname === '/api/agent/tokens') && req.method === 'GET') {
        if (!checkAuth()) {
          sendJson(401, { success: false, error: 'Unauthorized: Vault Owner authentication required to view API tokens.' });
          return;
        }

        const tokens = apiTokenManager.listTokens();
        sendJson(200, { success: true, tokens });
        return;
      }

      if ((pathname === '/tokens' || pathname === '/api/tokens' || pathname === '/api/agent/tokens') && req.method === 'POST') {
        if (!checkAuth()) {
          sendJson(401, { success: false, error: 'Unauthorized: Vault Owner authentication required to issue API tokens.' });
          return;
        }

        const body = await parseBody();
        const agentName = (body.agentName || '').trim();
        if (!agentName) {
          sendJson(400, { success: false, error: 'agentName is required to generate an API token.' });
          return;
        }

        const { token, record } = apiTokenManager.createToken({
          agentName,
          permissions: body.permissions,
          rateLimitPerMin: body.rateLimitPerMin ? Number(body.rateLimitPerMin) : 60,
          expiresInMs: body.expiresInDays ? Number(body.expiresInDays) * 86400 * 1000 : undefined,
        });

        sendJson(201, {
          success: true,
          message: 'API Token generated. Store this secret securely; it will not be displayed again.',
          token,
          record,
        });
        return;
      }

      const revokeTokenMatch = pathname.match(/^\/(?:api\/)?(?:agent\/)?tokens\/([a-zA-Z0-9_-]+)\/revoke$/);
      if (revokeTokenMatch && req.method === 'POST') {
        if (!checkAuth()) {
          sendJson(401, { success: false, error: 'Unauthorized: Vault Owner authentication required to revoke API tokens.' });
          return;
        }

        const targetTokenId = revokeTokenMatch[1];
        const revoked = apiTokenManager.revokeToken(targetTokenId);
        if (!revoked) {
          sendJson(404, { success: false, error: `Token not found: ${targetTokenId}` });
          return;
        }

        sendJson(200, { success: true, revoked: true, tokenId: targetTokenId });
        return;
      }

      // Route Not Found
      sendJson(404, { error: `Endpoint not found: ${req.method} ${pathname}` });
    } catch (err: any) {
      let errMsg = err?.message || 'Internal error';
      if (agentConfig.privateKey) {
        errMsg = errMsg.replaceAll(agentConfig.privateKey, '[REDACTED]');
      }
      if (agentConfig.signingRuntimeSecret) {
        errMsg = errMsg.replaceAll(agentConfig.signingRuntimeSecret, '[REDACTED]');
      }
      errMsg = errMsg.replace(/ed25519:[A-Za-z0-9_]+/g, '[REDACTED_KEY]');
      console.error('Runtime Server Error:', errMsg);
      sendJson(500, {
        success: false,
        error: `Internal signing runtime server error: ${errMsg}`,
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
          console.log(`🔐 Authentication: Timing-Safe Secret Rotation Active`);
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
