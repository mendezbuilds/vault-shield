import { VaultAgent, parseNearToYocto } from './runtime/agent.js';
import { generateIntentId } from './runtime/ledger.js';
import { NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID } from './runtime/config.js';
import type { PaymentIntent } from './runtime/types.js';
import { buildPaymentArgs, buildRestrictedFunctionCallAction } from './runtime/signer.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    let destination = (body.destination || '').trim();
    let amountNear = (body.amountNear || '').trim();
    let reason = (body.reason || '').trim();
    const ttlMinutes = Number(body.ttlMinutes) || 60;
    const naturalPrompt = (body.naturalPrompt || '').trim();

    // Natural language prompt parsing if provided and structured inputs are empty
    if (naturalPrompt && (!destination || !amountNear)) {
      const destMatch = naturalPrompt.match(/([a-zA-Z0-9._-]+\.testnet)/i);
      const amtMatch = naturalPrompt.match(/(\d+(?:\.\d+)?)\s*NEAR/i);
      if (destMatch) destination = destMatch[1];
      if (amtMatch) amountNear = amtMatch[1];
      if (!reason) reason = naturalPrompt;
    }

    // Default hackathon test intent values if omitted
    if (!destination) destination = 'whiteice2105.testnet';
    if (!amountNear) amountNear = '0.01';
    if (!reason) reason = 'Autonomous test disbursement of 0.01 NEAR';

    let amountYocto: string;
    try {
      amountYocto = parseNearToYocto(amountNear);
    } catch (err: any) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Invalid NEAR amount: ${err.message}` }));
      return;
    }

    const intentId = body.intentId || generateIntentId();
    const ttlSeconds = Math.max(ttlMinutes, 5) * 60;

    const intent: PaymentIntent = {
      intentId,
      destination,
      amountNear,
      amountYocto,
      reason,
      ttlSeconds,
      createdAt: Date.now(),
    };

    // Instantiate VaultAgent with target vault and agent credentials
    const agent = new VaultAgent({
      vaultContractId: DEFAULT_CONTRACT_ID,
      agentAccountId: DEFAULT_AGENT_ACCOUNT_ID,
      expectedPublicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
    });

    // Execute deterministic 10-check policy preflight against live contract on testnet
    const preflightResult = await agent.preflight(intent);

    // Build unbroadcast preview payload conforming strictly to the FunctionCall key restriction
    const paymentArgs = buildPaymentArgs(intent);
    const action = buildRestrictedFunctionCallAction(paymentArgs);

    const preview = {
      network: 'testnet',
      signerId: DEFAULT_AGENT_ACCOUNT_ID,
      receiverId: DEFAULT_CONTRACT_ID,
      methodName: 'request_payment',
      args: paymentArgs,
      deposit: '0 yoctoNEAR',
      gas: '30 Tgas',
      publicKey: NEW_AGENT_RESTRICTED_PUBLIC_KEY,
    };

    // Determine expected route
    let expectedRoute: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED' = 'DENIED';
    let expectedRouteLabel = 'Policy Denied';

    if (preflightResult.success) {
      if (preflightResult.predictedRouting === 'AUTO_DISPATCH') {
        expectedRoute = 'AUTO_DISPATCH';
        expectedRouteLabel = 'Route A: Automatic Approval (Disbursement settlement without owner signing)';
      } else {
        expectedRoute = 'PENDING_APPROVAL';
        expectedRouteLabel = 'Route B: Pending Owner Approval (Escrowed in contract queue)';
      }
    } else {
      expectedRoute = 'DENIED';
      expectedRouteLabel = `Pre-Flight Blocked: ${preflightResult.error || 'Contract constraint violated'}`;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: preflightResult.success,
        intentId,
        intent: {
          intentId,
          destination,
          amountNear,
          amountYocto,
          reason,
          ttlMinutes,
        },
        preflight: preflightResult,
        preview,
        expectedRoute,
        expectedRouteLabel,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err?.message || 'Preflight evaluation failed' }));
  }
}
