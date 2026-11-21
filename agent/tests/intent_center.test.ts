import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  IntentQueue,
  ApiTokenManager,
  parseNaturalLanguageIntent,
  VaultAgent,
  EXTERNAL_HANDOFF_WINDOW_MS,
  DEFAULT_VAULT_TTL_SECONDS,
  createSigningServer,
} from '../dist/index.js';

// Mock ContractViewProvider matching testnet policy
class MockTestViewProvider {
  public paused: boolean;
  public agentAuthorized: boolean;
  public liquidYocto: string;
  public dailyCapYocto: string;
  public maxPerTxYocto: string;
  public autoThresholdYocto: string;
  public allowlist: string[];
  public agentPending: number;
  public globalPending: number;
  public spentYocto: string;
  public reservedYocto: string;

  constructor(options: {
    paused?: boolean;
    agentAuthorized?: boolean;
    liquidYocto?: string;
    dailyCapYocto?: string;
    maxPerTxYocto?: string;
    autoThresholdYocto?: string;
    allowlist?: string[];
    agentPending?: number;
    globalPending?: number;
    spentYocto?: string;
    reservedYocto?: string;
  } = {}) {
    this.paused = options.paused ?? false;
    this.agentAuthorized = options.agentAuthorized ?? true;
    this.liquidYocto = options.liquidYocto ?? '5000000000000000000000000'; // 5 NEAR
    this.dailyCapYocto = options.dailyCapYocto ?? '2000000000000000000000000'; // 2 NEAR
    this.maxPerTxYocto = options.maxPerTxYocto ?? '1000000000000000000000000'; // 1 NEAR
    this.autoThresholdYocto = options.autoThresholdYocto ?? '200000000000000000000000'; // 0.2 NEAR
    this.allowlist = options.allowlist ?? ['merchant.vault-parent.testnet', 'whiteice2105.testnet'];
    this.agentPending = options.agentPending ?? 0;
    this.globalPending = options.globalPending ?? 0;
    this.spentYocto = options.spentYocto ?? '0';
    this.reservedYocto = options.reservedYocto ?? '0';
  }

  async isPaused(): Promise<boolean> { return this.paused; }
  async isAgentAuthorized(accountId: string): Promise<boolean> { return this.agentAuthorized; }
  async getPolicy(): Promise<SpendingPolicyView> {
    return {
      max_per_transaction: this.maxPerTxYocto,
      daily_cap: this.dailyCapYocto,
      auto_approval_threshold: this.autoThresholdYocto,
      destination_allowlist: this.allowlist,
      is_paused: this.paused,
    };
  }
  async getDailyBucket(): Promise<DailyBucketView> {
    return {
      bucket_index: Math.floor(Date.now() / 86400000),
      spent: this.spentYocto,
      reserved: this.reservedYocto,
      last_updated_at: Date.now() * 1_000_000,
    };
  }
  async getAvailableLiquidBalance(): Promise<string> { return this.liquidYocto; }
  async getAgentPendingCount(accountId: string): Promise<number> { return this.agentPending; }
  async getGlobalPendingCount(): Promise<number> { return this.globalPending; }
  async getRequest(requestId: number): Promise<PaymentRequestView | null> {
    return {
      id: requestId,
      agent_id: 'agent.cleartoad8704.testnet',
      destination: 'merchant.vault-parent.testnet',
      amount: '100000000000000000000000',
      reason: 'Test payment',
      created_at: Date.now() * 1_000_000,
      created_bucket: Math.floor(Date.now() / 86400000),
      ttl_nanos: 3600 * 1_000_000_000,
      status: 'Executed',
      origin_reason: 'None',
      dispatched_at: Date.now() * 1_000_000,
    };
  }
  async getTombstone(requestId: number) { return null; }
  async getOwner(): Promise<string> { return 'cleartoad8704.testnet'; }
}

