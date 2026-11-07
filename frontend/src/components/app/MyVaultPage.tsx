import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import { Modal } from '../common/Modal';
import { formatNear, parseNearToYocto, getExplorerAccountUrl } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import {
  Shield,
  Pause,
  Play,
  ArrowUpRight,
  Plus,
  Trash2,
  ExternalLink,
  Lock,
  Zap,
  Sliders,
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  Coins,
} from 'lucide-react';

interface MyVaultPageProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
}

export const MyVaultPage: React.FC<MyVaultPageProps> = ({ overview, onRefresh }) => {
  const { accountId, role, executeContractCall } = useWallet();

  // Modals state
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [isAddDestModalOpen, setIsAddDestModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isPauseConfirmOpen, setIsPauseConfirmOpen] = useState(false);

  // Form states
  const [newMaxPerTx, setNewMaxPerTx] = useState(formatNear(overview.policy.max_per_transaction, 2));
  const [newDailyCap, setNewDailyCap] = useState(formatNear(overview.policy.daily_cap, 2));
  const [newThreshold, setNewThreshold] = useState(formatNear(overview.policy.auto_approval_threshold, 2));
  const [newDestAccount, setNewDestAccount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDest, setWithdrawDest] = useState(overview.ownerId);

  const isOwner = role === 'owner' || accountId === overview.ownerId;

  // Handlers
  const handleTogglePause = async () => {
    setIsPauseConfirmOpen(false);
    const method = overview.isPaused ? 'unpause' : 'pause';
    const res = await executeContractCall(method, {});
    if (res.success) onRefresh();
  };

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPolicyModalOpen(false);
    const res = await executeContractCall('set_policy', {
      max_per_transaction: parseNearToYocto(newMaxPerTx),
      daily_cap: parseNearToYocto(newDailyCap),
      auto_approval_threshold: parseNearToYocto(newThreshold),
    });
    if (res.success) onRefresh();
  };

  const handleAddDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDestAccount.trim()) return;
    setIsAddDestModalOpen(false);
    const res = await executeContractCall('add_destination', {
      destination: newDestAccount.trim(),
    });
    if (res.success) {
      setNewDestAccount('');
      onRefresh();
    }
  };

  const handleRemoveDestination = async (dest: string) => {
    if (!window.confirm(`Are you sure you want to delist ${dest}?`)) return;
    const res = await executeContractCall('remove_destination', {
      destination: dest,
    });
    if (res.success) onRefresh();
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawAmount || !withdrawDest) return;
    setIsWithdrawModalOpen(false);
    const res = await executeContractCall('withdraw', {
      amount: parseNearToYocto(withdrawAmount),
      destination: withdrawDest.trim(),
    });
    if (res.success) {
      setWithdrawAmount('');
      onRefresh();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP BANNER: CONTRACT IDENTITY & ADMINISTRATIVE CONTROLS */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              VAULT TOPOLOGY // IMMUTABLE
            </span>
            {overview.isPaused ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono text-[9px] sm:text-[10px] font-bold border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                PAUSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-near-light text-near-dark font-mono text-[9px] sm:text-[10px] font-bold border border-near-green/30">
                <span className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
                OPERATIONAL
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-2xl lg:text-3xl font-extrabold text-charcoal-900 tracking-tight font-mono break-all">
            {overview.contractId}
          </h2>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal-500 font-mono">
            <div>
              Owner:{' '}
              <a
                href={getExplorerAccountUrl(overview.ownerId)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-charcoal-900 hover:text-near-dark underline inline-flex items-center gap-1"
              >
                <span>{overview.ownerId}</span>
                <ExternalLink className="w-3 h-3 text-charcoal-400" />
              </a>
            </div>
            <div>&bull;</div>
            <div>Storage: {overview.storageUsageBytes.toLocaleString()} bytes</div>
          </div>
        </div>

        {/* Action Controls for Owner */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
          {isOwner ? (
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 w-full sm:w-auto">
              <button
                onClick={() => setIsPauseConfirmOpen(true)}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold shadow-soft transition-all touch-manipulation ${
                  overview.isPaused
                    ? 'bg-near-dark hover:bg-near-green text-white'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                }`}
              >
                {overview.isPaused ? (
                  <>
                    <Play className="w-4 h-4 text-white" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 text-amber-700" />
                    <span>Pause</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsWithdrawModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
              >
                <ArrowUpRight className="w-4 h-4 text-charcoal-700" />
                <span>Withdraw</span>
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-ivory-warm border border-border text-center text-xs text-charcoal-500 font-mono">
              Connect as Vault Owner to enable administrative controls
            </div>
          )}
        </div>
      </div>

      {/* 2. SOLVENCY & STORAGE TELEMETRY TIERS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {/* Tier 1: Available Liquid */}
        <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400">
                AVAILABLE LIQUID
              </span>
              <Zap className="w-4 h-4 text-near-dark" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono text-charcoal-900">
                {formatNear(overview.availableLiquidBalance, 3)}
              </span>
              <span className="text-xs font-mono font-bold text-near-dark">NEAR</span>
            </div>
            <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
              Unreserved capital immediately available for payment dispatches or owner withdrawals.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border/70 text-[10px] font-mono font-bold text-near-dark">
            Physically Unencumbered
          </div>
        </div>

        {/* Tier 2: Storage Reserve Requirement */}
        <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400">
                STORAGE RESERVE PROTECTED
              </span>
              <Lock className="w-4 h-4 text-charcoal-700" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono text-charcoal-900">
                {formatNear(overview.storageReserveRequirement, 3)}
              </span>
              <span className="text-xs font-mono font-bold text-charcoal-500">NEAR</span>
            </div>
            <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
              Protected balance ensuring account storage rent obligations can never be violated on NEAR.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border/70 text-[10px] font-mono text-charcoal-400">
            {overview.storageUsageBytes.toLocaleString()} B + 10KB Cushion
          </div>
        </div>

        {/* Tier 3: Pending Escrow Commitments */}
        <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700">
                ACTIVE PENDING ESCROWS
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono text-amber-800">
                {formatNear(overview.pendingReserved, 3)}
              </span>
              <span className="text-xs font-mono font-bold text-amber-700">NEAR</span>
            </div>
            <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
              Capital quarantined for pending payment requests. Double spending is mathematically prevented.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-border/70 text-[10px] font-mono text-amber-800 font-bold">
            {overview.globalPendingCount} Request Escrowed
          </div>
        </div>
      </div>

      {/* 3. ACTIVE SPENDING POLICY CONSTRAINTS */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-border/70 gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              GOVERNANCE CONSTRAINTS
            </span>
            <h3 className="text-lg sm:text-xl font-extrabold text-charcoal-900 tracking-tight mt-1 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-near-dark shrink-0" />
              <span>Active Spending Policy Parameters</span>
            </h3>
            <p className="text-xs text-charcoal-500 mt-0.5 font-sans">
              Determines automatic execution boundaries versus owner approval gates for all authorized AI agents.
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => setIsPolicyModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all touch-manipulation w-full sm:w-auto"
            >
              <Sliders className="w-4 h-4 text-white" />
              <span>Configure Policy</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-4 sm:mt-6">
          <div className="p-4 sm:p-6 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-1">
              Per-Transaction Ceiling
            </span>
            <div className="text-2xl font-black font-mono text-charcoal-900">
              {formatNear(overview.policy.max_per_transaction, 2)} <span className="text-xs text-charcoal-500 font-normal">NEAR</span>
            </div>
            <p className="text-xs text-charcoal-500 mt-2 font-sans leading-relaxed">
              Absolute single-transaction cap. Any request exceeding this value is rejected on-chain immediately.
            </p>
          </div>

          <div className="p-4 sm:p-6 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400 block mb-1">
              24-Hour Rolling Cap
            </span>
            <div className="text-2xl font-black font-mono text-charcoal-900">
              {formatNear(overview.policy.daily_cap, 2)} <span className="text-xs text-charcoal-500 font-normal">NEAR</span>
            </div>
            <p className="text-xs text-charcoal-500 mt-2 font-sans leading-relaxed">
              Total allowable commitments within a 24-hour window (spent + active reservations).
            </p>
          </div>

          <div className="p-4 sm:p-6 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-near-dark block mb-1">
              Auto-Approval Threshold
            </span>
            <div className="text-2xl font-black font-mono text-near-dark">
              {formatNear(overview.policy.auto_approval_threshold, 2)} <span className="text-xs text-charcoal-500 font-normal">NEAR</span>
            </div>
            <p className="text-xs text-charcoal-500 mt-2 font-sans leading-relaxed">
              Transfers &le; this limit to allowlisted merchants execute instantly without owner sign-off.
            </p>
          </div>
        </div>
      </div>

      {/* 4. ALLOWLISTED PAYMENT DESTINATIONS */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-border/70 gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              RECIPIENT ALLOWLIST
            </span>
            <h3 className="text-lg sm:text-xl font-extrabold text-charcoal-900 tracking-tight mt-1 flex items-center gap-2">
              <Building className="w-5 h-5 text-near-dark shrink-0" />
              <span>Approved Payment Destinations</span>
            </h3>
            <p className="text-xs text-charcoal-500 mt-0.5 font-sans">
              Autonomous agents can execute auto-approved transfers exclusively to accounts in this list.
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => setIsAddDestModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all touch-manipulation w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Allowlist Destination</span>
            </button>
          )}
        </div>

        <div className="mt-4 sm:mt-6 divide-y divide-border/60">
          {overview.policy.destination_allowlist.length === 0 ? (
            <div className="py-8 sm:py-12 text-center text-xs text-charcoal-400 font-sans">
              No allowlisted destinations. All agent transfer intents require explicit owner authorization.
            </div>
          ) : (
            overview.policy.destination_allowlist.map(dest => (
              <div key={dest} className="py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-near-green mt-1 sm:mt-0 shrink-0" />
                  <div className="min-w-0">
                    <a
                      href={getExplorerAccountUrl(dest)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs sm:text-sm font-bold text-charcoal-900 hover:text-near-dark transition-colors inline-flex items-center gap-1.5 break-all"
                    >
                      <span>{dest}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-charcoal-400 shrink-0" />
                    </a>
                    <div className="text-[10px] sm:text-[11px] text-charcoal-400 font-sans">
                      Verified On-Chain Testnet Recipient
                    </div>
                  </div>
                </div>

                {isOwner && (
                  <button
                    onClick={() => handleRemoveDestination(dest)}
                    className="self-end sm:self-auto p-2 rounded-xl text-charcoal-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors touch-manipulation"
                    title="Remove destination from allowlist"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL 1: Configure Policy */}
      <Modal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title="Configure Spending Policy"
        description="Updates on-chain governance policy boundaries stored directly in contract.vault-parent.testnet."
      >
        <form onSubmit={handleUpdatePolicy} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Per-Transaction Ceiling (NEAR)
            </label>
            <input
              type="text"
              value={newMaxPerTx}
              onChange={e => setNewMaxPerTx(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              24-Hour Rolling Cap (NEAR)
            </label>
            <input
              type="text"
              value={newDailyCap}
              onChange={e => setNewDailyCap(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Auto-Approval Threshold (NEAR)
            </label>
            <input
              type="text"
              value={newThreshold}
              onChange={e => setNewThreshold(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsPolicyModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
            >
              Update Policy
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Add Destination */}
      <Modal
        isOpen={isAddDestModalOpen}
        onClose={() => setIsAddDestModalOpen(false)}
        title="Allowlist Payment Destination"
        description="Add a verified testnet merchant or target contract to the automatic execution allowlist."
      >
        <form onSubmit={handleAddDestination} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Destination Account ID
            </label>
            <input
              type="text"
              placeholder="e.g. merchant.vault-parent.testnet"
              value={newDestAccount}
              onChange={e => setNewDestAccount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddDestModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
            >
              Confirm Allowlist
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Withdraw Liquid */}
      <Modal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        title="Withdraw Liquid Balance"
        description="Withdraw unencumbered capital from the vault to the specified owner destination account."
      >
        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Destination Account ID
            </label>
            <input
              type="text"
              value={withdrawDest}
              onChange={e => setWithdrawDest(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Amount (NEAR) &bull; Max Liquid: {formatNear(overview.availableLiquidBalance, 3)} N
            </label>
            <input
              type="text"
              placeholder="0.05"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsWithdrawModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
            >
              Execute Withdrawal
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Pause Confirmation */}
      <Modal
        isOpen={isPauseConfirmOpen}
        onClose={() => setIsPauseConfirmOpen(false)}
        title={overview.isPaused ? 'Resume Vault Operations' : 'Emergency Pause Vault'}
        description={
          overview.isPaused
            ? 'Unpausing will restore normal automated execution and approval queue processing for authorized agents.'
            : 'Pausing will immediately reject all agent payment dispatches and freeze the approval queue on-chain.'
        }
      >
        <div className="pt-3 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setIsPauseConfirmOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
          >
            Cancel
          </button>
          <button
            onClick={handleTogglePause}
            className={`px-5 py-2 rounded-xl text-xs font-bold shadow-soft transition-all ${
              overview.isPaused
                ? 'bg-near-dark hover:bg-near-green text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {overview.isPaused ? 'Confirm Resume' : 'Confirm Emergency Pause'}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
};
