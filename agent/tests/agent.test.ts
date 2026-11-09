import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { VaultAgent } from '../dist/agent.js';
import { AgentSigner } from '../dist/signer.js';
import { ProcessLock } from '../dist/ledger.js';
import type { ContractViewProvider } from '../dist/preflight.js';
import type {
  SpendingPolicyView,
  DailyBucketView,
  PaymentRequestView,
  ReconciledTombstoneView,
  PaymentIntent,
} from '../dist/types.js';

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
  public requests: Map<number, PaymentRequestView> = new Map();
  public tombstones: Map<number, ReconciledTombstoneView> = new Map();
  public txStatuses: Map<string, any> = new Map();

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
  async getRequest(requestId: number): Promise<PaymentRequestView | null> {
    return this.requests.get(requestId) || null;
  }
  async getTombstone(requestId: number): Promise<ReconciledTombstoneView | null> {
    return this.tombstones.get(requestId) || null;
  }
  async getTransactionStatus(txHash: string, _signerAccountId: string): Promise<any> {
    const status = this.txStatuses.get(txHash);
    if (!status) {
      throw new Error(`Transaction ${txHash} not found on network`);
    }
    return status;
  }
}

class MockAgentSigner extends AgentSigner {
  public failBroadcast = false;
  public mockBroadcastOutcome: any = null;
  public simulatedTxHash = 'tx_simulated_hash_123';

  constructor(boundary = false) {
    super({
      agentAccountId: 'agent-a.vault-parent.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      rpcUrl: 'http://127.0.0.1:9999',
      fallbackRpcUrl: 'http://127.0.0.1:9998',
      expectedPublicKey: 'ed25519:6E4aW9fS3y...mock...',
      phase1StrictBoundary: boundary,
    } as any);
  }

  override hasSigningCapability(): boolean {
    return true;
  }

  override async createSignedPaymentTransaction(intent: PaymentIntent) {
    return {
      txHash: this.simulatedTxHash,
      signedTransaction: { mockSigned: true, intentId: intent.intentId },
      preview: this.previewPayload(intent),
    };
  }

  override async broadcastSignedTransaction(_signedTx: any) {
    if (this.failBroadcast) {
      throw new Error('RPC Node Timeout: Transaction timed out waiting to be included in block');
    }
    return this.mockBroadcastOutcome;
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

  // 1. Dispatched (Interim state awaiting downstream execution confirmation)
  const dispatchedOutcome = {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 10 } })).toString('base64'),
    },
  };
  const res1 = agent.parseExecutionOutcome(dispatchedOutcome);
  assert.strictEqual(res1.status, 'PAYMENT_DISPATCHED');
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
  assert.strictEqual(res2.status, 'PENDING_OWNER_APPROVAL');
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
  assert.strictEqual(res3.status, 'CONTRACT_DENIED');
  assert.strictEqual(res3.policyDenialReason, 'ExceedsDailyCap');
});

