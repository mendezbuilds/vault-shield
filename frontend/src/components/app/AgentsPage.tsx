import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import { Modal } from '../common/Modal';
import { useWallet } from '../../context/WalletContext';
import { getExplorerAccountUrl } from '../../utils/formatters';
import {
  Bot,
  UserPlus,
  UserX,
  ExternalLink,
  PlusCircle,
  CheckCircle2,
  Lock,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface AgentsPageProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
  onOpenPaymentModal: () => void;
}

export const AgentsPage: React.FC<AgentsPageProps> = ({
  overview,
  onRefresh,
  onOpenPaymentModal,
}) => {
  const { accountId, role, executeContractCall } = useWallet();

  const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [revokingAgent, setRevokingAgent] = useState<string | null>(null);

  const isOwner = role === 'owner' || accountId === overview.ownerId;

  // Track known agents from overview & testnet topology
  const allKnownAgents = [
    {
      id: 'agent-a.vault-parent.testnet',
      label: 'Autonomous Worker Agent Alpha',
      isAuthorized: overview.authorizedAgents.includes('agent-a.vault-parent.testnet'),
      description: 'Primary testnet autonomous worker delegated with payment initiation capability.',
    },
    {
      id: 'agent-rev.vault-parent.testnet',
      label: 'Compromised / Revoked Agent (Security Test)',
      isAuthorized: overview.authorizedAgents.includes('agent-rev.vault-parent.testnet'),
      description: 'Revoked test identity demonstrating instant cryptographic isolation.',
    },
    // Any extra agents added dynamically
    ...overview.authorizedAgents
      .filter(a => a !== 'agent-a.vault-parent.testnet' && a !== 'agent-rev.vault-parent.testnet')
      .map(a => ({
        id: a,
        label: 'Custom Autonomous Agent',
        isAuthorized: true,
        description: 'Dynamically registered on-chain agent delegate.',
      })),
  ];

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentId.trim()) return;
    setIsAddAgentModalOpen(false);
    const res = await executeContractCall('add_agent', {
      agent_id: newAgentId.trim(),
    });
    if (res.success) {
      setNewAgentId('');
      onRefresh();
    }
  };

  const handleRevokeAgent = async (agent: string) => {
    setRevokingAgent(null);
    const res = await executeContractCall('revoke_agent', {
      agent_id: agent,
    });
    if (res.success) onRefresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 sm:space-y-10 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP BANNER: AGENT ARCHITECTURE & ACTION BAR */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              KEY DELEGATION DISCIPLINE
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              LEAST PRIVILEGE ENFORCED
            </span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
            <span>Autonomous Agent Delegation</span>
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Registered AI agents can request payments bounded by deterministic policy. Agents never hold direct custody of vault balance or master signing keys.
          </p>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full lg:w-auto shrink-0">
          {isOwner && (
            <button
              onClick={() => setIsAddAgentModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98] touch-manipulation"
            >
              <UserPlus className="w-4 h-4 text-white" />
              <span>Register New Agent</span>
            </button>
          )}

          <button
            onClick={onOpenPaymentModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
          >
            <PlusCircle className="w-4 h-4 text-near-dark" />
            <span>Simulate Agent Payment</span>
          </button>
        </div>
      </div>

      {/* 2. REGISTERED AGENTS DIRECTORY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/70">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal-500">
            REGISTERED AGENTS ({allKnownAgents.length})
          </span>
          <span className="text-xs font-mono text-charcoal-400 hidden sm:inline">
            Per-Agent Queue Bound: &le; 2 Concurrent Requests
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {allKnownAgents.map(agent => (
            <div
              key={agent.id}
              className={`p-5 sm:p-7 rounded-3xl border transition-all ${
                agent.isAuthorized
                  ? 'bg-white/85 border-white/90 shadow-card'
                  : 'bg-ivory-warm/40 border-border/80 opacity-80'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      agent.isAuthorized
                        ? 'bg-near-light text-near-dark'
                        : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-extrabold text-charcoal-900">
                        {agent.label}
                      </h3>
                      {agent.isAuthorized ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-near-light text-near-dark font-mono text-[10px] font-bold border border-near-green/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
                          AUTHORIZED SPENDER
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 font-mono text-[10px] font-bold border border-rose-300">
                          REVOKED / DEAUTHORIZED
                        </span>
                      )}
                    </div>

                    <div>
                      <a
                        href={getExplorerAccountUrl(agent.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs font-bold text-charcoal-600 hover:text-near-dark underline inline-flex items-center gap-1.5 break-all"
                      >
                        <span>{agent.id}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-charcoal-400 shrink-0" />
                      </a>
                    </div>

                    <p className="text-xs text-charcoal-500 font-sans pt-1 leading-relaxed">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Revoke Action */}
                {isOwner && agent.isAuthorized && (
                  <button
                    onClick={() => setRevokingAgent(agent.id)}
                    className="self-end sm:self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition-all shadow-soft shrink-0 touch-manipulation"
                  >
                    <UserX className="w-3.5 h-3.5 text-rose-600" />
                    <span>Revoke Access</span>
                  </button>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border/70 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-charcoal-500">
                <div>Scope: <code className="text-charcoal-900 bg-ivory-warm px-1.5 py-0.5 rounded">request_payment</code> only</div>
                <div>&bull;</div>
                <div>Max Pending: 2 requests</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. FUNCTION-CALL ACCESS KEY SECURITY DISCIPLINE */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card">
        <div className="pb-4 sm:pb-6 border-b border-border/70">
          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
            CRYPTOGRAPHIC ACCESS ISOLATION
          </span>
          <h3 className="text-lg sm:text-xl font-extrabold text-charcoal-900 tracking-tight mt-1">
            Function-Call Access Key Security Discipline
          </h3>
          <p className="text-xs text-charcoal-500 mt-0.5 font-sans">
            Unlike standard crypto wallets where signing keys hold full balance custody, AI Agent Vault keys are provisioned with strict NEAR Function-Call Access Key permissions:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-4 sm:mt-6">
          <div className="p-5 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <div className="w-8 h-8 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark mb-3">
              <Lock className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-extrabold text-charcoal-900">
              Restricted Method Access
            </h4>
            <p className="text-xs text-charcoal-600 mt-1.5 leading-relaxed font-sans">
              Agent keys can ONLY invoke <code className="font-mono text-near-dark font-bold text-[11px]">request_payment()</code>. Key compromise grants zero access to ownership, policies, or withdrawals.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <div className="w-8 h-8 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-extrabold text-charcoal-900">
              Zero Capital Custody
            </h4>
            <p className="text-xs text-charcoal-600 mt-1.5 leading-relaxed font-sans">
              The agent account never holds token custody. Payments are settled atomically from the vault to recipient without touching agent balance.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-ivory-warm/70 border border-border/80">
            <div className="w-8 h-8 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark mb-3">
              <Layers className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-extrabold text-charcoal-900">
              Instant Key Invalidation
            </h4>
            <p className="text-xs text-charcoal-600 mt-1.5 leading-relaxed font-sans">
              If an agent model hallucinates or is exploited, the Owner revokes the agent on-chain in 1 transaction. All in-flight requests are immediately invalidated.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL: Register Agent */}
      <Modal
        isOpen={isAddAgentModalOpen}
        onClose={() => setIsAddAgentModalOpen(false)}
        title="Register Autonomous AI Agent"
        description="Grants permission for a NEAR testnet account to initiate bounded payment requests against this vault."
      >
        <form onSubmit={handleRegisterAgent} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-charcoal-700 block mb-1">
              Agent NEAR Account ID
            </label>
            <input
              type="text"
              placeholder="e.g. agent-b.vault-parent.testnet"
              value={newAgentId}
              onChange={e => setNewAgentId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
              required
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddAgentModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all"
            >
              Confirm Agent Authorization
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Revoke Confirmation */}
      <Modal
        isOpen={!!revokingAgent}
        onClose={() => setRevokingAgent(null)}
        title="Revoke Agent Authorization"
        description={`Are you sure you want to deauthorize ${revokingAgent}? The agent key will immediately lose ability to dispatch payment requests.`}
      >
        <div className="pt-3 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setRevokingAgent(null)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-charcoal-600 hover:text-charcoal-900"
          >
            Cancel
          </button>
          <button
            onClick={() => revokingAgent && handleRevokeAgent(revokingAgent)}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-soft transition-all"
          >
            Confirm Revocation
          </button>
        </div>
      </Modal>
    </motion.div>
  );
};
