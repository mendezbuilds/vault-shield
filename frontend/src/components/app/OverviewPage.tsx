import React from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import { LivingNodeNetwork } from '../network/LivingNodeNetwork';
import { formatNear, timeAgo, getAuditEventMeta, getExplorerAccountUrl } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import { AppPage } from './AppSidebar';
import {
  Zap,
  Lock,
  Calendar,
  Activity,
  PlusCircle,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Scale,
  ChevronRight,
} from 'lucide-react';

interface OverviewPageProps {
  overview: VaultAccountOverview;
  onNavigate: (page: AppPage) => void;
  onOpenPaymentModal: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  overview,
  onNavigate,
  onOpenPaymentModal,
}) => {
  const { accountId } = useWallet();

  // Primary Financial Solvency Metrics
  const totalBalance = formatNear(overview.totalAccountBalance, 3);
  const liquidBalance = formatNear(overview.availableLiquidBalance, 3);
  const storageReserve = formatNear(overview.storageReserveRequirement, 3);
  const pendingReserved = formatNear(overview.pendingReserved, 3);

  // Policy Caps & Daily Bucket
  const dailyCap = formatNear(overview.policy.daily_cap, 2);
  const maxPerTx = formatNear(overview.policy.max_per_transaction, 2);
  const autoThreshold = formatNear(overview.policy.auto_approval_threshold, 2);
  const spentToday = formatNear(overview.dailyBucket.spent, 3);

  // Daily Allowance Computations
  const dailyCapYocto = BigInt(overview.policy.daily_cap || '1');
  const spentYocto = BigInt(overview.dailyBucket.spent || '0') + BigInt(overview.dailyBucket.reserved || '0');
  const usagePercent = Number((spentYocto * 100n) / (dailyCapYocto === 0n ? 1n : dailyCapYocto));
  const remainingAllowanceYocto = dailyCapYocto > spentYocto ? dailyCapYocto - spentYocto : 0n;
  const remainingAllowance = formatNear(remainingAllowanceYocto.toString(), 3);

  // Proportional Solvency Breakdown for Equation Bar
  const totalYocto = BigInt(overview.totalAccountBalance || '1');
  const storageYocto = BigInt(overview.storageReserveRequirement || '0');
  const pendingYocto = BigInt(overview.pendingReserved || '0');

  const storagePct = totalYocto > 0n ? Math.max(1, Number((storageYocto * 100n) / totalYocto)) : 95;
  const pendingPct = totalYocto > 0n ? Math.max(0, Number((pendingYocto * 100n) / totalYocto)) : 2;
  const liquidPct = totalYocto > 0n ? Math.max(1, 100 - storagePct - pendingPct) : 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP OPERATIONAL COMMAND STRIP */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-soft flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              NEAR PUBLIC TESTNET
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              BLOCKCHAIN VERIFIED &bull; cc7760b
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight">
            Vault Security Cockpit
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-charcoal-500 font-sans hidden sm:inline">
              Contract:
            </span>
            <a
              href={getExplorerAccountUrl(overview.contractId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono font-bold text-charcoal-900 bg-ivory-warm px-2.5 py-1 rounded-lg border border-border hover:border-near-green transition-colors text-[11px] sm:text-xs break-all"
            >
              <span>{overview.contractId}</span>
              <ExternalLink className="w-3 h-3 text-near-dark shrink-0" />
            </a>
            {overview.isPaused ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono text-[10px] font-bold border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                PAUSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-near-light text-near-dark font-mono text-[10px] font-bold border border-near-green/30">
                <span className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
                OPERATIONAL
              </span>
            )}
          </div>
        </div>

        {/* Action Controls & Signer Context */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="hidden sm:block px-4 py-2.5 rounded-2xl bg-ivory-warm border border-border text-left">
            <div className="text-[10px] font-mono uppercase tracking-wider text-charcoal-400 font-bold">
              Active Context
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-near-green" />
              <span className="text-xs font-mono font-bold text-charcoal-900 truncate max-w-[170px]">
                {accountId || 'Public Inspector'}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons (Full-Width Touch Targets on Mobile) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onOpenPaymentModal}
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold tracking-tight shadow-soft transition-all active:scale-[0.98] touch-manipulation"
            >
              <PlusCircle className="w-4 h-4 text-white shrink-0" />
              <span>Dispatch Intent</span>
            </button>

            {overview.pendingRequests.length > 0 ? (
              <button
                onClick={() => onNavigate('approvals')}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold shadow-soft transition-all touch-manipulation"
              >
                <Activity className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Review ({overview.pendingRequests.length})</span>
              </button>
            ) : (
              <button
                onClick={() => onNavigate('vault')}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
              >
                <span>My Vault</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. PRIMARY SOLVENCY & FINANCIAL TELEMETRY (VERTICAL FIRST ON MOBILE, ASYMMETRIC ON DESKTOP) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
        {/* Primary Liquid Solvency Master Panel */}
        <div className="lg:col-span-8 p-5 sm:p-10 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-near-green/5 rounded-full blur-2xl pointer-events-none" />

          <div>
            {/* Header / Kicker */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-border/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-near-light flex items-center justify-center text-near-dark shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-charcoal-400 block">
                    PRIMARY FINANCIAL METRIC
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-charcoal-900 tracking-tight">
                    Liquid Transfer Solvency
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-near-light text-near-dark text-[10px] sm:text-xs font-mono font-bold border border-near-green/30">
                <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                PHYSICALLY UNENCUMBERED
              </span>
            </div>

            {/* Oversized Confident Number */}
            <div className="mt-5 sm:mt-6 flex flex-wrap items-baseline gap-2 sm:gap-3">
              <span className="text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-black font-mono tracking-tight text-charcoal-900">
                {liquidBalance}
              </span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-near-dark">NEAR</span>
            </div>

            <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-charcoal-600 leading-relaxed font-sans max-w-2xl">
              Authentic on-chain capital available for immediate agent execution.
              Forward storage costs (<span className="font-mono text-charcoal-900 font-bold">{storageReserve} N</span>) and active approval reservations (<span className="font-mono text-charcoal-900 font-bold">{pendingReserved} N</span>) are strictly quarantined.
            </p>
          </div>

          {/* Solvency Invariant Mathematical Breakdown & Proportional Bar */}
          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border/70">
            <div className="flex flex-col xs:flex-row xs:items-center justify-between text-xs font-mono mb-3 gap-1.5">
              <span className="font-bold text-charcoal-700 text-[11px] sm:text-xs">
                Solvency Accounting Invariant:
              </span>
              <code className="text-[10px] sm:text-[11px] bg-ivory-warm px-2 py-0.5 rounded border border-border text-charcoal-800 break-words self-start xs:self-auto">
                liquid = total - reserve - pending
              </code>
            </div>

            {/* Visual Proportional Segmented Bar */}
            <div className="h-3.5 sm:h-4 w-full bg-ivory-warm rounded-xl overflow-hidden flex border border-border shadow-inner">
              <div
                style={{ width: `${storagePct}%` }}
                className="bg-charcoal-800 h-full border-r border-white/60 transition-all duration-500"
                title={`Storage Reserve: ${storageReserve} NEAR (${storagePct}%)`}
              />
              <div
                style={{ width: `${Math.max(pendingPct, 2)}%` }}
                className="bg-amber-500 h-full border-r border-white/60 transition-all duration-500"
                title={`Pending Locks: ${pendingReserved} NEAR (${pendingPct}%)`}
              />
              <div
                style={{ width: `${Math.max(liquidPct, 2)}%` }}
                className="bg-near-green h-full transition-all duration-500"
                title={`Liquid Solvency: ${liquidBalance} NEAR (${liquidPct}%)`}
              />
            </div>

            {/* Segment Labels Grid (Clean Vertical Stack on Mobile) */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs font-mono">
              <div className="p-3 sm:p-3.5 rounded-2xl bg-ivory-warm/70 border border-border/80 flex sm:flex-col justify-between items-center sm:items-start">
                <div>
                  <div className="flex items-center gap-1.5 text-charcoal-500 text-[10px] uppercase font-bold">
                    <span className="w-2 h-2 rounded-sm bg-charcoal-800 shrink-0" />
                    <span>Total Balance</span>
                  </div>
                  <div className="text-[10px] text-charcoal-400 mt-0.5 hidden sm:block">
                    100% on-chain custody
                  </div>
                </div>
                <div className="text-base sm:text-lg font-extrabold text-charcoal-900">
                  {totalBalance} <span className="text-[10px] text-charcoal-500 font-normal">N</span>
                </div>
              </div>

              <div className="p-3 sm:p-3.5 rounded-2xl bg-ivory-warm/70 border border-border/80 flex sm:flex-col justify-between items-center sm:items-start">
                <div>
                  <div className="flex items-center gap-1.5 text-charcoal-500 text-[10px] uppercase font-bold">
                    <span className="w-2 h-2 rounded-sm bg-charcoal-800 shrink-0" />
                    <span>Storage Reserve</span>
                  </div>
                  <div className="text-[10px] text-charcoal-400 mt-0.5 hidden sm:block">
                    {overview.storageUsageBytes.toLocaleString()} B + 10KB cushion
                  </div>
                </div>
                <div className="text-base sm:text-lg font-extrabold text-charcoal-800">
                  {storageReserve} <span className="text-[10px] text-charcoal-500 font-normal">N</span>
                </div>
              </div>

              <div className="p-3 sm:p-3.5 rounded-2xl bg-ivory-warm/70 border border-border/80 flex sm:flex-col justify-between items-center sm:items-start">
                <div>
                  <div className="flex items-center gap-1.5 text-amber-700 text-[10px] uppercase font-bold">
                    <span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0" />
                    <span>Pending Locks</span>
                  </div>
                  <div className="text-[10px] text-charcoal-400 mt-0.5 hidden sm:block">
                    {overview.globalPendingCount} reserved requests
                  </div>
                </div>
                <div className="text-base sm:text-lg font-extrabold text-amber-900">
                  {pendingReserved} <span className="text-[10px] text-amber-700 font-normal">N</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 24-Hour Policy Allowance Meter */}
        <div className="lg:col-span-4 p-5 sm:p-10 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border/70">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-charcoal-700" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal-700">
                  24h Allowance
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-ivory-warm border border-border text-charcoal-600">
                Bucket #{overview.dailyBucket.bucket_index}
              </span>
            </div>

            <div className="mt-5 sm:mt-6">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-400">
                Remaining Allowance
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl xs:text-4xl sm:text-5xl font-black font-mono tracking-tight text-charcoal-900">
                  {remainingAllowance}
                </span>
                <span className="text-sm font-mono text-charcoal-500">
                  / {dailyCap} N
                </span>
              </div>
            </div>

            {/* Allowance Progress Bar */}
            <div className="mt-4 sm:mt-5 space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-charcoal-500">Cap Utilization</span>
                <span className="font-bold text-charcoal-900">{usagePercent}%</span>
              </div>
              <div className="w-full h-3 bg-ivory-warm rounded-full overflow-hidden border border-border">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent > 80 ? 'bg-amber-500' : 'bg-near-dark'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-charcoal-400 pt-1">
                <span>Spent: {spentToday} N</span>
                <span>Cap: {dailyCap} N</span>
              </div>
            </div>

            {/* Strict Policy Limits List */}
            <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-border/70 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Per-Tx Limit</span>
                <span className="font-bold text-charcoal-900">{maxPerTx} NEAR</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Auto-Approve</span>
                <span className="font-bold text-near-dark">{autoThreshold} NEAR</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Allowlist</span>
                <span className="font-bold text-charcoal-900">{overview.policy.destination_allowlist.length} Merchants</span>
              </div>
            </div>
          </div>

          <div className="mt-5 sm:mt-6 pt-4 border-t border-border/70">
            <button
              onClick={() => onNavigate('vault')}
              className="w-full py-2.5 rounded-xl bg-ivory-warm hover:bg-border/60 border border-border text-xs font-bold text-charcoal-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Inspect Spending Policy</span>
              <ChevronRight className="w-3.5 h-3.5 text-charcoal-400" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. LIVING NODE NETWORK — COMPACT RESPONSIVE VISUALIZATION */}
      <div className="p-5 sm:p-10 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-border/70 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
                LIVING TOPOLOGY
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
                ACTIVE CONDUIT
              </span>
            </div>
            <h3 className="text-lg sm:text-2xl font-extrabold text-charcoal-900 tracking-tight mt-1">
              Autonomous Agent &bull; Vault Execution Conduit
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-near-light text-near-dark font-bold border border-near-green/30 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
              {overview.authorizedAgents.length} ACTIVE AGENT
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-ivory-warm border border-border text-charcoal-700 font-semibold text-[11px]">
              {overview.policy.destination_allowlist.length} MERCHANTS
            </span>
          </div>
        </div>

        {/* Real-time Living Node Canvas with Responsive Height (Compact on Mobile) */}
        <div className="mt-4 sm:mt-6 overflow-hidden rounded-2xl bg-ivory/50 border border-border/50">
          <LivingNodeNetwork
            variant="dashboard"
            vaultData={overview}
            height={220}
          />
        </div>

        {/* Node Topology Legend Grid (Compact 2x2 Grid on Mobile) */}
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-border/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-charcoal-600 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-charcoal-800 shrink-0" />
            <div className="truncate">
              <div className="font-bold text-charcoal-900 text-[10px] sm:text-[11px]">Owner</div>
              <div className="text-[9px] sm:text-[10px] text-charcoal-400 truncate">{overview.ownerId}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-charcoal-600 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-near-green shrink-0" />
            <div className="truncate">
              <div className="font-bold text-charcoal-900 text-[10px] sm:text-[11px]">Vault</div>
              <div className="text-[9px] sm:text-[10px] text-charcoal-400 truncate">{overview.contractId}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-charcoal-600 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-near-dark shrink-0" />
            <div className="truncate">
              <div className="font-bold text-charcoal-900 text-[10px] sm:text-[11px]">Agent Alpha</div>
              <div className="text-[9px] sm:text-[10px] text-charcoal-400 truncate">
                {overview.authorizedAgents[0] || 'agent-a.vault-parent.testnet'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-charcoal-600 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <div className="truncate">
              <div className="font-bold text-charcoal-900 text-[10px] sm:text-[11px]">Merchant</div>
              <div className="text-[9px] sm:text-[10px] text-charcoal-400 truncate">
                {overview.policy.destination_allowlist[0] || 'merchant.vault-parent.testnet'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. FORMALLY ENFORCED SECURITY GUARANTEES */}
      <div>
        <div className="mb-4 sm:mb-6">
          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
            SECURITY INVARIANTS
          </span>
          <h3 className="text-xl sm:text-2xl font-extrabold text-charcoal-900 tracking-tight mt-1">
            Cryptographically Enforced Invariants
          </h3>
          <p className="text-xs sm:text-sm text-charcoal-600 font-sans mt-0.5 max-w-3xl">
            Boundaries enforced directly by the Rust contract logic (<code className="font-mono text-xs">cc7760b</code>).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Invariant 1: Forward Storage Reserve Shield */}
          <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/70">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-charcoal-500 uppercase tracking-wider">
                  INVARIANT 01 // RENT IMMUNITY
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-surface-white border border-border text-near-dark">
                  ENFORCED
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900 mt-3 sm:mt-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-near-dark shrink-0" />
                <span>Forward Storage Shield</span>
              </h4>
              <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-black font-mono text-charcoal-900">
                {storageReserve} <span className="text-xs font-mono text-charcoal-500">NEAR Locked</span>
              </div>
              <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
                Withdrawals and transfers are physically blocked if they breach storage rent requirements on <span className="font-mono font-bold">{overview.storageUsageBytes.toLocaleString()} bytes</span> plus a 10,000-byte cushion.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-charcoal-400 truncate">
              contract_balance &ge; storage_reserve + pending_locks
            </div>
          </div>

          {/* Invariant 2: Two-Phase Solvency Reservation */}
          <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/70">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-amber-700 uppercase tracking-wider">
                  INVARIANT 02 // ATOMIC LOCK
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800">
                  ACTIVE
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900 mt-3 sm:mt-4 flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Two-Phase Escrow Lock</span>
              </h4>
              <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-black font-mono text-amber-800">
                {pendingReserved} <span className="text-xs font-mono text-charcoal-500">NEAR Escrowed</span>
              </div>
              <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
                Any payment intent exceeding auto-approval thresholds immediately reserves funds at initiation. Concurrent bursts can never overdraw the vault.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-charcoal-400 truncate">
              pending_reserved = &Sigma; active_requests.amount
            </div>
          </div>

          {/* Invariant 3: Zero-Reentrancy Gate */}
          <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-border/70">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-near-dark uppercase tracking-wider">
                  INVARIANT 03 // EXECUTION INTEGRITY
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-near-light border border-near-green/30 text-near-dark">
                  IMMUTABLE
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900 mt-3 sm:mt-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-near-dark shrink-0" />
                <span>Zero-Reentrancy Gate</span>
              </h4>
              <div className="mt-2 sm:mt-3 text-xl sm:text-2xl font-black font-mono text-charcoal-900">
                Atomic State <span className="text-xs font-mono text-charcoal-500">Precedes Dispatch</span>
              </div>
              <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
                All accounting deductions occur prior to outward <code className="font-mono text-[11px] bg-ivory-warm px-1 rounded">PromiseCreate</code> calls. Recursive exploit vectors are structurally impossible.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-charcoal-400 truncate">
              state_mutation &rarr; Promise::new().transfer()
            </div>
          </div>
        </div>
      </div>

      {/* 5. OPERATIONAL FEEDS: APPROVALS & RECENT AUDIT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Approvals Queue Card */}
        <div className="lg:col-span-6 p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border/70">
              <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900">
                Pending Approvals Queue
              </h4>
              {overview.pendingRequests.length > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  {overview.pendingRequests.length} REQUIRED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-near-light text-near-dark">
                  QUEUE CLEAR
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {overview.pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-xs text-charcoal-400 font-sans">
                  No active exceptions in the approval queue. All agent transactions are solvent.
                </div>
              ) : (
                overview.pendingRequests.slice(0, 3).map(req => (
                  <div
                    key={req.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-ivory-warm/70 border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-charcoal-900">Req #{req.id}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-surface-white border border-border text-amber-800 font-bold">
                          {req.origin_reason}
                        </span>
                      </div>
                      <div className="text-charcoal-500 text-[11px] mt-1 break-all">
                        To: {req.destination}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                      <span className="font-black text-charcoal-900 text-sm">
                        {formatNear(req.amount, 3)} N
                      </span>
                      <button
                        onClick={() => onNavigate('approvals')}
                        className="px-3 py-1.5 rounded-xl bg-near-dark text-white text-[11px] font-bold"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/70">
            <button
              onClick={() => onNavigate('approvals')}
              className="w-full py-2.5 rounded-xl bg-ivory-warm hover:bg-border/60 border border-border text-xs font-bold text-charcoal-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Open Approvals Console</span>
              <ChevronRight className="w-3.5 h-3.5 text-charcoal-400" />
            </button>
          </div>
        </div>

        {/* Recent Audit Feed */}
        <div className="lg:col-span-6 p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-border/70">
              <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900">
                Recent On-Chain Activity
              </h4>
              <span className="text-[10px] font-mono text-charcoal-400">
                Ring Buffer (50 slots)
              </span>
            </div>

            <div className="mt-4 divide-y divide-border/60">
              {overview.auditRecords.slice(0, 4).map(rec => {
                const meta = getAuditEventMeta(rec.event_type);
                return (
                  <div key={rec.sequence_id} className="py-2.5 flex items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                      <div className="truncate">
                        <div className="font-bold text-charcoal-900 text-[11px] truncate">
                          {meta.label}
                        </div>
                        <div className="text-[10px] text-charcoal-400 truncate">
                          Seq #{rec.sequence_id} &bull; {rec.account_id}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {BigInt(rec.amount || '0') > 0n && (
                        <div className="font-bold text-charcoal-900 text-[11px]">
                          {formatNear(rec.amount, 3)} N
                        </div>
                      )}
                      <div className="text-[10px] text-charcoal-400">
                        {timeAgo(rec.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/70">
            <button
              onClick={() => onNavigate('transactions')}
              className="w-full py-2.5 rounded-xl bg-ivory-warm hover:bg-border/60 border border-border text-xs font-bold text-charcoal-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>View Full Transaction Ledger</span>
              <ChevronRight className="w-3.5 h-3.5 text-charcoal-400" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
