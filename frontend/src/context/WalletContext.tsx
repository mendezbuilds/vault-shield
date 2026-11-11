import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  VAULT_CONTRACT_ID,
  DEFAULT_METHOD_GAS,
  MAX_PROTOCOL_GAS,
  StagedTransaction
} from '../types/contract';
import { nearRpc } from '../services/nearRpc';
import { nearWallet, SupportedWalletId } from '../services/nearWallet';
import { TxStagingModal } from '../components/common/TxStagingModal';
import { formatNear } from '../utils/formatters';

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
  transferNativeNear: (
    receiverId: string,
    yoctoAmount: string
  ) => Promise<{ success: boolean; txHash?: string | null; error?: string }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const STORAGE_ACCOUNT_KEY = 'near_vault_connected_account';
const STORAGE_AUTH_TYPE_KEY = 'near_vault_auth_type';

export const KNOWN_PERSONAS = [
  {
    id: 'cleartoad8704.testnet',
    label: 'Vault Owner Account',
    role: 'owner' as UserRole,
    description: 'Designated vault owner governance identity on NEAR Testnet.',
    badge: 'VAULT OWNER',
  },
  {
    id: 'whiteice2105.testnet',
    label: 'Allowlisted Destination',
    role: 'user' as UserRole,
    description: 'Approved payment recipient identity for autonomous test disbursements.',
    badge: 'APPROVED RECIPIENT',
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

  // Staged transaction state for pre-flight review modal
  const [stagedTx, setStagedTx] = useState<StagedTransaction | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<((approved: boolean) => void) | null>(null);

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
      if (acct) {
        setWalletBalance(acct.amount || '0');
        setBalanceError(null);
      } else {
        setWalletBalance(null);
        setBalanceError('Account not found on testnet');
      }
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
        const savedAuthType = (localStorage.getItem(STORAGE_AUTH_TYPE_KEY) as AuthType) || 'genuine_wallet';
        if (savedAccount) {
          await resolveRole(savedAccount, savedAuthType);
        }
      } catch (err) {
        console.warn('[WalletContext] Wallet initialization check:', err);
      }
    };

    initAuth();

    return () => {
      subscription?.remove();
    };
  }, []);

  /**
   * Resolves role authoritatively against the live contract's get_owner() and is_agent_authorized().
   * If contract is not deployed or uninitialized, defaults to 'user' (observer mode).
   */
  const resolveRole = async (targetId: string, type: AuthType) => {
    try {
      const owner = await nearRpc.callViewFunction<string>('get_owner');
      let resolvedRole: UserRole = 'user';

      if (owner && targetId.toLowerCase() === owner.toLowerCase()) {
        resolvedRole = 'owner';
      } else {
        const isAuthorized = await nearRpc.isAgentAuthorized(targetId);
        if (isAuthorized) {
          resolvedRole = 'agent';
        }
      }

      setAccountId(targetId);
      setRole(resolvedRole);
      setAuthType(type);
      localStorage.setItem(STORAGE_ACCOUNT_KEY, targetId);
      localStorage.setItem(STORAGE_AUTH_TYPE_KEY, type);
    } catch {
      // Contract uninitialized or view call failed: assign observer mode
      setAccountId(targetId);
      setRole('user');
      setAuthType(type);
    }
  };

  const connectGenuineWallet = async (targetWallet: SupportedWalletId = 'meteor-wallet') => {
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

  /**
   * Staged contract call execution:
   * 1. Resolves and validates method-specific gas against protocol limits (max 300 Tgas).
   * 2. Displays the Pre-Flight Staged Transaction Review Modal.
   * 3. Requires explicit confirmation from the user before delegating to Meteor Wallet.
   */
  const executeContractCall = async (
    methodName: string,
    args: Record<string, any> = {},
    deposit: string = '0',
    gas?: string
  ): Promise<{ success: boolean; txHash?: string | null; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Please connect Meteor Wallet (cleartoad8704.testnet) first' };
    }

    // 1. Resolve gas allocation
    let resolvedGasStr = gas || DEFAULT_METHOD_GAS[methodName] || '50000000000000';
    // If passed in Tgas format (e.g. '50.0 Tgas' or '50 Tgas')
    if (resolvedGasStr.toLowerCase().includes('tgas')) {
      const numeric = parseFloat(resolvedGasStr);
      resolvedGasStr = (BigInt(Math.round(numeric * 1e12))).toString();
    }

    let gasUnits: bigint;
    try {
      gasUnits = BigInt(resolvedGasStr);
    } catch {
      return { success: false, error: `Invalid gas allocation specified: "${resolvedGasStr}"` };
    }

    if (gasUnits <= 0n) {
      return { success: false, error: 'Gas allocation must be greater than zero' };
    }
    if (gasUnits > MAX_PROTOCOL_GAS) {
      return {
        success: false,
        error: `Gas allocation of ${Number(gasUnits) / 1e12} Tgas exceeds NEAR protocol limit (300 Tgas)`,
      };
    }

    // 2. Resolve deposit
    let depositYocto = '0';
    if (deposit) {
      const cleanDeposit = deposit.toLowerCase().replace('near', '').trim();
      if (cleanDeposit && cleanDeposit !== '0') {
        try {
          depositYocto = BigInt(cleanDeposit).toString();
        } catch {
          // If in NEAR units (e.g. "0.01")
          depositYocto = (BigInt(Math.round(parseFloat(cleanDeposit) * 1e24))).toString();
        }
      }
    }

    // 3. Construct exact Staged Transaction payload
    const staged: StagedTransaction = {
      network: 'NEAR Public Testnet',
      signerId: accountId,
      receiverId: VAULT_CONTRACT_ID,
      methodName,
      args,
      depositYocto,
      depositNear: depositYocto === '0' ? '0 NEAR' : `${formatNear(depositYocto, 4)} NEAR`,
      gasUnits: gasUnits.toString(),
      gasTgas: `${(Number(gasUnits) / 1e12).toFixed(1)} Tgas`,
    };

    setStagedTx(staged);

    // 4. Await user confirmation via the Pre-Flight Staging Review Modal
    const userConfirmed = await new Promise<boolean>((resolve) => {
      setPendingConfirm(() => resolve);
    });

    setStagedTx(null);
    setPendingConfirm(null);

    if (!userConfirmed) {
      setTxStatus({ state: 'idle' });
      return { success: false, error: 'Transaction was cancelled by user before signing' };
    }

    // 5. User confirmed in modal -> proceed to transaction signing
    setTxStatus({
      state: 'signing',
      message: `Authorizing transaction via session key or wallet (${accountId})...`,
    });

    try {
      if (authType === 'genuine_wallet') {
        const hash = await nearWallet.signAndSendTransaction(
          methodName,
          args,
          staged.depositYocto,
          staged.gasUnits
        );

        if (!hash || typeof hash !== 'string' || hash.trim().length === 0) {
          throw new Error('Transaction execution completed without a verified transaction hash');
        }

        setTxStatus({
          state: 'confirmed',
          message: 'Transaction successfully verified on NEAR Testnet!',
          txHash: hash,
        });

        // Invalidate in-memory RPC cache so dashboard queries fresh on-chain data
        nearRpc.clearCache();

        if (accountId) {
          fetchBalanceForAccount(accountId).catch(console.warn);
        }
        return { success: true, txHash: hash };
      }

      // Fallback for mock evaluation persona if active
      const response = await fetch('/api/tx/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method_name: methodName,
          args,
          signer_id: accountId,
          deposit: staged.depositNear,
          gas: staged.gasTgas,
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

  const transferNativeNear = async (
    receiverId: string,
    yoctoAmount: string
  ): Promise<{ success: boolean; txHash?: string | null; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Please connect a testnet wallet first' };
    }

    if (authType !== 'genuine_wallet') {
      return {
        success: false,
        error: 'Native deposits require genuine Web3 wallet signing (Meteor Wallet or MyNearWallet).',
      };
    }

    setTxStatus({
      state: 'preparing',
      message: `Preparing native NEAR transfer to ${receiverId}...`,
    });

    try {
      setTxStatus({
        state: 'signing',
        message: `Requesting transfer authorization in ${walletId === 'meteor-wallet' ? 'Meteor Wallet' : 'MyNearWallet'} (${accountId})...`,
      });

      const hash = await nearWallet.transferNear(receiverId, yoctoAmount);

      if (!hash || typeof hash !== 'string' || hash.trim().length === 0) {
        throw new Error('Native transfer completed without a verified transaction hash');
      }

      setTxStatus({
        state: 'confirmed',
        message: 'Native transfer successfully verified on NEAR Testnet!',
        txHash: hash,
      });

      // Invalidate in-memory RPC cache so dashboard queries fresh on-chain data
      nearRpc.clearCache();

      if (accountId) {
        fetchBalanceForAccount(accountId).catch(console.warn);
      }

      return { success: true, txHash: hash };
    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Transaction execution error';
      const isRejection = /reject|cancel|closed|user denied|not granted/i.test(errMsg);
      const friendlyError = isRejection ? 'Transaction cancelled by user in wallet.' : errMsg;

      setTxStatus({
        state: 'failed',
        error: friendlyError,
      });
      return { success: false, error: friendlyError };
    }
  };

  if (typeof window !== 'undefined' && Boolean(import.meta.env?.DEV)) {
    (window as any).__testExecuteContractCall = executeContractCall;
  }

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
        transferNativeNear,
      }}
    >
      {children}
      {/* Reusable Pre-Flight Staged Transaction Review Modal */}
      <TxStagingModal
        stagedTx={stagedTx}
        onConfirm={() => pendingConfirm && pendingConfirm(true)}
        onCancel={() => pendingConfirm && pendingConfirm(false)}
      />
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
