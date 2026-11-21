import { VaultAgent, parseNearToYocto } from '../_runtime/agent.js';
import { IntentQueue } from '../_runtime/intentQueue.js';
import { ApiTokenManager } from '../_runtime/apiTokens.js';
import { parseNaturalLanguageIntent } from '../_runtime/llm.js';
import {
  NEW_AGENT_RESTRICTED_PUBLIC_KEY,
  DEFAULT_CONTRACT_ID,
  DEFAULT_AGENT_ACCOUNT_ID,
} from '../_runtime/config.js';
import { getEffectiveRuntimeSecret, validateRuntimeAuth } from '../_runtime/auth.js';
import path from 'path';
import os from 'os';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const defaultBaseDir = isServerless ? os.tmpdir() : process.cwd();
const intentsPath = process.env.AGENT_INTENTS_PATH || (
  isServerless
    ? path.resolve(defaultBaseDir, 'vault-intents.json')
    : path.resolve(defaultBaseDir, 'data', 'intents.json')
);
const tokensPath = process.env.AGENT_API_TOKENS_PATH || (
  isServerless
    ? path.resolve(defaultBaseDir, 'vault-api-tokens.json')
    : path.resolve(defaultBaseDir, 'data', 'api_tokens.json')
);

const intentQueue = new IntentQueue(intentsPath);
const apiTokenManager = new ApiTokenManager(tokensPath);

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
      if (raw.length > 65536) {
        req.destroy();
        reject(new Error('Payload Too Large: Maximum 64KB'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-agent-api-key, x-runtime-secret, idempotency-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(url.searchParams.entries());

  const sendJson = (statusCode: number, data: any) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };

  const agent = new VaultAgent({
    vaultContractId: DEFAULT_CONTRACT_ID,
    agentAccountId: DEFAULT_AGENT_ACCOUNT_ID,
    expectedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
  });

  try {
    const authHeader = (Array.isArray(req.headers['authorization']) ? req.headers['authorization'][0] : req.headers['authorization']) || '';
    const customTokenHeader = (Array.isArray(req.headers['x-agent-api-key']) ? req.headers['x-agent-api-key'][0] : req.headers['x-agent-api-key']) || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const candidateToken = bearerToken || customTokenHeader.trim();

    const runtimeSecret = getEffectiveRuntimeSecret();
    const isDashboardAuthed = validateRuntimeAuth(req.headers as any, runtimeSecret);

    // 1. Natural Language Parse helper
    if (pathname.endsWith('/parse') || query.action === 'parse') {
      if (req.method !== 'POST') return sendJson(405, { error: 'Method Not Allowed' });
      const body = await parseBody(req);
      const prompt = (body.prompt || body.naturalPrompt || '').trim();
      if (!prompt) return sendJson(400, { success: false, error: 'Missing prompt to parse' });
      const parsed = parseNaturalLanguageIntent(prompt);
      return sendJson(200, { success: true, parsed });
    }

    // 2. Manual processing trigger for existing intent (Dashboard Operator only)
    if (pathname.endsWith('/process') || query.action === 'process') {
      if (req.method !== 'POST') return sendJson(405, { error: 'Method Not Allowed' });
      if (!isDashboardAuthed) {
        return sendJson(401, { success: false, error: 'Unauthorized: Vault Owner authorization required to trigger processing.' });
      }
      const targetId = query.id || pathname.split('/').slice(-2)[0];
      if (!targetId) return sendJson(400, { success: false, error: 'Missing intent ID to process' });
      const body = await parseBody(req);
      const processed = await intentQueue.processIntent(targetId, agent, { dryRun: body.dryRun === true });
      return sendJson(200, { success: true, intent: processed });
    }

    // 3. Inspect single intent by ID
    const intentIdMatch = pathname.match(/\/intents\/([a-zA-Z0-9_-]+)$/);
    const targetIntentId = query.id || (intentIdMatch ? intentIdMatch[1] : null);

    if (req.method === 'GET' && targetIntentId && targetIntentId !== 'intents') {
      let allowedAgentName: string | undefined = undefined;
      if (isDashboardAuthed) {
        // Vault Owner / Dashboard: full access
      } else if (candidateToken) {
        const tokenResult = apiTokenManager.validateToken(candidateToken);
        if (!tokenResult.valid) {
          return sendJson(tokenResult.statusCode || 401, { success: false, error: tokenResult.error });
        }
        allowedAgentName = tokenResult.token?.agentName;
      } else {
        return sendJson(401, { success: false, error: 'Unauthorized: Authentication required to inspect intent.' });
      }

      const intent = intentQueue.getIntent(targetIntentId);
      if (!intent) return sendJson(404, { success: false, error: `Intent not found: ${targetIntentId}` });

      if (allowedAgentName && intent.agentId !== allowedAgentName) {
        return sendJson(403, { success: false, error: 'Forbidden: Cannot inspect intents submitted by another agent.' });
      }

      return sendJson(200, { success: true, intent });
    }

    // 4. Query Intent Inbox (GET /api/agent/intents)
    if (req.method === 'GET') {
      let allowedAgentName: string | undefined = undefined;
      if (isDashboardAuthed) {
        // Vault Owner / Dashboard: full visibility
      } else if (candidateToken) {
        const tokenResult = apiTokenManager.validateToken(candidateToken);
        if (!tokenResult.valid) {
          return sendJson(tokenResult.statusCode || 401, { success: false, error: tokenResult.error });
        }
        allowedAgentName = tokenResult.token?.agentName;
      } else {
        return sendJson(401, { success: false, error: 'Unauthorized: Authentication required to view intent inbox.' });
      }

      await intentQueue.reconcileIntents(agent);
      const result = intentQueue.listIntents({
        status: (query.status as any) || 'ALL',
        source: (query.source as any) || 'ALL',
        search: query.search,
        limit: query.limit ? Number(query.limit) : 50,
        offset: query.offset ? Number(query.offset) : 0,
      });

      const filteredIntents = allowedAgentName
        ? result.intents.filter(i => i.agentId === allowedAgentName)
        : result.intents;

      return sendJson(200, {
        success: true,
        intents: filteredIntents,
        total: allowedAgentName ? filteredIntents.length : result.total,
      });
    }

    // 5. Submit Intent (POST /api/agent/intents)
    if (req.method === 'POST') {
      let source: 'DASHBOARD' | 'EXTERNAL_AGENT' = 'EXTERNAL_AGENT';
      let agentIdentifier = 'External Agent';

      if (isDashboardAuthed) {
        source = 'DASHBOARD';
        agentIdentifier = 'Dashboard Operator';
      } else if (candidateToken) {
        // Validate external agent token
        const tokenResult = apiTokenManager.validateToken(candidateToken);
        if (!tokenResult.valid) {
          return sendJson(tokenResult.statusCode || 401, {
            success: false,
            error: tokenResult.error || 'Unauthorized: Invalid API token',
          });
        }
        source = 'EXTERNAL_AGENT';
        agentIdentifier = tokenResult.token?.agentName || 'External AI Agent';
      } else {
        return sendJson(401, {
          success: false,
          error: 'Unauthorized: Valid Agent API Token (Bearer vsa_live_...) or Dashboard authorization required.',
        });
      }

      const body = await parseBody(req);
      let destination = (body.destination || '').trim();
      let amountNear = (body.amountNear || '').trim();
      let reason = (body.reason || '').trim();
      let ttlMinutes = Number(body.ttlMinutes) || 60;
      const prompt = (body.prompt || body.naturalPrompt || '').trim();
      const idempotencyKey = (body.idempotencyKey || req.headers['idempotency-key'] as string || '').trim();
      const processNow = body.processNow !== false;

      if (prompt && (!destination || !amountNear)) {
        const parsed = parseNaturalLanguageIntent(prompt);
        if (parsed.destination && !destination) destination = parsed.destination;
        if (parsed.amountNear && !amountNear) amountNear = parsed.amountNear;
        if (!reason) reason = parsed.reason;
        if (parsed.ttlMinutes && !body.ttlMinutes) ttlMinutes = parsed.ttlMinutes;
      }

      if (!destination || !amountNear) {
        return sendJson(400, {
          success: false,
          error: 'Missing required intent payload fields: destination and amountNear.',
        });
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

      if (!submissionResult.isDuplicate && processNow && finalIntent.status === 'RECEIVED') {
        finalIntent = await intentQueue.processIntent(finalIntent.intentId, agent, {
          dryRun: body.dryRun === true,
        });
      }

      return sendJson(200, {
        success: true,
        isDuplicate: submissionResult.isDuplicate,
        intent: finalIntent,
      });
    }

    sendJson(405, { error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('Intent API Error:', err);
    sendJson(500, { success: false, error: err?.message || 'Internal intent processing error' });
  }
}
