import React, { useState } from 'react';
import { AppSidebar, AppPage } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { MobileMoreSheet } from './MobileMoreSheet';
import { OverviewPage } from './OverviewPage';
import { MyVaultPage } from './MyVaultPage';
import { AgentsPage } from './AgentsPage';
import { ApprovalsPage } from './ApprovalsPage';
import { TransactionsPage } from './TransactionsPage';
import { SecurityCenterPage } from './SecurityCenterPage';
import { SettingsPage } from './SettingsPage';
import { PaymentRequestModal } from './PaymentRequestModal';
import { TxNotificationModal } from '../common/TxNotificationModal';
import { VaultAccountOverview, VAULT_CONTRACT_ID } from '../../types/contract';
import {
  Loader2,
  LayoutDashboard,
  Shield,
  CheckSquare,
  History,
  Menu,
} from 'lucide-react';

interface AppLayoutProps {
  overview: VaultAccountOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExitToLanding: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  overview,
  loading,
  error,
  onRefresh,
  onExitToLanding,
}) => {
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('agent')) return 'agents';
      if (hash.includes('vault')) return 'vault';
      if (hash.includes('approvals')) return 'approvals';
      if (hash.includes('transactions')) return 'transactions';
      if (hash.includes('security')) return 'security';
      if (hash.includes('settings')) return 'settings';
    }
    return 'overview';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState<boolean>(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  // Check if current page is one of the secondary routes accessed via More
  const isMoreActive = ['agents', 'security', 'settings'].includes(currentPage);

  // Loading state
  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-ivory flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-near-dark animate-spin" />
          <h2 className="text-base font-bold text-charcoal-900">
            Querying NEAR Public Testnet...
          </h2>
          <p className="text-xs text-charcoal-500 font-mono">
            {VAULT_CONTRACT_ID}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !overview) {
    return (
      <div className="min-h-screen bg-ivory flex flex-col items-center justify-center p-4">
        <div className="p-8 rounded-3xl bg-surface-white border border-rose-300 shadow-elevation text-center max-w-md space-y-4">
          <div className="text-rose-700 font-bold text-base">RPC Connection Interrupted</div>
          <p className="text-xs text-charcoal-600 font-sans">{error}</p>
          <button
            onClick={onRefresh}
            className="px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div className="min-h-screen bg-ivory flex flex-col md:flex-row overflow-x-hidden">
      {/* Desktop Sidebar (Strictly hidden on mobile: ZERO mobile sidebar) */}
      <AppSidebar
        currentPage={currentPage}
        onSelectPage={setCurrentPage}
        pendingCount={overview.globalPendingCount}
        onExitToLanding={onExitToLanding}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        <AppHeader
          pageTitle={currentPage}
          isPaused={overview.isPaused}
          onRefresh={onRefresh}
          isRefreshing={loading}
          onExitToLanding={onExitToLanding}
        />

        {overview && !overview.isDeployed && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-950 font-mono flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>
                <strong>PRE-PROVISIONING STAGE:</strong> Vault target <code className="font-bold underline">{overview.contractId}</code> is awaiting Step 1 on-chain deployment. Read-only pre-flight inspection active.
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 shrink-0">
              Zero-Key Target Architecture
            </span>
          </div>
        )}

        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pb-28 md:pb-12 min-w-0">
          {currentPage === 'overview' && (
            <OverviewPage
              overview={overview}
              onNavigate={setCurrentPage}
              onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
            />
          )}
          {currentPage === 'vault' && (
            <MyVaultPage overview={overview} onRefresh={onRefresh} />
          )}
          {currentPage === 'agents' && (
            <AgentsPage
              overview={overview}
              onRefresh={onRefresh}
              onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
            />
          )}
          {currentPage === 'approvals' && (
            <ApprovalsPage overview={overview} onRefresh={onRefresh} />
          )}
          {currentPage === 'transactions' && (
            <TransactionsPage overview={overview} />
          )}
          {currentPage === 'security' && (
            <SecurityCenterPage overview={overview} onRefresh={onRefresh} />
          )}
          {currentPage === 'settings' && (
            <SettingsPage overview={overview} />
          )}
        </main>
      </div>

      {/* Mobile-Only More Slide-Out Sheet for AI Agents, Security Center, and Settings */}
      <MobileMoreSheet
        isOpen={isMoreSheetOpen}
        onClose={() => setIsMoreSheetOpen(false)}
        currentPage={currentPage}
        onSelectPage={setCurrentPage}
        onExitToLanding={onExitToLanding}
      />

      {/* Mobile Bottom Navigation Bar (The ONLY Primary Navigation on Mobile) */}
      <nav
        aria-label="Mobile primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-white/95 backdrop-blur-xl border-t border-border px-2 py-2 flex items-center justify-around shadow-elevation"
      >
        <button
          onClick={() => setCurrentPage('overview')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all touch-manipulation ${
            currentPage === 'overview'
              ? 'text-near-dark font-bold'
              : 'text-charcoal-500 hover:text-charcoal-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Overview</span>
        </button>

        <button
          onClick={() => setCurrentPage('vault')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all touch-manipulation ${
            currentPage === 'vault'
              ? 'text-near-dark font-bold'
              : 'text-charcoal-500 hover:text-charcoal-900'
          }`}
        >
          <Shield className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Vault</span>
        </button>

        <button
          onClick={() => setCurrentPage('approvals')}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all touch-manipulation ${
            currentPage === 'approvals'
              ? 'text-near-dark font-bold'
              : 'text-charcoal-500 hover:text-charcoal-900'
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Approvals</span>
          {overview.globalPendingCount > 0 && (
            <span className="absolute top-0 right-2 w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] font-mono font-bold flex items-center justify-center">
              {overview.globalPendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setCurrentPage('transactions')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all touch-manipulation ${
            currentPage === 'transactions'
              ? 'text-near-dark font-bold'
              : 'text-charcoal-500 hover:text-charcoal-900'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Activity</span>
        </button>

        <button
          onClick={() => setIsMoreSheetOpen(true)}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all touch-manipulation ${
            isMoreActive
              ? 'text-near-dark font-bold'
              : 'text-charcoal-500 hover:text-charcoal-900'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">
            {isMoreActive
              ? currentPage === 'agents'
                ? 'Agents'
                : currentPage === 'security'
                ? 'Security'
                : 'Settings'
              : 'More'}
          </span>
          {isMoreActive && (
            <span className="absolute top-1 right-2.5 w-1.5 h-1.5 bg-near-green rounded-full ring-2 ring-white" />
          )}
        </button>
      </nav>

      {/* Interactive Payment Modal */}
      <PaymentRequestModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        overview={overview}
        onRefresh={onRefresh}
      />

      {/* Transaction Notifications Modal */}
      <TxNotificationModal />
    </div>
  );
};
