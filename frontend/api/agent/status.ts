import { VaultAgent } from '../_runtime/agent.js';
import {
  NEW_AGENT_RESTRICTED_PUBLIC_KEY,
  DEFAULT_CONTRACT_ID,
  DEFAULT_AGENT_ACCOUNT_ID,
  DEFAULT_SIGNING_RUNTIME_URL,
} from '../_runtime/config.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, bypass-tunnel-reminder');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const agent = new VaultAgent({
      vaultContractId: DEFAULT_CONTRACT_ID,
      agentAccountId: DEFAULT_AGENT_ACCOUNT_ID,
      expectedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
    });

    const status: any = await agent.getStatus();

    // Verify signing capability: either local embedded key or persistent remote signing runtime
    const signingRuntimeUrl = process.env.AGENT_SIGNING_RUNTIME_URL || DEFAULT_SIGNING_RUNTIME_URL;
    if (!status.hasSigningKey && signingRuntimeUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const healthRes = await fetch(`${signingRuntimeUrl.replace(/\/+$/, '')}/health`, {
          signal: controller.signal,
          headers: {
            'bypass-tunnel-reminder': 'true',
          },
        });
        clearTimeout(timeout);

        if (healthRes.ok) {
          const healthData = (await healthRes.json()) as any;
          if (
            healthData.hasSigningCapability &&
            healthData.restrictedPublicKey === NEW_AGENT_RESTRICTED_PUBLIC_KEY
          ) {
            status.hasSigningKey = true;
            status.signerPublicKey = healthData.restrictedPublicKey;
            status.signingRuntimeMode = 'remote_persistent';
            status.signingRuntimeUrl = signingRuntimeUrl;
          }
        }
      } catch (err: any) {
        // Persistent runtime unreachable; retain status.hasSigningKey = false
      }
    } else if (status.hasSigningKey) {
      status.signingRuntimeMode = 'local_embedded';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, status }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Failed to query agent status' }));
  }
}
