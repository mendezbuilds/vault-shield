import React, { useState } from 'react';
import {
  VaultPaymentRecord,
  getParentTxExplorerUrl,
  getReceiptExplorerUrl,
  getReceiptNearBlocksAnchorUrl,
  RECEIPT_EXPLANATION_NOTE,
  formatReceiptId,
} from '../../services/paymentVerification';
import { RecipientBalanceWidget } from './RecipientBalanceWidget';
import {
  formatNear,
  timeAgo,
  formatTimestamp,
  getExplorerAccountUrl,
  truncateId,
} from '../../utils/formatters';
import {
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  Clock,
  ArrowRight,
  Layers,
  FileCheck,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PaymentReceiptVerificationCardProps {
  payment: VaultPaymentRecord;
  showBalanceWidget?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

export const PaymentReceiptVerificationCard: React.FC<PaymentReceiptVerificationCardProps> = ({
  payment,
  showBalanceWidget = true,
  defaultExpanded = true,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  React.useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);


  const parentTxUrl = getParentTxExplorerUrl(payment.parentTxHash);
  const receiptExplorerUrl = getReceiptExplorerUrl(payment.receiptId);
  const receiptNearBlocksUrl = getReceiptNearBlocksAnchorUrl(payment.parentTxHash, payment.receiptId);

  const isReceiptVerified = Boolean(
    payment.receiptId &&
    payment.receiptId.trim() &&
    !payment.receiptId.toLowerCase().includes('not yet verified')
  );

  return (
    <div
      className={`rounded-3xl bg-white/95 border border-white/90 shadow-card p-5 sm:p-7 font-mono transition-all overflow-hidden relative ${className}`}
    >
      {/* Decorative gradient element */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

      {/* TOP HEADER: Request ID, Execution Path, Amount, and Expansion toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/70">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-extrabold text-xs text-charcoal-900 bg-ivory-warm px-2.5 py-1 rounded-xl border border-border">
            Request #{payment.requestId}
          </span>

          <span className="text-[10px] font-bold uppercase tracking-wider text-near-dark bg-near-light px-2.5 py-1 rounded-full border border-near-green/40 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-near-green" />
            <span>{payment.executionRoute || 'Autonomous Vault Transfer'}</span>
          </span>

          {payment.status === 'PAYMENT_EXECUTED' && (
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Executed On-Chain</span>
            </span>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="text-right">
            <span className="text-base sm:text-xl font-black text-near-dark">
              {payment.amountNear} <span className="text-xs text-charcoal-500 font-normal">NEAR</span>
            </span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-ivory-warm hover:bg-border/60 text-charcoal-600 transition-colors"
            title={isExpanded ? 'Collapse verification details' : 'Expand verification details'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 1. SEPARATE 3-PART VERIFICATION STATUS BAR (Requirement 5) */}
      <div className="mt-4 p-3.5 rounded-2xl bg-ivory-warm/60 border border-border/80">
        <div className="text-[10px] font-bold uppercase tracking-widest text-charcoal-400 mb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-near-dark" />
          <span>Multi-Stage On-Chain Verification Status</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* Stage 1: Parent Transaction */}
          <div className="p-2.5 rounded-xl bg-white border border-border flex items-center justify-between gap-2">
            <div>
              <span className="text-[9px] text-charcoal-400 block uppercase">1. Parent Transaction</span>
              <span className="font-bold text-charcoal-800 text-[11px]">Contract Call</span>
            </div>
            {payment.parentTxConfirmed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Confirmed</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>Pending</span>
              </span>
            )}
          </div>

          {/* Stage 2: Transfer Receipt */}
          <div className="p-2.5 rounded-xl bg-white border border-border flex items-center justify-between gap-2">
            <div>
              <span className="text-[9px] text-charcoal-400 block uppercase">2. Transfer Receipt</span>
              <span className="font-bold text-charcoal-800 text-[11px]">Downstream Payout</span>
            </div>
            {payment.receiptConfirmed && isReceiptVerified ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                <FileCheck className="w-3 h-3 text-emerald-600" />
                <span>Confirmed</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                <span>Not Yet Verified</span>
              </span>
            )}
          </div>

          {/* Stage 3: Recipient Balance */}
          <div className="p-2.5 rounded-xl bg-white border border-border flex items-center justify-between gap-2">
            <div>
              <span className="text-[9px] text-charcoal-400 block uppercase">3. Recipient Balance</span>
              <span className="font-bold text-charcoal-800 text-[11px]">FastNear View</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-near-dark bg-near-light px-2 py-0.5 rounded-md border border-near-green/40 shrink-0">
              <CheckCircle2 className="w-3 h-3 text-near-green" />
              <span>Verifiable RPC</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. TRANSACTION AND RECEIPT DETAILS (Strictly Distinguished - Requirement 1) */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
        {/* Box A: Parent Transaction (Contract Invocator) */}
        <div className="p-4 rounded-2xl bg-white border border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-charcoal-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Parent Transaction</span>
            </span>
            <span className="text-[9px] font-mono text-charcoal-400">Vault Contract Call</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-charcoal-400">Signer / Agent:</span>
              <span className="font-bold text-charcoal-800 truncate max-w-[200px]">
                {payment.signerId || 'agent.cleartoad8704.testnet'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-charcoal-400">Vault Contract:</span>
              <span className="font-bold text-charcoal-800 truncate max-w-[200px]">
                {payment.senderVault}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            <div className="text-[10px] text-charcoal-400 uppercase font-bold mb-1">
              Parent Transaction Hash:
            </div>
            <div className="font-mono text-[11px] font-bold text-charcoal-900 break-all bg-ivory-warm/60 p-2 rounded-xl border border-border/80">
              {payment.parentTxHash}
            </div>
          </div>

          {/* Labeled Explorer Link for Parent Tx (Requirement 2) */}
          {parentTxUrl && (
            <div className="pt-1">
              <a
                href={parentTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ivory-warm hover:bg-charcoal-100 text-charcoal-800 border border-border text-xs font-bold transition-all"
                title="Inspect the parent contract call transaction on NearBlocks"
              >
                <span>Inspect Parent Tx (NearBlocks)</span>
                <ExternalLink className="w-3 h-3 text-charcoal-500 shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Box B: Transfer Receipt (Downstream Fund Transfer) */}
        <div className="p-4 rounded-2xl bg-white border border-near-green/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-near-dark flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-near-green" />
              <span>Downstream Transfer Receipt</span>
            </span>
            <span className="text-[9px] font-mono text-near-dark/80">Funds Transferred To Recipient</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-charcoal-400">Recipient:</span>
              <a
                href={getExplorerAccountUrl(payment.recipient)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-charcoal-900 hover:text-near-dark underline truncate max-w-[200px] inline-flex items-center gap-1"
              >
                <span>{payment.recipient}</span>
                <ExternalLink className="w-2.5 h-2.5 text-charcoal-400" />
              </a>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-charcoal-400">Transfer Amount:</span>
              <span className="font-extrabold text-near-dark">
                {payment.amountNear} NEAR
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            <div className="text-[10px] text-charcoal-400 uppercase font-bold mb-1">
              Transfer Receipt ID:
            </div>
            {isReceiptVerified ? (
              <div className="font-mono text-[11px] font-bold text-near-dark break-all bg-near-light/30 p-2 rounded-xl border border-near-green/30">
                {payment.receiptId}
              </div>
            ) : (
              <div className="font-sans text-xs text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
                {formatReceiptId(payment.receiptId)}
              </div>
            )}
          </div>

          {/* Labeled Explorer Link for Transfer Receipt (Requirement 2: No speculative URLs!) */}
          <div className="pt-1">
            {receiptExplorerUrl ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href={receiptExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold transition-all shadow-soft"
                  title="Inspect actual transfer receipt on official NEAR Explorer"
                >
                  <span>Receipt (NEAR Explorer)</span>
                  <ExternalLink className="w-3 h-3 text-near-green shrink-0" />
                </a>

                {receiptNearBlocksUrl && (
                  <a
                    href={receiptNearBlocksUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ivory-warm hover:bg-charcoal-100 text-charcoal-800 border border-border text-xs font-bold transition-all"
                    title="View receipt execution node in NearBlocks Execution Plan"
                  >
                    <span>Receipt Plan (NearBlocks)</span>
                    <ExternalLink className="w-3 h-3 text-charcoal-500 shrink-0" />
                  </a>
                )}
              </div>
            ) : (
              <div className="py-2 text-center text-[11px] text-charcoal-400 font-sans italic bg-ivory-warm/40 rounded-xl border border-border/60">
                Explorer link unavailable until receipt execution is indexed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. ADDITIONAL TELEMETRY: BLOCK HEIGHT, TIMESTAMP, REASON */}
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
        <div className="p-3 rounded-xl bg-ivory-warm/50 border border-border">
          <span className="text-[10px] text-charcoal-400 uppercase block">Block Height</span>
          <span className="font-extrabold text-charcoal-900 block mt-0.5">
            {payment.blockHeight ? `#${payment.blockHeight.toLocaleString()}` : 'Pending Confirmation'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-ivory-warm/50 border border-border">
          <span className="text-[10px] text-charcoal-400 uppercase block">Settlement Time</span>
          <span className="font-bold text-charcoal-900 block mt-0.5 truncate">
            {payment.timestamp ? (
              <span title={formatTimestamp(payment.timestamp * 1_000_000)}>
                {timeAgo(payment.timestamp * 1_000_000)}
              </span>
            ) : (
              'Just now'
            )}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-ivory-warm/50 border border-border">
          <span className="text-[10px] text-charcoal-400 uppercase block">Disbursement Reason</span>
          <span className="font-medium text-charcoal-700 block mt-0.5 truncate" title={payment.reason}>
            {payment.reason || 'Autonomous agent payment'}
          </span>
        </div>
      </div>

      {/* 4. EXPANDABLE SECTION: RECIPIENT BALANCE VERIFICATION & INFORMATIONAL NOTE */}
      {isExpanded && (
        <div className="mt-4 space-y-4 pt-4 border-t border-border/70">
          {/* Informational Note (Requirement 4) */}
          <div className="p-4 rounded-2xl bg-near-light/40 border border-near-green/30 text-xs font-sans text-charcoal-700 flex items-start gap-3">
            <Info className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold font-mono text-near-dark uppercase text-[10px] block">
                Understanding Contract Transfers vs. Meteor Wallet Activity
              </span>
              <p className="leading-relaxed text-[11px] sm:text-xs">
                {RECEIPT_EXPLANATION_NOTE}
              </p>
            </div>
          </div>

          {/* Live Recipient Balance Verification Widget (Requirement 3) */}
          {showBalanceWidget && (
            <RecipientBalanceWidget recipientAccountId={payment.recipient} />
          )}
        </div>
      )}
    </div>
  );
};
