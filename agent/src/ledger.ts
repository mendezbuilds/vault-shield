import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { ExecutionRecord, PaymentIntent, TransactionOutcomeStatus } from './types.js';
import { DEFAULT_LOCK_TTL_MS } from './config.js';

export interface LockMetadata {
  pid: number;
  createdAt: string;
  timestamp: number;
  hostname: string;
  platform: string;
  nodeVersion: string;
}

/**
 * Process-level concurrency lock using an atomic filesystem flag.
 * Prevents multiple local agent runtime instances from stepping on nonces.
 * Supports robust stale-lock recovery with process liveness and Lock TTL checks.
 */
export class ProcessLock {
  private isLocked = false;
  private fd: number | null = null;
  private exitHandler: (() => void) | null = null;

  constructor(
    private lockfilePath: string,
    private lockTtlMs: number = DEFAULT_LOCK_TTL_MS
  ) {}

  public acquire(): void {
    try {
      const lockDir = path.dirname(this.lockfilePath);
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }
    } catch {}

    // Check for existing lock and evaluate staleness
    if (fs.existsSync(this.lockfilePath)) {
      try {
        const content = fs.readFileSync(this.lockfilePath, 'utf8');
        const lockInfo: LockMetadata = JSON.parse(content);
        const pid = lockInfo.pid;
        const now = Date.now();
        const lockAgeMs = now - (lockInfo.timestamp || new Date(lockInfo.createdAt).getTime());

        // 1. Check if PID is still alive
        let processAlive = false;
        try {
          process.kill(pid, 0);
          processAlive = true;
        } catch {
          processAlive = false;
        }

        // 2. Safe stale-lock recovery logic
        if (!processAlive) {
          // Process is definitively terminated: recover stale lock
          fs.unlinkSync(this.lockfilePath);
        } else if (lockAgeMs > this.lockTtlMs) {
          // Lock exceeded TTL window: on Windows, PIDs can be recycled after reboot.
          // If lock is older than TTL and on same host, reclaim to avoid indefinite deadlock.
          console.warn(
            `\x1b[33m⚠️  STALE LOCK RECOVERY: Lockfile owned by PID ${pid} exceeded TTL (${Math.round(lockAgeMs / 1000)}s > ${Math.round(this.lockTtlMs / 1000)}s). Reclaiming lock.\x1b[0m`
          );
          fs.unlinkSync(this.lockfilePath);
        } else {
          // Process is alive and within TTL window
          throw new Error(
            `Concurrency Lock Collision: Agent runtime already running under PID ${pid} (locked ${Math.round(lockAgeMs / 1000)}s ago on ${lockInfo.hostname}). Nonce collisions prevented.`
          );
        }
      } catch (err: any) {
        if (err.message.includes('Concurrency Lock Collision')) {
          throw err;
        }
        // If file read/parse failed (corrupted lockfile), reclaim
        try {
          fs.unlinkSync(this.lockfilePath);
        } catch {
          // ignore
        }
      }
    }

    try {
      this.fd = fs.openSync(this.lockfilePath, 'wx');
      const lockPayload: LockMetadata = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
      };
      fs.writeFileSync(this.fd, JSON.stringify(lockPayload, null, 2));
      this.isLocked = true;

      // Register process exit cleanup handlers
      this.exitHandler = () => this.release();
      process.once('exit', this.exitHandler);
    } catch (err: any) {
      throw new Error(`Failed to acquire agent process lock (${this.lockfilePath}): ${err.message}`);
    }
  }

  public release(): void {
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
      this.exitHandler = null;
    }

    if (this.isLocked && fs.existsSync(this.lockfilePath)) {
      try {
        // Verify we own the lock before unlinking
        const content = fs.readFileSync(this.lockfilePath, 'utf8');
        const lockInfo: LockMetadata = JSON.parse(content);
        if (lockInfo.pid === process.pid) {
          if (this.fd !== null) {
            fs.closeSync(this.fd);
            this.fd = null;
          }
          fs.unlinkSync(this.lockfilePath);
          this.isLocked = false;
        }
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
    try {
      const dir = path.dirname(this.ledgerPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {}

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
    const tempPath = `${this.ledgerPath}.${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');

    try {
      fs.renameSync(tempPath, this.ledgerPath);
    } catch {
      // Windows filesystem atomic rename fallback
      try {
        if (fs.existsSync(this.ledgerPath)) {
          fs.unlinkSync(this.ledgerPath);
        }
        fs.renameSync(tempPath, this.ledgerPath);
      } catch {
        fs.copyFileSync(tempPath, this.ledgerPath);
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore
        }
      }
    }
  }

  public getRecord(intentId: string): ExecutionRecord | null {
    return this.records.get(intentId) || null;
  }

  public getAllRecords(): ExecutionRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Clears in-memory cache and reloads records directly from disk.
   */
  public reload(): void {
    this.records.clear();
    this.load();
  }

  /**
   * Checks whether a task with this intent ID has already been executed or is actively processing.
   */
  public hasDuplicate(intentId: string): boolean {
    const record = this.records.get(intentId);
    if (!record) return false;

    // These states represent active, completed, or ambiguous tasks that must not be blindly re-run
    const activeOrConfirmedStates: TransactionOutcomeStatus[] = [
      'TRANSACTION_BROADCAST_PENDING',
      'PAYMENT_DISPATCHED',
      'PENDING_OWNER_APPROVAL',
      'PAYMENT_EXECUTED',
      'DRY_RUN_SUCCESS',
      'UNKNOWN_UNRESOLVED',
      'REQUEST_REJECTED',
      'REQUEST_EXPIRED',
    ];

    return activeOrConfirmedStates.includes(record.status);
  }

  /**
   * Initializes or updates an intent record before or during execution.
   */
  public recordIntent(
    intent: PaymentIntent,
    initialStatus: TransactionOutcomeStatus,
    txHash?: string
  ): ExecutionRecord {
    const record: ExecutionRecord = {
      intentId: intent.intentId,
      status: initialStatus,
      destination: intent.destination,
      amountNear: intent.amountNear,
      amountYocto: intent.amountYocto,
      reason: intent.reason,
      timestamp: intent.createdAt || Date.now(),
      txHash,
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
      'PAYMENT_DISPATCHED', // In-flight promises awaiting downstream callback confirmation
      'PENDING_OWNER_APPROVAL', // Requests awaiting owner approval, rejection, or expiry
    ];
    return Array.from(this.records.values()).filter(r => pendingStates.includes(r.status));
  }
}
