import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { parseNearToYocto, formatNear } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import { VaultAccountOverview, VAULT_CONTRACT_ID, EXPECTED_OWNER_ID } from '../../types/contract';
import {
  Send,
  Zap,
  Clock,
  ShieldX,
  ShieldAlert,
  ShieldCheck,
  Lock,
  KeyRound,
  Bot,
} from 'lucide-react';

interface PaymentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  overview: VaultAccountOverview;
  onRefresh: () => void;
}

export const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({
  isOpen,
  onClose,
  overview,
  onRefresh,
}) => {
  const { executeContractCall, accountId, isConnected } = useWallet();

  const [destination, setDestination] = useState(
    overview?.policy?.destination_allowlist?.[0] || 'whiteice2105.testnet'
  );
  const [amountNear, setAmountNear] = useState('0.15');
  const [reason, setReason] = useState('AI Agent Inference Compute Cluster #104');
  const [ttlMinutes, setTtlMinutes] = useState('60');

  // 1. Authorization Pre-flight (Fail-Closed)
  const ownerId = overview?.ownerId || '';
  const authorizedAgents = Array.isArray(overview?.authorizedAgents)
    ? overview.authorizedAgents
    : [];

  const isOwner = Boolean(accountId && ownerId && accountId === ownerId);
  const isAuthorizedAgent = Boolean(
    accountId && authorizedAgents.length > 0 && authorizedAgents.includes(accountId)
  );

  // Separate Authorization from Browser-Wallet Signing Capability:
  // - Vault Owner: Can dispatch administrative requests via connected browser wallet.
  // - Authorized Agent: On-chain authorization is recognized, but autonomous dispatch
  //   requires the agent's headless runtime holding its restricted Function-Call Access Key.
  //   Browser wallets do not hold the agent's restricted key.
  const canBrowserDispatch = isOwner;

  // Signer Role Label & Badge Class
  const signerRoleLabel = isOwner
    ? 'Vault Owner'
    : isAuthorizedAgent
    ? 'Authorized Agent'
    : isConnected
    ? 'Unauthorized External Signer'
    : 'Disconnected';

  const signerBadgeClass = isOwner
    ? 'bg-near-light text-near-dark border-near-green/40'
    : isAuthorizedAgent
    ? 'bg-blue-50 text-blue-800 border-blue-200'
    : isConnected
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-charcoal-100 text-charcoal-600 border-charcoal-200';

  // Preview expected route based on spending policy
  const numAmount = Number(amountNear) || 0;
  const isAllowlisted =
    overview?.policy?.destination_allowlist?.includes(destination.trim()) ?? false;
  const autoThresholdNear = Number(
    formatNear(overview?.policy?.auto_approval_threshold || '0', 4)
  );
  const maxPerTxNear = Number(
    formatNear(overview?.policy?.max_per_transaction || '0', 4)
  );

  let expectedRoute: 'auto' | 'queue' | 'denial' = 'queue';
  let routeExplanation = '';

  if (overview?.isPaused) {
    expectedRoute = 'denial';
    routeExplanation = 'Policy Denial: Vault is currently paused on-chain.';
  } else if (numAmount > maxPerTxNear) {
    expectedRoute = 'denial';
    routeExplanation = `Policy Denial: Amount exceeds Max Per Transaction (${maxPerTxNear} NEAR).`;
  } else if (isAllowlisted && numAmount <= autoThresholdNear) {
    expectedRoute = 'auto';
    routeExplanation = `Route A (Auto-Execution): Allowlisted destination and amount <= ${autoThresholdNear} NEAR.`;
  } else if (!isAllowlisted) {
    expectedRoute = 'queue';
    routeExplanation = 'Route B (Approval Queue): Destination is not in allowlist.';
  } else {
    expectedRoute = 'queue';
    routeExplanation = `Route B (Approval Queue): Amount > Auto-Approval Threshold (${autoThresholdNear} NEAR).`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict security guard: Only the vault owner can dispatch from browser wallet.
    // Autonomous agents require headless execution using their restricted Function-Call Key.
    if (!canBrowserDispatch) {
      console.warn(
        '[PaymentRequestModal] Browser wallet dispatch blocked for non-owner account:',
        accountId
      );
      return;
    }

    if (!destination.trim() || !amountNear) return;

    onClose();

    const ttlNanos =
      BigInt(Math.max(Number(ttlMinutes) || 60, 5)) * 60n * 1_000_000_000n;
    const amountYocto = parseNearToYocto(amountNear);

    const res = await executeContractCall('request_payment', {
      destination: destination.trim(),
      amount: amountYocto,
      reason: reason.trim(),
      ttl_nanos: Number(ttlNanos),
    });

    if (res.success) {
      onRefresh();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Owner Manual Dispatch (Administrative)"
      description={`Dispatches request_payment() from connected owner wallet to ${overview?.contractId || VAULT_CONTRACT_ID}. For autonomous agent signing, use Live Agent Execution.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* DISTINCTION NOTICE */}
        <div className="p-3 rounded-xl bg-near-light/50 border border-near-green/40 text-[11px] text-near-dark flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-sans">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-near-dark shrink-0" />
            <span>Autonomous agent execution uses <code className="font-mono font-bold">agent.cleartoad8704.testnet</code> without owner signing.</span>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="px-2.5 py-1 rounded-lg bg-near-dark text-white font-bold text-[10px] hover:bg-near-green transition-all shrink-0"
          >
            Switch to Live Agent Tab &rarr;
          </button>
        </div>

        {/* SIGNER IDENTIFICATION & ROLE STRIP */}
        <div className="p-3.5 rounded-2xl bg-ivory-warm border border-border text-xs space-y-2 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-charcoal-500 uppercase font-bold">
              Connected Signer
            </span>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${signerBadgeClass}`}
            >
              {signerRoleLabel}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-charcoal-900 truncate max-w-[280px]">
              {accountId || 'No wallet connected'}
            </span>
            <span className="text-[10px] text-charcoal-400 font-sans">
              {canBrowserDispatch ? 'Owner Dispatch Active' : 'Browser Signing Restricted'}
            </span>
          </div>
        </div>

        {/* STATE 1: VAULT OWNER (Browser Dispatch Permitted) */}
        {isOwner && (
          <div className="p-3 rounded-xl bg-near-light/40 border border-near-green/30 text-[11px] text-near-dark flex items-center gap-2 font-sans">
            <ShieldCheck className="w-4 h-4 text-near-dark shrink-0" />
            <span>
              Connected as Vault Owner (<span className="font-mono font-bold">{ownerId}</span>). Administrative payment dispatch enabled.
            </span>
          </div>
        )}

        {/* STATE 2: AUTHORIZED AGENT (Authorization Recognized, Browser Dispatch Separated) */}
        {isAuthorizedAgent && (
          <div className="p-4 rounded-2xl bg-blue-50/90 border border-blue-200 text-xs text-blue-950 space-y-2.5 font-sans">
            <div className="flex items-center gap-2 font-bold font-mono text-xs uppercase text-blue-900">
              <Bot className="w-4 h-4 text-blue-700 shrink-0" />
              <span>On-Chain Agent Authorization Confirmed</span>
            </div>
            <p className="text-[11px] leading-relaxed text-blue-900/90">
              Account <span className="font-mono font-bold text-blue-950">{accountId}</span> is verified as an active authorized agent in the vault contract.
            </p>
            <div className="p-2.5 rounded-xl bg-white/90 border border-blue-200 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 font-mono text-[10px] uppercase">
                <KeyRound className="w-3.5 h-3.5 text-blue-700" />
                <span>Autonomous Agent Runtime Required</span>
              </div>
              <p className="text-[10px] text-blue-900/80 leading-relaxed font-sans">
                Autonomous agents dispatch payments from headless backend daemons holding their restricted Function-Call Access Key (<code className="font-mono font-bold text-blue-950">ed25519:2H8EupC...</code>). Standard browser wallets do not hold or sign with the agent&apos;s restricted key.
              </p>
            </div>
          </div>
        )}

        {/* STATE 3: UNAUTHORIZED EXTERNAL SIGNER */}
        {!isOwner && !isAuthorizedAgent && (
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-xs text-amber-900 space-y-2.5 font-sans">
            <div className="flex items-center gap-2 font-bold font-mono text-xs uppercase text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Agent Signer Validation Guard</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-950/90">
              The deployed contract accepts payment requests only from the vault owner (<span className="font-mono font-bold text-amber-950">{ownerId || EXPECTED_OWNER_ID}</span>) or authorized agents (<span className="font-mono font-bold text-amber-950">{authorizedAgents.join(', ') || 'No active agents'}</span>).
            </p>
            <div className="p-2.5 rounded-xl bg-white/80 border border-amber-200 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 font-mono text-[10px] uppercase">
                <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                <span>Restricted Access Key Required</span>
              </div>
              <p className="text-[10px] text-amber-900/80 leading-relaxed font-sans">
                Autonomous agents dispatch payments programmatically using their dedicated, restricted Function-Call Access Key configured specifically for <code className="font-mono font-bold text-amber-950">request_payment</code>. External personal wallets cannot initiate agent spending intents.
              </p>
            </div>
          </div>
        )}

        {/* Destination Account */}
        <div>
          <label className="text-xs font-semibold text-charcoal-700 block mb-1">
            Destination Account ID
          </label>
          <input
            type="text"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            disabled={!canBrowserDispatch}
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800 disabled:opacity-60 disabled:cursor-not-allowed"
            required
          />
          {/* Preset Buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              disabled={!canBrowserDispatch}
              onClick={() => setDestination(overview?.policy?.destination_allowlist?.[0] || 'whiteice2105.testnet')}
              className="px-2 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-near-dark border border-border font-mono font-bold touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {overview?.policy?.destination_allowlist?.[0] || 'whiteice2105.testnet'} (Allowlisted)
            </button>
            <button
              type="button"
              disabled={!canBrowserDispatch}
              onClick={() => setDestination('unlisted-vendor.testnet')}
              className="px-2 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-amber-800 border border-border font-mono font-bold touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              unlisted-vendor.testnet (New Dest)
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-semibold text-charcoal-700 block mb-1">
            Amount (NEAR)
          </label>
          <input
            type="text"
            value={amountNear}
            onChange={e => setAmountNear(e.target.value)}
            disabled={!canBrowserDispatch}
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800 disabled:opacity-60 disabled:cursor-not-allowed"
            required
          />
          {/* Presets */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              disabled={!canBrowserDispatch}
              onClick={() => setAmountNear('0.15')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              0.15 N (Auto)
            </button>
            <button
              type="button"
              disabled={!canBrowserDispatch}
              onClick={() => setAmountNear('0.5')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              0.5 N (Queue)
            </button>
            <button
              type="button"
              disabled={!canBrowserDispatch}
              onClick={() => setAmountNear('1.5')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              1.5 N (Deny)
            </button>
          </div>
        </div>

        {/* Reason / Memo */}
        <div>
          <label className="text-xs font-semibold text-charcoal-700 block mb-1">
            Payment Audit Reason / Memo
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={!canBrowserDispatch}
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm text-charcoal-900 focus:outline-none focus:border-charcoal-800 disabled:opacity-60 disabled:cursor-not-allowed"
            required
          />
        </div>

        {/* TTL Duration */}
        <div>
          <label className="text-xs font-semibold text-charcoal-700 block mb-1">
            TTL Validity Window (Minutes)
          </label>
          <input
            type="number"
            min="5"
            max="1440"
            value={ttlMinutes}
            onChange={e => setTtlMinutes(e.target.value)}
            disabled={!canBrowserDispatch}
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800 disabled:opacity-60 disabled:cursor-not-allowed"
            required
          />
          <span className="text-[10px] text-charcoal-400 mt-1 block">
            Valid contract TTL bounds: 5 minutes to 24 hours (1440m).
          </span>
        </div>

        {/* Projected Route Preview Card */}
        <div
          className={`p-3.5 rounded-2xl border text-xs ${
            expectedRoute === 'auto'
              ? 'bg-near-light/40 border-near-green/30 text-near-dark'
              : expectedRoute === 'queue'
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 font-bold mb-1">
            {expectedRoute === 'auto' && (
              <Zap className="w-4 h-4 text-near-dark shrink-0" />
            )}
            {expectedRoute === 'queue' && (
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            {expectedRoute === 'denial' && (
              <ShieldX className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span>Projected Contract Outcome</span>
          </div>
          <p className="text-[11px] leading-relaxed font-sans">{routeExplanation}</p>
        </div>

        {/* Action Controls */}
        <div className="pt-3 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900 touch-manipulation"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!canBrowserDispatch}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-soft transition-all touch-manipulation ${
              canBrowserDispatch
                ? 'bg-near-dark hover:bg-near-green text-white cursor-pointer active:scale-[0.98]'
                : 'bg-charcoal-200 text-charcoal-500 cursor-not-allowed border border-charcoal-300'
            }`}
            title={
              isOwner
                ? 'Dispatch administrative payment request as Vault Owner'
                : isAuthorizedAgent
                ? 'Autonomous agent dispatch requires the agent runtime holding its restricted Function-Call Access Key'
                : 'Connected signer is not authorized to submit payment requests'
            }
          >
            {isOwner ? (
              <>
                <Send className="w-3.5 h-3.5 text-white" />
                <span>Dispatch Intent (Owner Admin)</span>
              </>
            ) : isAuthorizedAgent ? (
              <>
                <Bot className="w-3.5 h-3.5 text-charcoal-400" />
                <span>Agent Key Required (CLI / Daemon)</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-charcoal-400" />
                <span>Dispatch Disabled (Unauthorized Signer)</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
