import react from '@vitejs/plugin-react';
import { exec } from 'child_process';
import { defineConfig, Plugin } from 'vite';
import preflightHandler from './api/agent/preflight.ts';
import executeHandler from './api/agent/execute.ts';
import statusHandler from './api/agent/status.ts';

function nearTxBridgePlugin(): Plugin {
  // In-memory RPC response cache (TTL 3.5s) to eliminate duplicate burst queries
  const rpcCache = new Map<string, { data: string; expires: number }>();
  let lastUpstreamCallTime = 0;

  async function paceUpstream(): Promise<void> {
    const minGap = 55; // ms between upstream calls
    const now = Date.now();
    const elapsed = now - lastUpstreamCallTime;
    if (elapsed < minGap) {
      await new Promise(r => setTimeout(r, minGap - elapsed));
    }
    lastUpstreamCallTime = Date.now();
  }

  return {
    name: 'near-tx-bridge',
    configureServer(server) {
      // Local RPC proxy with caching, pacing, automatic fallback and zero CORS friction
      server.middlewares.use('/api/rpc', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          // Check cache for idempotent query calls (keyed by method + params, independent of request id)
          let cacheKey = body;
          let callerId = '1';
          try {
            const parsed = JSON.parse(body);
            callerId = parsed.id || '1';
            cacheKey = `${parsed.method}:${JSON.stringify(parsed.params)}`;
          } catch {}

          const cached = rpcCache.get(cacheKey);
          if (cached && cached.expires > Date.now()) {
            const patched = cached.data.replace(/"id":"[^"]*"/, `"id":${JSON.stringify(callerId)}`);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = 200;
            res.end(patched);
            return;
          }

          const endpoints = [
            'https://rpc.testnet.near.org',
            'https://test.rpc.fastnear.com',
          ];

          for (const ep of endpoints) {
            for (let retry = 0; retry < 3; retry++) {
              try {
                await paceUpstream();
                const rpcRes = await fetch(ep, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body,
                });

                if (rpcRes.status === 429) {
                  await new Promise(r => setTimeout(r, 200 * (retry + 1)));
                  continue;
                }

                const data = await rpcRes.text();
                let json;
                try {
                  json = JSON.parse(data);
                } catch {
                  break;
                }

                if (json.error && json.error.code === -429) {
                  await new Promise(r => setTimeout(r, 200 * (retry + 1)));
                  continue;
                }

                // Cache successful query responses for 3.5s
                if (!json.error) {
                  rpcCache.set(cacheKey, { data, expires: Date.now() + 3500 });
                }

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 200;
                res.end(data);
                return;
              } catch (err: any) {
                await new Promise(r => setTimeout(r, 150));
              }
            }
          }

          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'All NEAR testnet RPCs failed' }));
        });
      });

      server.middlewares.use('/api/tx/execute', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const { method_name, args = {}, signer_id, deposit = '0 NEAR', gas = '100.0 Tgas' } = data;

            if (!method_name || !signer_id) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing method_name or signer_id' }));
              return;
            }

            // Sanitize inputs
            const safeMethod = String(method_name).replace(/[^a-zA-Z0-9_]/g, '');
            const safeSigner = String(signer_id).replace(/[^a-zA-Z0-9_.-]/g, '');
            const safeDeposit = String(deposit).replace(/[^a-zA-Z0-9. ]/g, '');
            const safeGas = String(gas).replace(/[^a-zA-Z0-9. ]/g, '');
            const jsonArgsStr = JSON.stringify(args).replace(/"/g, '\\"');

            const cmd = `near contract call-function as-transaction contract.vault-parent.testnet ${safeMethod} json-args "${jsonArgsStr}" prepaid-gas "${safeGas}" attached-deposit "${safeDeposit}" sign-as ${safeSigner} network-config testnet now`;

            exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
              res.setHeader('Content-Type', 'application/json');

              // Extract transaction hash from near cli output if present
              const fullOutput = `${stdout}\n${stderr}`;
              const txHashMatch = fullOutput.match(/transaction\/([a-zA-Z0-9]{40,55})/i) || 
                                  fullOutput.match(/Transaction ID:\s*([a-zA-Z0-9]{40,55})/i) ||
                                  fullOutput.match(/https:\/\/testnet\.nearblocks\.io\/txns\/([a-zA-Z0-9]{40,55})/i);
              const txHash = txHashMatch ? txHashMatch[1] : null;

              if (error) {
                console.error('NEAR Execution Error:', stderr || stdout || error.message);
                res.statusCode = 400;
                res.end(JSON.stringify({
                  success: false,
                  error: stderr || stdout || error.message,
                  txHash,
                  output: fullOutput
                }));
                return;
              }

              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                txHash,
                output: stdout
              }));
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
          }
        });
      });

      // Live Autonomous Agent Runtime Endpoints
      server.middlewares.use('/api/agent/preflight', (req, res) => {
        preflightHandler(req, res);
      });

      server.middlewares.use('/api/agent/execute', (req, res) => {
        executeHandler(req, res);
      });

      server.middlewares.use('/api/agent/status', (req, res) => {
        statusHandler(req, res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), nearTxBridgePlugin()],
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  define: {
    'global': 'window',
    'process.env': {},
  },
  server: {
    port: 3000,
    open: false
  }
});
