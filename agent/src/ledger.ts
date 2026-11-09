import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExecutionRecord, PaymentIntent, TransactionOutcomeStatus } from './types.js';

/**
 * Process-level concurrency lock using an atomic filesystem flag.
 * Prevents multiple local agent runtime instances from stepping on nonces.
 */
export class ProcessLock {
  private isLocked = false;
  private fd: number | null = null;

  constructor(private lockfilePath: string) {}

  public acquire(): void {
    const lockDir = path.dirname(this.lockfilePath);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    // Check for stale lock
    if (fs.existsSync(this.lockfilePath)) {
      try {
        const content = fs.readFileSync(this.lockfilePath, 'utf8');
        const lockInfo = JSON.parse(content);
        const pid = lockInfo.pid;

        // Check if PID is still alive
        let processAlive = false;
        try {
          process.kill(pid, 0);
          processAlive = true;
        } catch {
          processAlive = false;
        }

        if (!processAlive) {
          // Stale lock detected, clean it up
          fs.unlinkSync(this.lockfilePath);
        } else {
          throw new Error(
            `Concurrency Lock Collision: Agent runtime already running under PID ${pid} (locked at ${lockInfo.createdAt}). Nonce collisions prevented.`
          );
        }
      } catch (err: any) {
        if (err.message.includes('Concurrency Lock Collision')) {
          throw err;
        }
        // If file read/parse failed, try unlinking
        try {
          fs.unlinkSync(this.lockfilePath);
        } catch {
          // ignore
        }
      }
    }

    try {
      this.fd = fs.openSync(this.lockfilePath, 'wx');
      const lockPayload = JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      });
      fs.writeFileSync(this.fd, lockPayload);
      this.isLocked = true;

      // Register process exit cleanup handlers
      process.on('exit', () => this.release());
    } catch (err: any) {
      throw new Error(`Failed to acquire agent process lock (${this.lockfilePath}): ${err.message}`);
    }
  }

  public release(): void {
    if (this.isLocked && fs.existsSync(this.lockfilePath)) {
      try {
        if (this.fd !== null) {
          fs.closeSync(this.fd);
          this.fd = null;
        }
        fs.unlinkSync(this.lockfilePath);
        this.isLocked = false;
      } catch {
        // File may have been removed or closed already
      }
    }
  }
}

/**
 * Generates a unique, high-entropy intent identifier.
 */
export function generateIntentId(prefix = 'intent'): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

/**
 * Persistent local execution ledger.
 *
 * NOTE ON SECURITY ARCHITECTURE:
 * Local intent IDs guarantee client-side idempotency and prevent duplicate task initiation within
 * the runtime. On-chain replay protection is separately and strictly enforced by NEAR access-key
 * monotonic nonces at the consensus layer.
 */
export class ExecutionLedger {
  private records: Map<string, ExecutionRecord> = new Map();

  constructor(private ledgerPath: string) {
    this.load();
  }

  private load(): void {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.ledgerPath)) {
      try {
        const raw = fs.readFileSync(this.ledgerPath, 'utf8');
        const data: ExecutionRecord[] = JSON.parse(raw);
        for (const item of data) {
          this.records.set(item.intentId, item);
        }
      } catch (err: any) {
        // If corrupted, preserve a backup rather than deleting
        const backupPath = `${this.ledgerPath}.bak.${Date.now()}`;
        fs.renameSync(this.ledgerPath, backupPath);
        this.records.clear();
      }
    }
  }

  private save(): void {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(this.records.values());
    const tempPath = `${this.ledgerPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, this.ledgerPath);
  }

  public getRecord(intentId: string): ExecutionRecord | null {
    return this.records.get(intentId) || null;
  }

  public getAllRecords(): ExecutionRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Checks whether a task with this intent ID has already been executed or is actively processing.
   */
  public hasDuplicate(intentId: string): boolean {
    const record = this.records.get(intentId);
    if (!record) return false;

    // These states represent active or successfully processed tasks
    const activeOrConfirmedStates: TransactionOutcomeStatus[] = [
      'TRANSACTION_BROADCAST_PENDING',
      'FUNCTION_CALL_EXECUTED',
      'PAYMENT_DISPATCHED_AND_EXECUTED',
      'PAYMENT_PENDING_APPROVAL',
      'DRY_RUN_SUCCESS',
    ];

    return activeOrConfirmedStates.includes(record.status);
  }

  /**
   * Initializes or updates an intent record before or during execution.
   */
  public recordIntent(intent: PaymentIntent, initialStatus: TransactionOutcomeStatus): ExecutionRecord {
    const record: ExecutionRecord = {
      intentId: intent.intentId,
      status: initialStatus,
      destination: intent.destination,
      amountNear: intent.amountNear,
      amountYocto: intent.amountYocto,
      reason: intent.reason,
      timestamp: intent.createdAt || Date.now(),
    };
    this.records.set(intent.intentId, record);
    this.save();
    return record;
  }

  /**
   * Updates an existing ledger record with verified outcome details.
   */
  public updateRecord(intentId: string, updates: Partial<ExecutionRecord>): ExecutionRecord {
    const existing = this.records.get(intentId);
    if (!existing) {
      throw new Error(`Cannot update non-existent ledger record for intent ID: ${intentId}`);
    }

    const updated: ExecutionRecord = {
      ...existing,
      ...updates,
      lastReconciledAt: Date.now(),
    };

    this.records.set(intentId, updated);
    this.save();
    return updated;
  }

  /**
   * Returns records that experienced ambiguous RPC outcomes and require reconciliation.
   */
  public getPendingReconciliations(): ExecutionRecord[] {
    const pendingStates: TransactionOutcomeStatus[] = [
      'TRANSACTION_BROADCAST_PENDING',
      'UNKNOWN_UNRESOLVED',
    ];
    return Array.from(this.records.values()).filter(r => pendingStates.includes(r.status));
  }
}
