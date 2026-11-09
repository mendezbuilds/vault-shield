import {
  SpendingPolicyView,
  DailyBucketView,
  PreflightResult,
  PreflightCheckItem,
  MIN_TTL_NANOS,
  MAX_TTL_NANOS,
  DEFAULT_TTL_NANOS,
  MAX_GLOBAL_PENDING,
  MAX_AGENT_PENDING,
  PaymentIntent,
} from './types.js';
import { AgentConfig } from './config.js';

export interface ContractViewProvider {
  isPaused(): Promise<boolean>;
  isAgentAuthorized(agentId: string): Promise<boolean>;
  getPolicy(): Promise<SpendingPolicyView>;
  getDailyBucket(dayIndex?: number): Promise<DailyBucketView>;
  getAvailableLiquidBalance(): Promise<string>;
  getAgentPendingCount(agentId: string): Promise<number>;
  getGlobalPendingCount(): Promise<number>;
}

/**
 * Standard RPC-based contract view provider using JSON-RPC query:call_function.
 */
export class NearRpcContractViewProvider implements ContractViewProvider {
  constructor(
    private rpcUrl: string,
    private fallbackRpcUrl: string,
    private contractId: string
  ) {}

  private async callViewMethod<T>(methodName: string, args: Record<string, any> = {}): Promise<T> {
    const urls = [this.rpcUrl, this.fallbackRpcUrl];
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `view_${methodName}_${Date.now()}`,
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'optimistic',
              account_id: this.contractId,
              method_name: methodName,
              args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
            },
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        }

        const data: any = await res.json();
        if (data.error) {
          throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
        }

        if (!data.result || !data.result.result) {
          throw new Error(`Invalid view response format from ${url}`);
        }

        const rawBytes = Buffer.from(data.result.result);
        const parsed = JSON.parse(rawBytes.toString('utf8'));
        return parsed as T;
      } catch (err: any) {
        lastError = err;
        continue;
      }
    }

    throw new Error(`Failed to call view method ${methodName} across all RPCs: ${lastError?.message}`);
  }

  async isPaused(): Promise<boolean> {
    return this.callViewMethod<boolean>('is_paused');
  }

  async isAgentAuthorized(agentId: string): Promise<boolean> {
    return this.callViewMethod<boolean>('is_agent_authorized', { agent_id: agentId });
  }

  async getPolicy(): Promise<SpendingPolicyView> {
    return this.callViewMethod<SpendingPolicyView>('get_policy');
  }

  async getDailyBucket(dayIndex?: number): Promise<DailyBucketView> {
    return this.callViewMethod<DailyBucketView>('get_daily_bucket', dayIndex !== undefined ? { day_index: dayIndex } : {});
  }

  async getAvailableLiquidBalance(): Promise<string> {
    return this.callViewMethod<string>('get_available_liquid_balance');
  }

  async getAgentPendingCount(agentId: string): Promise<number> {
    return this.callViewMethod<number>('get_agent_pending_count', { agent_id: agentId });
  }

  async getGlobalPendingCount(): Promise<number> {
    return this.callViewMethod<number>('get_global_pending_count');
  }
}

/**
 * Validates NEAR account ID syntax according to NEP-0010.
 */
export function isValidNearAccountId(accountId: string): boolean {
  if (!accountId || accountId.length < 2 || accountId.length > 64) return false;
  // Regex: lowercase alphanumeric, hyphens, underscores, dots
  const nearAccountRegex = /^(([a-z0-9_-]+)\.)*[a-z0-9_-]+$/;
  return nearAccountRegex.test(accountId);
}

/**
 * Executes a comprehensive, read-only pre-flight advisory check against the live vault contract.
 * Fails closed if any invariant check fails or if RPC state cannot be retrieved.
 */
