import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview, CompactAuditRecord } from '../../types/contract';
import { formatNear, timeAgo, formatTimestamp, getAuditEventMeta, getExplorerAccountUrl } from '../../utils/formatters';
import { History, Search, Download, ExternalLink } from 'lucide-react';

interface TransactionsPageProps {
  overview: VaultAccountOverview;
}

export const TransactionsPage: React.FC<TransactionsPageProps> = ({ overview }) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract transaction events from the audit buffer
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

  const filteredEvents = paymentEvents.filter(event => {
    // Status filter
    if (statusFilter !== 'all' && event.event_type !== statusFilter) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAccount = event.account_id.toLowerCase().includes(q);
      const matchReqId = event.request_id.toString().includes(q);
      const matchSeq = event.sequence_id.toString().includes(q);
      return matchAccount || matchReqId || matchSeq;
    }
    return true;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(paymentEvents, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `near_vault_audit_tx_${Date.now()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
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
              CIRCULAR RING BUFFER &bull; 50 SLOTS
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <History className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
            <span>Contract Transaction Ledger</span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Verifiable transaction lifecycle events recorded immutably on NEAR Public Testnet. Every payment request, approval, execution, and policy denial is cryptographically logged.
          </p>
        </div>

        {/* Telemetry and Export */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto">
          <div className="px-4 py-2.5 sm:py-3 rounded-2xl bg-ivory-warm border border-border text-left sm:text-right font-mono flex-1 sm:flex-initial">
            <div className="text-[9px] sm:text-[10px] text-charcoal-400 uppercase font-bold">Recorded</div>
            <div className="text-lg sm:text-xl font-black text-charcoal-900">
              {paymentEvents.length} <span className="text-xs text-charcoal-500 font-normal">Events</span>
            </div>
          </div>

          <button
            onClick={handleExportJSON}
            className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
          >
            <Download className="w-4 h-4 text-near-dark" />
            <span className="hidden xs:inline">Export JSON</span>
            <span className="xs:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* 2. FILTER & SEARCH CONTROLS */}
      <div className="p-4 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          {/* Status Filters (Scrollable on small mobile) */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap">
            {[
              { id: 'all', label: 'All Events' },
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
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] sm:text-xs touch-manipulation ${
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

          {/* Search Bar */}
          <div className="relative shrink-0 sm:w-64">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search account or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 sm:py-2 rounded-xl bg-ivory-warm border border-border text-xs font-mono text-charcoal-900 placeholder:text-charcoal-400 focus:border-near-green outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. DUAL REPRESENTATION: MOBILE CARDS (MOBILE) VS DESKTOP TABLE (DESKTOP) */}

      {/* MOBILE VIEW: Dedicated Structured Card List */}
      <div className="md:hidden space-y-3">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-charcoal-400 font-sans rounded-3xl bg-white/85 border border-white/90">
            No transactions match the selected filter.
          </div>
        ) : (
          filteredEvents.map(event => {
            const meta = getAuditEventMeta(event.event_type);
            const isDenied = event.event_type === 'PaymentPolicyDenied' || event.event_type === 'PaymentPolicyInvalidated';
            const isExecuted = event.event_type === 'PaymentExecuted';

            return (
              <div
                key={event.sequence_id}
                className="p-4 rounded-2xl bg-white/90 border border-charcoal-200/70 shadow-soft space-y-2.5 font-mono"
              >
                {/* Top line: Seq, Req, Badge, Time */}
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

                {/* Account line */}
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

                {/* Bottom line: Amount & Result */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <div>
                    {BigInt(event.amount || '0') > 0n ? (
                      <span className="font-black text-charcoal-900">
                        {formatNear(event.amount, 3)} <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
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
          })
        )}
      </div>

      {/* DESKTOP VIEW: High-Density Table */}
      <div className="hidden md:block rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-ivory-warm/80 border-b border-border/80 text-charcoal-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-4 px-6">Seq # / Req</th>
                <th className="py-4 px-6">Event Type</th>
                <th className="py-4 px-6">Participant Account</th>
                <th className="py-4 px-6 text-right">Amount</th>
                <th className="py-4 px-6 text-right">Timestamp</th>
                <th className="py-4 px-6 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-charcoal-400 font-sans">
                    No transactions match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredEvents.map(event => {
                  const meta = getAuditEventMeta(event.event_type);
                  const isDenied = event.event_type === 'PaymentPolicyDenied' || event.event_type === 'PaymentPolicyInvalidated';
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
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeClass}`}>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
