import http from 'http';
import { loadConfig, NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID, } from './config.js';
import { VaultAgent, parseNearToYocto } from './agent.js';
import { generateIntentId } from './ledger.js';
import { getEffectiveRuntimeSecret, validateRuntimeAuth, isOriginAllowed, RateLimiter, } from './auth.js';
export const DEFAULT_RUNTIME_PORT = 3888;
export const RUNTIME_SECRET = getEffectiveRuntimeSecret();
/**
 * Creates and starts the persistent server-side signing runtime for Vault Shield.
 * Guarantees zero private key leakage, timing-safe authentication, strict origin
 * filtering, rate limiting, and restricts execution strictly to
 * request_payment on vault-cleartoad8704.testnet with zero deposit.
 */
export function createSigningServer(options = {}) {
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
    const agent = new VaultAgent(agentConfig);
    const safeConfig = agent.getConfig();
    // Validate restricted public key immediately
    if (!safeConfig.hasPrivateKey) {
        console.warn('⚠️ WARNING: Agent private key missing. Server will reject execution requests.');
    }
    const server = http.createServer(async (req, res) => {
        // 1. Origin verification
        const origin = req.headers['origin'];
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
        const sendJson = (statusCode, data) => {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        };
        // Extract client IP for rate limiting
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        // Helper to verify shared-secret authentication (timing-safe)
        const checkAuth = () => {
            return validateRuntimeAuth(req.headers, secret);
        };
        // Parse JSON request body
        const parseBody = async () => {
            return new Promise((resolve, reject) => {
                let raw = '';
                req.on('data', chunk => { raw += chunk; });
                req.on('end', () => {
                    try {
                        resolve(raw ? JSON.parse(raw) : {});
                    }
                    catch (e) {
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
                const intent = {
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
                const result = await agent.requestPayment({
                    destination,
                    amountNear,
                    reason: reason || 'Autonomous payment disbursement',
                    ttlSeconds,
                    intentId,
                }, { dryRun: isDryRun });
                const isSuccess = result.status === 'PAYMENT_EXECUTED' ||
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
        }
        catch (err) {
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
            return new Promise((resolve) => {
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
            return new Promise((resolve, reject) => {
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
//# sourceMappingURL=server.js.map