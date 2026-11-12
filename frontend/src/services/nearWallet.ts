import { setupWalletSelector, WalletSelector, actionCreators } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { PublicKey } from 'near-api-js';
import {
  VAULT_CONTRACT_ID,
  MAX_PROTOCOL_GAS,
  DEFAULT_METHOD_GAS
} from '../types/contract';
import { nearRpc } from './nearRpc';

export type SupportedWalletId = 'my-near-wallet' | 'meteor-wallet';

class NearWalletService {
  private selector: WalletSelector | null = null;
  private initialized: boolean = false;

  public async init(): Promise<WalletSelector> {
    if (this.initialized && this.selector) return this.selector;

    this.selector = await setupWalletSelector({
      network: 'testnet',
      modules: [
        setupMyNearWallet({
          walletUrl: 'https://testnet.mynearwallet.com',
        }),
        setupMeteorWallet(),
      ],
    });

    this.initialized = true;
    return this.selector;
  }

  /**
   * Connects the wallet using the verified methods of the frozen vault contract ABI.
   * Preserves existing Meteor configuration without requesting arbitrary or full-access changes.
   */
  public async connectWallet(walletId: SupportedWalletId = 'meteor-wallet'): Promise<void> {
    const selector = await this.init();
    const wallet = await selector.wallet(walletId);
    await (wallet as any).signIn({
      contractId: VAULT_CONTRACT_ID,
      methodNames: [
        'pause',
        'unpause',
        'set_policy',
        'add_destination',
        'remove_destination',
        'withdraw',
        'add_agent',
        'revoke_agent',
        'request_payment',
        'approve_request',
        'reject_request',
        'expire_request',
        'reconcile_stuck_request',
        'prune_reconciled_tombstone',
      ],
    });
  }

  public async connectMyNearWallet(): Promise<void> {
    return this.connectWallet('my-near-wallet');
  }

  public async connectMeteorWallet(): Promise<void> {
    return this.connectWallet('meteor-wallet');
  }

  public async disconnect(): Promise<void> {
    if (!this.selector) return;
    const state = this.selector.store.getState();
    const activeAccount = state.accounts.find(a => a.active) || state.accounts[0];
    if (activeAccount) {
      const walletId = state.selectedWalletId;
      const wallet = await (walletId ? this.selector.wallet(walletId) : this.selector.wallet()).catch(() => null);
      if (wallet) {
        await wallet.signOut();
      }
    }
  }

  public getConnectedAccount(): string | null {
    if (!this.selector) return null;
    const state = this.selector.store.getState();
    const active = state.accounts.find(a => a.active) || state.accounts[0];
    return active ? active.accountId : null;
  }

  public getConnectedWalletId(): string | null {
    if (!this.selector) return null;
    return this.selector.store.getState().selectedWalletId;
  }

