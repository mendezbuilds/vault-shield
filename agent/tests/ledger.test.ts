import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { ExecutionLedger, ProcessLock, generateIntentId } from '../dist/ledger.js';
import type { PaymentIntent } from '../dist/types.js';

const tempDir = path.resolve(process.cwd(), 'tests', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

test('Ledger: generateIntentId generates unique identifiers', () => {
  const id1 = generateIntentId('test');
  const id2 = generateIntentId('test');
  assert.notStrictEqual(id1, id2);
  assert.ok(id1.startsWith('test_'));
});

test('Ledger: Detects and rejects duplicate intents', () => {
  const ledgerFile = path.resolve(tempDir, `ledger_${Date.now()}.json`);
  const ledger = new ExecutionLedger(ledgerFile);

  const intent: PaymentIntent = {
    intentId: 'intent_unique_1',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'First run',
    createdAt: Date.now(),
  };

  assert.strictEqual(ledger.hasDuplicate(intent.intentId), false);

  ledger.recordIntent(intent, 'PAYMENT_DISPATCHED_AND_EXECUTED');
  assert.strictEqual(ledger.hasDuplicate(intent.intentId), true);

  // A different intent is not considered duplicate
  assert.strictEqual(ledger.hasDuplicate('intent_unique_2'), false);

  // Clean up
  if (fs.existsSync(ledgerFile)) fs.unlinkSync(ledgerFile);
});

test('Ledger: Persists records to disk and reloads cleanly', () => {
  const ledgerFile = path.resolve(tempDir, `ledger_reload_${Date.now()}.json`);
  const ledger1 = new ExecutionLedger(ledgerFile);

  const intent: PaymentIntent = {
    intentId: 'intent_persisted',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.2',
    amountYocto: '200000000000000000000000',
    reason: 'Persistence test',
    createdAt: Date.now(),
  };

  ledger1.recordIntent(intent, 'TRANSACTION_BROADCAST_PENDING');
  ledger1.updateRecord(intent.intentId, {
    txHash: '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54',
    requestId: 42,
    status: 'PAYMENT_DISPATCHED_AND_EXECUTED',
  });

  // Reload ledger from disk in new instance
  const ledger2 = new ExecutionLedger(ledgerFile);
  const reloaded = ledger2.getRecord('intent_persisted');

  assert.ok(reloaded);
  assert.strictEqual(reloaded?.txHash, '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54');
  assert.strictEqual(reloaded?.requestId, 42);
  assert.strictEqual(reloaded?.status, 'PAYMENT_DISPATCHED_AND_EXECUTED');

  // Clean up
  if (fs.existsSync(ledgerFile)) fs.unlinkSync(ledgerFile);
});

test('ProcessLock: Acquires lock, prevents concurrent lock, and releases cleanly', () => {
  const lockFile = path.resolve(tempDir, `test_${Date.now()}.lock`);
  const lock1 = new ProcessLock(lockFile);
  const lock2 = new ProcessLock(lockFile);

  lock1.acquire();
  assert.ok(fs.existsSync(lockFile));

  // Second acquisition attempt should fail with lock collision
  assert.throws(
    () => {
      lock2.acquire();
    },
    /Concurrency Lock Collision/
  );

  lock1.release();
  assert.strictEqual(fs.existsSync(lockFile), false);

  // Now lock2 can acquire successfully
  lock2.acquire();
  assert.ok(fs.existsSync(lockFile));
  lock2.release();
  assert.strictEqual(fs.existsSync(lockFile), false);
});
