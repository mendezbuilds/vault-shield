import React from 'react';
import { Modal } from './Modal';
import { StagedTransaction } from '../../types/contract';
import { Shield, ArrowRight, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TxStagingModalProps {
  stagedTx: StagedTransaction | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TxStagingModal: React.FC<TxStagingModalProps> = ({
  stagedTx,
  onConfirm,
  onCancel,
}) => {
  if (!stagedTx) return null;

  const isMultiAction = Boolean(stagedTx.detailedActions && stagedTx.detailedActions.length > 0);

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={stagedTx.title || "Review Staged Owner Transaction"}
      description="Inspect the exact transaction payload before authorizing cryptographic signature."
      maxWidth="md"
    >
      <div className="space-y-4 py-1 text-sm font-sans">
        {/* Network & Identity Callout */}
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-bold text-charcoal-900 block mb-0.5">
              Owner-Authorized Transaction Gate
            </span>
            <span className="text-charcoal-600">
              This action requires cryptographic signing by the vault owner account ({stagedTx.signerId}).
              Verify all parameters below before approving.
            </span>
          </div>
        </div>

        {/* Signing Notice */}
        <div className="rounded-2xl bg-near-light/40 border border-near-green/30 p-3.5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-bold text-near-dark block mb-0.5">
              {isMultiAction ? 'Meteor Extension Popup Required' : 'Instant Session Key Execution'}
            </span>
            <span className="text-charcoal-700 leading-relaxed">
              {isMultiAction
                ? 'Because this transaction creates a subaccount and assigns a restricted access key, Meteor Wallet will open an extension popup asking for your FullAccess signature approval.'
                : 'Meteor may sign authorized transactions instantly using your session Function-Call key. An extension popup is not always required. Once execution is verified, you can view the transaction on NEAR Explorer.'}
            </span>
          </div>
        </div>

        {/* Transaction Metadata Grid */}
        <div className="rounded-2xl bg-ivory-warm border border-charcoal-200/80 p-3.5 space-y-2.5 text-xs font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-charcoal-200/60">
            <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
              Network
            </span>
            <span className="text-charcoal-900 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {stagedTx.network}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-charcoal-200/60">
            <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
              Signer (Wallet)
            </span>
            <span className="text-near-dark font-bold break-all">
              {stagedTx.signerId}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-charcoal-200/60">
            <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
              Receiver
            </span>
            <span className="text-charcoal-900 font-bold break-all">
              {stagedTx.receiverId}
            </span>
          </div>

          {stagedTx.methodName && (
            <div className="flex items-center justify-between pb-2 border-b border-charcoal-200/60">
              <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
                Contract Method
              </span>
              <span className="px-2 py-0.5 rounded bg-near-light text-near-dark font-bold text-xs">
                {stagedTx.methodName}()
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pb-2 border-b border-charcoal-200/60">
            <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
              Deposit / Funding
            </span>
            <span className="text-charcoal-800 font-bold">
              {stagedTx.depositNear} ({stagedTx.depositYocto} yocto)
            </span>
          </div>

          {stagedTx.gasTgas && (
            <div className="flex items-center justify-between">
              <span className="text-charcoal-500 font-bold uppercase tracking-wider text-[10px]">
                Prepaid Gas
              </span>
              <span className="text-charcoal-800 font-bold flex items-center gap-1.5">
                <span>{stagedTx.gasTgas}</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  &le; 300 Tgas Limit
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Detailed Actions (if multi-action) */}
        {stagedTx.detailedActions && stagedTx.detailedActions.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block">
              Atomic Actions ({stagedTx.detailedActions.length}):
            </span>
            <div className="space-y-1.5 font-mono text-xs">
              {stagedTx.detailedActions.map((act, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-white border border-charcoal-200 shadow-sm flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-near-light text-near-dark text-[10px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-bold text-charcoal-900">{act.action}</span>
                  </div>
                  <div className="text-[11px] text-charcoal-600 pl-7 break-all">
                    {act.details}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Method Arguments JSON Display (if single function call) */}
        {stagedTx.args && (
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1.5">
              Exact Serialized Arguments Payload:
            </span>
            <pre className="p-3 rounded-xl bg-charcoal-900 text-ivory text-[11px] font-mono overflow-x-auto max-h-48 border border-charcoal-800 selection:bg-near-green selection:text-charcoal-900">
              {JSON.stringify(stagedTx.args, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-charcoal-300 text-charcoal-700 hover:bg-charcoal-100 text-xs font-bold transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft flex items-center gap-2 transition-all"
          >
            <span>Confirm & Authorize Transaction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Modal>
  );
};

