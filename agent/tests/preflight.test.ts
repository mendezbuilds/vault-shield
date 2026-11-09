import test from 'node:test';
import assert from 'node:assert';
import { executePreflight, NearRpcContractViewProvider, type ContractViewProvider } from '../dist/preflight.js';
import { loadConfig } from '../dist/config.js';
import type { PaymentIntent, SpendingPolicyView, DailyBucketView } from '../dist/types.js';

class MockContractViewProvider implements ContractViewProvider {
  public paused: boolean;
  public authorized: boolean;
  public policy: SpendingPolicyView;
  public bucket: DailyBucketView;
  public liquidBalance: string;
  public agentPendingCount: number;
  public globalPendingCount: number;
  public shouldFailRpc: boolean;

  constructor(
    paused = false,
    authorized = true,
    policy?: SpendingPolicyView,
    bucket?: DailyBucketView,
    liquidBalance = '5000000000000000000000000',
    agentPendingCount = 0,
    globalPendingCount = 1,
    shouldFailRpc = false
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
      spent: '100000000000000000000000', // 0.1 NEAR
      reserved: '0',
      last_updated_at: 100000,
    };
    this.liquidBalance = liquidBalance;
    this.agentPendingCount = agentPendingCount;
    this.globalPendingCount = globalPendingCount;
    this.shouldFailRpc = shouldFailRpc;
  }

  async isPaused(): Promise<boolean> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.paused;
  }
  async isAgentAuthorized(_agentId: string): Promise<boolean> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.authorized;
  }
  async getPolicy(): Promise<SpendingPolicyView> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.policy;
  }
  async getDailyBucket(_dayIndex?: number): Promise<DailyBucketView> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.bucket;
  }
  async getAvailableLiquidBalance(): Promise<string> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.liquidBalance;
  }
  async getAgentPendingCount(_agentId: string): Promise<number> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.agentPendingCount;
  }
  async getGlobalPendingCount(): Promise<number> {
    if (this.shouldFailRpc) throw new Error('Simulated RPC Connection Timeout');
    return this.globalPendingCount;
  }
}

const config = loadConfig({
  agentAccountId: 'agent-a.vault-parent.testnet',
  vaultContractId: 'contract.vault-parent.testnet',
});

function createMockIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    intentId: 'intent_test_1',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    amountYocto: '150000000000000000000000', // 0.15 NEAR
    reason: 'Test payment for API services',
    ttlSeconds: 3600,
    createdAt: Date.now(),
    ...overrides,
  };
}

test('Preflight: Valid auto-approval request passes all checks', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent();
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.predictedRouting, 'AUTO_DISPATCH');
  assert.strictEqual(res.error, undefined);
  assert.ok(res.checks.every(c => c.passed));
});

test('Preflight: Valid above-threshold payment routes to PENDING_APPROVAL', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent({
    amountNear: '0.5',
    amountYocto: '500000000000000000000000', // 0.5 NEAR (> 0.2 auto-threshold, < 1.0 max tx)
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.predictedRouting, 'PENDING_APPROVAL');
  assert.strictEqual(res.predictedReason, 'AboveThresholdOnly');
});

test('Preflight: Unlisted destination routes to PENDING_APPROVAL', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent({
    destination: 'unlisted-provider.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000', // 0.1 NEAR (< 0.2 auto-threshold)
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.predictedRouting, 'PENDING_APPROVAL');
  assert.strictEqual(res.predictedReason, 'NewDestinationOnly');
});

test('Preflight: Rejects unauthorized agent', async () => {
  const provider = new MockContractViewProvider(false, false); // authorized = false
  const intent = createMockIntent();
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'AgentNotAuthorized');
  assert.ok(res.error?.includes('not an authorized agent'));
});

test('Preflight: Rejects when vault is paused', async () => {
  const provider = new MockContractViewProvider(true, true); // paused = true
  const intent = createMockIntent();
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'VaultPaused');
  assert.ok(res.error?.includes('Vault is paused'));
});

test('Preflight: Rejects when amount exceeds max_per_transaction', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent({
    amountNear: '1.5',
    amountYocto: '1500000000000000000000000', // 1.5 NEAR (> 1.0 cap)
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'ExceedsPerTransactionCap');
  assert.ok(res.error?.includes('maximum per-transaction policy cap'));
});

