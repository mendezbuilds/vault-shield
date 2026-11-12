import {
  VAULT_CONTRACT_ID,
  EXPECTED_OWNER_ID,
  FROZEN_WASM_CODE_HASH,
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
            const errStr = data.error.data || data.error.message || JSON.stringify(data.error);
            const err = new Error(errStr);
            (err as any).rpcError = data.error;
            throw err;
          }
        } else {
          console.warn('[nearRpc] callRpc HTTP error:', response.status);
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('does not exist') || msg.includes('UNKNOWN_ACCOUNT') || msg.includes('CompilationError') || msg.includes('MethodNotFound')) {
          throw err; // Non-retryable deterministic contract/account error
        }
        console.warn(`[nearRpc] callRpc attempt ${attempt + 1} failed:`, msg);
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
   * Invokes a view method on the vault contract and parses the base64 JSON response.
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
    code_hash: string;
    storage_usage: number;
    block_height: number;
  } | null> {
    try {
      return await this.callRpc('query', {
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('does not exist') || msg.includes('UNKNOWN_ACCOUNT')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches the complete list of access keys for an account.
   */
  public async viewAccessKeyList(accountId: string): Promise<any> {
    try {
      return await this.callRpc('query', {
        request_type: 'view_access_key_list',
        finality: 'final',
        account_id: accountId,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('does not exist') || msg.includes('UNKNOWN_ACCOUNT')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Authoritative read method for checking whether an agent account is authorized.
   * Matches the exact contract ABI: `pub fn is_agent_authorized(&self, agent_id: AccountId) -> bool`
   */
  public async isAgentAuthorized(agentId: string): Promise<boolean> {
    try {
      return await this.callViewFunction<boolean>('is_agent_authorized', { agent_id: agentId });
    } catch {
      return false;
    }
  }

  /**
   * Queries the authoritative execution outcome of a transaction from NEAR JSON-RPC.
   */
  public async getTransactionStatus(txHash: string, accountId: string): Promise<any> {
    try {
      return await this.callRpc('tx', [txHash, accountId]);
    } catch (err: any) {
      console.warn(`[nearRpc] getTransactionStatus error for ${txHash}:`, err?.message);
      return null;
    }
  }

  private cachedOverview: VaultAccountOverview | null = null;
  private lastFetchedTime: number = 0;
  private inflightOverviewPromise: Promise<VaultAccountOverview> | null = null;

  /**
   * Clears the in-memory vault overview cache and in-flight promise.
   * Ensures subsequent calls fetch fresh on-chain data immediately.
   */
  public clearCache(): void {
    this.cachedOverview = null;
    this.lastFetchedTime = 0;
    this.inflightOverviewPromise = null;
  }

  /**
   * Fetches all core vault parameters with caching and in-flight de-duplication.
   * Passing forceRefresh = true invalidates the cache and queries fresh RPC state.
   */
  public async fetchVaultOverview(forceRefresh: boolean = false): Promise<VaultAccountOverview> {
    const now = Date.now();
    if (!forceRefresh && this.cachedOverview && now - this.lastFetchedTime < 6000) {
      return this.cachedOverview;
    }

    if (forceRefresh) {
      this.clearCache();
    } else if (this.inflightOverviewPromise) {
      return this.inflightOverviewPromise;
    }

    this.inflightOverviewPromise = (async () => {
      console.log(`[nearRpc] Querying vault state for ${VAULT_CONTRACT_ID}...`);

      // 1. Query account metadata from NEAR Protocol
      let accountMeta: {
        amount: string;
        locked: string;
        code_hash: string;
        storage_usage: number;
        block_height: number;
      } | null = null;

      try {
        accountMeta = await this.viewAccount(VAULT_CONTRACT_ID);
      } catch (err: any) {
        console.warn(`[nearRpc] Vault account ${VAULT_CONTRACT_ID} not found on testnet:`, err?.message);
      }

      // If account does not exist on Testnet yet (prior to Step 1 authorization)
      if (!accountMeta) {
        const unprovisionedOverview: VaultAccountOverview = {
          contractId: VAULT_CONTRACT_ID,
          ownerId: EXPECTED_OWNER_ID,
          totalAccountBalance: '0',
          storageUsageBytes: 0,
          storageReserveRequirement: '0',
          protectedBalance: '0',
          availableLiquidBalance: '0',
          pendingReserved: '0',
          inflightReserved: '0',
          globalPendingCount: 0,
          policy: {
            max_per_transaction: '1000000000000000000000000', // 1 NEAR
            daily_cap: '2000000000000000000000000',           // 2 NEAR
            auto_approval_threshold: '200000000000000000000000', // 0.2 NEAR
            destination_allowlist: ['whiteice2105.testnet'],
            is_paused: false,
          },
          isPaused: false,
          dailyBucket: { bucket_index: 0, spent: '0', reserved: '0', last_updated_at: 0 },
          pendingRequests: [],
          auditRecords: [],
          authorizedAgents: [],
          isDeployed: false,
          isInitialized: false,
          codeHashMatches: false,
        };
        this.cachedOverview = unprovisionedOverview;
        this.lastFetchedTime = Date.now();
        return unprovisionedOverview;
      }

      const isDeployed = accountMeta.code_hash !== '11111111111111111111111111111111';
      const codeHashMatches = accountMeta.code_hash === FROZEN_WASM_CODE_HASH;

      // If contract is not deployed yet
      if (!isDeployed) {
        const undeployedOverview: VaultAccountOverview = {
          contractId: VAULT_CONTRACT_ID,
          ownerId: EXPECTED_OWNER_ID,
          totalAccountBalance: accountMeta.amount,
          storageUsageBytes: accountMeta.storage_usage,
          storageReserveRequirement: '0',
          protectedBalance: accountMeta.amount,
          availableLiquidBalance: accountMeta.amount,
          pendingReserved: '0',
          inflightReserved: '0',
          globalPendingCount: 0,
          policy: {
            max_per_transaction: '1000000000000000000000000',
            daily_cap: '2000000000000000000000000',
            auto_approval_threshold: '200000000000000000000000',
            destination_allowlist: ['whiteice2105.testnet'],
            is_paused: false,
          },
          isPaused: false,
          dailyBucket: { bucket_index: 0, spent: '0', reserved: '0', last_updated_at: 0 },
          pendingRequests: [],
          auditRecords: [],
          authorizedAgents: [],
          isDeployed: false,
          isInitialized: false,
          codeHashMatches: false,
        };
        this.cachedOverview = undeployedOverview;
        this.lastFetchedTime = Date.now();
        return undeployedOverview;
      }

      // 2. Fetch on-chain state via contract view methods
      try {
        const [ownerId, policy, isPaused] = await Promise.all([
          this.callViewFunction<string>('get_owner'),
          this.callViewFunction<SpendingPolicyView>('get_policy'),
          this.callViewFunction<boolean>('is_paused'),
        ]);

        const [storageReserveRequirement, protectedBalance, availableLiquidBalance, pendingReserved] = await Promise.all([
          this.callViewFunction<string>('get_storage_reserve_requirement'),
          this.callViewFunction<string>('get_protected_balance'),
          this.callViewFunction<string>('get_available_liquid_balance'),
          this.callViewFunction<string>('get_pending_reserved'),
        ]);

        const [inflightReserved, globalPendingCount, dailyBucket] = await Promise.all([
          this.callViewFunction<string>('get_inflight_reserved'),
          this.callViewFunction<number>('get_global_pending_count'),
          this.callViewFunction<DailyBucketView>('get_daily_bucket'),
        ]);

        const [pendingRequests, auditRecords] = await Promise.all([
          this.callViewFunction<PaymentRequestView[]>('get_pending_requests', { limit: 32 }).catch(() => []),
          this.callViewFunction<CompactAuditRecord[]>('get_audit_records', { limit: 50 }).catch(() => []),
        ]);

        // Discover active agents from audit events, then verify each with is_agent_authorized
        const candidateAgents = new Set<string>();
        for (const record of auditRecords) {
          if (record.event_type === 'AgentRegistered') {
            candidateAgents.add(record.account_id);
          }
        }

        const authorizedAgents: string[] = [];
        for (const agent of candidateAgents) {
          const isAuth = await this.isAgentAuthorized(agent);
          if (isAuth) {
            authorizedAgents.push(agent);
          }
        }

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
          isDeployed: true,
          isInitialized: true,
          codeHashMatches,
        };

        this.cachedOverview = overview;
        this.lastFetchedTime = Date.now();
        console.log('[nearRpc] Successfully loaded and cached vault overview!');
        return overview;
      } catch (err: any) {
        console.warn('[nearRpc] Contract deployed but uninitialized or view call failed:', err?.message);
        const uninitializedOverview: VaultAccountOverview = {
          contractId: VAULT_CONTRACT_ID,
          ownerId: EXPECTED_OWNER_ID,
          totalAccountBalance: accountMeta.amount,
          storageUsageBytes: accountMeta.storage_usage,
          storageReserveRequirement: '0',
          protectedBalance: accountMeta.amount,
          availableLiquidBalance: accountMeta.amount,
          pendingReserved: '0',
          inflightReserved: '0',
          globalPendingCount: 0,
          policy: {
            max_per_transaction: '1000000000000000000000000',
            daily_cap: '2000000000000000000000000',
            auto_approval_threshold: '200000000000000000000000',
            destination_allowlist: ['whiteice2105.testnet'],
            is_paused: false,
          },
          isPaused: false,
          dailyBucket: { bucket_index: 0, spent: '0', reserved: '0', last_updated_at: 0 },
          pendingRequests: [],
          auditRecords: [],
          authorizedAgents: [],
          isDeployed: true,
          isInitialized: false,
          codeHashMatches,
        };
        this.cachedOverview = uninitializedOverview;
        this.lastFetchedTime = Date.now();
        return uninitializedOverview;
      }
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
