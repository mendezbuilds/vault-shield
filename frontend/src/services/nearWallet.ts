import { setupWalletSelector, WalletSelector, actionCreators } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import {
  VAULT_CONTRACT_ID,
  MAX_PROTOCOL_GAS,
  DEFAULT_METHOD_GAS
} from '../types/contract';

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
   * Signs and broadcasts an owner-authorized FunctionCall transaction.
   * Validates gas against NEAR protocol limits (max 300 Tgas) and attaches exact deposit.
   */
  public async signAndSendTransaction(
    methodName: string,
    args: Record<string, any>,
    deposit: string = '0',
    gas?: string
  ): Promise<string | null> {
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

      const single = Array.isArray(outcome) ? outcome[0] : outcome;
      if (single && typeof single === 'object') {
        if ('transaction' in single && (single as any).transaction?.hash) {
          return (single as any).transaction.hash;
        }
        if ('transaction_outcome' in single && (single as any).transaction_outcome?.id) {
          return (single as any).transaction_outcome.id;
        }
      }
      return null;
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
   */
  public async transferNear(
    receiverId: string,
    yoctoAmount: string
  ): Promise<string | null> {
    if (!this.selector) await this.init();
    if (!this.selector) throw new Error('Wallet selector not initialized');

    const state = this.selector.store.getState();
    const active = state.accounts.find(a => a.active) || state.accounts[0];
    if (!active) throw new Error('No active wallet connected');

    const walletId = state.selectedWalletId;
    const wallet = await (walletId ? this.selector.wallet(walletId) : this.selector.wallet());
    const outcome = await wallet.signAndSendTransaction({
      signerId: active.accountId,
      receiverId,
      actions: [
        actionCreators.transfer(BigInt(yoctoAmount)),
      ],
    });

    const single = Array.isArray(outcome) ? outcome[0] : outcome;
    if (single && typeof single === 'object') {
      if ('transaction' in single && (single as any).transaction?.hash) {
        return (single as any).transaction.hash;
      }
      if ('transaction_outcome' in single && (single as any).transaction_outcome?.id) {
        return (single as any).transaction_outcome.id;
      }
    }
    return null;
  }
}

export const nearWallet = new NearWalletService();