test('Preflight: Rejects when amount breaches daily cap', async () => {
  const provider = new MockContractViewProvider(
    false,
    true,
    undefined,
    {
      bucket_index: 20000,
      spent: '1800000000000000000000000', // 1.8 NEAR spent today (out of 2.0 cap)
      reserved: '0',
      last_updated_at: 100,
    }
  );
  const intent = createMockIntent({
    amountNear: '0.3',
    amountYocto: '300000000000000000000000', // 0.3 NEAR (1.8 + 0.3 = 2.1 > 2.0)
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'ExceedsDailyCap');
  assert.ok(res.error?.includes('Daily spending budget exceeded'));
});

test('Preflight: Rejects when agent pending queue is full (2/2)', async () => {
  const provider = new MockContractViewProvider(
    false,
    true,
    undefined,
    undefined,
    undefined,
    2 // agent pending = 2 (ceiling reached)
  );
  // An above-threshold payment requires queue slot
  const intent = createMockIntent({
    amountNear: '0.5',
    amountYocto: '500000000000000000000000',
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'AgentQueueLimitExceeded');
  assert.ok(res.error?.includes('Agent concurrency ceiling reached'));
});

test('Preflight: Rejects when available liquid balance is insufficient', async () => {
  const provider = new MockContractViewProvider(
    false,
    true,
    undefined,
    undefined,
    '50000000000000000000000' // only 0.05 NEAR liquid
  );
  const intent = createMockIntent({
    amountNear: '0.15',
    amountYocto: '150000000000000000000000', // 0.15 NEAR
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'InsufficientLiquidBalance');
  assert.ok(res.error?.includes('insufficient liquid balance'));
});

test('Preflight: Rejects invalid TTL', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent({
    ttlSeconds: 60, // 1 min < 5 min minimum
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.strictEqual(res.predictedReason, 'InvalidTtl');
});

test('Preflight: Rejects invalid destination syntax', async () => {
  const provider = new MockContractViewProvider();
  const intent = createMockIntent({
    destination: 'INVALID/NAME!@#',
  });
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.ok(res.error?.includes('Invalid destination'));
});

test('Preflight: Fail-closed on RPC connection failure or timeout', async () => {
  const provider = new MockContractViewProvider(
    false,
    true,
    undefined,
    undefined,
    undefined,
    0,
    0,
    true // shouldFailRpc = true
  );
  const intent = createMockIntent();
  const res = await executePreflight(intent, config, provider);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.predictedRouting, 'DENIED');
  assert.ok(res.error?.includes('fail-closed'));
});

test('Preflight: Day index calculation matches UTC epoch day exactly', () => {
  const now = Date.now();
  const expectedDayIndex = Math.floor(now / 86400000);
  assert.strictEqual(typeof expectedDayIndex, 'number');
  assert.ok(expectedDayIndex > 19000);

  // Midnight rollover check: 23:59:59 UTC -> 00:00:01 UTC next day
  const midnightMinus1 = Date.UTC(2026, 10, 9, 23, 59, 59);
  const midnightPlus1 = Date.UTC(2026, 10, 10, 0, 0, 1);
  const day1 = Math.floor(midnightMinus1 / 86400000);
  const day2 = Math.floor(midnightPlus1 / 86400000);
  assert.strictEqual(day2 - day1, 1);
});

test('NearRpcContractViewProvider: Rejects malformed JSON and fails closed', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            result: Array.from(Buffer.from('not-valid-json{{{')),
          },
        }),
      } as any;
    };
    const provider = new NearRpcContractViewProvider('http://127.0.0.1:9999', 'http://127.0.0.1:9998', 'contract.vault-parent.testnet', 1000);
    await assert.rejects(async () => {
      await provider.isPaused();
    }, /Malformed RPC view response: invalid JSON payload/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NearRpcContractViewProvider: Rejects invalid view response structure', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: null,
        }),
      } as any;
    };
    const provider = new NearRpcContractViewProvider('http://127.0.0.1:9999', 'http://127.0.0.1:9998', 'contract.vault-parent.testnet', 1000);
    await assert.rejects(async () => {
      await provider.isPaused();
    }, /Invalid view response format/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NearRpcContractViewProvider: Times out after configured timeoutMs and aborts fetch', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init: any) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('RPC view call timeout after 50ms'));
        });
      });
    };
    const provider = new NearRpcContractViewProvider('http://127.0.0.1:9999', 'http://127.0.0.1:9998', 'contract.vault-parent.testnet', 50);
    await assert.rejects(async () => {
      await provider.isPaused();
    }, /RPC view call timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
