import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { DEFAULT_LOCK_TTL_MS } from './config.js';
/**
 * Process-level concurrency lock using an atomic filesystem flag.
 * Prevents multiple local agent runtime instances from stepping on nonces.
 * Supports robust stale-lock recovery with process liveness and Lock TTL checks.
 */
export class ProcessLock {
    lockfilePath;
    lockTtlMs;
    isLocked = false;
    fd = null;
    exitHandler = null;
    constructor(lockfilePath, lockTtlMs = DEFAULT_LOCK_TTL_MS) {
        this.lockfilePath = lockfilePath;
        this.lockTtlMs = lockTtlMs;
    }
    acquire() {
        const lockDir = path.dirname(this.lockfilePath);
        if (!fs.existsSync(lockDir)) {
            fs.mkdirSync(lockDir, { recursive: true });
        }
        // Check for existing lock and evaluate staleness
        if (fs.existsSync(this.lockfilePath)) {
            try {
                const content = fs.readFileSync(this.lockfilePath, 'utf8');
                const lockInfo = JSON.parse(content);
                const pid = lockInfo.pid;
                const now = Date.now();
                const lockAgeMs = now - (lockInfo.timestamp || new Date(lockInfo.createdAt).getTime());
                // 1. Check if PID is still alive
                let processAlive = false;
                try {
                    process.kill(pid, 0);
                    processAlive = true;
                }
                catch {
                    processAlive = false;
                }
                // 2. Safe stale-lock recovery logic
                if (!processAlive) {
                    // Process is definitively terminated: recover stale lock
                    fs.unlinkSync(this.lockfilePath);
                }
                else if (lockAgeMs > this.lockTtlMs) {
                    // Lock exceeded TTL window: on Windows, PIDs can be recycled after reboot.
                    // If lock is older than TTL and on same host, reclaim to avoid indefinite deadlock.
                    console.warn(`\x1b[33m⚠️  STALE LOCK RECOVERY: Lockfile owned by PID ${pid} exceeded TTL (${Math.round(lockAgeMs / 1000)}s > ${Math.round(this.lockTtlMs / 1000)}s). Reclaiming lock.\x1b[0m`);
                    fs.unlinkSync(this.lockfilePath);
                }
                else {
                    // Process is alive and within TTL window
                    throw new Error(`Concurrency Lock Collision: Agent runtime already running under PID ${pid} (locked ${Math.round(lockAgeMs / 1000)}s ago on ${lockInfo.hostname}). Nonce collisions prevented.`);
                }
            }
            catch (err) {
                if (err.message.includes('Concurrency Lock Collision')) {
                    throw err;
                }
                // If file read/parse failed (corrupted lockfile), reclaim
                try {
                    fs.unlinkSync(this.lockfilePath);
                }
                catch {
                    // ignore
                }
            }
        }
        try {
            this.fd = fs.openSync(this.lockfilePath, 'wx');
            const lockPayload = {
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
        }
        catch (err) {
            throw new Error(`Failed to acquire agent process lock (${this.lockfilePath}): ${err.message}`);
        }
    }
    release() {
        if (this.exitHandler) {
            process.removeListener('exit', this.exitHandler);
            this.exitHandler = null;
        }
        if (this.isLocked && fs.existsSync(this.lockfilePath)) {
            try {
                // Verify we own the lock before unlinking
                const content = fs.readFileSync(this.lockfilePath, 'utf8');
                const lockInfo = JSON.parse(content);
                if (lockInfo.pid === process.pid) {
                    if (this.fd !== null) {
                        fs.closeSync(this.fd);
                        this.fd = null;
                    }
                    fs.unlinkSync(this.lockfilePath);
                    this.isLocked = false;
                }
            }
            catch {
                // File may have been removed or closed already
            }
        }
    }
}
/**
 * Generates a unique, high-entropy intent identifier.
 */
export function generateIntentId(prefix = 'intent') {
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
    ledgerPath;
    records = new Map();
    constructor(ledgerPath) {
        this.ledgerPath = ledgerPath;
        this.load();
    }
    load() {
        const dir = path.dirname(this.ledgerPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(this.ledgerPath)) {
            try {
                const raw = fs.readFileSync(this.ledgerPath, 'utf8');
                const data = JSON.parse(raw);
                for (const item of data) {
                    this.records.set(item.intentId, item);
                }
            }
            catch (err) {
                // If corrupted, preserve a backup rather than deleting
                const backupPath = `${this.ledgerPath}.bak.${Date.now()}`;
                fs.renameSync(this.ledgerPath, backupPath);
                this.records.clear();
            }
        }
    }
    save() {
        const dir = path.dirname(this.ledgerPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = Array.from(this.records.values());
        const tempPath = `${this.ledgerPath}.${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        try {
            fs.renameSync(tempPath, this.ledgerPath);
        }
        catch {
            // Windows filesystem atomic rename fallback
            try {
                if (fs.existsSync(this.ledgerPath)) {
                    fs.unlinkSync(this.ledgerPath);
                }
                fs.renameSync(tempPath, this.ledgerPath);
            }
            catch {
                fs.copyFileSync(tempPath, this.ledgerPath);
                try {
                    fs.unlinkSync(tempPath);
                }
                catch {
                    // ignore
                }
            }
        }
    }
    getRecord(intentId) {
        return this.records.get(intentId) || null;
    }
    getAllRecords() {
        return Array.from(this.records.values());
    }
    /**
     * Clears in-memory cache and reloads records directly from disk.
     */
    reload() {
        this.records.clear();
        this.load();
    }
    /**
     * Checks whether a task with this intent ID has already been executed or is actively processing.
     */
    hasDuplicate(intentId) {
        const record = this.records.get(intentId);
        if (!record)
            return false;
        // These states represent active, completed, or ambiguous tasks that must not be blindly re-run
        const activeOrConfirmedStates = [
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
    recordIntent(intent, initialStatus, txHash) {
        const record = {
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
    updateRecord(intentId, updates) {
        const existing = this.records.get(intentId);
        if (!existing) {
            throw new Error(`Cannot update non-existent ledger record for intent ID: ${intentId}`);
        }
        const updated = {
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
    getPendingReconciliations() {
        const pendingStates = [
            'TRANSACTION_BROADCAST_PENDING',
            'UNKNOWN_UNRESOLVED',
            'PAYMENT_DISPATCHED', // In-flight promises awaiting downstream callback confirmation
            'PENDING_OWNER_APPROVAL', // Requests awaiting owner approval, rejection, or expiry
        ];
        return Array.from(this.records.values()).filter(r => pendingStates.includes(r.status));
    }
}
//# sourceMappingURL=ledger.js.map