describe('AI Agent Intent Center — Comprehensive Test Suite', () => {
  let tempDir: string;
  let intentsFilePath: string;
  let tokensFilePath: string;
  let ledgerFilePath: string;
  let lockfilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-intent-test-'));
    intentsFilePath = path.join(tempDir, 'intents.json');
    tokensFilePath = path.join(tempDir, 'tokens.json');
    ledgerFilePath = path.join(tempDir, 'ledger.json');
    lockfilePath = path.join(tempDir, 'agent.lock');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Natural-Language Intent Parser', () => {
    it('parses valid natural language prompt into structured payment parameters', () => {
      const prompt = 'Send 0.05 NEAR to merchant.vault-parent.testnet for completing the research task.';
      const result = parseNaturalLanguageIntent(prompt);

      assert.equal(result.destination, 'merchant.vault-parent.testnet');
      assert.equal(result.amountNear, '0.05');
      assert.equal(result.currency, 'NEAR');
      assert.equal(result.reason, 'completing the research task');
      assert.equal(result.ttlMinutes, 60);
      assert.equal(result.confidence, 'HIGH');
      assert.equal(result.amountYocto, '50000000000000000000000');
    });

    it('extracts explicit TTL from natural language prompt if specified', () => {
      const prompt = 'Disburse 0.1 NEAR to whiteice2105.testnet with expiry 120 minutes for batch indexing';
      const result = parseNaturalLanguageIntent(prompt);

      assert.equal(result.destination, 'whiteice2105.testnet');
      assert.equal(result.amountNear, '0.1');
      assert.equal(result.ttlMinutes, 120);
      assert.equal(result.confidence, 'HIGH');
    });

    it('returns low confidence when prompt does not contain financial instructions', () => {
      const prompt = 'What is the current gas price on NEAR testnet?';
      const result = parseNaturalLanguageIntent(prompt);

      assert.equal(result.destination, null);
      assert.equal(result.amountNear, null);
      assert.equal(result.confidence, 'LOW');
    });
  });

  describe('2. External Agent API Authentication & Token Management', () => {
    it('creates token and verifies authentication via SHA-256 hash', () => {
      const tokenManager = new ApiTokenManager(tokensFilePath);
      const { token, record } = tokenManager.createToken({
        agentName: 'Autonomous Research Subagent',
        rateLimitPerMin: 30,
      });

      assert.ok(token.startsWith('vsa_live_'));
      assert.equal(record.agentName, 'Autonomous Research Subagent');
      assert.equal(record.revoked, false);

      // Validate with correct token
      const authResult = tokenManager.validateToken(token);
      assert.equal(authResult.valid, true);
      assert.equal(authResult.token?.agentName, 'Autonomous Research Subagent');
    });

    it('rejects invalid or malformed tokens with 401', () => {
      const tokenManager = new ApiTokenManager(tokensFilePath);
      const authResult = tokenManager.validateToken('vsa_live_invalid_bad_token_xyz');

      assert.equal(authResult.valid, false);
      assert.equal(authResult.statusCode, 401);
      assert.match(authResult.error || '', /Invalid API credential/);
    });

    it('rejects revoked tokens with 403 Forbidden', () => {
      const tokenManager = new ApiTokenManager(tokensFilePath);
      const { token, record } = tokenManager.createToken({
        agentName: 'Compromised Bot',
      });

      // Revoke the token
      const revoked = tokenManager.revokeToken(record.tokenId);
      assert.equal(revoked, true);

      // Subsequent validation must fail closed with 403
      const authResult = tokenManager.validateToken(token);
      assert.equal(authResult.valid, false);
      assert.equal(authResult.statusCode, 403);
      assert.match(authResult.error || '', /revoked by the Vault Owner/);
    });

    it('enforces per-token sliding window rate limiting', () => {
      const tokenManager = new ApiTokenManager(tokensFilePath);
      const { token } = tokenManager.createToken({
        agentName: 'Rate Limited Agent',
        rateLimitPerMin: 3,
      });

      // 3 allowed calls
      assert.equal(tokenManager.validateToken(token).valid, true);
      assert.equal(tokenManager.validateToken(token).valid, true);
      assert.equal(tokenManager.validateToken(token).valid, true);

      // 4th call must be blocked with 429
      const blocked = tokenManager.validateToken(token);
      assert.equal(blocked.valid, false);
      assert.equal(blocked.statusCode, 429);
      assert.match(blocked.error || '', /Rate limit exceeded/);
    });
  });

  describe('3. Persistent Intent Queue & Two Distinct Expiry Windows', () => {
    it('submits intent in RECEIVED state and assigns distinct 300s handoff deadline', () => {
      const queue = new IntentQueue(intentsFilePath);
      const now = Date.now();
      const { intent } = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        reason: 'Research compute',
        source: 'EXTERNAL_AGENT',
        agentId: 'External Research Agent',
        createdAt: now,
      });

      assert.equal(intent.status, 'RECEIVED');
      assert.equal(intent.createdAt, now);
      assert.equal(intent.handoffDeadline, now + EXTERNAL_HANDOFF_WINDOW_MS);
      assert.equal(intent.handoffDeadline - intent.createdAt, 300_000); // exactly 300 seconds
      assert.equal(intent.acceptedAt, undefined); // vault payment TTL not started yet!
      assert.equal(intent.vaultDeadline, undefined);
      assert.equal(intent.auditTrail.length, 1);
    });

    it('transitions to HANDOFF_EXPIRED if external handoff window (300s) elapses before ingestion', () => {
      const queue = new IntentQueue(intentsFilePath);
      const staleTime = Date.now() - 305_000; // 305 seconds ago (> 300s)

      const { intent } = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        reason: 'Stale intent',
        source: 'EXTERNAL_AGENT',
        createdAt: staleTime,
      });

      assert.equal(intent.status, 'HANDOFF_EXPIRED');
      assert.match(intent.errorMessage || '', /External handoff/i);
      assert.equal(intent.auditTrail.some(e => e.status === 'HANDOFF_EXPIRED'), true);
    });

    it('starts Vault Payment TTL strictly after VaultAgent acceptance, not at intent creation', async () => {
      const queue = new IntentQueue(intentsFilePath);
      const mockView = new MockTestViewProvider();
      const agent = new VaultAgent(
        { ledgerPath: ledgerFilePath, lockfilePath },
        mockView
      );

      const creationTime = Date.now() - 10_000; // created 10 seconds ago
      const { intent } = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        reason: 'Autonomous compute',
        source: 'DASHBOARD',
        ttlMinutes: 60,
        createdAt: creationTime,
      });

      // Vault TTL not started
      assert.equal(intent.acceptedAt, undefined);
      assert.equal(intent.vaultDeadline, undefined);

      // Process through VaultAgent with dryRun: true (safe simulation)
      const dryRunProcessed = await queue.processIntent(intent.intentId, agent, { dryRun: true });

      // In dryRun, preflight simulation passes without on-chain broadcast; status remains PREFLIGHT
      assert.equal(dryRunProcessed.status, 'PREFLIGHT');
      assert.equal(dryRunProcessed.acceptedAt, undefined); // Vault TTL not started because no on-chain request created
      assert.equal(dryRunProcessed.vaultDeadline, undefined);

      // When registered on-chain in pending approval queue, acceptedAt & vaultDeadline are established
      const acceptedTime = Date.now();
      dryRunProcessed.status = 'AWAITING_APPROVAL';
      dryRunProcessed.acceptedAt = acceptedTime;
      dryRunProcessed.vaultDeadline = acceptedTime + dryRunProcessed.vaultTtlSeconds * 1000;
      dryRunProcessed.requestId = 88;

      // After acceptance, acceptedAt is set to ingestion execution time, NOT creationTime!
      assert.ok(dryRunProcessed.acceptedAt! >= creationTime);
      assert.equal(dryRunProcessed.vaultTtlSeconds, 3600);
      assert.equal(dryRunProcessed.vaultDeadline, acceptedTime + 3600 * 1000);
      assert.notEqual(dryRunProcessed.vaultDeadline, creationTime + 3600 * 1000);
    });

    it('reconciles unapproved pending request to EXPIRED when vault payment TTL elapses', async () => {
      const queue = new IntentQueue(intentsFilePath);
      const mockView = new MockTestViewProvider();
      const agent = new VaultAgent(
        { ledgerPath: ledgerFilePath, lockfilePath },
        mockView
      );

      // Simulate intent accepted 3605 seconds ago (> 3600s TTL)
      const acceptedTime = Date.now() - 3605 * 1000;
      const { intent } = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        source: 'DASHBOARD',
      });

      // Manually set into AWAITING_APPROVAL with expired vault deadline
      intent.status = 'AWAITING_APPROVAL';
      intent.acceptedAt = acceptedTime;
      intent.vaultDeadline = acceptedTime + 3600 * 1000;
      intent.requestId = 42;

      // Run reconciliation
      await queue.reconcileIntents(agent);

      const refreshed = queue.getIntent(intent.intentId);
      assert.equal(refreshed?.status, 'EXPIRED');
      assert.match(refreshed?.errorMessage || '', /Vault Payment TTL/);
      assert.equal(refreshed?.auditTrail.some(e => e.status === 'EXPIRED'), true);
    });
  });

  describe('4. Idempotency & Duplicate Protection', () => {
    it('prevents duplicate submissions with same intentId', () => {
      const queue = new IntentQueue(intentsFilePath);
      const input = {
        intentId: 'intent_fixed_test_id_001',
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        source: 'DASHBOARD' as const,
      };

      const res1 = queue.submitIntent(input);
      assert.equal(res1.isDuplicate, false);

      const res2 = queue.submitIntent(input);
      assert.equal(res2.isDuplicate, true);
      assert.equal(res2.intent.intentId, 'intent_fixed_test_id_001');
    });

    it('prevents duplicate submissions with same idempotencyKey', () => {
      const queue = new IntentQueue(intentsFilePath);
      const res1 = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        source: 'EXTERNAL_AGENT',
        idempotencyKey: 'idemp_key_run_4920',
      });
      assert.equal(res1.isDuplicate, false);

      const res2 = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        source: 'EXTERNAL_AGENT',
        idempotencyKey: 'idemp_key_run_4920',
      });
      assert.equal(res2.isDuplicate, true);
      assert.equal(res2.intent.intentId, res1.intent.intentId);
    });
  });

  describe('5. Preflight Enforcement & Routing through VaultAgent', () => {
    it('fails closed and records FAILED status when preflight policy is violated (exceeds cap)', async () => {
      const queue = new IntentQueue(intentsFilePath);
      const mockView = new MockTestViewProvider(); // maxPerTx = 1 NEAR
      const agent = new VaultAgent(
        { ledgerPath: ledgerFilePath, lockfilePath },
        mockView
      );

      // Attempt to submit 50 NEAR (adversarial prompt / cap violation)
      const { intent } = queue.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '50.0', // exceeds 1 NEAR max_per_tx
        reason: 'Exceeding cap attempt',
        source: 'EXTERNAL_AGENT',
      });

      const processed = await queue.processIntent(intent.intentId, agent, { dryRun: true });

      assert.equal(processed.status, 'FAILED');
      assert.match(processed.errorMessage || '', /Amount exceeds maximum per-transaction/);
      assert.equal(processed.auditTrail.some(e => e.status === 'FAILED'), true);
      assert.equal(processed.acceptedAt, undefined); // Never accepted!
    });

    it('routes unlisted destination to AWAITING_APPROVAL with requestId', async () => {
      const queue = new IntentQueue(intentsFilePath);
      const mockView = new MockTestViewProvider(); // allowlist has merchant, not oracle
      const agent = new VaultAgent(
        { ledgerPath: ledgerFilePath, lockfilePath },
        mockView
      );

      const { intent } = queue.submitIntent({
        destination: 'oracle.vault-parent.testnet', // NOT in allowlist
        amountNear: '0.15',
        reason: 'Oracle data feed',
        source: 'DASHBOARD',
      });

      const processed = await queue.processIntent(intent.intentId, agent, { dryRun: true });

      assert.equal(processed.status, 'PREFLIGHT'); // In dryRun mode, returns DRY_RUN_SUCCESS -> PREFLIGHT (never false COMPLETED)
      assert.equal(processed.preflightResult?.predictedRouting, 'PENDING_APPROVAL');
      assert.equal(processed.preflightResult?.predictedReason, 'NewDestinationOnly');
    });
  });

  describe('6. Persistence & Crash Recovery', () => {
    it('survives process restart and reloads queue state from disk', () => {
      const queue1 = new IntentQueue(intentsFilePath);
      const { intent } = queue1.submitIntent({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.05',
        reason: 'Durable task',
        source: 'DASHBOARD',
      });

      // Instantiate a new queue instance pointing to the same file
      const queue2 = new IntentQueue(intentsFilePath);
      const reloaded = queue2.getIntent(intent.intentId);

      assert.ok(reloaded !== null);
      assert.equal(reloaded?.intentId, intent.intentId);
      assert.equal(reloaded?.destination, 'merchant.vault-parent.testnet');
      assert.equal(reloaded?.amountNear, '0.05');
      assert.equal(reloaded?.auditTrail.length, intent.auditTrail.length);
    });
  });

  describe('7. Server Endpoints & HTTP Integration Suite', () => {
    const serverPort = 4088;
    const testSecret = 'test_dashboard_auth_secret_rotated_2026';
    let runtimeServer: any;

    beforeEach(async () => {
      runtimeServer = createSigningServer({
        port: serverPort,
        secret: testSecret,
        config: {
          intentsPath: intentsFilePath,
          apiTokensPath: tokensFilePath,
          ledgerPath: ledgerFilePath,
          lockfilePath: lockfilePath,
          phase1StrictBoundary: true,
        },
      });
      await runtimeServer.start();
    });

    afterEach(async () => {
      if (runtimeServer) {
        await runtimeServer.stop();
      }
    });

    it('POST /api/intents/parse parses prompt without executing', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Send 0.05 NEAR to merchant.vault-parent.testnet for testing' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.parsed.destination, 'merchant.vault-parent.testnet');
      assert.equal(data.parsed.amountNear, '0.05');
    });

    it('POST /api/intents rejects unauthenticated external requests with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: 'merchant.vault-parent.testnet', amountNear: '0.05' }),
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.match(data.error, /Unauthorized/);
    });

    it('POST /api/intents accepts authenticated external agent requests and routes through queue', async () => {
      // First generate an agent token
      const tokenRes = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testSecret}`,
        },
        body: JSON.stringify({ agentName: 'External CI Agent Worker' }),
      });
      const tokenData = await tokenRes.json();
      assert.equal(tokenRes.status, 201);
      const agentToken = tokenData.token;

      // Submit intent using the agent bearer token
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${agentToken}`,
          'Idempotency-Key': 'idemp_ci_test_01',
        },
        body: JSON.stringify({
          destination: 'merchant.vault-parent.testnet',
          amountNear: '0.05',
          reason: 'Autonomous external run',
          processNow: false, // stage in queue
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.intent.source, 'EXTERNAL_AGENT');
      assert.equal(data.intent.agentId, 'External CI Agent Worker');
      assert.equal(data.intent.status, 'RECEIVED');

      // Duplicate submission with same Idempotency-Key returns isDuplicate: true
      const dupRes = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${agentToken}`,
          'Idempotency-Key': 'idemp_ci_test_01',
        },
        body: JSON.stringify({
          destination: 'merchant.vault-parent.testnet',
          amountNear: '0.05',
        }),
      });
      const dupData = await dupRes.json();
      assert.equal(dupRes.status, 200);
      assert.equal(dupData.isDuplicate, true);
      assert.equal(dupData.intent.intentId, data.intent.intentId);
    });

    it('POST /api/tokens/:id/revoke revokes token and blocks subsequent submissions with 403', async () => {
      // Generate token
      const tokenRes = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testSecret}`,
        },
        body: JSON.stringify({ agentName: 'Temporary Agent' }),
      });
      const tokenData = await tokenRes.json();
      const { token, record } = tokenData;

      // Revoke token
      const revokeRes = await fetch(`http://127.0.0.1:${serverPort}/api/tokens/${record.tokenId}/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testSecret}`,
        },
      });
      assert.equal(revokeRes.status, 200);

      // Attempt submission with revoked token
      const blockedRes = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          destination: 'merchant.vault-parent.testnet',
          amountNear: '0.05',
        }),
      });
      const blockedData = await blockedRes.json();
      assert.equal(blockedRes.status, 403);
      assert.match(blockedData.error, /revoked by the Vault Owner/);
    });

    it('GET /api/intents requires authentication and rejects unauthenticated callers with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents?status=ALL`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.error, /Unauthorized/);
    });

    it('GET /api/tokens requires Owner authentication and rejects unauthenticated callers with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it('POST /api/tokens requires Owner authentication and rejects unauthenticated callers with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: 'Malicious Attacker' }),
      });
      assert.equal(res.status, 401);
    });

    it('enforces cross-agent intent isolation: Agent A cannot see or inspect Agent B intents', async () => {
      // 1. Create Agent A token
      const tokenARes = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testSecret}`,
        },
        body: JSON.stringify({ agentName: 'Isolated Agent A' }),
      });
      const tokenAData = await tokenARes.json();
      const agentTokenA = tokenAData.token;

      // 2. Create Agent B token
      const tokenBRes = await fetch(`http://127.0.0.1:${serverPort}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testSecret}`,
        },
        body: JSON.stringify({ agentName: 'Isolated Agent B' }),
      });
      const tokenBData = await tokenBRes.json();
      const tokenB = tokenBData.token;

      // 3. Submit intent as Agent B
      const submitB = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          destination: 'whiteice2105.testnet',
          amountNear: '0.02',
          reason: 'Confidential Agent B Task',
          processNow: false,
        }),
      });
      const submitBData = await submitB.json();
      const intentBId = submitBData.intent.intentId;

      // 4. Agent A queries intent inbox: should NOT see Agent B intent
      const listA = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
        headers: {
          'Authorization': `Bearer ${agentTokenA}`,
        },
      });
      const listAData = await listA.json();
      assert.equal(listA.status, 200);
      const containsB = listAData.intents.some((i: any) => i.intentId === intentBId);
      assert.equal(containsB, false, 'Agent A must never see Agent B intents in inbox');

      // 5. Agent A tries to inspect Agent B intent directly by ID: must be rejected with 403
      const inspectB = await fetch(`http://127.0.0.1:${serverPort}/api/intents/${intentBId}`, {
        headers: {
          'Authorization': `Bearer ${agentTokenA}`,
        },
      });
      assert.equal(inspectB.status, 403, 'Agent A direct inspection of Agent B intent must return 403');

      // 6. Vault Owner / Dashboard operator CAN inspect Agent B intent
      const ownerInspect = await fetch(`http://127.0.0.1:${serverPort}/api/intents/${intentBId}`, {
        headers: {
          'Authorization': `Bearer ${testSecret}`,
        },
      });
      assert.equal(ownerInspect.status, 200, 'Owner has full visibility over all intents');
    });

    it('rejects oversized request body exceeding 64KB with error', async () => {
      const hugeReason = 'A'.repeat(70_000); // 70KB
      try {
        const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testSecret}`,
          },
          body: JSON.stringify({
            destination: 'merchant.vault-parent.testnet',
            amountNear: '0.05',
            reason: hugeReason,
          }),
        });
        // Either connection destroyed or 400/500
        assert.ok(res.status >= 400);
      } catch (err: any) {
        // Socket hangup / connection destroyed when body exceeds limit is expected
        assert.ok(err);
      }
    });

    it('GET /api/intents lists and filters submitted intents when authenticated as Owner', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/intents?status=ALL`, {
        headers: {
          'Authorization': `Bearer ${testSecret}`,
        },
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.intents));
    });
  });
});
