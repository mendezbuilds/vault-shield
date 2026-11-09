import { nearToYocto, yoctoToNear } from 'near-api-js';
import { AgentConfig, loadConfig, getSafeConfig } from './config.js';
import {
  PaymentIntent,
  PreflightResult,
  TransactionOutcomeStatus,
  ExecutionRecord,
  ReconciliationResult,
} from './types.js';
import {
  ContractViewProvider,
  NearRpcContractViewProvider,
  executePreflight,
} from './preflight.js';
import { AgentSigner, SignedPayloadPreview } from './signer.js';
import { ExecutionLedger, ProcessLock, generateIntentId } from './ledger.js';

export interface AgentStatusReport {
  agentAccountId: string;
  vaultContractId: string;
  networkId: string;
  expectedPublicKey: string;
  signerPublicKey: string | null;
  hasSigningKey: boolean;
  isAgentAuthorized: boolean;
  isVaultPaused: boolean;
  availableLiquidNear: string;
  dailyCapNear: string;
  dailySpentNear: string;
  dailyReservedNear: string;
  maxPerTxNear: string;
  autoApprovalThresholdNear: string;
  destinationAllowlist: string[];
  agentPendingCount: number;
  globalPendingCount: number;
}

export interface RequestPaymentResult {
  status: TransactionOutcomeStatus;
  intentId: string;
  txHash?: string;
  requestId?: number;
  preview?: SignedPayloadPreview;
  preflight: PreflightResult;
  message: string;
  error?: string;
}

/**
 * Converts a decimal NEAR string into exact yoctoNEAR string.
 */
export function parseNearToYocto(nearAmount: string): string {
  try {
    const trimmed = nearAmount.trim();
    return nearToYocto(trimmed as `${number}`).toString();
  } catch (err: any) {
    throw new Error(`Invalid NEAR amount "${nearAmount}": ${err?.message}`);
  }
}

/**
 * Converts a yoctoNEAR string into a human-readable NEAR string.
 */
export function formatYoctoToNear(yoctoAmount: string, decimals = 4): string {
  try {
    const val = yoctoToNear(BigInt(yoctoAmount));
    const num = parseFloat(val);
    return isNaN(num) ? '0' : num.toFixed(decimals);
  } catch {
    return '0';
  }
}

/**
 * Main coordinator for the Alpha Autonomous Agent Runtime.
 */
export class VaultAgent {
  private config: AgentConfig;
  private viewProvider: ContractViewProvider;
  private signer: AgentSigner;
  private ledger: ExecutionLedger;
  private lock: ProcessLock;

  constructor(
    customConfig?: Partial<AgentConfig>,
    customViewProvider?: ContractViewProvider,
    customSigner?: AgentSigner
  ) {
    this.config = loadConfig(customConfig);
    this.viewProvider =
      customViewProvider ||
      new NearRpcContractViewProvider(
        this.config.rpcUrl,
        this.config.fallbackRpcUrl,
        this.config.vaultContractId,
        this.config.rpcTimeoutMs
      );
    this.signer = customSigner || new AgentSigner(this.config);
    this.ledger = new ExecutionLedger(this.config.ledgerPath);
    this.lock = new ProcessLock(this.config.lockfilePath, this.config.lockTtlMs);
  }

  public getConfig(): ReturnType<typeof getSafeConfig> {
    return getSafeConfig(this.config);
  }

