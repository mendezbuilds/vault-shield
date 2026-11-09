import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import {
  formatNear,
  timeAgo,
  formatTimestamp,
  getAuditEventMeta,
  getExplorerAccountUrl,
  getExplorerTxUrl,
  truncateId,
} from '../../utils/formatters';
import {
  externalDepositStorage,
  ExternalDepositRecord,
} from '../../services/depositStorage';
import {
  History,
  Search,
  Download,
  ExternalLink,
  Coins,
  CheckCircle2,
  ShieldCheck,
  PlusCircle,
  X,
  Loader2,
  AlertTriangle,
  Layers,
} from 'lucide-react';

interface TransactionsPageProps {
  overview: VaultAccountOverview;
}

type ActivityTab = 'all' | 'contract' | 'deposits';

export const TransactionsPage: React.FC<TransactionsPageProps> = ({ overview }) => {
  const [activityTab, setActivityTab] = useState<ActivityTab>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deposits, setDeposits] = useState<ExternalDepositRecord[]>([]);

  // Recover modal state
  const [isRecoverOpen, setIsRecoverOpen] = useState(false);
  const [recoverTxHash, setRecoverTxHash] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoverSuccess, setRecoverSuccess] = useState<string | null>(null);

  // Load external deposits and listen to storage events
  const loadDeposits = () => {
    const list = externalDepositStorage.getDeposits(overview.contractId);
    setDeposits(list);
  };

  useEffect(() => {
    loadDeposits();

    const handleRecorded = () => {
      loadDeposits();
    };

    window.addEventListener('vault_deposit_recorded', handleRecorded);
    window.addEventListener('storage', handleRecorded);

    return () => {
      window.removeEventListener('vault_deposit_recorded', handleRecorded);
      window.removeEventListener('storage', handleRecorded);
    };
  }, [overview.contractId]);

  // Extract transaction events from the contract audit buffer
  const paymentEvents = overview.auditRecords.filter(r =>
    [
      'PaymentDispatched',
      'PaymentExecuted',
      'PaymentPending',
      'PaymentApproved',
      'PaymentRejected',
      'PaymentPolicyDenied',
      'PaymentPolicyInvalidated',
      'PaymentExpired',
      'PaymentFailed',
      'OwnerWithdrawal',
    ].includes(r.event_type)
  );

  // Filter contract events
  const filteredContractEvents = paymentEvents.filter(event => {
    if (statusFilter !== 'all' && event.event_type !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAccount = event.account_id.toLowerCase().includes(q);
      const matchReqId = event.request_id.toString().includes(q);
      const matchSeq = event.sequence_id.toString().includes(q);
      return matchAccount || matchReqId || matchSeq;
    }
    return true;
  });

  // Filter external deposits
  const filteredDeposits = deposits.filter(deposit => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSender = deposit.senderId.toLowerCase().includes(q);
      const matchReceiver = deposit.receiverId.toLowerCase().includes(q);
      const matchTx = deposit.txHash.toLowerCase().includes(q);
      const matchAmount = deposit.amountNear.includes(q);
      return matchSender || matchReceiver || matchTx || matchAmount;
    }
    return true;
  });

  // Calculate total external funding in NEAR
  const totalFundingYocto = deposits.reduce(
    (acc, d) => acc + BigInt(d.amountYocto || '0'),
    0n
  );

  // Export JSON (Cleanly separates Contract Audit Events from External Funding Deposits)
  const handleExportJSON = () => {
    const exportData = {
      vault_contract: overview.contractId,
      network: 'near-testnet',
      exported_at: new Date().toISOString(),
      metadata: {
        contract_events_count: paymentEvents.length,
        external_deposits_count: deposits.length,
        total_external_funding_near: formatNear(totalFundingYocto.toString(), 4),
      },
      contract_audit_records: paymentEvents,
      external_funding_transactions: deposits,
    };

    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `vault_shield_tx_ledger_${Date.now()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Recover / Import past deposit from NEAR RPC
  const handleRecoverDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = recoverTxHash.trim();
    if (!hash) {
      setRecoverError('Please enter a valid NEAR transaction hash.');
      return;
    }

    setIsRecovering(true);
    setRecoverError(null);
    setRecoverSuccess(null);

    try {
      const result = await externalDepositStorage.verifyAndImportFromRpc(
        hash,
        overview.contractId
      );

      if (result.success && result.deposit) {
        setRecoverSuccess(
          `Successfully recovered and verified deposit of ${result.deposit.amountNear} NEAR from ${result.deposit.senderId}!`
        );
        setRecoverTxHash('');
        loadDeposits();
        setTimeout(() => {
          setIsRecoverOpen(false);
          setRecoverSuccess(null);
        }, 2200);
      } else {
        setRecoverError(result.error || 'Failed to verify transaction on NEAR testnet.');
      }
    } catch (err: any) {
      setRecoverError(err?.message || 'Verification failed. Please check the transaction hash.');
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP BANNER: TRANSACTION AUDIT TRAIL */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              IMMUTABLE AUDIT TRAIL
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              CIRCULAR RING BUFFER (50 SLOTS) &bull; EXTERNAL FUNDING LEDGER
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <History className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
            <span>Vault Transactions & Audit Ledger</span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Verifiable on-chain lifecycle events on NEAR Public Testnet. Track both contract-executed agent operations and direct native NEAR funding transactions.
          </p>
        </div>

        {/* Telemetry and Actions */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto">
          <div className="px-4 py-2.5 sm:py-3 rounded-2xl bg-ivory-warm border border-border text-left sm:text-right font-mono flex-1 sm:flex-initial">
            <div className="text-[9px] sm:text-[10px] text-charcoal-400 uppercase font-bold">Contract Events</div>
            <div className="text-base sm:text-lg font-black text-charcoal-900">
              {paymentEvents.length} <span className="text-xs text-charcoal-500 font-normal">Events</span>
            </div>
          </div>

          <div className="px-4 py-2.5 sm:py-3 rounded-2xl bg-near-light/40 border border-near-green/30 text-left sm:text-right font-mono flex-1 sm:flex-initial">
            <div className="text-[9px] sm:text-[10px] text-near-dark uppercase font-bold">External Funding</div>
            <div className="text-base sm:text-lg font-black text-near-dark">
              {deposits.length} <span className="text-xs text-near-dark/80 font-normal">Deposits</span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0">
            <button
              onClick={() => setIsRecoverOpen(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl bg-ivory-warm hover:bg-white text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
              title="Import or recover past deposit by transaction hash"
            >
              <PlusCircle className="w-4 h-4 text-near-dark" />
              <span>Recover Deposit</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-3 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
            >
              <Download className="w-4 h-4 text-near-dark" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. TAB CONTROLS & SEARCH */}
      <div className="p-4 sm:p-6 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card space-y-4">
        {/* Activity Tab Switcher (Distinguishes Contract Audit vs External Deposits) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-ivory-warm border border-border text-xs font-mono">
            <button
              onClick={() => setActivityTab('all')}
              className={`px-3.5 py-2 rounded-xl transition-all font-bold flex items-center gap-1.5 text-xs ${
                activityTab === 'all'
                  ? 'bg-white text-charcoal-900 shadow-soft border border-border/80'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-near-dark" />
              <span>All Activity</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-charcoal-100 text-charcoal-700 ml-1">
                {paymentEvents.length + deposits.length}
              </span>
            </button>

            <button
              onClick={() => setActivityTab('contract')}
              className={`px-3.5 py-2 rounded-xl transition-all font-bold flex items-center gap-1.5 text-xs ${
                activityTab === 'contract'
                  ? 'bg-white text-charcoal-900 shadow-soft border border-border/80'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-blue-600" />
              <span>Contract Audit Events</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 ml-1">
                {paymentEvents.length}
              </span>
            </button>

            <button
              onClick={() => setActivityTab('deposits')}
              className={`px-3.5 py-2 rounded-xl transition-all font-bold flex items-center gap-1.5 text-xs ${
                activityTab === 'deposits'
                  ? 'bg-white text-near-dark shadow-soft border border-border/80'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              <Coins className="w-3.5 h-3.5 text-near-green" />
              <span>External Deposits</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-near-light text-near-dark border border-near-green/30 ml-1">
                {deposits.length}
              </span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative shrink-0 sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search account, ID, or tx hash..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 sm:py-2 rounded-xl bg-ivory-warm border border-border text-xs font-mono text-charcoal-900 placeholder:text-charcoal-400 focus:border-near-green outline-none"
            />
          </div>
        </div>

        {/* Secondary Status Filters (Active for Contract Events) */}
        {activityTab !== 'deposits' && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap">
            <span className="text-[10px] uppercase font-bold text-charcoal-400 mr-1 shrink-0">Filter Event:</span>
            {[
              { id: 'all', label: 'All Statuses' },
              { id: 'PaymentExecuted', label: 'Executed' },
              { id: 'PaymentDispatched', label: 'Dispatched' },
              { id: 'PaymentPending', label: 'Pending' },
              { id: 'PaymentPolicyDenied', label: 'Policy Denied' },
              { id: 'PaymentRejected', label: 'Rejected' },
              { id: 'PaymentExpired', label: 'Expired' },
            ].map(f => {
              const isActive = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1 rounded-xl transition-all whitespace-nowrap text-[11px] touch-manipulation ${
                    isActive
                      ? 'bg-near-dark text-white font-bold shadow-soft'
                      : 'bg-ivory-warm text-charcoal-700 hover:text-charcoal-900 border border-border font-medium'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Informational distinction notice */}
        {activityTab === 'deposits' && (
          <div className="p-3.5 rounded-2xl bg-near-light/30 border border-near-green/30 text-xs font-sans text-charcoal-700 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-near-dark shrink-0 mt-0.5" />
            <div className="leading-relaxed text-[11px]">
              <span className="font-bold text-near-dark font-mono uppercase mr-1">External Vault Funding:</span>
              Native NEAR deposits transfer capital directly into <span className="font-mono font-bold">{overview.contractId}</span> without calling contract execution methods. They are recorded client-side, verified cryptographically on NEAR Testnet, and linked directly to explorer transactions.
            </div>
          </div>
        )}
      </div>

      {/* 3. DUAL REPRESENTATION: MOBILE CARDS VS DESKTOP TABLE */}

      {/* MOBILE VIEW */}
      <div className="md:hidden space-y-3">
        {/* Render External Deposits if active */}
        {activityTab !== 'contract' &&
          filteredDeposits.map(deposit => (
            <div
              key={deposit.txHash}
              className="p-4 rounded-2xl bg-white/90 border border-near-green/40 shadow-soft space-y-2.5 font-mono"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-near-light text-near-dark border border-near-green/40">
                    <Coins className="w-3 h-3 text-near-dark" />
                    <span>External Deposit</span>
                  </span>
                </div>
                <span className="text-[10px] text-charcoal-400">
                  {timeAgo(deposit.timestamp * 1_000_000)}
                </span>
              </div>

              {/* Sender & Destination */}
              <div className="text-xs text-charcoal-600 space-y-1">
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-charcoal-400 text-[10px] shrink-0">FROM:</span>
                  <a
                    href={getExplorerAccountUrl(deposit.senderId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-charcoal-900 hover:text-near-dark underline truncate"
                  >
                    {deposit.senderId}
                  </a>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-charcoal-400 text-[10px] shrink-0">TO:</span>
                  <span className="font-bold text-charcoal-700 truncate">{deposit.receiverId}</span>
                </div>
              </div>

              {/* Amount, Tx & Status */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                <div>
                  <span className="font-black text-near-dark text-sm">
                    +{deposit.amountNear} <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={getExplorerTxUrl(deposit.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-near-dark bg-near-light/70 px-2 py-0.5 rounded-md hover:underline"
                  >
                    <span>Tx</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span className="text-[10px] font-bold text-near-dark bg-near-light px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-near-green" />
                    <span>Confirmed</span>
                  </span>
                </div>
              </div>
            </div>
          ))}

        {/* Render Contract Audit Events if active */}
        {activityTab !== 'deposits' &&
          filteredContractEvents.map(event => {
            const meta = getAuditEventMeta(event.event_type);
            const isDenied =
              event.event_type === 'PaymentPolicyDenied' ||
              event.event_type === 'PaymentPolicyInvalidated';
            const isExecuted = event.event_type === 'PaymentExecuted';

            return (
              <div
                key={event.sequence_id}
                className="p-4 rounded-2xl bg-white/90 border border-charcoal-200/70 shadow-soft space-y-2.5 font-mono"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-charcoal-900">
                      #{event.sequence_id}
                    </span>
                    {event.request_id > 0 && (
                      <span className="text-[10px] text-charcoal-500 font-medium">
                        (Req #{event.request_id})
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-charcoal-400">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>

                <div className="text-xs text-charcoal-600 flex items-start gap-1.5 min-w-0">
                  <span className="text-charcoal-400 text-[10px] shrink-0 mt-0.5">ACCOUNT:</span>
                  <a
                    href={getExplorerAccountUrl(event.account_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-charcoal-900 hover:text-near-dark underline break-all inline-flex items-center gap-1"
                  >
                    <span>{event.account_id}</span>
                    <ExternalLink className="w-3 h-3 text-charcoal-400 shrink-0" />
                  </a>
                </div>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <div>
                    {BigInt(event.amount || '0') > 0n ? (
                      <span className="font-black text-charcoal-900">
                        {formatNear(event.amount, 3)}{' '}
                        <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
                      </span>
                    ) : (
                      <span className="text-charcoal-400 text-[11px]">&mdash;</span>
                    )}
                  </div>

                  <div>
                    {isExecuted && (
                      <span className="text-[10px] font-bold text-near-dark bg-near-light px-2 py-0.5 rounded-md">
                        Success
                      </span>
                    )}
                    {isDenied && (
                      <span className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                        Code: {event.code}
                      </span>
                    )}
                    {!isExecuted && !isDenied && (
                      <span className="text-[10px] text-charcoal-600 bg-ivory-warm px-2 py-0.5 rounded-md">
                        Logged
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

        {/* Empty state for mobile */}
        {((activityTab === 'deposits' && filteredDeposits.length === 0) ||
          (activityTab === 'contract' && filteredContractEvents.length === 0) ||
          (activityTab === 'all' &&
            filteredDeposits.length === 0 &&
            filteredContractEvents.length === 0)) && (
          <div className="p-8 text-center text-xs text-charcoal-400 font-sans rounded-3xl bg-white/85 border border-white/90">
            No transactions match the selected criteria.
          </div>
        )}
      </div>

      {/* DESKTOP VIEW: High-Density Table */}
      <div className="hidden md:block rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-ivory-warm/80 border-b border-border/80 text-charcoal-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-4 px-6">Record / Seq</th>
                <th className="py-4 px-6">Transaction Type</th>
                <th className="py-4 px-6">Participant / Flow</th>
                <th className="py-4 px-6 text-right">Amount</th>
                <th className="py-4 px-6 text-right">Timestamp</th>
                <th className="py-4 px-6 text-right">Result & Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {/* 1. EXTERNAL DEPOSITS (Rendered at top when viewing all or deposits) */}
              {activityTab !== 'contract' &&
                filteredDeposits.map(deposit => (
                  <tr
                    key={deposit.txHash}
                    className="hover:bg-near-light/20 bg-near-light/5 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-near-dark text-[11px] bg-near-light px-2 py-0.5 rounded-md border border-near-green/30">
                          External Tx
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-near-light text-near-dark border border-near-green/40">
                        <Coins className="w-3.5 h-3.5 text-near-green" />
                        <span>Vault Funding</span>
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-charcoal-400 font-sans">From:</span>
                          <a
                            href={getExplorerAccountUrl(deposit.senderId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-charcoal-900 hover:text-near-dark underline"
                          >
                            {deposit.senderId}
                          </a>
                        </div>
                        <div className="text-[10px] text-charcoal-400 flex items-center gap-1 font-sans">
                          <span>To:</span>
                          <span className="font-mono text-charcoal-600">{deposit.receiverId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right font-black text-near-dark text-sm">
                      +{deposit.amountNear}{' '}
                      <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
                    </td>
                    <td className="py-4 px-6 text-right text-charcoal-500">
                      <span>{timeAgo(deposit.timestamp * 1_000_000)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={getExplorerTxUrl(deposit.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-near-dark hover:underline bg-white px-2.5 py-1 rounded-lg border border-border"
                          title="View transaction on NearBlocks"
                        >
                          <span>{truncateId(deposit.txHash, 6, 6)}</span>
                          <ExternalLink className="w-3 h-3 text-near-dark shrink-0" />
                        </a>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-near-dark bg-near-light px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3 text-near-green" />
                          <span>Confirmed</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}

              {/* 2. CONTRACT AUDIT EVENTS */}
              {activityTab !== 'deposits' &&
                filteredContractEvents.map(event => {
                  const meta = getAuditEventMeta(event.event_type);
                  const isDenied =
                    event.event_type === 'PaymentPolicyDenied' ||
                    event.event_type === 'PaymentPolicyInvalidated';
                  const isExecuted = event.event_type === 'PaymentExecuted';

                  return (
                    <tr key={event.sequence_id} className="hover:bg-ivory-warm/40 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-black text-charcoal-900">
                          #{event.sequence_id}
                        </span>
                        {event.request_id > 0 && (
                          <span className="text-charcoal-400 text-[11px] ml-1.5 font-sans">
                            (Req #{event.request_id})
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <a
                          href={getExplorerAccountUrl(event.account_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-charcoal-800 hover:text-near-dark underline inline-flex items-center gap-1"
                        >
                          <span>{event.account_id}</span>
                          <ExternalLink className="w-3 h-3 text-charcoal-400" />
                        </a>
                      </td>
                      <td className="py-4 px-6 text-right font-black text-charcoal-900">
                        {BigInt(event.amount || '0') > 0n ? (
                          <>
                            {formatNear(event.amount, 3)}{' '}
                            <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
                          </>
                        ) : (
                          <span className="text-charcoal-300">&mdash;</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right text-charcoal-500">
                        <span>{timeAgo(event.timestamp)}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        {isExecuted && (
                          <span className="text-[11px] font-bold text-near-dark">Success</span>
                        )}
                        {isDenied && (
                          <span className="text-[11px] font-bold text-rose-700">Code: {event.code}</span>
                        )}
                        {!isExecuted && !isDenied && (
                          <span className="text-[11px] text-charcoal-500">Logged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {/* Empty state desktop */}
              {((activityTab === 'deposits' && filteredDeposits.length === 0) ||
                (activityTab === 'contract' && filteredContractEvents.length === 0) ||
                (activityTab === 'all' &&
                  filteredDeposits.length === 0 &&
                  filteredContractEvents.length === 0)) && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-charcoal-400 font-sans">
                    No transactions match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: RECOVER MISSING DEPOSIT VIA NEAR RPC */}
      <AnimatePresence>
        {isRecoverOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-surface-white rounded-3xl p-6 sm:p-8 shadow-card border border-white/80 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-charcoal-900 font-extrabold text-lg">
                  <Coins className="w-5 h-5 text-near-dark" />
                  <span>Recover Past Deposit</span>
                </div>
                <button
                  onClick={() => {
                    setIsRecoverOpen(false);
                    setRecoverError(null);
                    setRecoverSuccess(null);
                  }}
                  className="p-1.5 rounded-full hover:bg-ivory-warm text-charcoal-400 hover:text-charcoal-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-charcoal-600 font-sans leading-relaxed">
                If you made a native deposit from Meteor Wallet or MyNearWallet before this session, enter the transaction hash below. The application will cryptographically verify the transfer on NEAR Testnet and add it to your persistent ledger.
              </p>

              <form onSubmit={handleRecoverDeposit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase font-bold text-charcoal-700 mb-1.5">
                    NEAR Testnet Transaction Hash:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 37oJPsbysoFLtzcUeKh1KZq4YEm14pxCepCzc5cz1Z54"
                    value={recoverTxHash}
                    onChange={e => setRecoverTxHash(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs font-mono text-charcoal-900 placeholder:text-charcoal-400 focus:border-near-green outline-none"
                  />
                  <div className="text-[10px] text-charcoal-400 mt-1 font-mono">
                    Target Vault: {overview.contractId}
                  </div>
                </div>

                {recoverError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{recoverError}</span>
                  </div>
                )}

                {recoverSuccess && (
                  <div className="p-3 rounded-xl bg-near-light border border-near-green/40 text-xs text-near-dark flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-near-green shrink-0 mt-0.5" />
                    <span>{recoverSuccess}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecoverOpen(false);
                      setRecoverError(null);
                      setRecoverSuccess(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:bg-ivory-warm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRecovering || !recoverTxHash.trim()}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all disabled:opacity-50"
                  >
                    {isRecovering ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying with RPC...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify & Import</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
