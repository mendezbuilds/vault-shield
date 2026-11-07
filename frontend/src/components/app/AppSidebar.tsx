import React from 'react';
import {
  LayoutDashboard,
  Shield,
  Bot,
  CheckSquare,
  History,
  ShieldAlert,
  Settings,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { VAULT_CONTRACT_ID } from '../../types/contract';
import { getExplorerAccountUrl } from '../../utils/formatters';

export type AppPage =
  | 'overview'
  | 'vault'
  | 'agents'
  | 'approvals'
  | 'transactions'
  | 'security'
  | 'settings';

interface AppSidebarProps {
  currentPage: AppPage;
  onSelectPage: (page: AppPage) => void;
  pendingCount?: number;
  onExitToLanding: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentPage,
  onSelectPage,
  pendingCount = 0,
  onExitToLanding,
  isCollapsed,
  onToggleCollapse,
}) => {
  const navItems = [
    { id: 'overview' as AppPage, label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'vault' as AppPage, label: 'My Vault', icon: <Shield className="w-4 h-4" /> },
    { id: 'agents' as AppPage, label: 'AI Agents', icon: <Bot className="w-4 h-4" /> },
    {
      id: 'approvals' as AppPage,
      label: 'Approvals',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeColor: 'bg-amber-100 text-amber-900 border border-amber-300',
    },
    { id: 'transactions' as AppPage, label: 'Transactions', icon: <History className="w-4 h-4" /> },
    { id: 'security' as AppPage, label: 'Security Center', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'settings' as AppPage, label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside
      className={`hidden md:flex fixed top-0 bottom-0 z-30 bg-ivory border-r border-border transition-all duration-300 flex-col justify-between left-0 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full justify-between">
        <div>
          {/* Brand Header */}
          <div className="h-18 px-5 flex items-center justify-between border-b border-border">
            {!isCollapsed && (
              <div className="flex items-center gap-3 cursor-pointer" onClick={onExitToLanding}>
                <div className="w-9 h-9 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark shadow-soft shrink-0">
                  <Shield className="w-4 h-4 text-near-dark" />
                </div>
                <div className="overflow-hidden">
                  <div className="font-extrabold text-xs tracking-tight text-charcoal-900 uppercase">
                    NEAR AI VAULT
                  </div>
                  <div className="text-[10px] text-charcoal-500 font-mono">
                    Testnet Console
                  </div>
                </div>
              </div>
            )}

            {isCollapsed && (
              <div
                className="mx-auto w-9 h-9 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark shadow-soft cursor-pointer"
                onClick={onExitToLanding}
              >
                <Shield className="w-4 h-4 text-near-dark" />
              </div>
            )}

            {/* Desktop Collapse Toggle */}
            <button
              onClick={onToggleCollapse}
              aria-label="Toggle sidebar width"
              className="p-1 rounded-lg text-charcoal-400 hover:text-charcoal-900 hover:bg-ivory-warm transition-colors"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Desktop Nav Items */}
          <div className="p-3 space-y-1.5">
            {navItems.map(item => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectPage(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all touch-manipulation ${
                    isActive
                      ? 'bg-surface-white text-charcoal-900 border border-border shadow-soft font-bold'
                      : 'text-charcoal-600 hover:text-charcoal-900 hover:bg-ivory-warm border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-near-dark' : 'text-charcoal-500'}>
                      {item.icon}
                    </span>
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Footer Info */}
        <div className="p-4 border-t border-border space-y-2.5">
          <button
            onClick={onExitToLanding}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-charcoal-600 hover:text-charcoal-900 hover:bg-ivory-warm transition-colors"
          >
            <Globe className="w-4 h-4 text-charcoal-500 shrink-0" />
            {!isCollapsed && <span>Public Website</span>}
          </button>

          {!isCollapsed && (
            <div className="px-3 py-2.5 rounded-xl bg-surface-white border border-border">
              <div className="text-[10px] text-charcoal-400 uppercase font-mono font-bold">Smart Contract</div>
              <a
                href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-near-dark font-semibold hover:underline truncate block mt-0.5"
              >
                {VAULT_CONTRACT_ID}
              </a>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
