import {
  VAULT_CONTRACT_ID,
  TESTNET_RPC_URL,
  BACKUP_TESTNET_RPC_URL,
  SpendingPolicyView,
  DailyBucketView,
  PaymentRequestView,
  CompactAuditRecord,
  ReconciledTombstoneView,
  VaultAccountOverview
} from '../types/contract';

class NearRpcClient {
  private primaryUrl: string = TESTNET_RPC_URL;
  private backupUrl: string = typeof window !== 'undefined' ? '' : BACKUP_TESTNET_RPC_URL;

  private async callRpc(method: string, params: Record<string, any>, retries: number = 3): Promise<any> {
    const payload = {
      jsonrpc: '2.0',
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      method,
      params,
    };

    console.log('[nearRpc] callRpc request:', method, params?.request_type, params?.method_name);
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(this.primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.result !== undefined) {
            console.log('[nearRpc] callRpc success:', method, params?.method_name || params?.request_type);
            return data.result;
          }
          if (data.error && data.error.code !== -429) {
            console.error('[nearRpc] callRpc RPC error:', data.error);
            throw new Error(data.error.message || JSON.stringify(data.error));
          }
        } else {
          console.warn('[nearRpc] callRpc HTTP error:', response.status);
        }
      } catch (err: any) {
        console.warn(`[nearRpc] callRpc attempt ${attempt + 1} failed:`, err?.message || err);
        if (attempt === retries - 1 && !this.backupUrl) throw err;
      }
      await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
    }

    if (this.backupUrl) {
      try {
        const backupResponse = await fetch(this.backupUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (backupResponse.ok) {
          const data = await backupResponse.json();
          if (data.result !== undefined) return data.result;
        }
      } catch {
        // Backup failed
      }
    }

    throw new Error('All RPC attempts exhausted');
  }

  /**
   * Invokes a view method on a NEAR contract and parses the base64 JSON response.
   */
  public async callViewFunction<T>(methodName: string, args: Record<string, any> = {}): Promise<T> {
    const argsJson = JSON.stringify(args);
    const argsBase64 = btoa(unescape(encodeURIComponent(argsJson)));

    const result = await this.callRpc('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: VAULT_CONTRACT_ID,
      method_name: methodName,
      args_base64: argsBase64,
    });

    if (!result || !result.result) {
      throw new Error(`Empty response for ${methodName}`);
    }

    const uint8Array = new Uint8Array(result.result);
    const decodedStr = new TextDecoder().decode(uint8Array);
    return JSON.parse(decodedStr) as T;
  }

  /**
   * Fetches native account balance and storage metadata.
   */
  public async viewAccount(accountId: string = VAULT_CONTRACT_ID): Promise<{
    amount: string;
    locked: string;
    storage_usage: number;
    block_height: number;
  }> {
    return this.callRpc('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    });
  }

  /**
   * Fetches all core vault parameters in staged batches to avoid rate-limiting testnet nodes.
   */
  private cachedOverview: VaultAccountOverview | null = null;
  private lastFetchedTime: number = 0;
  private inflightOverviewPromise: Promise<VaultAccountOverview> | null = null;

  /**
   * Fetches all core vault parameters with caching and in-flight de-duplication.
   */
  public async fetchVaultOverview(): Promise<VaultAccountOverview> {
    const now = Date.now();
    if (this.cachedOverview && now - this.lastFetchedTime < 6000) {
      return this.cachedOverview;
    }
    if (this.inflightOverviewPromise) {
      return this.inflightOverviewPromise;
    }

    this.inflightOverviewPromise = (async () => {
      console.log('[nearRpc] Starting staged fetchVaultOverview...');
      
      // Stage 1: Basic account & owner governance metadata (4 parallel)
      const [accountMeta, ownerId, policy, isPaused] = await Promise.all([
        this.viewAccount(VAULT_CONTRACT_ID),
        this.callViewFunction<string>('get_owner'),
        this.callViewFunction<SpendingPolicyView>('get_policy'),
        this.callViewFunction<boolean>('is_paused')
      ]);

      // Stage 2: Core solvency metrics (4 parallel)
      const [storageReserveRequirement, protectedBalance, availableLiquidBalance, pendingReserved] = await Promise.all([
        this.callViewFunction<string>('get_storage_reserve_requirement'),
        this.callViewFunction<string>('get_protected_balance'),
        this.callViewFunction<string>('get_available_liquid_balance'),
        this.callViewFunction<string>('get_pending_reserved')
      ]);

      // Stage 3: Queue & daily bucket (3 parallel)
      const [inflightReserved, globalPendingCount, dailyBucket] = await Promise.all([
        this.callViewFunction<string>('get_inflight_reserved'),
        this.callViewFunction<number>('get_global_pending_count'),
        this.callViewFunction<DailyBucketView>('get_daily_bucket')
      ]);

      // Stage 4: Pending lists, audits & authorized agents (4 parallel)
      const [pendingRequests, auditRecords, isAgentAAuthorized, isAgentRevAuthorized] = await Promise.all([
        this.callViewFunction<PaymentRequestView[]>('get_pending_requests', { limit: 32 }).catch(() => []),
        this.callViewFunction<CompactAuditRecord[]>('get_audit_records', { limit: 50 }).catch(() => []),
        this.callViewFunction<boolean>('is_agent_authorized', { agent_id: 'agent-a.vault-parent.testnet' }).catch(() => false),
        this.callViewFunction<boolean>('is_agent_authorized', { agent_id: 'agent-rev.vault-parent.testnet' }).catch(() => false)
      ]);

      const authorizedAgents: string[] = [];
      if (isAgentAAuthorized) authorizedAgents.push('agent-a.vault-parent.testnet');
      if (isAgentRevAuthorized) authorizedAgents.push('agent-rev.vault-parent.testnet');

      const overview: VaultAccountOverview = {
        contractId: VAULT_CONTRACT_ID,
        ownerId,
        totalAccountBalance: accountMeta.amount,
        storageUsageBytes: accountMeta.storage_usage,
        storageReserveRequirement,
        protectedBalance,
        availableLiquidBalance,
        pendingReserved,
        inflightReserved,
        globalPendingCount,
        policy,
        isPaused,
        dailyBucket,
        pendingRequests,
        auditRecords,
        authorizedAgents,
      };

      this.cachedOverview = overview;
      this.lastFetchedTime = Date.now();
      console.log('[nearRpc] Successfully loaded and cached vault overview!');
      return overview;
    })().finally(() => {
      this.inflightOverviewPromise = null;
    });

    return this.inflightOverviewPromise;
  }

  public async getTombstone(requestId: number): Promise<ReconciledTombstoneView | null> {
    try {
      return await this.callViewFunction<ReconciledTombstoneView>('get_tombstone', { request_id: requestId });
    } catch {
      return null;
    }
  }
}

export const nearRpc = new NearRpcClient();
