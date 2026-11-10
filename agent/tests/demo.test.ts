import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import {
  ScenarioHarness,
  StandardPolicyFixtureViewProvider,
  DEMO_SCENARIOS,
} from '../dist/harness.js';
import { VaultAgent } from '../dist/agent.js';
import { loadConfig, EXPECTED_RESTRICTED_PUBLIC_KEY } from '../dist/config.js';
import { MockLLMProvider, PAYMENT_TOOL_NAME } from '../dist/llm.js';

const tempDir = path.resolve(process.cwd(), 'tests', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function createHarnessForTesting(): { harness: ScenarioHarness; ledgerFile: string; lockFile: string } {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ledgerFile = path.resolve(tempDir, `ledger_demo_${nonce}.json`);
  const lockFile = path.resolve(tempDir, `lock_demo_${nonce}.lock`);

  const config = loadConfig({
    agentAccountId: 'agent-a.vault-parent.testnet',
    vaultContractId: 'contract.vault-parent.testnet',
    expectedPublicKey: EXPECTED_RESTRICTED_PUBLIC_KEY,
    ledgerPath: ledgerFile,
    lockfilePath: lockFile,
    phase1StrictBoundary: true,
    llmProvider: 'mock',
  });

  const agent = new VaultAgent(config, new StandardPolicyFixtureViewProvider());
  const harness = new ScenarioHarness(agent);

  return { harness, ledgerFile, lockFile };
}

function cleanupFiles(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
}

// -----------------------------------------------------------------------------
// Test 1: Scenario A - Autonomous Payment Path
// -----------------------------------------------------------------------------
test('Day 2 Scenario A: Autonomous payment request executes within policy limits', async () => {
  const { harness, ledgerFile, lockFile } = createHarnessForTesting();

  try {
    const result = await harness.runScenario('auto', { silent: true });

    assert.strictEqual(result.scenarioId, 'auto');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.actualRouting, 'AUTO_DISPATCH');
    assert.strictEqual(result.aiTaskResult.success, true);
    assert.strictEqual(result.aiTaskResult.decisionType, 'PAYMENT_REQUESTED');

    // Intent parameters
    assert.ok(result.aiTaskResult.proposedIntent);
    assert.strictEqual(result.aiTaskResult.proposedIntent.destination, 'merchant.vault-parent.testnet');
    assert.strictEqual(result.aiTaskResult.proposedIntent.amountNear, '0.05');

    // Payment runtime outcome
    const pr = result.aiTaskResult.paymentResult;
    assert.ok(pr);
    assert.strictEqual(pr.status, 'DRY_RUN_SUCCESS');
    assert.strictEqual(pr.preflight.success, true);
    assert.strictEqual(pr.preflight.predictedRouting, 'AUTO_DISPATCH');

    // Payload verification
    assert.ok(pr.preview);
    assert.strictEqual(pr.preview.receiverId, 'contract.vault-parent.testnet');
    assert.strictEqual(pr.preview.methodName, 'request_payment');
    assert.strictEqual(pr.preview.deposit, '0');
    assert.strictEqual(pr.txHash, undefined, 'Dry-run must not produce live transaction hash');
  } finally {
    cleanupFiles(ledgerFile, lockFile);
  }
});

// -----------------------------------------------------------------------------
// Test 2: Scenario B - Human Approval Path (Pending Queue)
// -----------------------------------------------------------------------------
test('Day 2 Scenario B: Payment requiring owner approval is held in pending queue', async () => {
  const { harness, ledgerFile, lockFile } = createHarnessForTesting();

  try {
    const result = await harness.runScenario('approval', { silent: true });

    assert.strictEqual(result.scenarioId, 'approval');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.actualRouting, 'PENDING_APPROVAL');
    assert.strictEqual(result.aiTaskResult.success, true);

    // Intent parameters
    assert.ok(result.aiTaskResult.proposedIntent);
    assert.strictEqual(result.aiTaskResult.proposedIntent.destination, 'oracle.vault-parent.testnet');
    assert.strictEqual(result.aiTaskResult.proposedIntent.amountNear, '0.15');

    // Preflight routing checks
    const pr = result.aiTaskResult.paymentResult;
    assert.ok(pr);
    assert.strictEqual(pr.preflight.success, true);
    assert.strictEqual(pr.preflight.predictedRouting, 'PENDING_APPROVAL');
    assert.strictEqual(pr.preflight.predictedReason, 'NewDestinationOnly');

    // Dry-run preview exists, but reports pending queue routing
    assert.ok(pr.preview);
    assert.strictEqual(pr.preview.deposit, '0');
    assert.strictEqual(pr.txHash, undefined);
  } finally {
    cleanupFiles(ledgerFile, lockFile);
  }
});

