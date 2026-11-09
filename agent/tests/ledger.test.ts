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

  ledger.recordIntent(intent, 'PAYMENT_EXECUTED');
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
    status: 'PAYMENT_EXECUTED',
  });

  // Reload ledger from disk in new instance
  const ledger2 = new ExecutionLedger(ledgerFile);
  const reloaded = ledger2.getRecord('intent_persisted');

  assert.ok(reloaded);
  assert.strictEqual(reloaded?.txHash, '37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54');
  assert.strictEqual(reloaded?.requestId, 42);
  assert.strictEqual(reloaded?.status, 'PAYMENT_EXECUTED');

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

test('ProcessLock: Recovers stale lock exceeding TTL', () => {
  const lockFile = path.resolve(tempDir, `stale_${Date.now()}.lock`);
  // Create an artificially stale lockfile (30 minutes old)
  const staleTimestamp = Date.now() - 30 * 60 * 1000;
  const staleData = {
    pid: process.pid,
    hostname: 'test-host',
    createdAt: new Date(staleTimestamp).toISOString(),
    timestamp: staleTimestamp,
    platform: process.platform,
    nodeVersion: process.version,
  };
  fs.writeFileSync(lockFile, JSON.stringify(staleData), 'utf-8');

  // A new process lock instance with default 15 min TTL should safely break the stale lock
  const lock = new ProcessLock(lockFile, 15 * 60 * 1000);
  lock.acquire();

  assert.ok(fs.existsSync(lockFile));
  const newContent = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
  assert.strictEqual(newContent.pid, process.pid);
  assert.ok(newContent.timestamp > staleData.timestamp);

  lock.release();
  assert.strictEqual(fs.existsSync(lockFile), false);
});

test('ProcessLock: Recovers orphaned lock from dead PID', () => {
  const lockFile = path.resolve(tempDir, `dead_pid_${Date.now()}.lock`);
  // Use a PID that does not exist (e.g. 99999999)
  const deadPidData = {
    pid: 99999999,
    hostname: 'test-host',
    createdAt: new Date().toISOString(),
    timestamp: Date.now() - 1000,
    platform: process.platform,
    nodeVersion: process.version,
  };
  fs.writeFileSync(lockFile, JSON.stringify(deadPidData), 'utf-8');

  const lock = new ProcessLock(lockFile);
  lock.acquire();

  assert.ok(fs.existsSync(lockFile));
  const content = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
  assert.strictEqual(content.pid, process.pid);

  lock.release();
  assert.strictEqual(fs.existsSync(lockFile), false);
});

test('Ledger: Treats UNKNOWN_UNRESOLVED as active duplicate and surfaces in getPendingReconciliations', () => {
  const ledgerFile = path.resolve(tempDir, `pending_ledger_${Date.now()}.json`);
  const ledger = new ExecutionLedger(ledgerFile);

  const intent: PaymentIntent = {
    intentId: 'intent_unresolved_1',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'Timeout test',
    createdAt: Date.now(),
  };

  ledger.recordIntent(intent, 'UNKNOWN_UNRESOLVED', 'tx_hash_timeout_123');
  assert.strictEqual(ledger.hasDuplicate('intent_unresolved_1'), true);

  const pending = ledger.getPendingReconciliations();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].intentId, 'intent_unresolved_1');
  assert.strictEqual(pending[0].status, 'UNKNOWN_UNRESOLVED');
  assert.strictEqual(pending[0].txHash, 'tx_hash_timeout_123');

  if (fs.existsSync(ledgerFile)) fs.unlinkSync(ledgerFile);
});

test('Ledger: reload() safely preserves records and ignores interrupted .tmp writes', () => {
  const ledgerFile = path.resolve(tempDir, `ledger_tmp_interrupted_${Date.now()}.json`);
  const ledger = new ExecutionLedger(ledgerFile);

  const intent: PaymentIntent = {
    intentId: 'intent_persisted_safely',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.2',
    amountYocto: '200000000000000000000000',
    reason: 'Interruption test',
    createdAt: Date.now(),
  };

  ledger.recordIntent(intent, 'TRANSACTION_BROADCAST_PENDING', 'tx_hash_safe');

  // Simulate process interrupted mid-write leaving a partial .tmp file
  const tmpFile = `${ledgerFile}.tmp`;
  fs.writeFileSync(tmpFile, '{"incomplete_json": [', 'utf8');

  // Reload should safely read the main intact ledger file
  ledger.reload();
  const record = ledger.getRecord('intent_persisted_safely');
  assert.ok(record);
  assert.strictEqual(record?.status, 'TRANSACTION_BROADCAST_PENDING');
  assert.strictEqual(record?.txHash, 'tx_hash_safe');

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  if (fs.existsSync(ledgerFile)) fs.unlinkSync(ledgerFile);
});

test('Ledger: reload() preserves backup and recovers from corrupted ledger file', () => {
  const ledgerFile = path.resolve(tempDir, `ledger_corrupted_${Date.now()}.json`);
  const ledger = new ExecutionLedger(ledgerFile);

  // Write invalid corrupted syntax directly to main ledger file
  fs.writeFileSync(ledgerFile, 'MALFORMED_NON_JSON_CORRUPTED_BYTES{{{', 'utf8');

  // Reload should catch corruption, move file to backup, and reset records without crashing
  ledger.reload();
  assert.strictEqual(ledger.getAllRecords().length, 0);

  // Verify a .bak backup file was created
  const files = fs.readdirSync(tempDir);
  const backupFound = files.some(f => f.startsWith(path.basename(ledgerFile)) && f.includes('.bak.'));
  assert.strictEqual(backupFound, true);

  // Clean up
  for (const f of files) {
    if (f.startsWith(path.basename(ledgerFile))) {
      try {
        fs.unlinkSync(path.resolve(tempDir, f));
      } catch {}
    }
  }
});

test('Ledger: Treats REQUEST_REJECTED and REQUEST_EXPIRED as active duplicates and removes from pending reconciliations', () => {
  const ledgerFile = path.resolve(tempDir, `ledger_terminal_dedup_${Date.now()}.json`);
  const ledger = new ExecutionLedger(ledgerFile);

  const intent1: PaymentIntent = {
    intentId: 'intent_terminal_rejected',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'Rejected dedup',
    createdAt: Date.now(),
  };

  const intent2: PaymentIntent = {
    intentId: 'intent_terminal_expired',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'Expired dedup',
    createdAt: Date.now(),
  };

  ledger.recordIntent(intent1, 'REQUEST_REJECTED');
  ledger.recordIntent(intent2, 'REQUEST_EXPIRED');

  // Both terminal states must prevent duplicate replay of the same intent ID
  assert.strictEqual(ledger.hasDuplicate('intent_terminal_rejected'), true);
  assert.strictEqual(ledger.hasDuplicate('intent_terminal_expired'), true);

  // Neither should be present in pending reconciliations
  const pending = ledger.getPendingReconciliations();
  assert.strictEqual(pending.some(r => r.intentId === 'intent_terminal_rejected'), false);
  assert.strictEqual(pending.some(r => r.intentId === 'intent_terminal_expired'), false);

  if (fs.existsSync(ledgerFile)) fs.unlinkSync(ledgerFile);
});
