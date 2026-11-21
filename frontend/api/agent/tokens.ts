import { ApiTokenManager } from '../_runtime/apiTokens.js';
import { getEffectiveRuntimeSecret, validateRuntimeAuth } from '../_runtime/auth.js';
import path from 'path';
import os from 'os';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const defaultBaseDir = isServerless ? os.tmpdir() : process.cwd();
const tokensPath = process.env.AGENT_API_TOKENS_PATH || (
  isServerless
    ? path.resolve(defaultBaseDir, 'vault-api-tokens.json')
    : path.resolve(defaultBaseDir, 'data', 'api_tokens.json')
);

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-runtime-secret');

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

  try {
    // Check if caller is authorized dashboard operator / vault owner
    const runtimeSecret = getEffectiveRuntimeSecret();
    const isDashboardAuthed = validateRuntimeAuth(req.headers as any, runtimeSecret);

    if (!isDashboardAuthed) {
      return sendJson(401, {
        success: false,
        error: 'Unauthorized: Vault Owner authentication required for token management.',
      });
    }

    // List tokens
    if (req.method === 'GET') {
      const tokens = apiTokenManager.listTokens();
      return sendJson(200, { success: true, tokens });
    }

    // Revoke token
    if (req.method === 'POST' && (pathname.endsWith('/revoke') || query.action === 'revoke')) {
      const targetId = query.id || pathname.split('/').slice(-2)[0];
      if (!targetId) return sendJson(400, { success: false, error: 'Missing token ID to revoke' });
      const revoked = apiTokenManager.revokeToken(targetId);
      if (!revoked) return sendJson(404, { success: false, error: `Token not found: ${targetId}` });
      return sendJson(200, { success: true, revoked: true, tokenId: targetId });
    }

    // Generate new token
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const agentName = (body.agentName || '').trim();
      if (!agentName) {
        return sendJson(400, { success: false, error: 'agentName is required' });
      }

      const { token, record } = apiTokenManager.createToken({
        agentName,
        permissions: body.permissions,
        rateLimitPerMin: body.rateLimitPerMin ? Number(body.rateLimitPerMin) : 60,
        expiresInMs: body.expiresInDays ? Number(body.expiresInDays) * 86400 * 1000 : undefined,
      });

      return sendJson(201, {
        success: true,
        message: 'API Token generated. Store this secret securely; it will not be displayed again.',
        token,
        record,
      });
    }

    sendJson(405, { error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('Token API Error:', err);
    sendJson(500, { success: false, error: err?.message || 'Token management error' });
  }
}