test('SEC-01 Scenario: Broadcast timeout after node receipt sets status UNKNOWN_UNRESOLVED and preserves txHash in ledger', async () => {
  const provider = new MockAgentViewProvider();
  const signer = new MockAgentSigner(false);
  signer.failBroadcast = true;
  signer.simulatedTxHash = '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54';

  const ledgerPath = path.resolve(tempDir, `ledger_timeout_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_timeout_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      agentAccountId: 'agent-a.vault-parent.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider,
    signer
  );

  const result = await agent.requestPayment({
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    reason: 'Timeout test',
    intentId: 'intent_timeout_test_1',
  });

  // Verify result status is UNKNOWN_UNRESOLVED with txHash
  assert.strictEqual(result.status, 'UNKNOWN_UNRESOLVED');
  assert.strictEqual(result.txHash, '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54');
  assert.ok(result.error?.includes('RPC Node Timeout'));

  // Verify ledger entry on disk captured txHash and UNKNOWN_UNRESOLVED status
  const record = agent.getLedger().getRecord('intent_timeout_test_1');
  assert.ok(record);
  assert.strictEqual(record?.status, 'UNKNOWN_UNRESOLVED');
  assert.strictEqual(record?.txHash, '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54');
});

test('SEC-04 Scenario: reconcilePending queries RPC with persisted txHash and transitions UNKNOWN_UNRESOLVED to PAYMENT_EXECUTED', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_reconcile_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_reconcile_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      agentAccountId: 'agent-a.vault-parent.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider
  );

  // Seed an unresolved pending record in the ledger
  const testTxHash = '9x7YzaBcdEfGhIjKlMnOpQrStUvWxYz1234567890';
  agent.getLedger().recordIntent(
    {
      intentId: 'intent_reconcile_success',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'Reconcile test',
      createdAt: Date.now(),
    },
    'UNKNOWN_UNRESOLVED',
    testTxHash
  );

  // Set up RPC mock outcomes
  provider.txStatuses.set(testTxHash, {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 77 } })).toString('base64'),
    },
  });
  provider.requests.set(77, {
    id: 77,
    requester: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'Reconcile test',
    created_at: 1000,
    expires_at: 2000,
    status: 'Executed',
    origin_reason: 'AutoApprovalPolicy',
  });

  // Execute reconciliation
  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].intentId, 'intent_reconcile_success');
  assert.strictEqual(reconciliations[0].updated, true);
  assert.strictEqual(reconciliations[0].previousStatus, 'UNKNOWN_UNRESOLVED');
  assert.strictEqual(reconciliations[0].newStatus, 'PAYMENT_EXECUTED');
  assert.strictEqual(reconciliations[0].requestId, 77);

  // Verify ledger on disk updated
  const updatedRecord = agent.getLedger().getRecord('intent_reconcile_success');
  assert.strictEqual(updatedRecord?.status, 'PAYMENT_EXECUTED');
  assert.strictEqual(updatedRecord?.requestId, 77);
});

test('SEC-04 Scenario: reconcilePending leaves record as UNKNOWN_UNRESOLVED when transaction is temporarily not indexed on RPC', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_reconcile_missing_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_reconcile_missing_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider
  );

  const testTxHash = 'tx_not_yet_in_block_123';
  agent.getLedger().recordIntent(
    {
      intentId: 'intent_reconcile_missing',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.1',
      amountYocto: '100000000000000000000000',
      reason: 'Temporary missing test',
      createdAt: Date.now(),
    },
    'UNKNOWN_UNRESOLVED',
    testTxHash
  );

  // View provider has no txStatus for testTxHash, which causes it to throw/not find
  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].intentId, 'intent_reconcile_missing');
  assert.strictEqual(reconciliations[0].updated, false);
  assert.strictEqual(reconciliations[0].newStatus, 'UNKNOWN_UNRESOLVED');

  // Verify status in ledger is unchanged and not rebroadcast
  const record = agent.getLedger().getRecord('intent_reconcile_missing');
  assert.strictEqual(record?.status, 'UNKNOWN_UNRESOLVED');
});

test('VaultAgent: Concurrent duplicate payment intent submission is strictly rejected', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_dup_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_dup_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  const intent = {
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    reason: 'Duplicate intent test',
    intentId: 'intent_strictly_unique_123',
  };

  const res1 = await agent.requestPayment(intent, { dryRun: true });
  assert.strictEqual(res1.status, 'DRY_RUN_SUCCESS');

  // Attempt duplicate submission
  const res2 = await agent.requestPayment(intent, { dryRun: true });
  assert.strictEqual(res2.status, 'LOCAL_PREFLIGHT_REJECTED');
  assert.ok(res2.error?.includes('Duplicate task intent detected'));
});

test('SEC-02 Scenario: Dispatched payment with downstream callback failure records DOWNSTREAM_TRANSFER_FAILED', async () => {
  const provider = new MockAgentViewProvider();
  const signer = new MockAgentSigner(false);
  signer.simulatedTxHash = 'tx_downstream_failed_hash';
  signer.mockBroadcastOutcome = {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 88 } })).toString('base64'),
    },
  };

  // Mock downstream failure in getRequest view
  provider.requests.set(88, {
    id: 88,
    requester: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'Failed downstream test',
    created_at: 1000,
    expires_at: 2000,
    status: 'Failed',
    origin_reason: 'AutoApprovalPolicy',
  });

  const ledgerPath = path.resolve(tempDir, `ledger_downstream_fail_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_downstream_fail_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider,
    signer
  );

  const result = await agent.requestPayment({
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    reason: 'Downstream failure test',
    intentId: 'intent_downstream_fail',
  });

  assert.strictEqual(result.status, 'DOWNSTREAM_TRANSFER_FAILED');
  assert.strictEqual(result.requestId, 88);

  const record = agent.getLedger().getRecord('intent_downstream_fail');
  assert.strictEqual(record?.status, 'DOWNSTREAM_TRANSFER_FAILED');
  assert.strictEqual(record?.requestId, 88);
});