  /**
   * Retrieves full status of agent permissions, access key, and vault policy metrics.
   */
  public async getStatus(): Promise<AgentStatusReport> {
    const [
      isPaused,
      isAuthorized,
      policy,
      bucket,
      liquidYocto,
      agentPending,
      globalPending,
    ] = await Promise.all([
      this.viewProvider.isPaused(),
      this.viewProvider.isAgentAuthorized(this.config.agentAccountId),
      this.viewProvider.getPolicy(),
      this.viewProvider.getDailyBucket(),
      this.viewProvider.getAvailableLiquidBalance(),
      this.viewProvider.getAgentPendingCount(this.config.agentAccountId),
      this.viewProvider.getGlobalPendingCount(),
    ]);

    return {
      agentAccountId: this.config.agentAccountId,
      vaultContractId: this.config.vaultContractId,
      networkId: this.config.networkId,
      expectedPublicKey: this.config.expectedPublicKey,
      signerPublicKey: this.signer.getPublicKey(),
      hasSigningKey: this.signer.hasSigningCapability(),
      isAgentAuthorized: isAuthorized,
      isVaultPaused: isPaused || policy.is_paused,
      availableLiquidNear: formatYoctoToNear(liquidYocto),
      dailyCapNear: formatYoctoToNear(policy.daily_cap),
      dailySpentNear: formatYoctoToNear(bucket.spent || '0'),
      dailyReservedNear: formatYoctoToNear(bucket.reserved || '0'),
      maxPerTxNear: formatYoctoToNear(policy.max_per_transaction),
      autoApprovalThresholdNear: formatYoctoToNear(policy.auto_approval_threshold),
      destinationAllowlist: policy.destination_allowlist,
      agentPendingCount: agentPending,
      globalPendingCount: globalPending,
    };
  }

  /**
   * Runs an advisory pre-flight check without acquiring locks or initiating signing.
   */
  public async preflight(intent: PaymentIntent): Promise<PreflightResult> {
    return executePreflight(intent, this.config, this.viewProvider);
  }

