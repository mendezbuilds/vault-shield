import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview, PaymentRequestView } from '../../types/contract';
import { Modal } from '../common/Modal';
import { formatNear, timeAgo, formatTimestamp, getExplorerAccountUrl } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';
import {
  CheckSquare,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Scale,
  Info,
} from 'lucide-react';

interface ApprovalsPageProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
}

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({ overview, onRefresh }) => {
  const { accountId, role, executeContractCall } = useWallet();

  const [selectedRequest, setSelectedRequest] = useState<PaymentRequestView | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{
    type: 'approve' | 'reject' | 'expire';
    requestId: number;
  } | null>(null);

  const isOwner = role === 'owner' || accountId === overview.ownerId;

  const handleAction = async () => {
    if (!actionConfirm) return;
    const { type, requestId } = actionConfirm;
    setActionConfirm(null);

    let method = 'approve_request';
    if (type === 'reject') method = 'reject_request';
    if (type === 'expire') method = 'expire_request';

    const res = await executeContractCall(method, { request_id: requestId });
    if (res.success) {
      setSelectedRequest(null);
      onRefresh();
    }
  };

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'NewDestinationOnly':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            NEW DESTINATION
          </span>
        );
      case 'AboveThresholdOnly':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            ABOVE AUTO-THRESHOLD
          </span>
        );
      case 'AboveThresholdAndNewDestination':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-900 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            THRESHOLD &amp; NEW DEST
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-ivory-warm text-charcoal-700 border border-border">
            {reason}
          </span>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP BANNER: APPROVALS GOVERNANCE COMMAND */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-amber-500/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300">
              HUMAN-IN-THE-LOOP EXCEPTION GATE
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              ATOMIC ESCROW LOCK
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <CheckSquare className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600 shrink-0" />
            <span>Owner Authorization Queue</span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Requests exceeding deterministic thresholds or targeting unlisted recipient accounts require explicit owner authorization. Capital is escrowed on-chain upon submission.
          </p>
        </div>

        {/* Global Queue Telemetry */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-ivory-warm border border-border text-left sm:text-right font-mono w-full sm:w-auto">
            <div className="text-[9px] sm:text-[10px] text-charcoal-400 uppercase font-bold">
              Global Queue Occupancy
            </div>
            <div className="text-lg sm:text-xl font-black text-charcoal-900 mt-0.5">
              {overview.globalPendingCount} <span className="text-xs text-charcoal-500 font-normal">/ 32 Slots</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. REQUESTS DIRECTORY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/70">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal-500">
            PENDING REQUESTS ({overview.pendingRequests.length})
          </span>
          <span className="text-xs font-mono text-charcoal-400">
            Locked Escrows: {formatNear(overview.pendingReserved, 3)} NEAR
          </span>
        </div>

        {overview.pendingRequests.length === 0 ? (
          <div className="p-10 sm:p-16 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card text-center space-y-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-near-light text-near-dark flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-charcoal-900">
                Approvals Queue Clear
              </h3>
              <p className="text-xs text-charcoal-500 max-w-sm mx-auto mt-1 font-sans">
                All agent payment intents have been either automatically dispatched, authorized by owner, rejected, or expired.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {overview.pendingRequests.map(req => {
              const nowNanos = BigInt(Date.now()) * 1_000_000n;
              const expiryNanos = BigInt(req.created_at) + BigInt(req.ttl_nanos);
              const isExpired = nowNanos >= expiryNanos;

              return (
                <div
                  key={req.id}
                  className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 transition-all hover:shadow-elevation"
                >
                  {/* Left Request Info */}
                  <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black font-mono text-charcoal-900">
                        Request #{req.id}
                      </span>
                      {getReasonBadge(req.origin_reason)}
                      {isExpired && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-mono font-bold">
                          EXPIRED (Release Ready)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
                      <div className="text-charcoal-600 flex items-start gap-1.5 min-w-0">
                        <span className="text-charcoal-400 shrink-0">Agent:</span>
                        <a
                          href={getExplorerAccountUrl(req.agent_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-near-dark font-bold underline truncate text-charcoal-800 break-all"
                        >
                          {req.agent_id}
                        </a>
                      </div>
                      <div className="text-charcoal-600 flex items-start gap-1.5 min-w-0">
                        <span className="text-charcoal-400 shrink-0">Destination:</span>
                        <a
                          href={getExplorerAccountUrl(req.destination)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-near-dark font-bold underline truncate text-charcoal-800 break-all"
                        >
                          {req.destination}
                        </a>
                      </div>
                      <div className="text-charcoal-600 flex items-center gap-1.5">
                        <span className="text-charcoal-400">Created:</span>
                        <span>{timeAgo(req.created_at)}</span>
                      </div>
                      <div className="text-charcoal-600 flex items-center gap-1.5 min-w-0">
                        <span className="text-charcoal-400 shrink-0">Memo:</span>
                        <span className="text-charcoal-900 italic truncate font-sans">
                          "{req.reason || 'No description provided'}"
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Amount & Actions */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/70 shrink-0">
                    <div className="text-left sm:text-right font-mono">
                      <div className="text-[10px] text-charcoal-400 uppercase font-bold">Escrow Amount</div>
                      <div className="text-2xl font-black text-charcoal-900">
                        {formatNear(req.amount, 3)} <span className="text-xs text-charcoal-500 font-normal">NEAR</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                      {isExpired ? (
                        <button
                          onClick={() => setActionConfirm({ type: 'expire', requestId: req.id })}
                          className="col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-ivory-warm hover:bg-border/60 text-charcoal-800 border border-border text-xs font-bold transition-all shadow-soft touch-manipulation"
                        >
                          <Clock className="w-4 h-4 text-cyan-600" />
                          <span>Release Expired</span>
                        </button>
                      ) : (
                        <>
                          {isOwner && (
                            <>
                              <button
                                onClick={() => setActionConfirm({ type: 'approve', requestId: req.id })}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold transition-all shadow-soft active:scale-[0.98] touch-manipulation"
                              >
                                <CheckCircle className="w-4 h-4 text-white" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => setActionConfirm({ type: 'reject', requestId: req.id })}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold transition-all shadow-soft touch-manipulation"
                              >
                                <XCircle className="w-4 h-4 text-rose-700" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => setSelectedRequest(req)}
                        className={`${
                          isExpired ? 'col-span-2' : ''
                        } inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-white hover:bg-ivory-warm border border-border text-xs font-bold text-charcoal-700 transition-all touch-manipulation`}
                      >
                        <span>Inspect</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. ATOMIC ON-CHAIN POLICY REVALIDATION EXPLANATION */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-2xl bg-near-light text-near-dark flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-extrabold text-charcoal-900">
              Atomic On-Chain Policy Revalidation Guarantee
            </h4>
            <p className="mt-1.5 text-xs text-charcoal-600 leading-relaxed font-sans">
              When an owner approves a pending request, the smart contract does not blindly dispatch tokens. It cryptographically re-validates all 5 conditions on-chain: (1) vault is not paused, (2) agent has not been revoked, (3) amount fits remaining 24h allowance, (4) liquid balance is solvent above storage reserve, and (5) destination is valid. If any condition fails, the request is cleanly invalidated and capital remains secure.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Inspect Request */}
      {selectedRequest && (
        <Modal
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title={`Payment Intent # ${selectedRequest.id}`}
          description="Detailed on-chain state parameters for this pending payment request."
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="p-4 rounded-xl bg-ivory-warm/70 border border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">REQUEST ID</span>
                <span className="font-bold text-charcoal-900">#{selectedRequest.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">AMOUNT</span>
                <span className="font-bold text-charcoal-900">{formatNear(selectedRequest.amount, 4)} NEAR</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">ORIGIN REASON</span>
                <span className="font-bold text-amber-800">{selectedRequest.origin_reason}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">SUBMITTED BY</span>
                <span className="font-bold text-charcoal-900 break-all">{selectedRequest.agent_id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">DESTINATION</span>
                <span className="font-bold text-charcoal-900 break-all">{selectedRequest.destination}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">CREATED TIME</span>
                <span className="text-charcoal-700">{formatTimestamp(selectedRequest.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">TTL EXPIRATION</span>
                <span className="text-charcoal-700">
                  {formatTimestamp(selectedRequest.created_at + selectedRequest.ttl_nanos)}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Action Confirmation */}
      {actionConfirm && (
        <Modal
          isOpen={!!actionConfirm}
          onClose={() => setActionConfirm(null)}
          title={`Confirm ${actionConfirm.type.toUpperCase()}`}
          description={`Are you sure you want to ${actionConfirm.type} Request #${actionConfirm.requestId}? This contract call will be executed on NEAR Testnet.`}
        >
          <div className="pt-3 flex justify-end gap-2.5">
            <button
              onClick={() => setActionConfirm(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              className={`px-5 py-2 rounded-xl text-xs font-bold shadow-soft transition-all text-white ${
                actionConfirm.type === 'approve'
                  ? 'bg-near-dark hover:bg-near-green'
                  : actionConfirm.type === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-cyan-600 hover:bg-cyan-700'
              }`}
            >
              Confirm {actionConfirm.type}
            </button>
          </div>
        </Modal>
      )}
    </motion.div>
  );
};
