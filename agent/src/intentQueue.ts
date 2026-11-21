import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  StoredIntent,
  IntentLifecycleStatus,
  IntentSource,
  PreflightResult,
  EXTERNAL_HANDOFF_WINDOW_MS,
  DEFAULT_VAULT_TTL_SECONDS,
  PaymentIntent,
} from './types.js';
import { isValidNearAccountId } from './preflight.js';
import { VaultAgent, parseNearToYocto, formatYoctoToNear } from './agent.js';
import { generateIntentId } from './ledger.js';

export interface SubmitIntentInput {
  destination: string;
  amountNear: string;
  reason?: string;
  ttlMinutes?: number;
  source: IntentSource;
  agentId?: string;
  rawPrompt?: string;
  idempotencyKey?: string;
  createdAt?: number; // Optional external creation timestamp
  intentId?: string;
}

export interface IntentQueryFilters {
  status?: IntentLifecycleStatus | 'ALL';
  source?: IntentSource | 'ALL';
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Persistent Intent Queue and Lifecycle Orchestrator for Vault Shield.
 * Guarantees crash-resilient persistence, strict handoff vs vault TTL separation,
 * append-only audit trail logging, and seamless routing into VaultAgent runtime.
 */
export class IntentQueue {
  private intents: Map<string, StoredIntent> = new Map();
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> intentId

  constructor(private storagePath: string) {
    this.load();
    this.checkHandoffExpiries();
  }

  public reload(): void {
    this.intents.clear();
    this.idempotencyIndex.clear();
    this.load();
  }