  /**
   * Handles payment request execution lifecycle:
   * 1. Concurrency lock acquisition with stale-lock recovery
   * 2. Idempotency deduplication
   * 3. Advisory pre-flight simulation
   * 4. Dry-run payload preview OR live broadcast (gated by Phase 1 boundary)
   * 5. Two-stage transaction construction with hash persistence BEFORE broadcast
   * 6. Receipt inspection and status determination
   * 7. Lock release
   */
  public async requestPayment(
    intentInput: {
      destination: string;
      amountNear: string;
      reason: string;
      ttlSeconds?: number;
      intentId?: string;
    },
    options: { dryRun?: boolean } = {}
  ): Promise<RequestPaymentResult> {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : this.config.phase1StrictBoundary;
    const amountYocto = parseNearToYocto(intentInput.amountNear);
    const intentId = intentInput.intentId || generateIntentId();

    const intent: PaymentIntent = {
      intentId,
      destination: intentInput.destination.trim(),
      amountNear: intentInput.amountNear.trim(),
      amountYocto,
      reason: intentInput.reason.trim(),
      ttlSeconds: intentInput.ttlSeconds,
      createdAt: Date.now(),
    };

    // 1. Acquire single-instance process lock
    this.lock.acquire();

    try {
      // 2. Check for duplicate intent
      if (this.ledger.hasDuplicate(intent.intentId)) {
        return {
          status: 'LOCAL_PREFLIGHT_REJECTED',
          intentId: intent.intentId,
          preflight: {
            success: false,
            checks: [
              {
                check: 'Local Intent Idempotency',
                passed: false,
                detail: `Task with Intent ID "${intent.intentId}" has already been processed or is pending. Replay rejected locally.`,
              },
            ],
            predictedRouting: 'DENIED',
          },
          message: `Duplicate intent rejected locally (${intent.intentId}).`,
          error: 'Duplicate task intent detected in local execution ledger.',
        };
      }

      // Record intent initiation in ledger
      this.ledger.recordIntent(intent, 'TRANSACTION_BROADCAST_PENDING');

      // 3. Pre-flight simulation
      const preflightResult = await this.preflight(intent);

      if (!preflightResult.success) {
        this.ledger.updateRecord(intent.intentId, {
          status: 'LOCAL_PREFLIGHT_REJECTED',
          errorMessage: preflightResult.error,
        });

        return {
          status: 'LOCAL_PREFLIGHT_REJECTED',
          intentId: intent.intentId,
          preflight: preflightResult,
          message: `Pre-flight policy simulation rejected: ${preflightResult.error}`,
          error: preflightResult.error,
        };
      }

      // 4. Dry-Run / Phase 1 Boundary Enforcement
      if (isDryRun || this.config.phase1StrictBoundary) {
        const preview = this.signer.previewPayload(intent);

        this.ledger.updateRecord(intent.intentId, {
          status: 'DRY_RUN_SUCCESS',
          errorMessage: undefined,
        });

        return {
          status: 'DRY_RUN_SUCCESS',
          intentId: intent.intentId,
          preview,
          preflight: preflightResult,
          message:
            'Dry-run simulation completed successfully. Pre-flight passed, payload validated, and zero deposit verified. No live on-chain transaction was broadcast.',
        };
      }

      // 5. Live On-Chain Broadcast with SEC-01 Pre-Persistence (Phase 2 only)
      // Step A: Sign and derive transaction hash BEFORE broadcasting
      const { txHash, signedTransaction, preview } = await this.signer.createSignedPaymentTransaction(intent);

      // Step B: DURABLY PERSIST TRANSACTION HASH TO DISK BEFORE BROADCAST
      this.ledger.updateRecord(intent.intentId, {
        status: 'TRANSACTION_BROADCAST_PENDING',
        txHash,
      });

      // Step C: Broadcast exact signed transaction with timeout handling
      let rawOutcome: any;
      try {
        rawOutcome = await this.signer.broadcastSignedTransaction(signedTransaction);
      } catch (broadcastErr: any) {
        const errMsg = broadcastErr?.message || String(broadcastErr);
        this.ledger.updateRecord(intent.intentId, {
          status: 'UNKNOWN_UNRESOLVED',
          errorMessage: `Broadcast timeout / network error: ${errMsg}`,
        });

        return {
          status: 'UNKNOWN_UNRESOLVED',
          intentId: intent.intentId,
          txHash,
          preview,
          preflight: preflightResult,
          message: `Broadcast timed out or encountered network error (${errMsg}). Transaction hash (${txHash}) is safely persisted. Run "agent reconcile" to determine final on-chain outcome.`,
          error: errMsg,
        };
      }

      // Step D: Parse outcome from transaction receipts (SEC-02)
      const parsedOutcome = this.parseExecutionOutcome(rawOutcome);

      // Step E: If Dispatched, inspect contract request view to verify downstream transfer execution
      if (parsedOutcome.status === 'PAYMENT_DISPATCHED' && parsedOutcome.requestId !== undefined) {
        try {
          const reqView = await this.viewProvider.getRequest(parsedOutcome.requestId);
          if (reqView) {
            if (reqView.status === 'Executed') {
              parsedOutcome.status = 'PAYMENT_EXECUTED';
              parsedOutcome.message = `Payment auto-approved, dispatched, and confirmed executed on-chain (Request ID #${parsedOutcome.requestId}).`;
            } else if (reqView.status === 'Failed') {
              parsedOutcome.status = 'DOWNSTREAM_TRANSFER_FAILED';
              parsedOutcome.message = `Payment dispatched but downstream transfer failed on-chain (Request ID #${parsedOutcome.requestId}). Reservation refunded.`;
            }
            // If still InFlight, it remains PAYMENT_DISPATCHED (interim)
          }
        } catch {
          // If view query times out, keep interim PAYMENT_DISPATCHED state
        }
      }

      // Step F: Persist final confirmed status in ledger
      this.ledger.updateRecord(intent.intentId, {
        status: parsedOutcome.status,
        requestId: parsedOutcome.requestId,
        originReason: parsedOutcome.originReason,
        policyDenialReason: parsedOutcome.policyDenialReason,
        errorMessage: parsedOutcome.errorMessage,
      });

      return {
        status: parsedOutcome.status,
        intentId: intent.intentId,
        txHash,
        requestId: parsedOutcome.requestId,
        preview,
        preflight: preflightResult,
        message: parsedOutcome.message,
        error: parsedOutcome.errorMessage,
      };
    } finally {
      // Always release process lock
      this.lock.release();
    }
  }

