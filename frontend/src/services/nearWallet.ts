import { setupWalletSelector, WalletSelector, Wallet, actionCreators } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { VAULT_CONTRACT_ID } from '../types/contract';

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
      ],
    });

    this.initialized = true;
    return this.selector;
  }

  public async connectMyNearWallet(): Promise<void> {
    const selector = await this.init();
    const myNearWallet = await selector.wallet('my-near-wallet');
    await (myNearWallet as any).signIn({
      contractId: VAULT_CONTRACT_ID,
      methodNames: ['request_payment', 'approve_request', 'reject_request', 'expire_request', 'pause', 'unpause'],
    });
  }

  public async disconnect(): Promise<void> {
    if (!this.selector) return;
    const state = this.selector.store.getState();
    const activeAccount = state.accounts.find(a => a.active) || state.accounts[0];
    if (activeAccount) {
      const wallet = await this.selector.wallet('my-near-wallet').catch(() => null);
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

    const wallet = await this.selector.wallet('my-near-wallet');
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