test('SEC-02 Scenario: Dispatched payment confirmed Executed on-chain records PAYMENT_EXECUTED', async () => {
  const provider = new MockAgentViewProvider();
  const signer = new MockAgentSigner(false);
  signer.simulatedTxHash = 'tx_confirmed_executed_hash';
  signer.mockBroadcastOutcome = {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 99 } })).toString('base64'),
    },
  };

  provider.requests.set(99, {
    id: 99,
    requester: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'Confirmed executed test',
    created_at: 1000,
    expires_at: 2000,
    status: 'Executed',
    origin_reason: 'AutoApprovalPolicy',
  });

  const ledgerPath = path.resolve(tempDir, `ledger_confirmed_exec_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_confirmed_exec_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider,
    signer
  );

  const result = await agent.requestPayment({
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    reason: 'Confirmed execution test',
    intentId: 'intent_confirmed_exec',
  });

  assert.strictEqual(result.status, 'PAYMENT_EXECUTED');
  assert.strictEqual(result.requestId, 99);

  const record = agent.getLedger().getRecord('intent_confirmed_exec');
  assert.strictEqual(record?.status, 'PAYMENT_EXECUTED');
  assert.strictEqual(record?.requestId, 99);
});

test('SEC-02 Scenario: Dispatched payment still InFlight remains interim PAYMENT_DISPATCHED', async () => {
  const provider = new MockAgentViewProvider();
  const signer = new MockAgentSigner(false);
  signer.simulatedTxHash = 'tx_inflight_hash';
  signer.mockBroadcastOutcome = {
    status: {
      SuccessValue: Buffer.from(JSON.stringify({ Dispatched: { request_id: 100 } })).toString('base64'),
    },
  };

  provider.requests.set(100, {
    id: 100,
    requester: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'InFlight test',
    created_at: 1000,
    expires_at: 2000,
    status: 'InFlight',
    origin_reason: 'AutoApprovalPolicy',
  });

  const ledgerPath = path.resolve(tempDir, `ledger_inflight_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_inflight_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: false,
    },
    provider,
    signer
  );

  const result = await agent.requestPayment({
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    reason: 'InFlight test',
    intentId: 'intent_inflight',
  });

  assert.strictEqual(result.status, 'PAYMENT_DISPATCHED');
  assert.strictEqual(result.requestId, 100);

  const record = agent.getLedger().getRecord('intent_inflight');
  assert.strictEqual(record?.status, 'PAYMENT_DISPATCHED');
  assert.strictEqual(record?.requestId, 100);
});

test('MED-02 Concurrency: reconcilePending fails closed when process lock is held by another process', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_lock_reconcile_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_lock_reconcile_${Date.now()}.lock`);

  // External process holds the lock
  const externalLock = new ProcessLock(lockfilePath);
  externalLock.acquire();

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  // reconcilePending should fail closed with lock collision
  await assert.rejects(
    async () => {
      await agent.reconcilePending();
    },
    /Concurrency Lock Collision/
  );

  // Release external lock
  externalLock.release();

  // Now reconcilePending succeeds
  const results = await agent.reconcilePending();
  assert.strictEqual(Array.isArray(results), true);
});

test('MED-02 Concurrency: requestPayment fails closed when external process holds lock', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_lock_req_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_lock_req_${Date.now()}.lock`);

  const externalLock = new ProcessLock(lockfilePath);
  externalLock.acquire();

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  await assert.rejects(
    async () => {
      await agent.requestPayment({
        destination: 'merchant.vault-parent.testnet',
        amountNear: '0.1',
        reason: 'Lock collision check',
      });
    },
    /Concurrency Lock Collision/
  );

  externalLock.release();
});

