import { VaultAgent } from '../_runtime/agent.js';
import { NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID } from '../_runtime/config.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    const status = await agent.getStatus();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, status }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Failed to query agent status' }));
  }
}
