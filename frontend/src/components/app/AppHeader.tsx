import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { WalletModal } from '../common/WalletModal';
import { truncateId, formatNear } from '../../utils/formatters';
import {
  Wallet,
  Shield,
  Bot,
  User,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Globe,
} from 'lucide-react';

interface AppHeaderProps {
  pageTitle: string;
  isPaused: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onExitToLanding: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  pageTitle,
  isPaused,
  onRefresh,
  isRefreshing,
  onExitToLanding,
}) => {
  const { accountId, role, authType, walletId, walletBalance, isBalanceLoading, isConnected, disconnect, refreshBalance } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const getHeaderTitle = (title: string) => {
    switch (title) {
      case 'overview':
        return 'Overview';
      case 'vault':
        return 'My Vault';
      case 'agents':
        return 'AI Agents';
      case 'approvals':
        return 'Approvals';
      case 'transactions':
        return 'Transactions';
      case 'security':
        return 'Security Center';
      case 'settings':
        return 'Settings';
      default:
        return title;
    }
  };

  const getRoleBadge = () => {
    if (role === 'owner') {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-white border border-border text-charcoal-900 font-bold shadow-soft flex items-center gap-1">
          <Shield className="w-3 h-3 text-near-dark" />
          <span className="hidden xs:inline">OWNER</span>
        </span>
      );
    }
    if (role === 'agent') {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-near-light text-near-dark font-bold flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span className="hidden xs:inline">AGENT</span>
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-ivory-warm text-charcoal-700 font-bold flex items-center gap-1">
        <User className="w-3 h-3" />
        <span className="hidden xs:inline">PUBLIC</span>
      </span>
    );
  };

  return (
    <>
      <header className="h-16 sm:h-18 px-3.5 sm:px-8 border-b border-border bg-ivory/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-charcoal-400 truncate">
              Protocol Console
            </div>
            <h1 className="text-base sm:text-xl font-extrabold text-charcoal-900 tracking-tight truncate">
              {getHeaderTitle(pageTitle)}
            </h1>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Pause status indicator */}
          {isPaused ? (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>VAULT PAUSED</span>
            </div>
          ) : (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-near-light text-near-dark border border-near-green/30">
              <span className="w-2 h-2 rounded-full bg-near-green animate-pulse" />
              <span>ACTIVE</span>
            </div>
          )}

          {/* Testnet Network badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-white border border-border text-xs font-mono text-charcoal-600 shadow-soft">
            <span className="w-1.5 h-1.5 rounded-full bg-near-green" />
            <span>NEAR TESTNET</span>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => {
              onRefresh();
              refreshBalance();
            }}
            disabled={isRefreshing || isBalanceLoading}
            aria-label="Refresh contract state and wallet balance from NEAR RPC"
            title="Refresh contract state and wallet balance from NEAR RPC"
            className="p-2 sm:p-2.5 rounded-xl text-charcoal-500 hover:text-charcoal-900 bg-surface-white hover:bg-ivory-warm border border-border transition-colors shadow-soft disabled:opacity-50 touch-manipulation"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || isBalanceLoading ? 'animate-spin text-near-dark' : ''}`} />
          </button>

          {/* Exit to Public Landing */}
          <button
            onClick={onExitToLanding}
            title="Return to Public Landing Page"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-white hover:bg-ivory-warm border border-border text-xs font-semibold text-charcoal-700 shadow-soft transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-charcoal-500" />
            <span>Website</span>
          </button>

          {/* Wallet Connection */}
          {isConnected ? (
            <div className="relative">
              <button
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-surface-white border border-border hover:border-border-strong transition-all text-xs font-mono shadow-soft touch-manipulation"
              >
                {getRoleBadge()}
                <span className="font-bold text-charcoal-900 text-[11px] sm:text-xs">
                  {truncateId(accountId || '', 4, 4)}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-charcoal-400" />
              </button>

              {/* Account Dropdown */}
              {isAccountMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-white p-4 shadow-elevation z-50 animate-in fade-in zoom-in-95">
                  <div className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between text-[10px] text-charcoal-400 uppercase font-mono">
                      <span>Connected Signer</span>
                      <span className="font-bold text-near-dark">
                        {authType === 'genuine_wallet'
                          ? (walletId === 'meteor-wallet' ? 'METEOR WALLET' : 'MYNEARWALLET')
                          : 'PERSONA'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-charcoal-900 truncate font-bold mt-1">
                      {accountId}
                    </div>
                    {walletBalance !== null && (
                      <div className="text-xs font-mono text-near-dark font-extrabold mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-charcoal-400">Balance</span>
                        <span>{formatNear(walletBalance, 4)} NEAR</span>
                      </div>
                    )}
                  </div>

                  <div className="py-2 space-y-1">
                    <button
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setIsWalletModalOpen(true);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs text-charcoal-700 hover:text-charcoal-900 hover:bg-ivory-warm flex items-center justify-between"
                    >
                      <span>Switch Wallet / Persona</span>
                      <span className="text-[10px] text-near-dark font-mono font-bold">Change</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        disconnect();
                        setIsAccountMenuOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs text-rose-600 hover:bg-rose-50 font-bold"
                    >
                      Disconnect Identity
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              data-testid="connect-wallet-btn"
              aria-label="Connect NEAR Wallet"
              onClick={() => setIsWalletModalOpen(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold tracking-tight shadow-soft transition-all touch-manipulation"
            >
              <Wallet className="w-3.5 h-3.5 text-white" />
              <span className="hidden xs:inline">Connect</span>
              <span className="xs:hidden">Auth</span>
            </button>
          )}
        </div>
      </header>

      {/* Wallet Modal */}
      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </>
  );
};