test('MED-01 Terminal Status: Rejected maps to REQUEST_REJECTED in reconciliation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_rejected_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_rejected_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_rejected_test',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.5',
      amountYocto: '500000000000000000000000',
      reason: 'Rejected payment test',
      createdAt: Date.now(),
    },
    'PENDING_OWNER_APPROVAL'
  );
  agent.getLedger().updateRecord('intent_rejected_test', { requestId: 201 });

  provider.requests.set(201, {
    id: 201,
    agent_id: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '500000000000000000000000',
    reason: 'Rejected payment test',
    created_at: 1000,
    created_bucket: 20000,
    ttl_nanos: 3600000000000,
    status: 'Rejected',
    origin_reason: 'AboveThresholdOnly',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'REQUEST_REJECTED');
  assert.strictEqual(reconciliations[0].updated, true);

  const record = agent.getLedger().getRecord('intent_rejected_test');
  assert.strictEqual(record?.status, 'REQUEST_REJECTED');
});

test('MED-01 Terminal Status: Expired maps to REQUEST_EXPIRED in reconciliation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_expired_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_expired_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_expired_test',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.5',
      amountYocto: '500000000000000000000000',
      reason: 'Expired payment test',
      createdAt: Date.now(),
    },
    'PENDING_OWNER_APPROVAL'
  );
  agent.getLedger().updateRecord('intent_expired_test', { requestId: 202 });

  provider.requests.set(202, {
    id: 202,
    agent_id: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '500000000000000000000000',
    reason: 'Expired payment test',
    created_at: 1000,
    created_bucket: 20000,
    ttl_nanos: 3600000000000,
    status: 'Expired',
    origin_reason: 'AboveThresholdOnly',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'REQUEST_EXPIRED');
  assert.strictEqual(reconciliations[0].updated, true);

  const record = agent.getLedger().getRecord('intent_expired_test');
  assert.strictEqual(record?.status, 'REQUEST_EXPIRED');
});

test('MED-01 Terminal Status: ReconciledExecuted maps to PAYMENT_EXECUTED in reconciliation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_reconciled_exec_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_reconciled_exec_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_reconciled_exec',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'ReconciledExecuted test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_reconciled_exec', { requestId: 203 });

  provider.requests.set(203, {
    id: 203,
    agent_id: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'ReconciledExecuted test',
    created_at: 1000,
    created_bucket: 20000,
    ttl_nanos: 3600000000000,
    status: 'ReconciledExecuted',
    origin_reason: 'None',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'PAYMENT_EXECUTED');
  assert.strictEqual(reconciliations[0].updated, true);
  assert.ok(reconciliations[0].message.includes('via contract reconciliation'));

  const record = agent.getLedger().getRecord('intent_reconciled_exec');
  assert.strictEqual(record?.status, 'PAYMENT_EXECUTED');
});

test('MED-01 Terminal Status: ReconciledFailed maps to DOWNSTREAM_TRANSFER_FAILED in reconciliation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_reconciled_failed_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_reconciled_failed_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_reconciled_failed',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'ReconciledFailed test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_reconciled_failed', { requestId: 204 });

  provider.requests.set(204, {
    id: 204,
    agent_id: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'ReconciledFailed test',
    created_at: 1000,
    created_bucket: 20000,
    ttl_nanos: 3600000000000,
    status: 'ReconciledFailed',
    origin_reason: 'None',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'DOWNSTREAM_TRANSFER_FAILED');
  assert.strictEqual(reconciliations[0].updated, true);
  assert.ok(reconciliations[0].message.includes('reservation refunded'));

  const record = agent.getLedger().getRecord('intent_reconciled_failed');
  assert.strictEqual(record?.status, 'DOWNSTREAM_TRANSFER_FAILED');
});