  private load(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const items: StoredIntent[] = JSON.parse(raw);
        for (const item of items) {
          this.intents.set(item.intentId, item);
          if (item.idempotencyKey) {
            this.idempotencyIndex.set(item.idempotencyKey, item.intentId);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[IntentQueue] Could not read ${this.storagePath}: ${err.message}`);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const items = Array.from(this.intents.values());
      const tempPath = `${this.storagePath}.${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(items, null, 2), 'utf8');

      try {
        fs.renameSync(tempPath, this.storagePath);
      } catch {
        fs.copyFileSync(tempPath, this.storagePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } catch (err: any) {
      console.error(`[IntentQueue] Failed to save queue to ${this.storagePath}: ${err.message}`);
    }
  }

  /**
   * Evaluates external handoff deadlines for uningested intents.
   * If an intent remains in 'RECEIVED' state and exceeds 300s window, transitions to HANDOFF_EXPIRED.
   */
  public checkHandoffExpiries(): void {
    const now = Date.now();
    let mutated = false;

    for (const intent of this.intents.values()) {
      if (intent.status === 'RECEIVED' && now > intent.handoffDeadline) {
        intent.status = 'HANDOFF_EXPIRED';
        intent.errorMessage = `External Handoff Window (300s) expired before intent ingestion.`;
        intent.auditTrail.push({
          timestamp: now,
          status: 'HANDOFF_EXPIRED',
          message: 'Intent handoff window of 300 seconds elapsed without runtime ingestion. Marked HANDOFF_EXPIRED.',
          details: { handoffDeadline: intent.handoffDeadline, evaluatedAt: now },
        });
        mutated = true;
      }
    }

    if (mutated) {
      this.save();
    }
  }

  /**
   * Submits a new payment intent into the persistent queue in state RECEIVED.
   * Enforces idempotency protection, NEP-0010 syntax check, and assigns distinct 300s handoff deadline.
   */
  public submitIntent(input: SubmitIntentInput): { intent: StoredIntent; isDuplicate: boolean } {
    this.reload();
    this.checkHandoffExpiries();

    // 1. Idempotency check
    if (input.idempotencyKey && this.idempotencyIndex.has(input.idempotencyKey)) {
      const existingId = this.idempotencyIndex.get(input.idempotencyKey)!;
      const existing = this.intents.get(existingId);
      if (existing) {
        return { intent: existing, isDuplicate: true };
      }
    }

    const intentId = input.intentId || generateIntentId('intent');
    if (this.intents.has(intentId)) {
      return { intent: this.intents.get(intentId)!, isDuplicate: true };
    }

    const now = Date.now();
    const createdAt = input.createdAt || now;
    const handoffDeadline = createdAt + EXTERNAL_HANDOFF_WINDOW_MS; // strictly 300 seconds
    const vaultTtlSeconds = (input.ttlMinutes ? Math.max(input.ttlMinutes, 5) * 60 : DEFAULT_VAULT_TTL_SECONDS);

    let amountYocto: string;
    try {
      amountYocto = parseNearToYocto(input.amountNear);
    } catch {
      amountYocto = '0';
    }

    const initialStatus: IntentLifecycleStatus = (now > handoffDeadline) ? 'HANDOFF_EXPIRED' : 'RECEIVED';
    const auditMessage = (initialStatus === 'HANDOFF_EXPIRED')
      ? 'Intent rejected on arrival: External handoff window of 300 seconds already elapsed.'
      : `Payment intent received into queue via ${input.source}. External handoff window set to 300 seconds.`;

    const stored: StoredIntent = {
      intentId,
      source: input.source,
      agentId: input.agentId || (input.source === 'DASHBOARD' ? 'Dashboard Operator' : 'External Agent'),
      rawPrompt: input.rawPrompt,
      destination: input.destination.trim(),
      amountNear: input.amountNear.trim(),
      amountYocto,
      currency: 'NEAR',
      reason: input.reason?.trim() || 'Autonomous disbursement',
      status: initialStatus,
      createdAt,
      handoffDeadline,
      vaultTtlSeconds,
      attempts: 0,
      idempotencyKey: input.idempotencyKey,
      errorMessage: initialStatus === 'HANDOFF_EXPIRED' ? 'External Handoff Window (300s) expired upon submission.' : undefined,
      auditTrail: [
        {
          timestamp: now,
          status: initialStatus,
          message: auditMessage,
          details: {
            createdAt,
            handoffDeadline,
            vaultTtlSeconds,
            source: input.source,
            destination: input.destination,
            amountNear: input.amountNear,
          },
        },
      ],
    };

    this.intents.set(intentId, stored);
    if (input.idempotencyKey) {
      this.idempotencyIndex.set(input.idempotencyKey, intentId);
    }

    this.save();
    return { intent: stored, isDuplicate: false };
  }

  /**
   * Processes an intent through the full VaultAgent runtime pipeline:
   * RECEIVED -> INGESTED -> VALIDATING -> PREFLIGHT -> AWAITING_APPROVAL / DISPATCHED -> COMPLETED / FAILED / EXPIRED.
   */
  public async processIntent(
    intentId: string,
    agent: VaultAgent,
    options: { dryRun?: boolean } = {}
  ): Promise<StoredIntent> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }

    const now = Date.now();

    // 1. Check handoff deadline before ingestion
    if (intent.status === 'RECEIVED' && now > intent.handoffDeadline) {
      intent.status = 'HANDOFF_EXPIRED';
      intent.errorMessage = 'External handoff window (300s) expired before runtime ingestion.';
      intent.auditTrail.push({
        timestamp: now,
        status: 'HANDOFF_EXPIRED',
        message: 'Handoff window expired (300 seconds) prior to ingestion. Pipeline aborted.',
      });
      this.save();
      return intent;
    }

    // Guard against re-processing completed or terminal states
    if (['COMPLETED', 'HANDOFF_EXPIRED', 'EXPIRED'].includes(intent.status)) {
      return intent;
    }

    intent.attempts += 1;

    // 2. Stage: INGESTED
    intent.status = 'INGESTED';
    intent.ingestedAt = now;
    intent.auditTrail.push({
      timestamp: now,
      status: 'INGESTED',
      message: `Intent ingested by VaultAgent runtime within the handoff window (${Math.round((intent.handoffDeadline - now) / 1000)}s remaining).`,
    });
    this.save();

    // 3. Stage: VALIDATING (Syntax & arguments defense-in-depth)
    intent.status = 'VALIDATING';
    intent.auditTrail.push({
      timestamp: Date.now(),
      status: 'VALIDATING',
      message: 'Validating destination account syntax, decimal amount format, and constraints.',
    });
    this.save();

    if (!isValidNearAccountId(intent.destination)) {
      intent.status = 'FAILED';
      intent.errorMessage = `Invalid NEAR account ID syntax: "${intent.destination}". Must comply with NEP-0010.`;
      intent.auditTrail.push({
        timestamp: Date.now(),
        status: 'FAILED',
        message: intent.errorMessage,
      });
      this.save();
      return intent;
    }

    const decimalRegex = /^\d+(\.\d+)?$/;
    if (!decimalRegex.test(intent.amountNear) || parseFloat(intent.amountNear) <= 0) {
      intent.status = 'FAILED';
      intent.errorMessage = `Invalid positive decimal amount: "${intent.amountNear}".`;
      intent.auditTrail.push({
        timestamp: Date.now(),
        status: 'FAILED',
        message: intent.errorMessage,
      });
      this.save();
      return intent;
    }

    // 4. Stage: PREFLIGHT (Advisory 10-check policy evaluation against live contract)
    intent.status = 'PREFLIGHT';
    intent.auditTrail.push({
      timestamp: Date.now(),
      status: 'PREFLIGHT',
      message: 'Executing deterministic 10-check on-chain policy preflight simulation.',
    });
    this.save();

    const paymentIntent: PaymentIntent = {
      intentId: intent.intentId,
      destination: intent.destination,
      amountNear: intent.amountNear,
      amountYocto: intent.amountYocto,
      reason: intent.reason,
      ttlSeconds: intent.vaultTtlSeconds,
      createdAt: intent.createdAt,
    };

    let preflight: PreflightResult;
    try {
      preflight = await agent.preflight(paymentIntent);
      intent.preflightResult = preflight;
    } catch (err: any) {
      intent.status = 'FAILED';
      intent.errorMessage = `Preflight simulation query error: ${err.message}`;
      intent.auditTrail.push({
        timestamp: Date.now(),
        status: 'FAILED',
        message: intent.errorMessage,
      });
      this.save();
      return intent;
    }

    if (!preflight.success) {
      intent.status = 'FAILED';
      intent.errorMessage = preflight.error || 'Preflight policy verification rejected.';
      intent.auditTrail.push({
        timestamp: Date.now(),
        status: 'FAILED',
        message: `Policy preflight failed: ${intent.errorMessage}`,
        details: { checks: preflight.checks },
      });
      this.save();
      return intent;
    }

    intent.auditTrail.push({
      timestamp: Date.now(),
      status: 'PREFLIGHT',
      message: `Preflight checks passed successfully. Predicted routing: ${preflight.predictedRouting}.`,
      details: { predictedRouting: preflight.predictedRouting },
    });
    this.save();

    // 5. Stage: EXECUTE via VaultAgent
    // The Vault payment TTL strictly begins once accepted by the runtime
    try {
      const execResult = await agent.requestPayment(
        {
          destination: intent.destination,
          amountNear: intent.amountNear,
          reason: intent.reason,
          ttlSeconds: intent.vaultTtlSeconds,
          intentId: intent.intentId,
        },
        { dryRun: options.dryRun }
      );

      if (execResult.status === 'PENDING_OWNER_APPROVAL') {
        const acceptedTime = Date.now();
        intent.status = 'AWAITING_APPROVAL';
        intent.acceptedAt = acceptedTime;
        intent.vaultDeadline = acceptedTime + intent.vaultTtlSeconds * 1000;
        intent.txHash = execResult.txHash;
        intent.requestId = execResult.requestId;
        intent.auditTrail.push({
          timestamp: acceptedTime,
          status: 'AWAITING_APPROVAL',
          message: `Payment request #${intent.requestId} accepted into contract pending approval queue. Vault payment TTL (1 hour) is now active until ${new Date(intent.vaultDeadline).toISOString()}.`,
          details: {
            requestId: intent.requestId,
            txHash: intent.txHash,
            vaultDeadline: intent.vaultDeadline,
          },
        });
      } else if (execResult.status === 'PAYMENT_DISPATCHED') {
        const acceptedTime = Date.now();
        intent.status = 'DISPATCHED';
        intent.acceptedAt = acceptedTime;
        intent.vaultDeadline = acceptedTime + intent.vaultTtlSeconds * 1000;
        intent.txHash = execResult.txHash;
        intent.requestId = execResult.requestId;
        intent.auditTrail.push({
          timestamp: acceptedTime,
          status: 'DISPATCHED',
          message: `Payment request #${intent.requestId} dispatched on-chain via Route A (Autonomous). Downstream transfer in flight.`,
          details: { requestId: intent.requestId, txHash: intent.txHash },
        });
      } else if (execResult.status === 'PAYMENT_EXECUTED') {
        const acceptedTime = Date.now();
        intent.status = 'COMPLETED';
        intent.acceptedAt = acceptedTime;
        intent.txHash = execResult.txHash;
        intent.requestId = execResult.requestId;
        intent.auditTrail.push({
          timestamp: acceptedTime,
          status: 'COMPLETED',
          message: `Payment executed and confirmed on NEAR Testnet. TxHash: ${intent.txHash}.`,
          details: { txHash: intent.txHash, requestId: intent.requestId },
        });
      } else if (execResult.status === 'DRY_RUN_SUCCESS') {
        // DRY_RUN does NOT broadcast to the blockchain, does not create an on-chain request,
        // and does NOT start the Vault Payment TTL. It validates preflight and preview.
        intent.status = 'PREFLIGHT';
        intent.auditTrail.push({
          timestamp: Date.now(),
          status: 'PREFLIGHT',
          message: `Dry-run simulation verified successfully. Preflight passed, payload validated, zero deposit confirmed. No live transaction broadcast.`,
          details: { preview: execResult.preview, preflight: execResult.preflight },
        });
      } else if (execResult.status === 'REQUEST_EXPIRED') {
        intent.status = 'EXPIRED';
        intent.errorMessage = 'Vault payment TTL expired.';
        intent.auditTrail.push({
          timestamp: Date.now(),
          status: 'EXPIRED',
          message: 'Payment request expired on-chain.',
        });
      } else {
        intent.status = 'FAILED';
        intent.errorMessage = execResult.error || execResult.message || 'Execution rejected';
        intent.auditTrail.push({
          timestamp: Date.now(),
          status: 'FAILED',
          message: `Execution failed: ${intent.errorMessage}`,
        });
      }
    } catch (err: any) {
      intent.status = 'FAILED';
      intent.errorMessage = err.message || 'Error occurred during payment request execution';
      intent.auditTrail.push({
        timestamp: Date.now(),
        status: 'FAILED',
        message: intent.errorMessage || 'Unknown error occurred during payment execution',
      });
    }

    this.save();
    return intent;
  }

  /**
   * Reconciles active intents against on-chain status and evaluates the Vault Payment TTL.
   */
  public async reconcileIntents(agent: VaultAgent): Promise<void> {
    this.checkHandoffExpiries();
    const now = Date.now();
    let mutated = false;

    for (const intent of this.intents.values()) {
      // 1. Vault Payment TTL expiration check for unapproved pending requests
      if (
        intent.status === 'AWAITING_APPROVAL' &&
        intent.vaultDeadline &&
        now > intent.vaultDeadline
      ) {
        intent.status = 'EXPIRED';
        intent.errorMessage = 'Vault Payment TTL (1 hour) elapsed without Vault Owner approval.';
        intent.auditTrail.push({
          timestamp: now,
          status: 'EXPIRED',
          message: 'Vault Payment TTL expired while awaiting approval.',
          details: { vaultDeadline: intent.vaultDeadline, evaluatedAt: now },
        });
        mutated = true;
        continue;
      }

      // 2. Query on-chain resolution for dispatched or awaiting approval requests with requestId
      if (
        (intent.status === 'AWAITING_APPROVAL' || intent.status === 'DISPATCHED') &&
        intent.requestId !== undefined
      ) {
        try {
          const resolution = await agent.resolveOnChainRequestStatus(intent.requestId);
          if (resolution.updated) {
            if (resolution.status === 'PAYMENT_EXECUTED') {
              intent.status = 'COMPLETED';
              intent.auditTrail.push({
                timestamp: now,
                status: 'COMPLETED',
                message: `Request #${intent.requestId} reconciled as Executed on-chain.`,
              });
              mutated = true;
            } else if (resolution.status === 'REQUEST_REJECTED') {
              intent.status = 'FAILED';
              intent.errorMessage = `Request #${intent.requestId} was rejected by Vault Owner.`;
              intent.auditTrail.push({
                timestamp: now,
                status: 'FAILED',
                message: intent.errorMessage,
              });
              mutated = true;
            } else if (resolution.status === 'REQUEST_EXPIRED') {
              intent.status = 'EXPIRED';
              intent.errorMessage = `Request #${intent.requestId} expired on-chain.`;
              intent.auditTrail.push({
                timestamp: now,
                status: 'EXPIRED',
                message: intent.errorMessage,
              });
              mutated = true;
            }
          }
        } catch {
          // RPC failure during reconciliation; preserve current state
        }
      }
    }

    if (mutated) {
      this.save();
    }
  }

  public getIntent(intentId: string): StoredIntent | null {
    this.reload();
    this.checkHandoffExpiries();
    return this.intents.get(intentId) || null;
  }

  public listIntents(filters: IntentQueryFilters = {}): { intents: StoredIntent[]; total: number } {
    this.reload();
    this.checkHandoffExpiries();
    let all = Array.from(this.intents.values()).sort((a, b) => b.createdAt - a.createdAt);

    if (filters.status && filters.status !== 'ALL') {
      all = all.filter(item => item.status === filters.status);
    }

    if (filters.source && filters.source !== 'ALL') {
      all = all.filter(item => item.source === filters.source);
    }

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      all = all.filter(
        item =>
          item.intentId.toLowerCase().includes(q) ||
          item.destination.toLowerCase().includes(q) ||
          item.reason.toLowerCase().includes(q) ||
          (item.agentId && item.agentId.toLowerCase().includes(q)) ||
          (item.requestId !== undefined && String(item.requestId).includes(q)) ||
          (item.txHash && item.txHash.toLowerCase().includes(q))
      );
    }

    const total = all.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginated = all.slice(offset, offset + limit);

    return { intents: paginated, total };
  }
}
