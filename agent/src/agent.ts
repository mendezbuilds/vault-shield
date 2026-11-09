import { nearToYocto, yoctoToNear } from 'near-api-js';
import { AgentConfig, loadConfig, getSafeConfig } from './config.js';
import {
  PaymentIntent,
  PreflightResult,
  TransactionOutcomeStatus,
  ExecutionRecord,
  RequestPaymentArgs,
  ExecutionResult,
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
    customViewProvider?: ContractViewProvider
  ) {
    this.config = loadConfig(customConfig);
    this.viewProvider =
      customViewProvider ||
      new NearRpcContractViewProvider(
        this.config.rpcUrl,
        this.config.fallbackRpcUrl,
        this.config.vaultContractId
      );
    this.signer = new AgentSigner(this.config);
    this.ledger = new ExecutionLedger(this.config.ledgerPath);
    this.lock = new ProcessLock(this.config.lockfilePath);
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
   * 1. Concurrency lock acquisition
   * 2. Idempotency deduplication
   * 3. Advisory pre-flight simulation
   * 4. Dry-run payload preview OR live broadcast (gated by Phase 1 boundary)
   * 5. Receipt inspection and status determination
   * 6. Lock release
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
                detail: `Task with Intent ID "${intent.intentId}" has already been processed. Replay rejected locally.`,
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

      // 5. Live On-Chain Broadcast (Phase 2 only)
      const broadcastRes = await this.signer.signAndSendPayment(intent);
      const txHash = broadcastRes.txHash;

      this.ledger.updateRecord(intent.intentId, {
        status: 'TRANSACTION_BROADCAST_PENDING',
        txHash,
      });

      // Parse outcome from transaction receipts
      const parsedOutcome = this.parseExecutionOutcome(broadcastRes.rawOutcome);

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
        preflight: preflightResult,
        message: parsedOutcome.message,
        error: parsedOutcome.errorMessage,
      };
    } finally {
      // 6. Always release process lock
      this.lock.release();
    }
  }

  /**
   * Distinguishes exact contract return values and execution receipts.
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
          status: 'FUNCTION_CALL_EXECUTED',
          message: 'Function call completed without parsed ExecutionResult.',
        };
      }

      // Check ExecutionResult variants: Dispatched | Pending | Denied
      if ('Dispatched' in successValue) {
        const reqId = successValue.Dispatched.request_id;
        return {
          status: 'PAYMENT_DISPATCHED_AND_EXECUTED',
          requestId: reqId,
          message: `Payment auto-approved and dispatched on-chain (Request ID #${reqId}).`,
        };
      }

      if ('Pending' in successValue) {
        const reqId = successValue.Pending.request_id;
        const originReason = successValue.Pending.origin_reason;
        return {
          status: 'PAYMENT_PENDING_APPROVAL',
          requestId: reqId,
          originReason,
          message: `Payment held in pending queue awaiting owner approval (Request ID #${reqId}, Reason: ${originReason}).`,
        };
      }

      if ('Denied' in successValue) {
        const denialReason = successValue.Denied.reason;
        return {
          status: 'POLICY_DENIED_ON_CHAIN',
          policyDenialReason: denialReason,
          message: `Payment rejected on-chain by contract policy engine: ${denialReason}.`,
          errorMessage: `On-chain policy denial: ${denialReason}`,
        };
      }

      return {
        status: 'FUNCTION_CALL_EXECUTED',
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
}
