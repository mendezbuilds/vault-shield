import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview, VAULT_CONTRACT_ID, TESTNET_RPC_URL } from '../../types/contract';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { WalletModal } from '../common/WalletModal';
import { useWallet } from '../../context/WalletContext';
import { getExplorerAccountUrl, formatNear } from '../../utils/formatters';
import {
  Settings,
  Wallet,
  Server,
  Download,
  ExternalLink,
  Shield,
  GitCommit,
  LogOut,
  Cpu,
  Lock,
  ArrowRightLeft,
  FileCode,
  Activity,
} from 'lucide-react';

interface SettingsPageProps {
  overview: VaultAccountOverview;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ overview }) => {
  const { accountId, role, isConnected, disconnect } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [copiedContract, setCopiedContract] = useState(false);

  const handleExportState = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(overview, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `near_vault_state_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyContract = () => {
    navigator.clipboard.writeText(VAULT_CONTRACT_ID);
    setCopiedContract(true);
    setTimeout(() => setCopiedContract(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-charcoal-200/60 pb-5 sm:pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-near-light/40 border border-near-green/30 text-[10px] sm:text-[11px] font-bold text-near-dark tracking-wide uppercase font-mono mb-2 sm:mb-3">
            <Settings className="w-3.5 h-3.5 text-near-dark shrink-0" />
            <span>Infrastructure &amp; Node Settings</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-charcoal-900 font-serif">
            Settings &amp; Provenance
          </h1>
          <p className="text-xs sm:text-sm text-charcoal-600 mt-1 max-w-2xl font-sans">
            Cryptographic identity credentials, RPC endpoint topology, frozen contract provenance commit <code className="font-mono text-near-dark font-bold">cc7760b</code>, and real-time state telemetry export.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <Button
            variant="secondary"
            onClick={handleExportState}
            icon={<Download className="w-4 h-4 text-near-dark" />}
            className="w-full sm:w-auto justify-center"
          >
            Export State JSON
          </Button>
        </div>
      </div>

      {/* Signer Identity Section */}
      <div className="rounded-3xl border border-white/90 bg-white/85 backdrop-blur-xl p-5 sm:p-8 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 sm:pb-6 border-b border-charcoal-200/60">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1">
              Active Signer Credentials
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-charcoal-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-near-dark shrink-0" />
              <span>Connected Identity</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsWalletModalOpen(true)}
              icon={<ArrowRightLeft className="w-3.5 h-3.5 text-charcoal-700" />}
              className="justify-center"
            >
              Switch Persona
            </Button>
            {isConnected && (
              <Button
                variant="danger"
                size="sm"
                onClick={disconnect}
                icon={<LogOut className="w-3.5 h-3.5" />}
                className="justify-center"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mt-4 sm:mt-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60 md:col-span-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
                NEAR Testnet Account ID
              </div>
              <div className="text-sm sm:text-lg font-mono font-bold text-charcoal-900 mt-1 break-all">
                {accountId || 'Not Connected (Read-Only Mode)'}
              </div>
              <p className="text-xs text-charcoal-600 mt-2">
                All contract state queries execute continuously via the local proxy without requiring a signer key. Mutating transactions require signature authorization.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-charcoal-200/40 flex flex-wrap items-center justify-between gap-1 text-xs font-mono">
              <span className="text-charcoal-500 text-[10px]">SIGNER PERMISSIONS</span>
              <span className="font-bold text-charcoal-800 text-[11px] sm:text-xs">
                {role === 'owner' ? 'Full Vault Administrator' : role === 'agent' ? 'Autonomous Payment Dispatcher' : 'Public Auditor (Read-Only)'}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
                Contract Access Tier
              </div>
              <div className="mt-2">
                {role === 'owner' ? (
                  <Badge variant="green" dot>
                    Vault Owner
                  </Badge>
                ) : role === 'agent' ? (
                  <Badge variant="purple" dot>
                    Authorized Agent
                  </Badge>
                ) : (
                  <Badge variant="gray">Public Evaluator</Badge>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-charcoal-200/40 text-[11px] text-charcoal-600 leading-relaxed">
              {role === 'owner' && 'Authorized to approve/reject queues, adjust spending policy, manage agent keys, pause vault, and withdraw capital.'}
              {role === 'agent' && 'Authorized to invoke request_payment() up to daily cap. Unlisted destinations route to Owner approval queue.'}
              {(!role || role === 'user') && 'Inspecting live testnet state in read-only audit mode. Switch persona to test contract mutations.'}
            </div>
          </div>
        </div>
      </div>

      {/* Network Topology & RPC Node Telemetry */}
      <div className="rounded-3xl border border-white/90 bg-white/85 backdrop-blur-xl p-5 sm:p-8 shadow-card">
        <div className="pb-4 sm:pb-6 border-b border-charcoal-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1">
              Distributed Infrastructure
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-charcoal-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-near-dark shrink-0" />
              <span>Blockchain Node Topology</span>
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-near-light/40 border border-near-green/30 text-xs font-mono text-near-dark font-bold self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-near-green animate-pulse" />
            <span>NEAR Testnet Live</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mt-4 sm:mt-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-charcoal-500">PRIMARY JSON-RPC</span>
              <span className="text-[10px] font-mono font-bold text-near-dark bg-near-light/50 px-2 py-0.5 rounded">Active Route</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-charcoal-900 break-all">
              {TESTNET_RPC_URL}
            </div>
            <p className="text-xs text-charcoal-600 leading-relaxed font-sans">
              Queries routed through Vite proxy with an in-memory 3.5s micro-cache to prevent RPC rate limiting.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-charcoal-500">FAILOVER RPC MIRROR</span>
              <span className="text-[10px] font-mono text-charcoal-600 bg-charcoal-100 px-2 py-0.5 rounded">FastNEAR</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-charcoal-900 break-all">
              https://test.rpc.fastnear.com
            </div>
            <p className="text-xs text-charcoal-600 leading-relaxed font-sans">
              Secondary high-throughput fallback automatically invoked if the primary testnet gateway encounters rate limits.
            </p>
          </div>
        </div>

        {/* Contract Address Callout */}
        <div className="mt-4 sm:mt-5 p-4 sm:p-5 rounded-2xl bg-surface-white border border-charcoal-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-near-light/50 border border-near-green/30 flex items-center justify-center text-near-dark shrink-0">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
                Deployed Contract Address
              </div>
              <div className="text-xs sm:text-base font-mono font-bold text-charcoal-900 break-all">
                {VAULT_CONTRACT_ID}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
            <button
              onClick={handleCopyContract}
              className="px-3 py-2 rounded-xl bg-ivory hover:bg-ivory-warm border border-charcoal-200/60 text-xs font-mono font-semibold text-charcoal-700 transition-colors text-center"
            >
              {copiedContract ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold transition-all shadow-soft"
            >
              <span>NearBlocks</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Frozen Contract Provenance & Invariants */}
      <div className="rounded-3xl border border-white/90 bg-white/85 backdrop-blur-xl p-5 sm:p-8 shadow-card">
        <div className="pb-4 sm:pb-6 border-b border-charcoal-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500 block mb-1">
              Phase 1 Contract Verification
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-charcoal-900 flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-near-dark shrink-0" />
              <span>Cryptographic Provenance</span>
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-near-light/40 border border-near-green/30 text-xs font-mono text-near-dark font-bold self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5 text-near-dark" />
            <span>Frozen at Commit cc7760b</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mt-4 sm:mt-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60">
            <div className="w-8 h-8 rounded-lg bg-surface-white border border-charcoal-200/60 flex items-center justify-center text-near-dark mb-2.5">
              <Shield className="w-4 h-4 text-near-dark" />
            </div>
            <div className="text-xs font-bold text-charcoal-900 font-sans">
              10KB Storage Cushion
            </div>
            <p className="text-[11px] text-charcoal-600 mt-1 leading-relaxed">
              Every on-chain allocation mandates <code className="font-mono text-near-dark">10,000</code> bytes overhead buffer to prevent out-of-storage state reverts.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60">
            <div className="w-8 h-8 rounded-lg bg-surface-white border border-charcoal-200/60 flex items-center justify-center text-near-dark mb-2.5">
              <Activity className="w-4 h-4 text-near-dark" />
            </div>
            <div className="text-xs font-bold text-charcoal-900 font-sans">
              32-Item Bounded Queue
            </div>
            <p className="text-[11px] text-charcoal-600 mt-1 leading-relaxed">
              Pending human-in-the-loop requests are hard-capped at 32 slots. Incoming requests automatically panic with queue-full error if not reviewed.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-ivory/60 border border-charcoal-200/60">
            <div className="w-8 h-8 rounded-lg bg-surface-white border border-charcoal-200/60 flex items-center justify-center text-near-dark mb-2.5">
              <Cpu className="w-4 h-4 text-near-dark" />
            </div>
            <div className="text-xs font-bold text-charcoal-900 font-sans">
              Double-Resolution Guard
            </div>
            <p className="text-[11px] text-charcoal-600 mt-1 leading-relaxed">
              Every resolved request registers a tombstone with monotonic timestamp, preventing replay or duplicate execution on asynchronous promise retries.
            </p>
          </div>
        </div>

        {/* State Telemetry JSON Inspection Card */}
        <div className="mt-4 sm:mt-6 p-4 sm:p-6 rounded-2xl bg-ivory/60 border border-charcoal-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-near-dark shrink-0" />
              <span className="text-xs font-bold text-charcoal-900 font-mono uppercase">
                Live State Snapshot Telemetry
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportState}
              icon={<Download className="w-3.5 h-3.5 text-near-dark" />}
              className="w-full sm:w-auto justify-center"
            >
              Download JSON
            </Button>
          </div>

          <div className="p-3 sm:p-4 rounded-xl bg-charcoal-900 text-ivory font-mono text-[10px] sm:text-[11px] leading-relaxed overflow-x-auto max-h-56 shadow-inner border border-charcoal-800">
            <pre className="text-near-green/90">
              {JSON.stringify(
                {
                  contract_id: VAULT_CONTRACT_ID,
                  network: 'testnet',
                  frozen_commit: 'cc7760b',
                  total_balance_near: formatNear(overview.totalAccountBalance, 4),
                  liquid_available_near: formatNear(overview.availableLiquidBalance, 4),
                  storage_reserve_near: formatNear(overview.storageReserveRequirement, 4),
                  pending_reserved_near: formatNear(overview.pendingReserved, 4),
                  daily_budget_spent_near: formatNear(overview.dailyBucket.spent, 4),
                  is_paused: overview.isPaused,
                  global_pending_count: overview.globalPendingCount,
                  authorized_agents_count: overview.authorizedAgents.length,
                  allowlisted_destinations: overview.policy.destination_allowlist,
                  recent_audit_records_count: overview.auditRecords.length,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>

      {/* Wallet Persona Modal */}
      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </motion.div>
  );
};
