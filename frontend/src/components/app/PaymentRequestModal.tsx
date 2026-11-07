import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { parseNearToYocto, formatNear } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import { VaultAccountOverview } from '../../types/contract';
import { Send, Zap, Clock, ShieldX } from 'lucide-react';

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
  const { executeContractCall } = useWallet();

  const [destination, setDestination] = useState('merchant.vault-parent.testnet');
  const [amountNear, setAmountNear] = useState('0.15');
  const [reason, setReason] = useState('AI Agent Inference Compute Cluster #104');
  const [ttlMinutes, setTtlMinutes] = useState('60');

  // Preview expected route based on spending policy
  const numAmount = Number(amountNear) || 0;
  const isAllowlisted = overview.policy.destination_allowlist.includes(destination.trim());
  const autoThresholdNear = Number(formatNear(overview.policy.auto_approval_threshold, 4));
  const maxPerTxNear = Number(formatNear(overview.policy.max_per_transaction, 4));

  let expectedRoute: 'auto' | 'queue' | 'denial' = 'queue';
  let routeExplanation = '';

  if (overview.isPaused) {
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
    if (!destination.trim() || !amountNear) return;

    onClose();

    const ttlNanos = BigInt(Math.max(Number(ttlMinutes) || 60, 5)) * 60n * 1_000_000_000n;
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
      title="Submit Agent Payment Request"
      description="Dispatches request_payment() directly to contract.vault-parent.testnet."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Destination Account */}
        <div>
          <label className="text-xs font-semibold text-charcoal-700 block mb-1">
            Destination Account ID
          </label>
          <input
            type="text"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
            required
          />
          {/* Preset Buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => setDestination('merchant.vault-parent.testnet')}
              className="px-2 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-near-dark border border-border font-mono font-bold touch-manipulation"
            >
              merchant.vault-parent.testnet (Allowlisted)
            </button>
            <button
              type="button"
              onClick={() => setDestination('unlisted-vendor.vault-parent.testnet')}
              className="px-2 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-amber-800 border border-border font-mono font-bold touch-manipulation"
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
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
            required
          />
          {/* Presets */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => setAmountNear('0.15')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation"
            >
              0.15 N (Auto)
            </button>
            <button
              type="button"
              onClick={() => setAmountNear('0.5')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation"
            >
              0.5 N (Queue)
            </button>
            <button
              type="button"
              onClick={() => setAmountNear('1.5')}
              className="px-2.5 py-1 rounded-lg bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border font-mono font-bold touch-manipulation"
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
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm text-charcoal-900 focus:outline-none focus:border-charcoal-800"
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
            className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
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
            {expectedRoute === 'auto' && <Zap className="w-4 h-4 text-near-dark shrink-0" />}
            {expectedRoute === 'queue' && <Clock className="w-4 h-4 text-amber-700 shrink-0" />}
            {expectedRoute === 'denial' && <ShieldX className="w-4 h-4 text-rose-700 shrink-0" />}
            <span>Projected Contract Outcome</span>
          </div>
          <p className="text-[11px] leading-relaxed font-sans">{routeExplanation}</p>
        </div>

        {/* Submit */}
        <div className="pt-3 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all touch-manipulation"
          >
            <Send className="w-3.5 h-3.5 text-white" />
            <span>Dispatch Intent</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