export async function executePreflight(
  intent: PaymentIntent,
  config: AgentConfig,
  viewProvider?: ContractViewProvider
): Promise<PreflightResult> {
  const checks: PreflightCheckItem[] = [];
  const provider = viewProvider || new NearRpcContractViewProvider(config.rpcUrl, config.fallbackRpcUrl, config.vaultContractId);

  // 1. Destination Syntax Check
  const validDest = isValidNearAccountId(intent.destination);
  checks.push({
    check: 'Valid Destination Account ID',
    passed: validDest,
    detail: validDest ? `Valid NEAR account syntax (${intent.destination})` : `Invalid NEAR account ID: "${intent.destination}"`,
  });

  if (!validDest) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      error: `Invalid destination account ID: ${intent.destination}`,
    };
  }

  // 2. Amount Validation Check
  let amountYoctoBn: bigint;
  try {
    amountYoctoBn = BigInt(intent.amountYocto);
    const positive = amountYoctoBn > 0n;
    checks.push({
      check: 'Positive Transfer Amount',
      passed: positive,
      detail: positive ? `${intent.amountNear} NEAR (${intent.amountYocto} yocto)` : 'Amount must be greater than zero',
    });
    if (!positive) {
      return {
        success: false,
        checks,
        predictedRouting: 'DENIED',
        error: 'Amount must be greater than zero yoctoNEAR',
      };
    }
  } catch (err: any) {
    checks.push({
      check: 'Amount Parse Validity',
      passed: false,
      detail: `Failed to parse yoctoNEAR amount: ${err?.message}`,
    });
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      error: `Failed to parse yoctoNEAR amount: ${err?.message}`,
    };
  }

  // 3. TTL Bounds Check
  const ttlNanos = intent.ttlSeconds ? intent.ttlSeconds * 1_000_000_000 : DEFAULT_TTL_NANOS;
  const ttlValid = ttlNanos >= MIN_TTL_NANOS && ttlNanos <= MAX_TTL_NANOS;
  checks.push({
    check: 'TTL Range Compliance',
    passed: ttlValid,
    detail: ttlValid
      ? `${ttlNanos / 1_000_000_000}s (within 300s - 86400s bounds)`
      : `TTL ${ttlNanos / 1_000_000_000}s out of bounds (min 300s, max 86400s)`,
  });

  if (!ttlValid) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'InvalidTtl',
      error: 'Requested TTL is outside contract permissible bounds (5 min - 24 hours)',
    };
  }

  // Retrieve on-chain contract state snapshots
  let isPaused: boolean;
  let isAuthorized: boolean;
  let policy: SpendingPolicyView;
  let bucket: DailyBucketView;
  let liquidBalanceYocto: string;
  let agentPendingCount: number;
  let globalPendingCount: number;

  try {
    const [pausedRes, authRes, policyRes, bucketRes, liquidRes, agentPendRes, globalPendRes] = await Promise.all([
      provider.isPaused(),
      provider.isAgentAuthorized(config.agentAccountId),
      provider.getPolicy(),
      provider.getDailyBucket(),
      provider.getAvailableLiquidBalance(),
      provider.getAgentPendingCount(config.agentAccountId),
      provider.getGlobalPendingCount(),
    ]);

    isPaused = pausedRes;
    isAuthorized = authRes;
    policy = policyRes;
    bucket = bucketRes;
    liquidBalanceYocto = liquidRes;
    agentPendingCount = agentPendRes;
    globalPendingCount = globalPendRes;
  } catch (err: any) {
    checks.push({
      check: 'On-Chain RPC State Retrieval',
      passed: false,
      detail: `Fail-closed: could not query contract state via RPC: ${err?.message}`,
    });
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      error: `Contract view query failed (fail-closed): ${err?.message}`,
    };
  }

  // 4. Agent Authorization Check
  checks.push({
    check: 'Agent Authorization Status',
    passed: isAuthorized,
    detail: isAuthorized
      ? `Agent ${config.agentAccountId} is actively registered in authorized_agents`
      : `Agent ${config.agentAccountId} is NOT authorized on contract ${config.vaultContractId}`,
  });
  if (!isAuthorized) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'AgentNotAuthorized',
      error: `Signer ${config.agentAccountId} is not an authorized agent in contract policy`,
    };
  }

  // 5. Vault Pause Check
  const notPaused = !isPaused && !policy.is_paused;
  checks.push({
    check: 'Vault Emergency Pause Status',
    passed: notPaused,
    detail: notPaused ? 'Vault is active (unpaused)' : 'Vault is currently PAUSED',
  });
  if (!notPaused) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'VaultPaused',
      error: 'Vault is paused by owner; all agent spending is halted',
    };
  }

  // 6. Per-Transaction Cap Check
  const maxPerTxBn = BigInt(policy.max_per_transaction);
  const underPerTxCap = amountYoctoBn <= maxPerTxBn;
  checks.push({
    check: 'Per-Transaction Cap Compliance',
    passed: underPerTxCap,
    detail: underPerTxCap
      ? `Amount <= Max Per Tx (${policy.max_per_transaction} yocto)`
      : `Amount exceeds Max Per Tx limit (${policy.max_per_transaction} yocto)`,
  });
  if (!underPerTxCap) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'ExceedsPerTransactionCap',
      error: `Amount exceeds maximum per-transaction policy cap (${policy.max_per_transaction} yoctoNEAR)`,
    };
  }

  // 7. Daily Cap & Bucket Spend Check
  const dailyCapBn = BigInt(policy.daily_cap);
  const spentBn = BigInt(bucket.spent || '0');
  const reservedBn = BigInt(bucket.reserved || '0');
  const totalCommitmentBn = spentBn + reservedBn + amountYoctoBn;
  const underDailyCap = totalCommitmentBn <= dailyCapBn;
  checks.push({
    check: 'Daily Cap & Budget Compliance',
    passed: underDailyCap,
    detail: underDailyCap
      ? `Total commitment (${totalCommitmentBn.toString()} yocto) <= Daily Cap (${policy.daily_cap} yocto)`
      : `Total commitment (${totalCommitmentBn.toString()} yocto) breaches Daily Cap (${policy.daily_cap} yocto). Current spent: ${bucket.spent}, reserved: ${bucket.reserved}`,
  });
  if (!underDailyCap) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'ExceedsDailyCap',
      error: `Daily spending budget exceeded (Cap: ${policy.daily_cap}, Spent+Reserved: ${(spentBn + reservedBn).toString()} yoctoNEAR)`,
    };
  }

  // 8. Available Liquid Balance Check
  const liquidBn = BigInt(liquidBalanceYocto);
  const sufficientLiquid = amountYoctoBn <= liquidBn;
  checks.push({
    check: 'Available Liquid Balance Solvency',
    passed: sufficientLiquid,
    detail: sufficientLiquid
      ? `Amount <= Available Liquid (${liquidBalanceYocto} yocto)`
      : `Insufficient liquid funds (${liquidBalanceYocto} yocto available, ${amountYoctoBn.toString()} requested)`,
  });
  if (!sufficientLiquid) {
    return {
      success: false,
      checks,
      predictedRouting: 'DENIED',
      predictedReason: 'InsufficientLiquidBalance',
      error: `Vault has insufficient liquid balance (${liquidBalanceYocto} yoctoNEAR available)`,
    };
  }

  // 9. Queue Limits Check
  const underAgentQueue = agentPendingCount < MAX_AGENT_PENDING;
  checks.push({
    check: 'Agent Pending Queue Quota',
    passed: underAgentQueue,
    detail: underAgentQueue
      ? `Agent pending requests: ${agentPendingCount} / ${MAX_AGENT_PENDING} slots`
      : `Agent pending limit reached (${agentPendingCount} / ${MAX_AGENT_PENDING})`,
  });

  const underGlobalQueue = globalPendingCount < MAX_GLOBAL_PENDING;
  checks.push({
    check: 'Global Pending Queue Capacity',
    passed: underGlobalQueue,
    detail: underGlobalQueue
      ? `Global pending requests: ${globalPendingCount} / ${MAX_GLOBAL_PENDING} slots`
      : `Global pending limit reached (${globalPendingCount} / ${MAX_GLOBAL_PENDING})`,
  });

  // 10. Routing Prediction
  const isAllowlisted = policy.destination_allowlist.includes(intent.destination);
  const autoThresholdBn = BigInt(policy.auto_approval_threshold);
  const belowThreshold = amountYoctoBn <= autoThresholdBn;

  let predictedRouting: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
  let predictedReason: any;

  if (isAllowlisted && belowThreshold) {
    predictedRouting = 'AUTO_DISPATCH';
    predictedReason = 'None';
  } else {
    // If it requires approval, check queue limits
    if (!underGlobalQueue) {
      return {
        success: false,
        checks,
        predictedRouting: 'DENIED',
        predictedReason: 'GlobalQueueLimitExceeded',
        error: 'Global vault pending approval queue is completely full (32/32)',
      };
    }
    if (!underAgentQueue) {
      return {
        success: false,
        checks,
        predictedRouting: 'DENIED',
        predictedReason: 'AgentQueueLimitExceeded',
        error: `Agent concurrency ceiling reached (${agentPendingCount}/${MAX_AGENT_PENDING} pending requests awaiting owner approval)`,
      };
    }

    predictedRouting = 'PENDING_APPROVAL';
    if (!isAllowlisted && !belowThreshold) {
      predictedReason = 'AboveThresholdAndNewDestination';
    } else if (!isAllowlisted) {
      predictedReason = 'NewDestinationOnly';
    } else {
      predictedReason = 'AboveThresholdOnly';
    }
  }

  return {
    success: true,
    checks,
    predictedRouting,
    predictedReason,
    vaultState: {
      isPaused,
      isAgentAuthorized: isAuthorized,
      availableLiquidYocto: liquidBalanceYocto,
      agentPendingCount,
      globalPendingCount,
      dailySpentYocto: bucket.spent,
      dailyReservedYocto: bucket.reserved,
      dailyCapYocto: policy.daily_cap,
      maxPerTxYocto: policy.max_per_transaction,
      autoApprovalThresholdYocto: policy.auto_approval_threshold,
      isDestinationAllowlisted: isAllowlisted,
    },
  };
}