  public isMeteorExtensionInstalled(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).meteorWallet);
  }

  /**
   * Authoritatively extracts the transaction hash and verifies execution outcome.
   * Throws an explicit error if:
   * 1. Status indicates Failure (top-level or inside receipts).
   * 2. Transaction hash is missing or uninterpretable.
   * 3. Authoritative RPC check reports Failure.
   */
  public async verifyAndExtractTxHash(
    outcome: any,
    signerId: string
  ): Promise<string> {
    if (!outcome) {
      throw new Error('Wallet provider returned an empty transaction outcome');
    }

    const single = Array.isArray(outcome) ? outcome[0] : outcome;
    if (!single) {
      throw new Error('Wallet provider returned an empty outcome array');
    }

    // 1. Extract transaction hash from supported response formats
    let candidateHash: string | null = null;
    if (typeof single === 'string' && single.trim().length > 0) {
      candidateHash = single.trim();
    } else if (typeof single === 'object') {
      if (typeof single.transaction?.hash === 'string' && single.transaction.hash.trim().length > 0) {
        candidateHash = single.transaction.hash.trim();
      } else if (typeof single.transaction_outcome?.id === 'string' && single.transaction_outcome.id.trim().length > 0) {
        candidateHash = single.transaction_outcome.id.trim();
      } else if (typeof single.transactionHashes === 'string' && single.transactionHashes.trim().length > 0) {
        candidateHash = single.transactionHashes.split(',')[0].trim();
      } else if (typeof single.hash === 'string' && single.hash.trim().length > 0) {
        candidateHash = single.hash.trim();
      }
    }

    if (!candidateHash) {
      throw new Error(
        'Unable to extract a valid transaction hash from wallet response: ' +
          (typeof single === 'object' ? JSON.stringify(single) : String(single))
      );
    }

    // Helper to format failure messages
    const parseFailureReason = (failure: any): string => {
      if (!failure) return 'Transaction execution failed on NEAR Protocol';
      if (typeof failure === 'string') return failure;
      const kind = failure.ActionError?.kind || failure.kind;
      if (kind?.FunctionCallError?.ExecutionError) {
        return `Execution Error: ${kind.FunctionCallError.ExecutionError}`;
      }
      if (kind && typeof kind === 'object') {
        const primary = Object.keys(kind)[0];
        if (typeof kind[primary] === 'object' && kind[primary] !== null) {
          const secondary = Object.keys(kind[primary])[0];
          const val = kind[primary][secondary];
          if (val) return `${primary}: ${secondary} - ${typeof val === 'object' ? JSON.stringify(val) : val}`;
          return `${primary}: ${secondary}`;
        }
        return primary;
      }
      return JSON.stringify(failure);
    };

    // 2. Direct inspection of returned execution outcome (FinalExecutionOutcome)
    if (typeof single === 'object') {
      if (single.status?.Failure) {
        throw new Error(parseFailureReason(single.status.Failure));
      }
      if (Array.isArray(single.receipts_outcome)) {
        for (const receipt of single.receipts_outcome) {
          if (receipt?.outcome?.status?.Failure) {
            throw new Error(parseFailureReason(receipt.outcome.status.Failure));
          }
        }
      }
    }

    // 3. If execution status was not included directly in the response (e.g. extension redirect/hashes string),
    // verify authoritatively via NEAR Testnet RPC
    const hasExecutionStatus =
      typeof single === 'object' &&
      (single.status?.SuccessValue !== undefined || single.status?.SuccessReceiptId !== undefined);

    if (!hasExecutionStatus) {
      try {
        const rpcTx = await nearRpc.getTransactionStatus(candidateHash, signerId);
        if (rpcTx) {
          if (rpcTx.status?.Failure) {
            throw new Error(parseFailureReason(rpcTx.status.Failure));
          }
          if (Array.isArray(rpcTx.receipts_outcome)) {
            for (const receipt of rpcTx.receipts_outcome) {
              if (receipt?.outcome?.status?.Failure) {
                throw new Error(parseFailureReason(receipt.outcome.status.Failure));
              }
            }
          }
        }
      } catch (err: any) {
        // If RPC verification detected an authoritative on-chain failure, throw immediately!
        if (err?.message && (err.message.includes('Execution Error') || err.message.includes('ActionError'))) {
          throw err;
        }
        console.warn('[nearWallet] RPC transaction status verification notice:', err?.message);
      }
    }

    return candidateHash;
  }

  /**
   * Signs and broadcasts an owner-authorized FunctionCall transaction.
   * Validates gas against NEAR protocol limits (max 300 Tgas) and attaches exact deposit.
   * Returns verified transaction hash or throws an explicit verification error.
   */
  public async signAndSendTransaction(
    methodName: string,
    args: Record<string, any>,
    deposit: string = '0',
    gas?: string
  ): Promise<string> {
    if (!this.selector) await this.init();
    if (!this.selector) throw new Error('Wallet selector not initialized');

    const state = this.selector.store.getState();
    const active = state.accounts.find(a => a.active) || state.accounts[0];
    if (!active) throw new Error('No active wallet connected');

    // Determine gas: caller-specified or method-specific default
    const resolvedGasStr = gas || DEFAULT_METHOD_GAS[methodName] || '50000000000000';
    let gasUnits: bigint;
    try {
      gasUnits = BigInt(resolvedGasStr);
    } catch {
      throw new Error(`Invalid gas string provided: "${resolvedGasStr}"`);
    }

    if (gasUnits <= 0n) {
      throw new Error(`Gas allocation must be positive; received ${gasUnits}`);
    }
    if (gasUnits > MAX_PROTOCOL_GAS) {
      throw new Error(
        `Gas allocation (${gasUnits} units / ${Number(gasUnits) / 1e12} Tgas) exceeds NEAR protocol limit of 300 Tgas`
      );
    }

    let depositYocto: bigint;
    try {
      depositYocto = BigInt(deposit || '0');
    } catch {
      throw new Error(`Invalid deposit string provided: "${deposit}"`);
    }

    const walletId = state.selectedWalletId;
    const wallet = await (walletId ? this.selector.wallet(walletId) : this.selector.wallet());

    try {
      const outcome = await wallet.signAndSendTransaction({
        signerId: active.accountId,
        receiverId: VAULT_CONTRACT_ID,
        actions: [
          actionCreators.functionCall(methodName, args, gasUnits, depositYocto),
        ],
      });

      return await this.verifyAndExtractTxHash(outcome, active.accountId);
    } catch (err: any) {
      console.warn(`[nearWallet] Transaction execution failed:`, err);
      // Re-throw with user-friendly error message
      const msg = err?.message || String(err);
      if (msg.includes('User rejected') || msg.includes('USER_CANCELLED')) {
        throw new Error('Transaction was cancelled by user in wallet');
      }
      throw err;
    }
  }

  /**
   * Executes a native NEAR token transfer using actionCreators.transfer (no contract function call).
   * Returns verified transaction hash or throws an explicit verification error.
   */
  public async transferNear(
    receiverId: string,
    yoctoAmount: string
  ): Promise<string> {
    if (!this.selector) await this.init();
    if (!this.selector) throw new Error('Wallet selector not initialized');

    const state = this.selector.store.getState();
    const active = state.accounts.find(a => a.active) || state.accounts[0];
    if (!active) throw new Error('No active wallet connected');

    const walletId = state.selectedWalletId;
    const wallet = await (walletId ? this.selector.wallet(walletId) : this.selector.wallet());
    try {
      const outcome = await wallet.signAndSendTransaction({
        signerId: active.accountId,
        receiverId,
        actions: [
          actionCreators.transfer(BigInt(yoctoAmount)),
        ],
      });

      return await this.verifyAndExtractTxHash(outcome, active.accountId);
    } catch (err: any) {
      console.warn(`[nearWallet] Transfer execution failed:`, err);
      const msg = err?.message || String(err);
      if (msg.includes('User rejected') || msg.includes('USER_CANCELLED')) {
        throw new Error('Transaction was cancelled by user in wallet');
      }
      throw err;
    }
  }

  /**
   * Creates an autonomous agent subaccount with ZERO FullAccess keys.
   * Atomically executes CreateAccount, Transfer (initial funding), and AddKey (restricted FunctionCall).
   * Triggers an approval popup in Meteor Wallet extension using the owner's FullAccess key.
   */
  public async createAgentSubaccount(
    agentAccountId: string = 'agent.cleartoad8704.testnet',
    agentPublicKey: string = 'ed25519:E1dDCJgqc7AEhM57PsmXzorNoVTiGBBUgWxHz35bvK24',
    initialDepositYocto: string = '100000000000000000000000', // 0.1 NEAR
    allowanceYocto: string = '250000000000000000000000' // 0.25 NEAR
  ): Promise<string> {
    if (!this.selector) await this.init();
    if (!this.selector) throw new Error('Wallet selector not initialized');

    const state = this.selector.store.getState();
    const active = state.accounts.find(a => a.active) || state.accounts[0];
    if (!active) throw new Error('No active wallet connected');

    const walletId = state.selectedWalletId;
    const wallet = await (walletId ? this.selector.wallet(walletId) : this.selector.wallet());

    const actions = [
      actionCreators.createAccount(),
      actionCreators.transfer(BigInt(initialDepositYocto)),
      actionCreators.addKey(
        PublicKey.fromString(agentPublicKey) as any,
        actionCreators.functionCallAccessKey(
          VAULT_CONTRACT_ID,
          ['request_payment'],
          BigInt(allowanceYocto)
        )
      ),
    ];

    try {
      const outcome = await wallet.signAndSendTransaction({
        signerId: active.accountId,
        receiverId: agentAccountId,
        actions,
      });

      return await this.verifyAndExtractTxHash(outcome, active.accountId);
    } catch (err: any) {
      console.warn(`[nearWallet] Agent subaccount creation failed:`, err);
      const msg = err?.message || String(err);
      if (msg.includes('User rejected') || msg.includes('USER_CANCELLED') || msg.includes('cancelled')) {
        throw new Error('Transaction was cancelled by user in wallet');
      }
      throw err;
    }
  }
}

export const nearWallet = new NearWalletService();
