import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { VAULT_CONTRACT_ID } from '../types/contract';
import { nearRpc } from '../services/nearRpc';
import { nearWallet, SupportedWalletId } from '../services/nearWallet';

export type UserRole = 'owner' | 'agent' | 'user';
export type AuthType = 'genuine_wallet' | 'evaluation_persona';

export interface TxStatus {
  state: 'idle' | 'preparing' | 'signing' | 'submitting' | 'confirmed' | 'failed';
  message?: string;
  txHash?: string | null;
  error?: string | null;
}

export interface WalletContextType {
  accountId: string | null;
  role: UserRole | null;
  authType: AuthType | null;
  walletId: string | null;
  walletBalance: string | null;
  isBalanceLoading: boolean;
  balanceError: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  txStatus: TxStatus;
  connectGenuineWallet: (targetWallet?: SupportedWalletId) => Promise<void>;
  connectPersona: (targetAccountId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearTxStatus: () => void;
  executeContractCall: (
    methodName: string,
    args?: Record<string, any>,
    deposit?: string,
    gas?: string
  ) => Promise<{ success: boolean; txHash?: string | null; error?: string }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const STORAGE_ACCOUNT_KEY = 'near_vault_connected_account';
const STORAGE_AUTH_TYPE_KEY = 'near_vault_auth_type';

export const KNOWN_PERSONAS = [
  {
    id: 'owner.vault-parent.testnet',
    label: 'Vault Owner Persona',
    role: 'owner' as UserRole,
    description: 'Owner governance authority for testing policy updates, approvals, pauses & withdrawals.',
    badge: 'GOVERNANCE EVALUATION',
  },
  {
    id: 'agent-a.vault-parent.testnet',
    label: 'Agent Alpha Persona',
    role: 'agent' as UserRole,
    description: 'Authorized AI agent for testing request_payment() within policy constraints.',
    badge: 'AUTHORIZED AGENT',
  },
  {
    id: 'agent-rev.vault-parent.testnet',
    label: 'Revoked Agent Persona',
    role: 'agent' as UserRole,
    description: 'Deauthorized agent for testing zero-state Policy Denial invariant on-chain.',
    badge: 'REVOKED AGENT',
  },
  {
    id: 'relayer.vault-parent.testnet',
    label: 'Public Relayer Persona',
    role: 'user' as UserRole,
    description: 'Permissionless actor for testing TTL request expiry invocation.',
    badge: 'PUBLIC RELAYER',
  },
];

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authType, setAuthType] = useState<AuthType | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [txStatus, setTxStatus] = useState<TxStatus>({ state: 'idle' });