  /**
   * Reconciles ambiguous or in-flight transaction records against NEAR RPC.
   * NEVER blindly rebuilds or rebroadcasts transactions.
   */
  public async reconcilePending(targetIntentId?: string): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];
    const records = targetIntentId
      ? [this.ledger.getRecord(targetIntentId)].filter(Boolean) as ExecutionRecord[]
      : this.ledger.getPendingReconciliations();

    for (const record of records) {
      const prevStatus = record.status;

      // 1. If requestId is known (e.g. was PAYMENT_DISPATCHED interim state)
      if (record.requestId !== undefined) {
        try {
          const reqView = await this.viewProvider.getRequest(record.requestId);
          if (reqView) {
            if (reqView.status === 'Executed') {
              this.ledger.updateRecord(record.intentId, { status: 'PAYMENT_EXECUTED' });
              results.push({
                intentId: record.intentId,
                txHash: record.txHash,
                previousStatus: prevStatus,
                newStatus: 'PAYMENT_EXECUTED',
                requestId: record.requestId,
                message: `Downstream transfer confirmed executed on-chain (Request ID #${record.requestId}).`,
                updated: true,
              });
              continue;
            } else if (reqView.status === 'Failed') {
              this.ledger.updateRecord(record.intentId, { status: 'DOWNSTREAM_TRANSFER_FAILED' });
              results.push({
                intentId: record.intentId,
                txHash: record.txHash,
                previousStatus: prevStatus,
                newStatus: 'DOWNSTREAM_TRANSFER_FAILED',
                requestId: record.requestId,
                message: `Downstream transfer confirmed failed on-chain (Request ID #${record.requestId}). Reservation refunded.`,
                updated: true,
              });
              continue;
            } else if (reqView.status === 'Pending') {
              this.ledger.updateRecord(record.intentId, { status: 'PENDING_OWNER_APPROVAL' });
              results.push({
                intentId: record.intentId,
                txHash: record.txHash,
                previousStatus: prevStatus,
                newStatus: 'PENDING_OWNER_APPROVAL',
                requestId: record.requestId,
                message: `Request is in pending queue awaiting owner approval (Request ID #${record.requestId}).`,
                updated: true,
              });
              continue;
            } else if (reqView.status === 'InFlight') {
              results.push({
                intentId: record.intentId,
                txHash: record.txHash,
                previousStatus: prevStatus,
                newStatus: 'PAYMENT_DISPATCHED',
                requestId: record.requestId,
                message: `Request is still InFlight on-chain awaiting transfer completion.`,
                updated: false,
              });
              continue;
            }
          }
        } catch (err: any) {
          results.push({
            intentId: record.intentId,
            txHash: record.txHash,
            previousStatus: prevStatus,
            newStatus: prevStatus,
            requestId: record.requestId,
            message: `Contract view query failed (${err.message}). State remains unresolved.`,
            updated: false,
          });
          continue;
        }
      }

      // 2. If txHash is known, query on-chain transaction outcome via RPC
      if (record.txHash && this.viewProvider.getTransactionStatus) {
        try {
          const txOutcome = await this.viewProvider.getTransactionStatus(record.txHash, this.config.agentAccountId);
          if (!txOutcome) {
            results.push({
              intentId: record.intentId,
              txHash: record.txHash,
              previousStatus: prevStatus,
              newStatus: prevStatus,
              message: `Transaction hash (${record.txHash}) not yet indexed by RPC endpoint. Do not rebroadcast; re-check in a few blocks.`,
              updated: false,
            });
            continue;
          }

          const parsed = this.parseExecutionOutcome(txOutcome);
          let finalStatus = parsed.status;
          let reqId = parsed.requestId;

          // If dispatched, check downstream request view
          if (finalStatus === 'PAYMENT_DISPATCHED' && reqId !== undefined) {
            const reqView = await this.viewProvider.getRequest(reqId);
            if (reqView?.status === 'Executed') finalStatus = 'PAYMENT_EXECUTED';
            else if (reqView?.status === 'Failed') finalStatus = 'DOWNSTREAM_TRANSFER_FAILED';
          }

          this.ledger.updateRecord(record.intentId, {
            status: finalStatus,
            requestId: reqId,
            originReason: parsed.originReason,
            policyDenialReason: parsed.policyDenialReason,
            errorMessage: parsed.errorMessage,
          });

          results.push({
            intentId: record.intentId,
            txHash: record.txHash,
            previousStatus: prevStatus,
            newStatus: finalStatus,
            requestId: reqId,
            message: `Transaction reconciled successfully: ${parsed.message}`,
            updated: true,
          });
          continue;
        } catch (err: any) {
          results.push({
            intentId: record.intentId,
            txHash: record.txHash,
            previousStatus: prevStatus,
            newStatus: prevStatus,
            message: `Error querying transaction status: ${err.message}. State remains unresolved.`,
            updated: false,
          });
          continue;
        }
      }

      // 3. No txHash was recorded before crash
      results.push({
        intentId: record.intentId,
        previousStatus: prevStatus,
        newStatus: prevStatus,
        message: `Cannot reconcile: transaction hash was not recorded before termination. Never rebroadcasting automatically.`,
        updated: false,
      });
    }

    return results;
  }

  /**
   * Distinguishes exact contract return values and execution receipts.
   * Correctly maps Dispatched to an interim state rather than premature execution.
   */
  public parseExecutionOutcome(rawOutcome: any): {
    status: TransactionOutcomeStatus;
    requestId?: number;
    originReason?: any;
    policyDenialReason?: any;
    message: string;
    errorMessage?: string;
  } {
    try {
      const statusObj = rawOutcome?.status;
      if (statusObj && 'Failure' in statusObj) {
        return {
          status: 'UNKNOWN_UNRESOLVED',
          message: 'Transaction failed at blockchain execution level.',
          errorMessage: JSON.stringify(statusObj.Failure),
        };
      }

      // Extract success value
      let successValue: any = null;
      if (statusObj && typeof statusObj.SuccessValue === 'string') {
        const rawJson = Buffer.from(statusObj.SuccessValue, 'base64').toString('utf8');
        try {
          successValue = JSON.parse(rawJson);
        } catch {
          successValue = rawJson;
        }
      }

      if (!successValue) {
        return {
          status: 'UNKNOWN_UNRESOLVED',
          message: 'Function call completed without parsed ExecutionResult.',
        };
      }

      // Check ExecutionResult variants: Dispatched | Pending | Denied
      if ('Dispatched' in successValue) {
        const reqId = successValue.Dispatched.request_id;
        return {
          status: 'PAYMENT_DISPATCHED',
          requestId: reqId,
          message: `Payment auto-approved and dispatched on-chain (Request ID #${reqId}). Awaiting downstream transfer confirmation.`,
        };
      }

      if ('Pending' in successValue) {
        const reqId = successValue.Pending.request_id;
        const originReason = successValue.Pending.origin_reason;
        return {
          status: 'PENDING_OWNER_APPROVAL',
          requestId: reqId,
          originReason,
          message: `Payment held in pending queue awaiting owner approval (Request ID #${reqId}, Reason: ${originReason}).`,
        };
      }

      if ('Denied' in successValue) {
        const denialReason = successValue.Denied.reason;
        return {
          status: 'CONTRACT_DENIED',
          policyDenialReason: denialReason,
          message: `Payment rejected on-chain by contract policy engine: ${denialReason}.`,
          errorMessage: `On-chain policy denial: ${denialReason}`,
        };
      }

      return {
        status: 'UNKNOWN_UNRESOLVED',
        message: 'Contract call succeeded with unclassified response.',
      };
    } catch (err: any) {
      return {
        status: 'UNKNOWN_UNRESOLVED',
        message: 'Unable to parse transaction outcome receipts.',
        errorMessage: err?.message,
      };
    }
  }

  public getLedger(): ExecutionLedger {
    return this.ledger;
  }

  public getViewProvider(): ContractViewProvider {
    return this.viewProvider;
  }
}
