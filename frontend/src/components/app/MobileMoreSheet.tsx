import React, { useEffect } from 'react';
import {
  Bot,
  ShieldAlert,
  Settings,
  X,
  Globe,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';
import { AppPage } from './AppSidebar';
import { VAULT_CONTRACT_ID } from '../../types/contract';
import { getExplorerAccountUrl, truncateId } from '../../utils/formatters';
import { useWallet } from '../../context/WalletContext';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: AppPage;
  onSelectPage: (page: AppPage) => void;
  onExitToLanding: () => void;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  isOpen,
  onClose,
  currentPage,
  onSelectPage,
  onExitToLanding,
}) => {
  const { accountId, role } = useWallet();

  // Close on Escape key and prevent background scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const secondaryNavItems = [
    {
      id: 'agents' as AppPage,
      label: 'AI Agents',
      description: 'Spend allowances & access keys',
      icon: <Bot className="w-5 h-5 text-near-dark" />,
      color: 'bg-near-light text-near-dark',
    },
    {
      id: 'security' as AppPage,
      label: 'Security Center',
      description: 'Threat defenses & audit ledger',
      icon: <ShieldAlert className="w-5 h-5 text-rose-600" />,
      color: 'bg-rose-50 text-rose-600',
    },
    {
      id: 'settings' as AppPage,
      label: 'Settings',
      description: 'Node topology & state dump',
      icon: <Settings className="w-5 h-5 text-charcoal-700" />,
      color: 'bg-ivory-warm text-charcoal-700',
    },
  ];

  const handleItemClick = (page: AppPage) => {
    onSelectPage(page);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex justify-end">
      {/* Frosted Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-charcoal-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* Slide-out Sheet */}
      <div
        role="dialog"
        aria-label="More navigation options"
        className="relative z-10 w-[84vw] max-w-sm h-full bg-ivory border-l border-border shadow-elevation flex flex-col justify-between animate-in slide-in-from-right duration-300 overflow-y-auto"
      >
        {/* Header */}
        <div>
          <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-surface-white/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-ivory-warm border border-border flex items-center justify-center text-near-dark shadow-soft">
                <Layers className="w-4 h-4 text-near-dark" />
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-tight text-charcoal-900">
                  More Modules
                </div>
                <div className="text-[10px] text-charcoal-400 font-mono">
                  Autonomous Protocol
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close navigation sheet"
              className="p-2 rounded-xl text-charcoal-500 hover:text-charcoal-900 hover:bg-ivory-warm transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Connected Signer Status */}
          <div className="p-4 border-b border-border bg-surface-white/40">
            <div className="text-[10px] font-mono uppercase tracking-wider text-charcoal-400 font-bold mb-1.5">
              Connected Persona
            </div>
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-white border border-border shadow-soft">
              <div className="truncate font-mono text-xs font-bold text-charcoal-900">
                {accountId ? truncateId(accountId, 8, 8) : 'Public Auditor (Read-Only)'}
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-near-light text-near-dark shrink-0">
                {role ? role.toUpperCase() : 'AUDITOR'}
              </span>
            </div>
          </div>

          {/* Secondary Navigation Items */}
          <div className="p-3 space-y-2">
            <div className="px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-wider text-charcoal-400 font-bold">
              Secondary Modules
            </div>

            {secondaryNavItems.map(item => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left touch-manipulation ${
                    isActive
                      ? 'bg-surface-white border border-border shadow-soft font-bold'
                      : 'hover:bg-surface-white/80 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border shadow-soft ${
                        isActive ? 'bg-near-dark text-white' : 'bg-surface-white'
                      }`}
                    >
                      {React.cloneElement(item.icon, {
                        className: `w-5 h-5 ${isActive ? 'text-white' : ''}`,
                      })}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-charcoal-900 truncate">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-charcoal-500 font-sans truncate">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isActive ? 'text-near-dark translate-x-0.5' : 'text-charcoal-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Links & Info */}
        <div className="p-4 border-t border-border space-y-2.5 bg-surface-white/40">
          <button
            onClick={() => {
              onClose();
              onExitToLanding();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-charcoal-700 bg-surface-white hover:bg-ivory-warm border border-border transition-colors shadow-soft"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-charcoal-500 shrink-0" />
              <span>Public Website</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-charcoal-400" />
          </button>

          <div className="px-3.5 py-2.5 rounded-xl bg-surface-white border border-border shadow-soft">
            <div className="text-[10px] text-charcoal-400 uppercase font-mono font-bold flex items-center justify-between">
              <span>Smart Contract</span>
              <span className="text-[9px] text-near-dark">TESTNET</span>
            </div>
            <a
              href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-near-dark font-semibold hover:underline truncate block mt-0.5"
            >
              {VAULT_CONTRACT_ID}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

