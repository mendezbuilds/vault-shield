import { setupWalletSelector, WalletSelector, Wallet, actionCreators } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { VAULT_CONTRACT_ID } from '../types/contract';

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

  public async connectWallet(walletId: SupportedWalletId = 'my-near-wallet'): Promise<void> {
    const selector = await this.init();
    const wallet = await selector.wallet(walletId);
    await (wallet as any).signIn({
      contractId: VAULT_CONTRACT_ID,
      methodNames: ['request_payment', 'approve_request', 'reject_request', 'expire_request', 'pause', 'unpause'],
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

  public async signAndSendTransaction(
    methodName: string,
    args: Record<string, any>,
    deposit: string = '0',
    gas: string = '30000000000000'
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
      receiverId: VAULT_CONTRACT_ID,
      actions: [
        actionCreators.functionCall(methodName, args, BigInt(gas || '30000000000000'), BigInt(deposit || '0')),
      ],
    });

    if (outcome && typeof outcome === 'object' && 'transaction' in outcome) {
      return (outcome as any).transaction.hash;
    }
    return null;
  }
}

export const nearWallet = new NearWalletService();
