import React, { useState } from 'react';
import { Modal } from './Modal';
import { useWallet, KNOWN_PERSONAS } from '../../context/WalletContext';
import { Wallet, Shield, Bot, UserX, CheckCircle2 } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { accountId, authType, connectGenuineWallet, connectPersona } = useWallet();
  const [customAccount, setCustomAccount] = useState('');

  const handleConnectGenuine = async () => {
    onClose();
    await connectGenuineWallet();
  };

  const handleSelectPersona = async (id: string) => {
    await connectPersona(id);
    onClose();
  };

  const handleCustomConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAccount.trim()) return;
    await connectPersona(customAccount.trim());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect NEAR Testnet Identity"
      description="Authenticate with a genuine NEAR Web3 wallet or activate an evaluation persona for hackathon judging."
      maxWidth="md"
    >
      <div className="space-y-5 sm:space-y-6">
        {/* Section 1: Genuine Web3 Wallet Authentication */}
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-2">
            Section 1 &bull; Genuine Web3 Wallet Sign-In
          </span>
          <div
            onClick={handleConnectGenuine}
            className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between touch-manipulation ${
              authType === 'genuine_wallet'
                ? 'border-near-green bg-near-light/40 shadow-soft'
                : 'border-border bg-surface-white hover:border-near-border hover:shadow-card'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 rounded-xl bg-surface-white border border-border text-near-dark shadow-soft shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-bold text-charcoal-900">MyNearWallet Testnet</span>
                  <span className="text-[9px] sm:text-[10px] font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded bg-near-light text-near-dark">
                    WEB3 WALLET
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-charcoal-600 mt-0.5">
                  Direct wallet authentication via official NEAR Wallet Selector.
                </p>
              </div>
            </div>

            {authType === 'genuine_wallet' && (
              <CheckCircle2 className="w-5 h-5 text-near-green shrink-0 ml-2" />
            )}
          </div>
        </div>

        {/* Section 2: Segregated Judge / Evaluation Personas */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500">
              Section 2 &bull; Judge &amp; Evaluator Personas
            </span>
            <span className="text-[9px] font-mono uppercase bg-ivory-warm px-2 py-0.5 rounded text-charcoal-500 font-bold">
              Testnet Only
            </span>
          </div>
          <p className="text-xs text-charcoal-500 mb-3">
            Since judges do not hold private keys for the deployed testnet contract, these evaluation personas permit instant end-to-end testing.
          </p>

          <div className="space-y-2">
            {KNOWN_PERSONAS.map(p => {
              const isCurrent = accountId === p.id;
              const isRevoked = p.id.includes('rev');

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPersona(p.id)}
                  className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between touch-manipulation ${
                    isCurrent
                      ? 'border-charcoal-900 bg-ivory-warm'
                      : 'border-border bg-surface-white hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-ivory-warm border border-border mt-0.5 shrink-0">
                      {isRevoked ? (
                        <UserX className="w-4 h-4 text-rose-600" />
                      ) : p.role === 'owner' ? (
                        <Shield className="w-4 h-4 text-charcoal-900" />
                      ) : (
                        <Bot className="w-4 h-4 text-near-dark" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-charcoal-900">{p.label}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-ivory-warm border border-border text-charcoal-600 font-bold">
                          {p.badge}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-mono text-charcoal-500 mt-0.5 break-all">{p.id}</div>
                      <p className="text-[10px] sm:text-[11px] text-charcoal-600 mt-1 leading-relaxed">{p.description}</p>
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="text-[10px] font-mono font-bold text-charcoal-900 uppercase shrink-0 ml-2">
                      ACTIVE
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Custom Testnet Account */}
        <div className="pt-4 border-t border-border">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-2">
            Section 3 &bull; Enter Any NEAR Testnet Account
          </span>
          <form onSubmit={handleCustomConnect} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. auditor.testnet"
              value={customAccount}
              onChange={e => setCustomAccount(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:border-charcoal-800"
            />
            <button
              type="submit"
              disabled={!customAccount.trim()}
              className="px-4 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold disabled:opacity-40 shadow-soft transition-all touch-manipulation"
            >
              Connect
            </button>
          </form>
        </div>
      </div>
    </Modal>
  );
};
