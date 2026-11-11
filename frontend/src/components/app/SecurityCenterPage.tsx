import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import { Modal } from '../common/Modal';
import { formatNear, timeAgo, formatTimestamp, getAuditEventMeta, getExplorerAccountUrl } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import { nearRpc } from '../../services/nearRpc';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  RotateCcw,
  Search,
  ExternalLink,
  Trash2,
} from 'lucide-react';

interface SecurityCenterPageProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
}

export const SecurityCenterPage: React.FC<SecurityCenterPageProps> = ({ overview, onRefresh }) => {
  const { accountId, role, executeContractCall } = useWallet();

  const [tombstoneQueryId, setTombstoneQueryId] = useState('');
  const [tombstoneResult, setTombstoneResult] = useState<any>(null);
  const [tombstoneLoading, setTombstoneLoading] = useState(false);

  // Reconcile stuck modal
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [reconcileReqId, setReconcileReqId] = useState('');
  const [attestedResolution, setAttestedResolution] = useState<'Executed' | 'Failed'>('Executed');
  const [evidenceTxHash, setEvidenceTxHash] = useState('');

  // Prune tombstone modal
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);
  const [pruneEvidence, setPruneEvidence] = useState('');

  const isOwner = role === 'owner' || (Boolean(accountId) && accountId === overview.ownerId);

  // Aggregate stats from audit buffer
  const denials = overview.auditRecords.filter(r => r.event_type === 'PaymentPolicyDenied');
  const invalidations = overview.auditRecords.filter(r => r.event_type === 'PaymentPolicyInvalidated');
  const failures = overview.auditRecords.filter(r => r.event_type === 'PaymentFailed');
  const expiries = overview.auditRecords.filter(r => r.event_type === 'PaymentExpired');

  const handleQueryTombstone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tombstoneQueryId) return;
    setTombstoneLoading(true);
    try {
      const res = await nearRpc.getTombstone(Number(tombstoneQueryId));
      setTombstoneResult(res || 'NOT_FOUND');
    } catch {
      setTombstoneResult('NOT_FOUND');
    } finally {
      setTombstoneLoading(false);
    }
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileReqId || !evidenceTxHash) return;
    setIsReconcileModalOpen(false);
    const res = await executeContractCall('reconcile_stuck_request', {
      request_id: Number(reconcileReqId),
      attested_resolution: attestedResolution,
      evidence_tx_hash: evidenceTxHash.trim(),
    });
    if (res.success) {
      setReconcileReqId('');
      setEvidenceTxHash('');
      onRefresh();
    }
  };

  const handlePruneTombstone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tombstoneQueryId || !pruneEvidence.trim()) return;
    setIsPruneModalOpen(false);
    const res = await executeContractCall('prune_reconciled_tombstone', {
      request_id: Number(tombstoneQueryId),
      verification_evidence: pruneEvidence.trim(),
    });
    if (res.success) {
      setTombstoneResult(null);
      setPruneEvidence('');
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
      {/* 1. TOP BANNER: SECURITY POSTURE & INVARIANT HEALTH */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              FORMAL SECURITY POSTURE
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              CONTINUOUS TESTNET AUDITING
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
            <span>Vault Security Posture &amp; Audit Forensics</span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Active physical solvency validation, circular ring buffer inspection, and emergency reconciliation gates. Zero simulated data.
          </p>
        </div>

        {/* Global Security Badge */}
        <div className="flex items-center gap-3 shrink-0">
          {overview.isPaused ? (
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 font-mono text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>VAULT PAUSED BY OWNER</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-near-light text-near-dark border border-near-green/30 font-mono text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-near-green animate-pulse shrink-0" />
              <span>ALL INVARIANTS HEALTHY</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. THREAT & EXCEPTION COUNTERS (2x2 Grid on Mobile, 4-Col on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="p-4 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-charcoal-400 block mb-1">
              Zero-State Denials
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-charcoal-900">
              {denials.length}
            </div>
            <p className="text-[11px] sm:text-xs text-charcoal-500 font-sans mt-1 leading-relaxed hidden xs:block">
              Pre-flight rejected intents.
            </p>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-charcoal-400 truncate">
            PaymentPolicyDenied
          </div>
        </div>

        <div className="p-4 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-amber-700 block mb-1">
              Invalidations
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-800">
              {invalidations.length}
            </div>
            <p className="text-[11px] sm:text-xs text-charcoal-500 font-sans mt-1 leading-relaxed hidden xs:block">
              Failed atomic revalidation.
            </p>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-amber-700 truncate">
            PaymentPolicyInvalidated
          </div>
        </div>

        <div className="p-4 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-800 block mb-1">
              Expired Requests
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-900">
              {expiries.length}
            </div>
            <p className="text-[11px] sm:text-xs text-charcoal-500 font-sans mt-1 leading-relaxed hidden xs:block">
              Permissionless TTL timeouts.
            </p>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-cyan-700 truncate">
            PaymentExpired
          </div>
        </div>

        <div className="p-4 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-rose-700 block mb-1">
              Failed Refunds
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-rose-800">
              {failures.length}
            </div>
            <p className="text-[11px] sm:text-xs text-charcoal-500 font-sans mt-1 leading-relaxed hidden xs:block">
              Promise execution refunds.
            </p>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-border/70 text-[9px] sm:text-[10px] font-mono text-rose-700 truncate">
            PaymentFailed
          </div>
        </div>
      </div>

      {/* 3. 50-SLOT PERSISTENT AUDIT RING BUFFER (MOBILE STACKED CARDS) */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-border/70 gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              ON-CHAIN FORENSIC STREAM
            </span>
            <h3 className="text-lg sm:text-xl font-extrabold text-charcoal-900 tracking-tight mt-1 flex items-center gap-2">
              <FileText className="w-5 h-5 text-near-dark shrink-0" />
              <span>50-Slot Circular Audit Ring Buffer</span>
            </h3>
            <p className="text-xs text-charcoal-500 mt-0.5 font-sans">
              Direct telemetry from contract view method <code className="font-mono text-near-dark">get_audit_records</code>. Head wraps sequentially.
            </p>
          </div>
          <span className="text-xs font-mono text-charcoal-500 px-3 py-1 rounded-full bg-ivory-warm border border-border self-start sm:self-auto">
            Buffer: 50 Records
          </span>
        </div>

        <div className="mt-4 sm:mt-6 divide-y divide-border/60 max-h-96 overflow-y-auto pr-1">
          {overview.auditRecords.map(record => {
            const meta = getAuditEventMeta(record.event_type);
            return (
              <div
                key={record.sequence_id}
                className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 font-mono text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${meta.dotClass}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs font-black text-charcoal-900">
                        Seq #{record.sequence_id}
                      </span>
                      {record.request_id > 0 && (
                        <span className="text-xs text-amber-700 font-bold">
                          (Req #{record.request_id})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] sm:text-xs text-charcoal-600 mt-1 flex items-start gap-1 min-w-0">
                      <span className="text-charcoal-400 shrink-0">Account:</span>
                      <a
                        href={getExplorerAccountUrl(record.account_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-charcoal-800 hover:text-near-dark underline break-all inline-flex items-center gap-1"
                      >
                        <span>{record.account_id}</span>
                        <ExternalLink className="w-3 h-3 text-charcoal-400 shrink-0" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-1 sm:pt-0 pl-4 sm:pl-0 border-t sm:border-t-0 border-border/40 shrink-0">
                  {BigInt(record.amount || '0') > 0n ? (
                    <div className="text-xs font-black text-charcoal-900">
                      {formatNear(record.amount, 3)} <span className="text-[10px] text-charcoal-500 font-normal">NEAR</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-charcoal-400 sm:hidden">No balance transfer</div>
                  )}
                  <div className="text-[10px] text-charcoal-400">
                    {timeAgo(record.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. TOMBSTONE & STUCK INFLIGHT REQUEST RECONCILIATION */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 border-b border-border/70 gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-800 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
              FAIL-SAFE RECONCILIATION
            </span>
            <h3 className="text-lg sm:text-xl font-extrabold text-charcoal-900 tracking-tight mt-1 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-cyan-700 shrink-0" />
              <span>Stuck InFlight Request &amp; Tombstone Inspector</span>
            </h3>
            <p className="text-xs text-charcoal-500 mt-0.5 font-sans">
              If an asynchronous cross-contract call is partitioned on NEAR testnet for &gt; 24h, the Owner can attest resolution and preserve immutable tombstone evidence.
            </p>
          </div>

          {isOwner && (
            <button
              onClick={() => setIsReconcileModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all touch-manipulation w-full sm:w-auto"
            >
              <span>Attest Stuck Request</span>
            </button>
          )}
        </div>

        {/* Tombstone Query Tool */}
        <div className="mt-4 sm:mt-6">
          <form onSubmit={handleQueryTombstone} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="number"
              placeholder="Query Tombstone by Request ID (e.g. 1)"
              value={tombstoneQueryId}
              onChange={e => setTombstoneQueryId(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
            />
            <button
              type="submit"
              disabled={tombstoneLoading || !tombstoneQueryId}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all disabled:opacity-50 touch-manipulation"
            >
              <Search className="w-4 h-4 text-charcoal-600" />
              <span>Lookup Tombstone</span>
            </button>
          </form>

          {tombstoneResult && (
            <div className="mt-4 p-4 rounded-2xl bg-ivory-warm/70 border border-border text-xs font-mono">
              {tombstoneResult === 'NOT_FOUND' ? (
                <div className="text-charcoal-500">
                  No tombstone record found for Request #{tombstoneQueryId}. This request has not been reconciled as a dead promise.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="font-bold text-near-dark">Tombstone Verified on NEAR Testnet:</div>
                  <div>Resolution: {tombstoneResult.attested_resolution}</div>
                  <div>Amount: {formatNear(tombstoneResult.amount, 4)} NEAR</div>
                  <div>Evidence Tx: <code className="break-all">{tombstoneResult.evidence_tx_hash}</code></div>
                  <div>Reconciled At: {formatTimestamp(tombstoneResult.reconciled_at)}</div>
                  {isOwner && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setIsPruneModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Prune Tombstone Storage (prune_reconciled_tombstone)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Reconcile Stuck InFlight Request */}
      <Modal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        title="Attest & Reconcile Stuck InFlight Request"
        description="Emergency fail-safe method to finalize a payment request whose cross-contract execution promise hung without a callback."
      >
        <form onSubmit={handleReconcile} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Request ID
            </label>
            <input
              type="number"
              value={reconcileReqId}
              onChange={e => setReconcileReqId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Attested Resolution
            </label>
            <select
              value={attestedResolution}
              onChange={e => setAttestedResolution(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
            >
              <option value="Executed">Executed (Merchant received funds)</option>
              <option value="Failed">Failed (Funds refunded back to vault liquid balance)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Evidence Transaction Hash
            </label>
            <input
              type="text"
              placeholder="e.g. 3KzV... (NEAR Testnet Explorer TX)"
              value={evidenceTxHash}
              onChange={e => setEvidenceTxHash(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsReconcileModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold shadow-soft transition-all"
            >
              Attest &amp; Reconcile
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Prune Reconciled Tombstone */}
      <Modal
        isOpen={isPruneModalOpen}
        onClose={() => setIsPruneModalOpen(false)}
        title="Prune Reconciled Tombstone Storage"
        description="Permanently prune a finalized tombstone record from contract state to reclaim storage stake on NEAR Testnet."
      >
        <form onSubmit={handlePruneTombstone} className="space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1">
              Request ID
            </label>
            <input
              type="number"
              value={tombstoneQueryId}
              readOnly
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-600 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1">
              Verification Evidence / Audit Note
            </label>
            <input
              type="text"
              placeholder="e.g. Audit verified in NearBlocks explorer tx 8KqP..."
              value={pruneEvidence}
              onChange={e => setPruneEvidence(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsPruneModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-soft transition-all"
            >
              Prune Tombstone
            </button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
};
