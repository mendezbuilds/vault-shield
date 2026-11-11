import React from 'react';
import { Modal } from './Modal';
import { useWallet } from '../../context/WalletContext';
import { getExplorerTxUrl } from '../../utils/formatters';
import { CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';

export const TxNotificationModal: React.FC = () => {
  const { txStatus, clearTxStatus } = useWallet();

  if (txStatus.state === 'idle') return null;

  const isPending = txStatus.state === 'preparing' || txStatus.state === 'signing' || txStatus.state === 'submitting';
  const isSuccess = txStatus.state === 'confirmed';
  const isFailed = txStatus.state === 'failed';

  return (
    <Modal
      isOpen={true}
      onClose={isPending ? () => {} : clearTxStatus}
      title={isSuccess ? 'Transaction Confirmed' : isFailed ? 'Transaction Rejected / Denied' : 'Executing On-Chain Action'}
      maxWidth="sm"
    >
      <div className="text-center py-4 space-y-5">
        {/* Status Icon */}
        <div className="flex justify-center">
          {isPending && (
            <div className="p-4 rounded-full bg-ivory-warm border border-border text-charcoal-800">
              <Loader2 className="w-8 h-8 animate-spin text-near-dark" />
            </div>
          )}
          {isSuccess && (
            <div className="p-4 rounded-full bg-near-light border border-near-green/30 text-near-dark">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}
          {isFailed && (
            <div className="p-4 rounded-full bg-rose-50 border border-rose-300 text-rose-600">
              <AlertTriangle className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Message */}
        <div>
          <p className="text-sm text-charcoal-900 font-bold">
            {txStatus.message || (isFailed ? 'The transaction was denied by contract policy or rejected.' : '')}
          </p>
          {isSuccess && (
            <p className="text-[11px] text-charcoal-600 mt-1">
              Signed via session key or wallet approval. Execution verified on NEAR Public Testnet.
            </p>
          )}
          {txStatus.error && (
            <div className="mt-3 p-3 rounded-xl bg-ivory-warm border border-border text-left overflow-x-auto max-h-36 text-xs font-mono text-rose-700">
              {txStatus.error}
            </div>
          )}
        </div>

        {/* Tx Hash Link */}
        {txStatus.txHash && (
          <div className="pt-2 border-t border-border">
            <a
              href={getExplorerTxUrl(txStatus.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-near-dark hover:underline font-mono font-bold"
            >
              <span>View On NearBlocks Explorer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Close Action */}
        {!isPending && (
          <div className="pt-2">
            <button
              onClick={clearTxStatus}
              className="w-full py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
