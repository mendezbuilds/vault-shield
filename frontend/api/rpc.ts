interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any> | any[];
}

interface CachedResponse {
  result: any;
  expiresAt: number;
}

// Strictly hardcoded upstream RPC endpoints (cannot be overridden by caller)
const PRIMARY_UPSTREAM = 'https://rpc.testnet.near.org';
const FALLBACK_UPSTREAM = 'https://test.rpc.fastnear.com';

// Whitelisted read-only JSON-RPC methods permitted through the proxy.
// Mutating operations (e.g. broadcast_tx_commit, broadcast_tx_async) are explicitly prohibited.
const ALLOWED_RPC_METHODS = new Set([
  'query',
  'block',
  'status',
  'gas_price',
  'tx',
  'EXPERIMENTAL_tx_status',
]);

// Sub-types permitted for the 'query' method (all strictly read-only)
const ALLOWED_QUERY_TYPES = new Set([
  'call_function',
  'view_account',
  'view_state',
  'view_access_key',
  'view_access_key_list',
]);

// Methods explicitly excluded from caching (transaction polling and network telemetry must always be real-time)
const NEVER_CACHE_METHODS = new Set([
  'tx',
  'EXPERIMENTAL_tx_status',
  'block',
  'status',
  'gas_price',
]);

// Maximum permitted payload size (64 KB)
const MAX_PAYLOAD_BYTES = 64 * 1024;

// Upstream request timeout (8 seconds)
const UPSTREAM_TIMEOUT_MS = 8000;

// In-memory micro-cache for hot serverless container reuse (TTL 3 seconds)
const responseCache = new Map<string, CachedResponse>();

/**
 * Builds a deterministic cache key containing ALL parameters relevant to the response.
 * Strictly distinguishes actual RPC method ('query') from query request_type ('call_function' | 'view_account').
 * 
 * - 'tx' and 'EXPERIMENTAL_tx_status' are explicitly excluded from caching to guarantee
 *   real-time transaction confirmation polling fidelity.
 * - Only idempotent read calls (query:call_function, query:view_account) are eligible for micro-caching.
 */
function getCacheKey(reqBody: JsonRpcRequest): string | null {
  // Explicitly disallow caching for any non-query methods, including tx and EXPERIMENTAL_tx_status
  if (!reqBody.method || reqBody.method !== 'query' || !reqBody.params || Array.isArray(reqBody.params)) {
    return null;
  }

  const p = reqBody.params as Record<string, any>;
  const qType = p.request_type;

  // Only idempotent call_function and view_account sub-types are cached
  if (qType !== 'call_function' && qType !== 'view_account') {
    return null;
  }

  // Include every response-relevant parameter in the key
  return [
    `method:${reqBody.method}`,
    `type:${qType}`,
    `finality:${p.finality || ''}`,
    `block:${p.block_id || ''}`,
    `account:${p.account_id || ''}`,
    `func:${p.method_name || ''}`,
    `args:${p.args_base64 || ''}`,
  ].join('|');
}

async function fetchWithTimeout(url: string, bodyStr: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NearVaultShield-Proxy/1.0',
      },
      body: bodyStr,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Strict method restriction
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  // Payload size guard via Content-Length header
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Payload Too Large. Max permitted size is 64 KB.' }));
    return;
  }

  // Read request body
  let rawBody = '';
  try {
    if (req.body && typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_PAYLOAD_BYTES) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Payload Too Large. Max permitted size is 64 KB.' }));
          return;
        }
        chunks.push(chunk);
      }
      rawBody = Buffer.concat(chunks).toString('utf-8');
    }
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to read request stream' }));
    return;
  }

  // Validate JSON-RPC syntax
  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      })
    );
    return;
  }

  // Validate method whitelist
  if (!parsed.method || !ALLOWED_RPC_METHODS.has(parsed.method)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: parsed.id ?? null,
        error: {
          code: -32601,
          message: `Method '${parsed.method}' not allowed or unsupported. Only read/query methods are permitted.`,
        },
      })
    );
    return;
  }

  // Validate query type if method is 'query'
  if (parsed.method === 'query') {
    const p = parsed.params as Record<string, any> | undefined;
    const qType = p?.request_type;
    if (!qType || !ALLOWED_QUERY_TYPES.has(qType)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id ?? null,
          error: {
            code: -32602,
            message: `Query request_type '${qType}' not allowed.`,
          },
        })
      );
      return;
    }
  }

  // Check in-memory hot cache for safe idempotent read calls
  const cacheKey = getCacheKey(parsed);
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Proxy-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=5');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id ?? null,
          result: cached.result,
        })
      );
      return;
    }
  }

  // Forward to upstream with fallback
  const endpoints = [PRIMARY_UPSTREAM, FALLBACK_UPSTREAM];
  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const upstreamRes = await fetchWithTimeout(endpoint, rawBody, UPSTREAM_TIMEOUT_MS);

      if (upstreamRes.status === 429) {
        console.warn(`[rpc.ts] Upstream ${endpoint} returned 429, trying fallback...`);
        continue;
      }

      const responseText = await upstreamRes.text();
      let responseJson: any;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        continue;
      }

      // Check if upstream returned rate limit in JSON
      if (responseJson.error && responseJson.error.code === -429) {
        continue;
      }

      // Only cache valid, successful read responses.
      // Top-level RPC errors AND contract execution errors (result.error) are NEVER cached.
      const hasExecutionError = responseJson.result && responseJson.result.error !== undefined;
      const isCleanSuccess = !responseJson.error && !hasExecutionError && responseJson.result !== undefined;

      if (cacheKey && isCleanSuccess) {
        responseCache.set(cacheKey, {
          result: responseJson.result,
          expiresAt: Date.now() + 3000,
        });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Proxy-Cache', 'MISS');
      res.setHeader('Cache-Control', cacheKey ? 'public, s-maxage=3, stale-while-revalidate=5' : 'no-cache');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id ?? null,
          ...(responseJson.error !== undefined ? { error: responseJson.error } : {}),
          ...(responseJson.result !== undefined ? { result: responseJson.result } : {}),
        })
      );
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`[rpc.ts] Upstream ${endpoint} failed:`, err?.message || err);
    }
  }

  // All upstreams exhausted
  res.statusCode = 502;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Proxy-Cache', 'MISS');
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      id: parsed.id ?? null,
      error: {
        code: -32000,
        message: 'All NEAR testnet RPC upstreams failed or timed out.',
        detail: lastError?.message || 'Upstream unavailable',
      },
    })
  );
}
