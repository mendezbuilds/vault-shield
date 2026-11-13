import React, { useState, useEffect, useCallback } from 'react';
import {
  queryRecipientBalance,
  RecipientBalanceReport,
} from '../../services/paymentVerification';
import { getExplorerAccountUrl, timeAgo, formatTimestamp } from '../../utils/formatters';
import {
  RefreshCw,
  Wallet,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface RecipientBalanceWidgetProps {
  recipientAccountId: string;
  autoFetch?: boolean;
  compact?: boolean;
  className?: string;
}

export const RecipientBalanceWidget: React.FC<RecipientBalanceWidgetProps> = ({
  recipientAccountId,
  autoFetch = true,
  compact = false,
  className = '',
}) => {
  const [balance, setBalance] = useState<RecipientBalanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = useCallback(
    async (forceRefresh = false) => {
      if (!recipientAccountId) return;
      setIsLoading(true);
      try {
        const report = await queryRecipientBalance(recipientAccountId, { forceRefresh });
        setBalance(report);
      } catch (err: any) {
        setBalance(prev =>
          prev
            ? {
                ...prev,
                isStale: true,
                status: 'error',
                errorMessage: err?.message || 'Failed to refresh balance via FastNear RPC',
              }
            : {
                accountId: recipientAccountId,
                totalNear: '0',
                totalYocto: '0',
                availableNear: '0',
                availableYocto: '0',
                storageReservedNear: '0',
                storageReservedYocto: '0',
                storageUsageBytes: 0,
                lastVerifiedAt: null,
                isStale: false,
                status: 'error',
                errorMessage: err?.message || 'RPC balance query failed',
              }
        );
      } finally {
        setIsLoading(false);
      }
    },
    [recipientAccountId]
  );

  useEffect(() => {
    if (autoFetch && recipientAccountId) {
      fetchBalance(false);
    }
  }, [autoFetch, recipientAccountId, fetchBalance]);

  if (compact) {
    return (
      <div className={`p-3 rounded-2xl bg-ivory-warm/60 border border-border/80 text-xs font-mono ${className}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-charcoal-500 text-[10px] uppercase font-bold">
            <Wallet className="w-3.5 h-3.5 text-near-dark" />
            <span>Recipient Live Balance</span>
          </div>
          <button
            onClick={() => fetchBalance(true)}
            disabled={isLoading}
            className="p-1 rounded-lg hover:bg-white text-charcoal-400 hover:text-near-dark transition-all disabled:opacity-50"
            title="Manual refresh on-chain balance"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-near-green' : ''}`} />
          </button>
        </div>

        {balance?.status === 'success' || (balance && balance.isStale) ? (
          <div>
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-extrabold text-near-dark text-sm">
                {balance.availableNear} <span className="text-[10px] text-charcoal-500 font-normal">NEAR spendable</span>
              </span>
              <span className="text-[10px] text-charcoal-400 font-sans">
                (Total: {balance.totalNear})
              </span>
            </div>
            {balance.isStale && (
              <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                Potentially outdated (RPC uncontactable)
              </span>
            )}
          </div>
        ) : isLoading ? (
          <div className="text-[11px] text-charcoal-400 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3 animate-spin text-near-green" />
            <span>Querying FastNear RPC...</span>
          </div>
        ) : (
          <div className="text-[11px] text-rose-700">
            {balance?.errorMessage || 'Balance unavailable'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-white/95 border border-near-green/30 shadow-soft font-mono ${className}`}>
      {/* Header & Refresh Action */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-near-light text-near-dark border border-near-green/30">
            <Wallet className="w-4 h-4 text-near-dark" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h5 className="text-xs sm:text-sm font-extrabold text-charcoal-900 tracking-tight">
                Live Recipient On-Chain Verification
              </h5>
              <span className="text-[9px] font-bold text-near-dark bg-near-light px-2 py-0.5 rounded-full border border-near-green/40">
                FASTNEAR RPC
              </span>
            </div>
            <p className="text-[10px] text-charcoal-500 font-sans mt-0.5">
              Read-only authoritative ledger state on NEAR Public Testnet
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchBalance(true)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ivory-warm hover:bg-white text-charcoal-800 border border-border text-[11px] font-bold shadow-soft transition-all touch-manipulation disabled:opacity-50"
          title="Query latest balance from FastNear RPC"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-near-dark ${isLoading ? 'animate-spin text-near-green' : ''}`} />
          <span>{isLoading ? 'Verifying...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Recipient Account Meta */}
      <div className="mt-3 flex items-center justify-between text-xs pb-3 border-b border-border/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] uppercase font-bold text-charcoal-400 shrink-0">Recipient Account:</span>
          <a
            href={getExplorerAccountUrl(recipientAccountId)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-charcoal-900 hover:text-near-dark underline truncate inline-flex items-center gap-1"
          >
            <span>{recipientAccountId}</span>
            <ExternalLink className="w-3 h-3 text-charcoal-400 shrink-0" />
          </a>
        </div>

        <div className="text-[10px] text-charcoal-400 shrink-0 text-right font-sans">
          {balance?.lastVerifiedAt ? (
            <span title={formatTimestamp(balance.lastVerifiedAt * 1_000_000)}>
              Verified {timeAgo(balance.lastVerifiedAt * 1_000_000)}
            </span>
          ) : (
            <span>Not yet verified</span>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !balance && (
        <div className="py-6 text-center text-xs text-charcoal-500 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-near-green" />
          <span>Querying FastNear RPC for latest account balance...</span>
        </div>
      )}

      {/* Error state without cache */}
      {balance?.status === 'error' && !balance.isStale && !isLoading && (
        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Verification Error</div>
            <div className="text-[11px] font-sans mt-0.5">{balance.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Stale warning when RPC fails but prior balance exists */}
      {balance?.isStale && (
        <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] font-sans leading-relaxed">
            <span className="font-bold font-mono uppercase mr-1">Potentially Outdated:</span>
            {balance.errorMessage || 'RPC request failed. Displaying last verified on-chain result.'}
          </div>
        </div>
      )}

      {/* Authoritative Balances Grid */}
      {balance && (balance.status === 'success' || balance.isStale) && (
        <div className="mt-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {/* 1. Spendable / Available Balance */}
            <div className="p-3 rounded-xl bg-near-light/40 border border-near-green/40">
              <span className="text-[10px] text-near-dark uppercase font-bold block">
                Spendable / Available
              </span>
              <div className="font-black text-near-dark text-base sm:text-lg mt-0.5">
                {balance.availableNear} <span className="text-[10px] text-near-dark/80 font-normal">NEAR</span>
              </div>
              <span className="text-[9px] text-charcoal-500 font-sans block mt-0.5">
                Available to send immediately
              </span>
            </div>

            {/* 2. Total Account Balance */}
            <div className="p-3 rounded-xl bg-ivory-warm/70 border border-border">
              <span className="text-[10px] text-charcoal-500 uppercase font-bold block">
                Total Account Balance
              </span>
              <div className="font-bold text-charcoal-900 text-base sm:text-lg mt-0.5">
                {balance.totalNear} <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
              </div>
              <span className="text-[9px] text-charcoal-400 font-sans block mt-0.5">
                Includes storage-staked NEAR
              </span>
            </div>

            {/* 3. Storage Reserved */}
            <div className="p-3 rounded-xl bg-ivory-warm/70 border border-border">
              <span className="text-[10px] text-charcoal-500 uppercase font-bold block flex items-center gap-1">
                <Lock className="w-3 h-3 text-charcoal-400" />
                <span>Storage Reserved</span>
              </span>
              <div className="font-bold text-charcoal-800 text-sm mt-0.5">
                {balance.storageReservedNear} <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
              </div>
              <span className="text-[9px] text-charcoal-400 font-sans block mt-0.5">
                {balance.storageUsageBytes} bytes used on-chain
              </span>
            </div>
          </div>

          {/* Authoritative Protocol Clarification (Requirement 3: Never label total balance as available-to-send) */}
          <div className="p-3 rounded-xl bg-near-light/30 border border-near-green/30 text-[11px] font-sans text-charcoal-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-near-green shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold font-mono text-near-dark uppercase mr-1">Authoritative NEAR RPC:</span>
              NEAR Protocol strictly locks <span className="font-mono font-bold">{balance.storageReservedNear} NEAR</span> to maintain account and key storage. The recipient's true available-to-send balance is <span className="font-mono font-bold text-near-dark">{balance.availableNear} NEAR</span>. Do not rely on Meteor Wallet's displayed number as authoritative.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