test('MED-01 Terminal Status: Tombstone Executed maps to PAYMENT_EXECUTED when request view is null', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_tombstone_exec_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_tombstone_exec_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_tombstone_exec',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'Tombstone Executed test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_tombstone_exec', { requestId: 205 });

  // requests.get(205) returns null (pruned from active requests)
  provider.tombstones.set(205, {
    request_id: 205,
    original_bucket: 20000,
    amount: '150000000000000000000000',
    attested_resolution: 'Executed',
    reconciled_at: 1000,
    evidence_tx_hash: '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'PAYMENT_EXECUTED');
  assert.strictEqual(reconciliations[0].updated, true);
  assert.ok(reconciliations[0].message.includes('via contract tombstone'));

  const record = agent.getLedger().getRecord('intent_tombstone_exec');
  assert.strictEqual(record?.status, 'PAYMENT_EXECUTED');
});

test('MED-01 Terminal Status: Tombstone Failed maps to DOWNSTREAM_TRANSFER_FAILED when request view is null', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_tombstone_fail_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_tombstone_fail_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_tombstone_fail',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'Tombstone Failed test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_tombstone_fail', { requestId: 206 });

  provider.tombstones.set(206, {
    request_id: 206,
    original_bucket: 20000,
    amount: '150000000000000000000000',
    attested_resolution: 'Failed',
    reconciled_at: 1000,
    evidence_tx_hash: 'evidence_failed_tx_hash',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'DOWNSTREAM_TRANSFER_FAILED');
  assert.strictEqual(reconciliations[0].updated, true);

  const record = agent.getLedger().getRecord('intent_tombstone_fail');
  assert.strictEqual(record?.status, 'DOWNSTREAM_TRANSFER_FAILED');
});

test('MED-01 Terminal Status: Missing request view and tombstone fails closed without status mutation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_missing_req_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_missing_req_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_missing_req',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'Missing request test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_missing_req', { requestId: 999 });

  // Neither request 999 nor tombstone 999 exists
  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'PAYMENT_DISPATCHED');
  assert.strictEqual(reconciliations[0].updated, false);
  assert.ok(reconciliations[0].message.includes('not found in active requests or tombstones'));

  const record = agent.getLedger().getRecord('intent_missing_req');
  assert.strictEqual(record?.status, 'PAYMENT_DISPATCHED');
});

test('MED-01 Terminal Status: Unexpected or malformed status fails closed without status mutation', async () => {
  const provider = new MockAgentViewProvider();
  const ledgerPath = path.resolve(tempDir, `ledger_malformed_${Date.now()}.json`);
  const lockfilePath = path.resolve(tempDir, `lock_malformed_${Date.now()}.lock`);

  const agent = new VaultAgent(
    {
      ledgerPath,
      lockfilePath,
      phase1StrictBoundary: true,
    },
    provider
  );

  agent.getLedger().recordIntent(
    {
      intentId: 'intent_malformed',
      destination: 'merchant.vault-parent.testnet',
      amountNear: '0.15',
      amountYocto: '150000000000000000000000',
      reason: 'Malformed test',
      createdAt: Date.now(),
    },
    'PAYMENT_DISPATCHED'
  );
  agent.getLedger().updateRecord('intent_malformed', { requestId: 207 });

  provider.requests.set(207, {
    id: 207,
    agent_id: 'agent-a.vault-parent.testnet',
    destination: 'merchant.vault-parent.testnet',
    amount: '150000000000000000000000',
    reason: 'Malformed status',
    created_at: 1000,
    created_bucket: 20000,
    ttl_nanos: 3600000000000,
    status: 'CorruptedNonExistentVariant' as any,
    origin_reason: 'None',
  });

  const reconciliations = await agent.reconcilePending();
  assert.strictEqual(reconciliations.length, 1);
  assert.strictEqual(reconciliations[0].newStatus, 'PAYMENT_DISPATCHED');
  assert.strictEqual(reconciliations[0].updated, false);
  assert.ok(reconciliations[0].message.includes('Unexpected contract request status'));

  const record = agent.getLedger().getRecord('intent_malformed');
  assert.strictEqual(record?.status, 'PAYMENT_DISPATCHED');
});