// -----------------------------------------------------------------------------
// Test 3: Scenario C - Prompt Injection & Policy Defense
// -----------------------------------------------------------------------------
test('Day 2 Scenario C: Malicious or excessive payment request is blocked by contract policy', async () => {
  const { harness, ledgerFile, lockFile } = createHarnessForTesting();

  try {
    const result = await harness.runScenario('injection', { silent: true });

    assert.strictEqual(result.scenarioId, 'injection');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.actualRouting, 'DENIED');

    // AI proposed the transfer, but runtime rejected it
    assert.ok(result.aiTaskResult.proposedIntent);
    assert.strictEqual(result.aiTaskResult.proposedIntent.destination, 'attacker.testnet');
    assert.strictEqual(result.aiTaskResult.proposedIntent.amountNear, '50');

    // Preflight failure verification
    const pr = result.aiTaskResult.paymentResult;
    assert.ok(pr);
    assert.strictEqual(pr.status, 'LOCAL_PREFLIGHT_REJECTED');
    assert.strictEqual(pr.preflight.success, false);
    assert.strictEqual(pr.preflight.predictedRouting, 'DENIED');
    assert.strictEqual(pr.preflight.predictedReason, 'ExceedsPerTransactionCap');
    assert.ok(pr.error?.includes('exceeds maximum per-transaction policy cap'));

    // Zero transactions signed or previewed
    assert.strictEqual(pr.preview, undefined, 'Blocked intent must not generate signed payload preview');
    assert.strictEqual(pr.txHash, undefined);
  } finally {
    cleanupFiles(ledgerFile, lockFile);
  }
});

// -----------------------------------------------------------------------------
// Test 4: Complete Harness Suite (runAll)
// -----------------------------------------------------------------------------
test('Day 2 Demonstration Suite: runAll executes all 3 scenarios and returns allPassed: true', async () => {
  const { harness, ledgerFile, lockFile } = createHarnessForTesting();

  try {
    const report = await harness.runAll({ silent: true });

    assert.strictEqual(report.totalScenarios, 3);
    assert.strictEqual(report.passedScenarios, 3);
    assert.strictEqual(report.failedScenarios, 0);
    assert.strictEqual(report.allPassed, true);

    const routes = report.results.map(r => r.actualRouting);
    assert.deepStrictEqual(routes, ['AUTO_DISPATCH', 'PENDING_APPROVAL', 'DENIED']);
  } finally {
    cleanupFiles(ledgerFile, lockFile);
  }
});

// -----------------------------------------------------------------------------
// Test 5: Distinction between Policy Denial Reasons
// -----------------------------------------------------------------------------
test('Day 2 Security: System strictly distinguishes per-tx cap, daily cap, and authorization denials', async () => {
  const { harness, ledgerFile, lockFile } = createHarnessForTesting();

  try {
    // 1. Oversized single transaction (3.0 NEAR > 1.0 NEAR max_per_tx)
    const customProvider = new MockLLMProvider(() => ({
      type: 'tool_call',
      toolName: PAYMENT_TOOL_NAME,
      args: {
        destination: 'merchant.vault-parent.testnet',
        amountNear: '3.0',
        reason: 'Oversized single tx',
      },
    }));

    const res1 = await harness.runScenario('injection', { provider: customProvider, silent: true });
    assert.strictEqual(res1.aiTaskResult.paymentResult?.preflight.predictedReason, 'ExceedsPerTransactionCap');

    // 2. Unauthorized agent
    const unauthorizedProvider = new StandardPolicyFixtureViewProvider();
    unauthorizedProvider.authorized = false;
    const config = loadConfig({
      agentAccountId: 'agent-unauthorized.testnet',
      vaultContractId: 'contract.vault-parent.testnet',
      expectedPublicKey: EXPECTED_RESTRICTED_PUBLIC_KEY,
      ledgerPath: ledgerFile,
      lockfilePath: lockFile,
      phase1StrictBoundary: true,
    });
    const unauthAgent = new VaultAgent(config, unauthorizedProvider);
    const unauthHarness = new ScenarioHarness(unauthAgent);

    const res2 = await unauthHarness.runScenario('auto', { silent: true });
    assert.strictEqual(res2.aiTaskResult.paymentResult?.preflight.predictedReason, 'AgentNotAuthorized');
  } finally {
    cleanupFiles(ledgerFile, lockFile);
  }
});
