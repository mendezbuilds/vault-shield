import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { VaultAccountOverview, VAULT_CONTRACT_ID } from '../../types/contract';
import { useWallet } from '../../context/WalletContext';
import { formatNear, getExplorerAccountUrl } from '../../utils/formatters';
import {
  validateDepositAmount,
  getMaxSpendableNear,
  RECOMMENDED_GAS_RESERVE_YOCTO,
} from '../../utils/depositValidation';
import { WalletModal } from '../common/WalletModal';
import {
  Coins,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Wallet,
  Zap,
  Lock,
} from 'lucide-react';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  overview: VaultAccountOverview;
  onRefresh: () => Promise<void> | void;
}

type DepositStep =
  | 'input'
  | 'review'
  | 'awaiting'
  | 'processing'
  | 'success'
  | 'rejected'
  | 'failed';

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  overview,
  onRefresh,
}) => {
  const {
    accountId,
    role,
    authType,
    walletId,
    walletBalance,
    isBalanceLoading,
    isConnected,
    refreshBalance,
    transferNativeNear,
  } = useWallet();

  const [step, setStep] = useState<DepositStep>('input');
  const [amount, setAmount] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Reset state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setAmount('');
      setTxHash(null);
      setErrorMessage(null);
      setCopiedTx(false);
      setRefreshFailed(false);
      setIsRefreshingBalances(false);
    }
  }, [isOpen]);

  const isOwner =
    accountId === overview.ownerId ||
    accountId === 'owner.vault-parent.testnet' ||
    role === 'owner';

  // Validation
  const validation = validateDepositAmount(amount, walletBalance);
  const maxSpendable = getMaxSpendableNear(walletBalance);

  // Preset handler
  const handlePreset = (val: string) => {
    setAmount(val);
  };

  const handleCopyHash = () => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  // Perform post-transaction refresh of both vault data and wallet balance
  const executePostTxRefresh = async () => {
    setIsRefreshingBalances(true);
    setRefreshFailed(false);
    try {
      await Promise.all([
        Promise.resolve(onRefresh()),
        refreshBalance(),
      ]);
    } catch (err) {
      console.warn('[DepositModal] Post-tx refresh error:', err);
      setRefreshFailed(true);
    } finally {
      setIsRefreshingBalances(false);
    }
  };

  // Main deposit execution handler
  const handleExecuteDeposit = async () => {
    if (!validation.valid || !validation.yoctoAmount) return;

    setStep('awaiting');
    setErrorMessage(null);

    try {
      const res = await transferNativeNear(overview.contractId, validation.yoctoAmount);

      if (res.success && res.txHash) {
        setTxHash(res.txHash);
        setStep('success');
        // Asynchronously refresh balances
        executePostTxRefresh();
      } else {
        const err = res.error || 'Transaction execution failed';
        if (err.includes('cancelled') || err.includes('rejected')) {
          setErrorMessage(err);
          setStep('rejected');
        } else {
          setErrorMessage(err);
          setStep('failed');
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Unexpected deposit error';
      if (/reject|cancel|closed/i.test(errMsg)) {
        setErrorMessage('Transaction was cancelled in the wallet.');
        setStep('rejected');
      } else {
        setErrorMessage(errMsg);
        setStep('failed');
      }
    }
  };

  // Pre-calculated projected balances
  const currentTotal = BigInt(overview.totalAccountBalance || '0');
  const depositYocto = validation.yoctoAmount ? BigInt(validation.yoctoAmount) : 0n;
  const projectedTotalYocto = (currentTotal + depositYocto).toString();

  const currentLiquid = BigInt(overview.availableLiquidBalance || '0');
  const projectedLiquidYocto = (currentLiquid + depositYocto).toString();

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (step !== 'awaiting' && step !== 'processing') {
            onClose();
          }
        }}
        title="Deposit Native NEAR to Vault Shield"
        description="Fund the autonomous vault with native NEAR tokens. Transferred capital increases total vault solvency and unreserved liquid balance."
        maxWidth="md"
      >
        <div className="space-y-5">
          {/* STATE 1: WALLET NOT CONNECTED */}
          {!isConnected && (
            <div className="p-6 rounded-2xl bg-ivory-warm/90 border border-border text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-surface-white border border-border text-near-dark flex items-center justify-center mx-auto shadow-soft">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-charcoal-900">
                  Web3 Wallet Required
                </h4>
                <p className="text-xs text-charcoal-600 mt-1 max-w-sm mx-auto leading-relaxed">
                  Connect Meteor Wallet or MyNearWallet to deposit native NEAR into Vault Shield.
                </p>
              </div>
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
              >
                <Wallet className="w-4 h-4" />
                <span>Connect Wallet</span>
              </button>
            </div>
          )}

          {/* STATE 2: EVALUATION PERSONA NOTICE */}
          {isConnected && authType === 'evaluation_persona' && (
            <div className="p-5 rounded-2xl bg-near-light/40 border border-near-green/30 text-xs text-charcoal-700 space-y-3">
              <div className="flex items-center gap-2 font-bold text-near-dark font-mono text-xs uppercase">
                <ShieldCheck className="w-4 h-4 text-near-dark shrink-0" />
                <span>Simulated Persona Mode Active ({accountId})</span>
              </div>
              <p className="text-xs text-charcoal-600 leading-relaxed font-sans">
                Simulated evaluation personas cannot execute authentic on-chain transfers. To deposit native NEAR into this vault on NEAR Testnet, connect an authentic Web3 wallet (such as Meteor Wallet or MyNearWallet).
              </p>
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Connect Web3 Wallet</span>
              </button>
            </div>
          )}

          {/* STEPS FOR AUTHENTIC CONNECTED WALLET (PERMISSIONLESS DEPOSITS) */}
          {isConnected && authType === 'genuine_wallet' && (
            <>
              {/* STEP: INPUT */}
              {step === 'input' && (
                <div className="space-y-4">
                  {/* Permissionless Funding Informational Notice (Requirement 3) */}
                  <div className="p-3.5 rounded-2xl bg-ivory-warm border border-border text-xs text-charcoal-700 space-y-1 font-sans">
                    <div className="flex items-center gap-1.5 font-bold text-charcoal-900 text-[11px] font-mono uppercase">
                      <ShieldCheck className="w-4 h-4 text-near-dark shrink-0" />
                      <span>Permissionless Funding Notice</span>
                    </div>
                    <p className="text-[11px] text-charcoal-600 leading-relaxed">
                      Anyone can fund this vault. Depositing NEAR increases the vault&apos;s operational capital but does not grant ownership, withdrawal rights, or administrative permissions. Vault administration remains restricted to the recognized owner (<span className="font-mono font-bold text-charcoal-800">{overview.ownerId}</span>).
                    </p>
                  </div>

                  {/* Account Metadata Telemetry Strip */}
                  <div className="p-4 rounded-2xl bg-ivory-warm/80 border border-border text-xs space-y-2.5 font-mono">
                    <div className="flex items-center justify-between text-charcoal-500">
                      <span>Destination Vault:</span>
                      <span className="font-bold text-charcoal-900 truncate max-w-[200px]" title={overview.contractId}>
                        {overview.contractId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-charcoal-500">
                      <span>Connected Signer:</span>
                      <span className="font-bold text-charcoal-900 truncate max-w-[200px]">
                        {accountId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/70 text-charcoal-700">
                      <span>Available Wallet Balance:</span>
                      <span className="font-extrabold text-near-dark">
                        {isBalanceLoading ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Querying...
                          </span>
                        ) : (
                          `${formatNear(walletBalance || '0', 4)} NEAR`
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-charcoal-700 font-mono">
                        Deposit Amount
                      </label>
                      <span className="text-[11px] font-mono text-charcoal-500">
                        Max spendable: <span className="font-bold text-charcoal-900">{maxSpendable} NEAR</span>
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="e.g. 1.0"
                        className={`w-full px-4 py-3.5 rounded-2xl border text-base font-mono font-bold bg-surface-white focus:outline-none transition-all pr-18 ${
                          amount && !validation.valid
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-200'
                            : 'border-border focus:border-near-green focus:ring-1 focus:ring-near-green/30'
                        }`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-charcoal-500">
                        NEAR
                      </span>
                    </div>

                    {/* Validation Error Banner */}
                    {amount && !validation.valid && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{validation.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Preset Amount Chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-charcoal-400">
                      Presets:
                    </span>
                    {['0.1', '0.5', '1.0'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePreset(preset)}
                        className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-surface-white hover:bg-ivory-warm border border-border text-charcoal-800 shadow-soft transition-all"
                      >
                        +{preset} N
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handlePreset(maxSpendable)}
                      disabled={maxSpendable === '0'}
                      className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-near-light hover:bg-near-green/20 border border-near-green/30 text-near-dark transition-all disabled:opacity-50"
                    >
                      Max Spendable
                    </button>
                  </div>

                  {/* Network Gas Reserve Notice */}
                  <div className="p-3 rounded-xl bg-ivory-warm/60 border border-border/70 text-[11px] font-mono text-charcoal-500 flex items-center justify-between">
                    <span>Network transfer fee reserve:</span>
                    <span className="font-bold text-charcoal-700">~0.005 NEAR kept in wallet</span>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-charcoal-700 hover:bg-ivory-warm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!validation.valid}
                      onClick={() => setStep('review')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>Review Deposit</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: REVIEW */}
              {step === 'review' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-near-light/30 border border-near-green/30 text-left">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark block mb-1">
                      REVIEW DEPOSIT SUMMARY
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black font-mono text-charcoal-900">
                        {amount}
                      </span>
                      <span className="text-base font-bold font-mono text-near-dark">NEAR</span>
                    </div>
                  </div>

                  {/* Execution Details Table */}
                  <div className="space-y-2 text-xs font-mono border border-border rounded-2xl p-4 bg-surface-white">
                    <div className="flex justify-between py-1 border-b border-border/70">
                      <span className="text-charcoal-500">Action:</span>
                      <span className="font-bold text-charcoal-900">Native Transfer (actionCreators.transfer)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/70">
                      <span className="text-charcoal-500">Signer (From):</span>
                      <span className="font-bold text-charcoal-900">{accountId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/70">
                      <span className="text-charcoal-500">Vault (To):</span>
                      <span className="font-bold text-charcoal-900">{overview.contractId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/70">
                      <span className="text-charcoal-500">Current Total Solvency:</span>
                      <span className="font-bold text-charcoal-800">{formatNear(overview.totalAccountBalance, 3)} NEAR</span>
                    </div>
                    <div className="flex justify-between py-1 pt-1.5 text-near-dark font-extrabold">
                      <span>Post-Deposit Total Solvency:</span>
                      <span>{formatNear(projectedTotalYocto, 3)} NEAR</span>
                    </div>
                  </div>

                  {/* Solvency Protection Notice */}
                  <div className="p-3.5 rounded-2xl bg-ivory-warm border border-border text-[11px] text-charcoal-600 leading-relaxed font-sans">
                    <div className="font-bold text-charcoal-800 mb-0.5 flex items-center gap-1.5 font-mono text-xs">
                      <ShieldCheck className="w-4 h-4 text-near-dark shrink-0" />
                      <span>Mathematical Solvency Guarantee</span>
                    </div>
                    Native transfer directly inflates contract custody. Forward storage rent ({formatNear(overview.storageReserveRequirement, 3)} N) and active reservations ({formatNear(overview.pendingReserved, 3)} N) remain strictly quarantined.
                  </div>

                  {/* Buttons */}
                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-charcoal-700 hover:bg-ivory-warm transition-colors"
                    >
                      Back to Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteDeposit}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
                    >
                      <Coins className="w-4 h-4" />
                      <span>Confirm & Sign in Wallet</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: AWAITING WALLET APPROVAL */}
              {step === 'awaiting' && (
                <div className="py-8 text-center space-y-4">
                  <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                    <Loader2 className="w-16 h-16 text-near-dark animate-spin" />
                    <Coins className="w-6 h-6 text-near-dark absolute" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-charcoal-900">
                      Awaiting Wallet Signature
                    </h4>
                    <p className="text-xs text-charcoal-600 mt-1 max-w-sm mx-auto font-sans leading-relaxed">
                      Please approve the <span className="font-bold font-mono text-charcoal-900">{amount} NEAR</span> transfer in your {walletId === 'meteor-wallet' ? 'Meteor Wallet' : 'MyNearWallet'} window.
                    </p>
                  </div>
                  <div className="text-[11px] font-mono text-charcoal-400">
                    Signing as {accountId} &bull; Destination: {overview.contractId}
                  </div>
                </div>
              )}

              {/* STEP: PROCESSING */}
              {step === 'processing' && (
                <div className="py-8 text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-near-dark animate-spin mx-auto" />
                  <div>
                    <h4 className="text-base font-bold text-charcoal-900">
                      Processing On-Chain Transfer
                    </h4>
                    <p className="text-xs text-charcoal-600 mt-1 font-sans">
                      Broadcasting native transfer to NEAR Public Testnet and awaiting block finality...
                    </p>
                  </div>
                </div>
              )}

              {/* STEP: SUCCESS */}
              {step === 'success' && (
                <div className="space-y-4 py-2">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-near-light border border-near-green/40 flex items-center justify-center mx-auto text-near-dark">
                      <CheckCircle2 className="w-7 h-7 text-near-green" />
                    </div>
                    <h4 className="text-base sm:text-lg font-extrabold text-charcoal-900">
                      Deposit Successfully Confirmed!
                    </h4>
                    <p className="text-xs text-charcoal-600 font-sans">
                      Successfully transferred <span className="font-bold font-mono text-charcoal-900">{amount} NEAR</span> to Vault Shield.
                    </p>
                  </div>

                  {/* Transaction Hash & Explorer Link */}
                  {txHash && (
                    <div className="p-3.5 rounded-2xl bg-ivory-warm border border-border text-xs font-mono space-y-2">
                      <div className="flex items-center justify-between text-charcoal-500 text-[10px] uppercase font-bold">
                        <span>Transaction Hash</span>
                        <a
                          href={`https://testnet.nearblocks.io/txns/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-near-dark hover:underline"
                        >
                          <span>View on NearBlocks</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-white border border-border">
                        <span className="truncate font-bold text-charcoal-800 text-[11px]">
                          {txHash}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyHash}
                          title="Copy transaction hash"
                          className="p-1 rounded text-charcoal-500 hover:text-charcoal-900 transition-colors"
                        >
                          {copiedTx ? <Check className="w-3.5 h-3.5 text-near-green" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Solvency Tiers After Deposit */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-surface-white border border-border">
                      <div className="text-[10px] text-charcoal-400 uppercase font-bold">Total Vault Balance</div>
                      <div className="text-sm font-extrabold text-charcoal-900 mt-0.5">
                        {formatNear(projectedTotalYocto, 3)} NEAR
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-white border border-border">
                      <div className="text-[10px] text-charcoal-400 uppercase font-bold">Available Liquid</div>
                      <div className="text-sm font-extrabold text-near-dark mt-0.5">
                        {formatNear(projectedLiquidYocto, 3)} NEAR
                      </div>
                    </div>
                  </div>

                  {/* Balance Refresh Feedback / Fallback */}
                  {isRefreshingBalances ? (
                    <div className="p-3 rounded-xl bg-near-light/30 border border-near-green/30 flex items-center justify-center gap-2 text-xs font-mono text-near-dark">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating live on-chain balances from NEAR RPC...</span>
                    </div>
                  ) : refreshFailed ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5 text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-[11px]">Deposit confirmed! RPC telemetry sync timed out.</span>
                      </div>
                      <button
                        type="button"
                        onClick={executePostTxRefresh}
                        className="px-2.5 py-1 rounded bg-surface-white border border-amber-300 text-amber-950 font-bold hover:bg-ivory-warm text-[10px]"
                      >
                        Retry Sync
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-[11px] font-mono text-near-dark font-bold">
                      ✓ All on-chain balances synchronized
                    </div>
                  )}

                  {/* Done Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-3 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: REJECTED */}
              {step === 'rejected' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-800">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-charcoal-900">
                      Transaction Cancelled
                    </h4>
                    <p className="text-xs text-charcoal-600 mt-1 max-w-sm mx-auto font-sans leading-relaxed">
                      {errorMessage || 'The deposit request was cancelled or declined in your wallet. No NEAR tokens were transferred.'}
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-charcoal-700 hover:bg-ivory-warm transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('review')}
                      className="px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: FAILED */}
              {step === 'failed' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center mx-auto text-rose-800">
                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-charcoal-900">
                      Deposit Failed
                    </h4>
                    <p className="text-xs text-rose-700 mt-1 max-w-sm mx-auto font-mono text-[11px] break-words">
                      {errorMessage || 'Failed to broadcast transaction to NEAR testnet.'}
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-charcoal-700 hover:bg-ivory-warm transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('review')}
                      className="px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
};

