import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { VaultAgent } from '../dist/agent.js';
import type { ContractViewProvider } from '../dist/preflight.js';
import type { SpendingPolicyView, DailyBucketView } from '../dist/types.js';

const tempDir = path.resolve(process.cwd(), 'tests', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

class MockAgentViewProvider implements ContractViewProvider {
  public paused: boolean;
  public authorized: boolean;
  public policy: SpendingPolicyView;
  public bucket: DailyBucketView;
  public liquidBalance: string;
  public agentPendingCount: number;
  public globalPendingCount: number;

  constructor(
    paused = false,
    authorized = true,
    policy?: SpendingPolicyView,
    bucket?: DailyBucketView,
    liquidBalance = '3000000000000000000000000',
    agentPendingCount = 0,
    globalPendingCount = 0
  ) {
    this.paused = paused;
    this.authorized = authorized;
    this.policy = policy || {
      max_per_transaction: '1000000000000000000000000', // 1.0 NEAR
      daily_cap: '2000000000000000000000000', // 2.0 NEAR
      auto_approval_threshold: '200000000000000000000000', // 0.2 NEAR
      destination_allowlist: ['merchant.vault-parent.testnet'],
      is_paused: false,
    };
    this.bucket = bucket || {
      bucket_index: 20000,
      spent: '0',
      reserved: '0',
      last_updated_at: 0,
    };
    this.liquidBalance = liquidBalance;
    this.agentPendingCount = agentPendingCount;
    this.globalPendingCount = globalPendingCount;
  }

  async isPaused(): Promise<boolean> {
    return this.paused;
  }
  async isAgentAuthorized(_agentId: string): Promise<boolean> {
    return this.authorized;
  }
  async getPolicy(): Promise<SpendingPolicyView> {
    return this.policy;
  }
  async getDailyBucket(_dayIndex?: number): Promise<DailyBucketView> {
    return this.bucket;
  }
  async getAvailableLiquidBalance(): Promise<string> {
    return this.liquidBalance;
  }
  async getAgentPendingCount(_agentId: string): Promise<number> {
    return this.agentPendingCount;
  }
  async getGlobalPendingCount(): Promise<number> {
    return this.globalPendingCount;
  }
}

test('VaultAgent: getStatus returns formatted on-chain policy and solvency report', async () => {
  const provider = new MockAgentViewProvider();
  const agent = new VaultAgent(
    {
      agentAccountId: 'agent-a.vault-parent.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      ledgerPath: path.resolve(tempDir, `ledger_status_${Date.now()}.json`),
      lockfilePath: path.resolve(tempDir, `lock_status_${Date.now()}.lock`),
    },
    provider
  );

  const status = await agent.getStatus();
  assert.strictEqual(status.agentAccountId, 'agent-a.vault-parent.testnet');
  assert.strictEqual(status.vaultContractId, 'contract.vault-parent.testnet');
  assert.strictEqual(status.isAgentAuthorized, true);
  assert.strictEqual(status.isVaultPaused, false);
  assert.strictEqual(status.maxPerTxNear, '1.0000');
  assert.strictEqual(status.dailyCapNear, '2.0000');
  assert.strictEqual(status.autoApprovalThresholdNear, '0.2000');
  assert.strictEqual(status.availableLiquidNear, '3.0000');
  assert.strictEqual(status.agentPendingCount, 0);
  assert.strictEqual(status.globalPendingCount, 0);
});

test('VaultAgent: requestPayment in dry-run mode completes preflight, verifies payload, and returns DRY_RUN_SUCCESS', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_dryrun_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_dryrun_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      agentAccountId: 'agent-a.vault-parent.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  const result = await agent.requestPayment(
    {
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      reason: 'Automated batch payment',
      intentId: 'intent_dryrun_test',
    },
    { dryRun: true }
  );

  assert.strictEqual(result.status, 'DRY_RUN_SUCCESS');
  assert.ok(result.preview);
  assert.strictEqual(result.preview.deposit, '0');
  assert.strictEqual(result.preview.methodName, 'request_payment');
  assert.strictEqual(result.preview.receiverId, 'contract.vault-parent.testnet');
  assert.strictEqual(result.preview.signerId, 'agent-a.vault-parent.testnet');
  assert.strictEqual(result.preflight.success, true);
  assert.strictEqual(result.preflight.predictedRouting, 'AUTO_DISPATCH');

  // Verify ledger entry
  const record = agent.getLedger().getRecord('intent_dryrun_test');
  assert.ok(record);
  assert.strictEqual(record?.status, 'DRY_RUN_SUCCESS');
});

test('VaultAgent: requestPayment fails closed when pre-flight fails without signing', async () => {
  const provider = new MockAgentViewProvider(true); // paused = true
  const ledgerPath = path.resolve(tempDir, `ledger_fail_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_fail_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  const result = await agent.requestPayment(
    {
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      reason: 'Should be rejected by paused vault',
      intentId: 'intent_rejected_test',
    },
    { dryRun: true }
  );

  assert.strictEqual(result.status, 'LOCAL_PREFLIGHT_REJECTED');
  assert.strictEqual(result.preview, undefined);
  assert.strictEqual(result.preflight.success, false);
  assert.strictEqual(result.preflight.predictedReason, 'VaultPaused');

  // Verify ledger recorded rejection
  const record = agent.getLedger().getRecord('intent_rejected_test');
  assert.strictEqual(record?.status, 'LOCAL_PREFLIGHT_REJECTED');
});

test('VaultAgent: parseExecutionOutcome correctly distinguishes Dispatched, Pending, and Denied variants', () => {
  const agent = new VaultAgent();

  // 1. Dispatched
  const dispatchedOutcome = {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 10 } })).toString('base64'),
    },
  };
  const res1 = agent.parseExecutionOutcome(dispatchedOutcome);
  assert.strictEqual(res1.status, 'PAYMENT_DISPATCHED_AND_EXECUTED');
  assert.strictEqual(res1.requestId, 10);

  // 2. Pending
  const pendingOutcome = {
    status: {
      SuccessValue: Buffer.from(
        JSON.stringify({ Pending: { request_id: 11, origin_reason: 'AboveThresholdOnly' } })
      ).toString('base64'),
    },
  };
  const res2 = agent.parseExecutionOutcome(pendingOutcome);
  assert.strictEqual(res2.status, 'PAYMENT_PENDING_APPROVAL');
  assert.strictEqual(res2.requestId, 11);
  assert.strictEqual(res2.originReason, 'AboveThresholdOnly');

  // 3. Denied
  const deniedOutcome = {
    status: {
      SuccessValue: Buffer.from(
        JSON.stringify({ Denied: { reason: 'ExceedsDailyCap' } })
      ).toString('base64'),
    },
  };
  const res3 = agent.parseExecutionOutcome(deniedOutcome);
  assert.strictEqual(res3.status, 'POLICY_DENIED_ON_CHAIN');
  assert.strictEqual(res3.policyDenialReason, 'ExceedsDailyCap');
});
