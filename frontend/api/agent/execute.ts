import { VaultAgent, parseNearToYocto } from '../_runtime/agent.js';
import { generateIntentId } from '../_runtime/ledger.js';
import { NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID } from '../_runtime/config.js';

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body);
    }
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => { raw += chunk; });
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const destination = (body.destination || '').trim();
    const amountNear = (body.amountNear || '').trim();
    const reason = (body.reason || '').trim();
    const ttlMinutes = Number(body.ttlMinutes) || 60;
    const isDryRun = body.dryRun === true;
    const intentId = body.intentId || generateIntentId();

    if (!destination || !amountNear) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Missing destination or amountNear' }));
      return;
    }

    const ttlSeconds = Math.max(ttlMinutes, 5) * 60;

    // Instantiate agent with target contract and restricted credentials
    const agent = new VaultAgent({
      vaultContractId: DEFAULT_CONTRACT_ID,
      agentAccountId: DEFAULT_AGENT_ACCOUNT_ID,
      expectedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
      phase1StrictBoundary: isDryRun, // allow live broadcast if dryRun is false
    });

    // Check if signing key is available for live execution
    const agentStatus = await agent.getStatus();
    if (!isDryRun && !agentStatus.hasSigningKey) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error:
            'Autonomous Agent Restricted Key is not injected in this server environment. Live signing requires AGENT_PRIVATE_KEY or the local runtime credentials (~/.near-credentials/testnet/agent.cleartoad8704.testnet.json).',
        })
      );
      return;
    }

    // Execute payment request through complete VaultAgent lifecycle:
    // 1. Process lock acquisition
    // 2. Intent deduplication in ledger
    // 3. Advisory preflight verification
    // 4. Pre-persistence of txHash to ledger
    // 5. Signing and broadcast with restricted key
    // 6. Finality & receipt outcome verification
    // 7. Lock release
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

    res.statusCode = isSuccess ? 200 : 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: isSuccess,
        status: result.status,
        intentId: result.intentId,
        txHash: result.txHash,
        requestId: result.requestId,
        explorerUrl,
        message: result.message,
        preview: result.preview,
        error: result.error,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || 'Execution error occurred in autonomous agent runtime',
      })
    );
  }
}