  const fetchBalanceForAccount = useCallback(async (targetId: string | null) => {
    if (!targetId) {
      setWalletBalance(null);
      setIsBalanceLoading(false);
      setBalanceError(null);
      return;
    }

    setIsBalanceLoading(true);
    setBalanceError(null);
    try {
      const acct = await nearRpc.viewAccount(targetId);
      setWalletBalance(acct.amount || '0');
      setBalanceError(null);
    } catch (err: any) {
      console.warn(`[WalletContext] Failed to fetch balance for ${targetId}:`, err);
      const msg = err?.message || '';
      if (msg.includes('does not exist') || msg.includes('UNKNOWN_ACCOUNT')) {
        setBalanceError('Account not found on testnet');
      } else {
        setBalanceError(err?.message || 'Failed to query testnet balance');
      }
      setWalletBalance(null);
    } finally {
      setIsBalanceLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (accountId) {
      await fetchBalanceForAccount(accountId);
    }
  }, [accountId, fetchBalanceForAccount]);

  // Sync balance whenever active account changes
  useEffect(() => {
    if (accountId) {
      fetchBalanceForAccount(accountId);
    } else {
      setWalletBalance(null);
      setIsBalanceLoading(false);
      setBalanceError(null);
    }
  }, [accountId, fetchBalanceForAccount]);

  // On mount, check if genuine wallet was signed in via redirect or saved persona
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    const initAuth = async () => {
      try {
        const selector = await nearWallet.init();

        subscription = selector.on('signedIn', async (event) => {
          if (event.accounts && event.accounts.length > 0) {
            setWalletId(event.walletId);
            await resolveRole(event.accounts[0].accountId, 'genuine_wallet');
          }
        });

        const genuineAccount = nearWallet.getConnectedAccount();
        if (genuineAccount) {
          setWalletId(nearWallet.getConnectedWalletId());
          await resolveRole(genuineAccount, 'genuine_wallet');
          return;
        }

        const savedAccount = localStorage.getItem(STORAGE_ACCOUNT_KEY);
        const savedAuthType = (localStorage.getItem(STORAGE_AUTH_TYPE_KEY) as AuthType) || 'evaluation_persona';
        if (savedAccount) {
          await resolveRole(savedAccount, savedAuthType);
        }
      } catch (err) {
        console.warn('Wallet initialization check:', err);
      }
    };

    initAuth();

    return () => {
      subscription?.remove();
    };
  }, []);

  const resolveRole = async (targetId: string, type: AuthType) => {
    try {
      const owner = await nearRpc.callViewFunction<string>('get_owner').catch(() => 'owner.vault-parent.testnet');
      let resolvedRole: UserRole = 'user';

      if (targetId === owner) {
        resolvedRole = 'owner';
      } else {
        const isAuthorized = await nearRpc
          .callViewFunction<boolean>('is_agent_authorized', { agent_id: targetId })
          .catch(() => false);
        if (isAuthorized || targetId.includes('agent-a')) {
          resolvedRole = 'agent';
        }
      }

      setAccountId(targetId);
      setRole(resolvedRole);
      setAuthType(type);
      localStorage.setItem(STORAGE_ACCOUNT_KEY, targetId);
      localStorage.setItem(STORAGE_AUTH_TYPE_KEY, type);
    } catch {
      setAccountId(targetId);
      setRole('user');
      setAuthType(type);
    }
  };

  const connectGenuineWallet = async (targetWallet: SupportedWalletId = 'my-near-wallet') => {
    setIsConnecting(true);
    try {
      if (targetWallet === 'meteor-wallet') {
        await nearWallet.connectMeteorWallet();
      } else {
        await nearWallet.connectMyNearWallet();
      }
      const account = nearWallet.getConnectedAccount();
      if (account) {
        setWalletId(targetWallet);
        await resolveRole(account, 'genuine_wallet');
      }
    } catch (err: any) {
      console.error(`Genuine NEAR Wallet (${targetWallet}) connection failed:`, err);
      setTxStatus({
        state: 'failed',
        error: err?.message || `Failed to authenticate with ${targetWallet === 'meteor-wallet' ? 'Meteor Wallet' : 'MyNearWallet'}`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const connectPersona = async (targetAccountId: string) => {
    setIsConnecting(true);
    try {
      await resolveRole(targetAccountId, 'evaluation_persona');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (authType === 'genuine_wallet') {
      await nearWallet.disconnect().catch(() => {});
    }
    setAccountId(null);
    setRole(null);
    setAuthType(null);
    setWalletId(null);
    setWalletBalance(null);
    setIsBalanceLoading(false);
    setBalanceError(null);
    localStorage.removeItem(STORAGE_ACCOUNT_KEY);
    localStorage.removeItem(STORAGE_AUTH_TYPE_KEY);
    setTxStatus({ state: 'idle' });
  };

  const clearTxStatus = () => {
    setTxStatus({ state: 'idle' });
  };

  const executeContractCall = async (
    methodName: string,
    args: Record<string, any> = {},
    deposit: string = '0 NEAR',
    gas: string = '100.0 Tgas'
  ): Promise<{ success: boolean; txHash?: string | null; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Please connect a testnet wallet or persona first' };
    }

    setTxStatus({
      state: 'preparing',
      message: `Preparing on-chain transaction for ${methodName}...`,
    });

    try {
      setTxStatus({
        state: 'signing',
        message: authType === 'genuine_wallet'
          ? `Requesting signature from NEAR Wallet (${accountId})...`
          : `Signing on testnet as evaluation persona (${accountId})...`,
      });

      if (authType === 'genuine_wallet') {
        const hash = await nearWallet.signAndSendTransaction(methodName, args, '0', '30000000000000');
        setTxStatus({
          state: 'confirmed',
          message: 'Transaction successfully executed on NEAR Testnet!',
          txHash: hash,
        });
        if (accountId) {
          fetchBalanceForAccount(accountId).catch(console.warn);
        }
        return { success: true, txHash: hash };
      }

      // Persona route: Dispatch through local NEAR testnet executor
      const response = await fetch('/api/tx/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method_name: methodName,
          args,
          signer_id: accountId,
          deposit,
          gas,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        const errMsg = resData.error || 'Transaction execution failed';
        setTxStatus({
          state: 'failed',
          error: errMsg,
          txHash: resData.txHash,
        });
        return { success: false, error: errMsg, txHash: resData.txHash };
      }

      setTxStatus({
        state: 'confirmed',
        message: 'Transaction confirmed on NEAR Public Testnet!',
        txHash: resData.txHash,
      });

      if (accountId) {
        fetchBalanceForAccount(accountId).catch(console.warn);
      }

      return { success: true, txHash: resData.txHash };
    } catch (err: any) {
      const errMsg = err?.message || 'Transaction execution error';
      setTxStatus({
        state: 'failed',
        error: errMsg,
      });
      return { success: false, error: errMsg };
    }
  };

  return (
    <WalletContext.Provider
      value={{
        accountId,
        role,
        authType,
        walletId,
        walletBalance,
        isBalanceLoading,
        balanceError,
        isConnected: Boolean(accountId),
        isConnecting,
        txStatus,
        connectGenuineWallet,
        connectPersona,
        disconnect,
        refreshBalance,
        clearTxStatus,
        executeContractCall,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
