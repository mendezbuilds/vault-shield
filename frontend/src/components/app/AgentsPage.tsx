import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import { Modal } from '../common/Modal';
import { useWallet } from '../../context/WalletContext';
import { nearRpc } from '../../services/nearRpc';
import { getExplorerAccountUrl } from '../../utils/formatters';
import { AiAgentCockpit } from './AiAgentCockpit';
import { LiveAgentExecutionSection } from './LiveAgentExecutionSection';
import {
  Bot,
  UserPlus,
  UserX,
  ExternalLink,
  PlusCircle,
  Lock,
  Layers,
  ShieldCheck,
  Terminal,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Sparkles,
  Key,
  Coins,
  Shield,
  Zap,
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
  const {
    accountId,
    role,
    executeContractCall,
    createAgentSubaccount,
    connectGenuineWallet,
    isConnected,
  } = useWallet();

  const [activeTab, setActiveTab] = useState<'live' | 'cockpit' | 'directory'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('cockpit')) return 'cockpit';
      if (hash.includes('directory')) return 'directory';
    }
    return 'live';
  });
  const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [revokingAgent, setRevokingAgent] = useState<string | null>(null);

  // Dynamic on-chain agent authorization lookup (via is_agent_authorized)
  const [lookupAgentId, setLookupAgentId] = useState('');
  const [lookupResult, setLookupResult] = useState<{ checked: boolean; isAuthorized: boolean; queriedId: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Stage 1 subaccount provisioning state
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [subaccountStatus, setSubaccountStatus] = useState<{
    checked: boolean;
    exists: boolean;
    balance?: string;
    loading: boolean;
  }>({ checked: false, exists: false, loading: true });

  const isOwner = role === 'owner' || (Boolean(accountId) && accountId === overview.ownerId);

  const checkAgentSubaccount = useCallback(async () => {
    setSubaccountStatus(prev => ({ ...prev, loading: true }));
    try {
      const acct = await nearRpc.viewAccount('agent.cleartoad8704.testnet');
      if (acct) {
        const nearBalance = (Number(BigInt(acct.amount) / 1000000000000000000000n) / 1000).toFixed(2);
        setSubaccountStatus({
          checked: true,
          exists: true,
          balance: `${nearBalance} NEAR`,
          loading: false,
        });
      } else {
        setSubaccountStatus({
          checked: true,
          exists: false,
          loading: false,
        });
      }
    } catch {
      setSubaccountStatus({ checked: true, exists: false, loading: false });
    }
  }, []);

  useEffect(() => {
    checkAgentSubaccount();
  }, [checkAgentSubaccount]);

  const handleProvisionSubaccount = async () => {
    setIsProvisioning(true);
    try {
      const res = await createAgentSubaccount();
      if (res.success) {
        await checkAgentSubaccount();
        onRefresh();
      }
    } finally {
      setIsProvisioning(false);
    }
  };

  // Dynamic verified agents from on-chain state
  const allKnownAgents = overview.authorizedAgents.map(a => ({
    id: a,
    label: `Autonomous Agent Delegate (${a})`,
    isAuthorized: true,
    description: 'Cryptographically registered and authorized spending agent in vault storage.',
  }));

  const handleCheckAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupAgentId.trim()) return;
    setLookupLoading(true);
    try {
      const isAuth = await nearRpc.isAgentAuthorized(lookupAgentId.trim());
      setLookupResult({ checked: true, isAuthorized: isAuth, queriedId: lookupAgentId.trim() });
    } catch {
      setLookupResult({ checked: true, isAuthorized: false, queriedId: lookupAgentId.trim() });
    } finally {
      setLookupLoading(false);
    }
  };

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
      className="space-y-6 sm:space-y-8 pb-8 max-w-7xl mx-auto"
    >
      {/* 1. TOP HEADER & NAVIGATION BAR */}
      <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/5 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
              AUTONOMOUS AGENT GOVERNANCE
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-charcoal-400">
              ZERO-CUSTODY FUNCTION-CALL DELEGATION
            </span>
          </div>

          <h1 className="text-xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
            <span>AI Agent Operations Center</span>
          </h1>

          <p className="mt-1.5 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
            Configure, inspect, and simulate autonomous AI agent payments through Vault Shield's policy-bounded execution pipeline.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setActiveTab('live')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98] touch-manipulation"
          >
            <Zap className="w-4 h-4 text-near-green" />
            <span>Live Agent Execution</span>
          </button>

          {isOwner && (
            <button
              onClick={() => setIsAddAgentModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
            >
              <UserPlus className="w-4 h-4 text-near-dark" />
              <span>Register New Agent</span>
            </button>
          )}

          <button
            onClick={onOpenPaymentModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold shadow-soft transition-all touch-manipulation"
          >
            <PlusCircle className="w-4 h-4 text-charcoal-600" />
            <span>Owner Dispatch</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-VIEW SELECTOR TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-2">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === 'live'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-white/80 text-charcoal-600 hover:text-charcoal-900 border border-border/80 hover:bg-ivory-warm'
          }`}
        >
          <Zap className={`w-4 h-4 ${activeTab === 'live' ? 'text-near-green' : 'text-near-dark'}`} />
          <span>Live Agent Execution</span>
          <span
            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
              activeTab === 'live' ? 'bg-near-green text-near-dark' : 'bg-near-light text-near-dark'
            }`}
          >
            AUTHENTIC ON-CHAIN
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cockpit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === 'cockpit'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-white/80 text-charcoal-600 hover:text-charcoal-900 border border-border/80 hover:bg-ivory-warm'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>AI Cockpit & Simulator</span>
          <span
            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
              activeTab === 'cockpit' ? 'bg-near-green text-near-dark' : 'bg-near-light text-near-dark'
            }`}
          >
            DRY-RUN SIMULATOR
          </span>
        </button>

        <button
          onClick={() => setActiveTab('directory')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === 'directory'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-white/80 text-charcoal-600 hover:text-charcoal-900 border border-border/80 hover:bg-ivory-warm'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Registered Directory & Keys</span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-ivory-warm text-charcoal-700">
            {allKnownAgents.length}
          </span>
        </button>
      </div>

      {/* 3. ACTIVE TAB CONTENT */}
      <AnimatePresence mode="wait">
        {activeTab === 'live' ? (
          <motion.div
            key="live"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <LiveAgentExecutionSection overview={overview} onRefresh={onRefresh} />
          </motion.div>
        ) : activeTab === 'cockpit' ? (
          <motion.div
            key="cockpit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <AiAgentCockpit overview={overview} />
          </motion.div>
        ) : (
          <motion.div
            key="directory"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-6 sm:space-y-8"
          >
            {/* STAGE 1: AUTONOMOUS AGENT SUBACCOUNT PROVISIONING */}
            <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-white via-white to-near-light/20 border-2 border-near-green/30 shadow-card space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-36 bg-gradient-to-bl from-near-green/10 via-transparent to-transparent pointer-events-none rounded-bl-full" />

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-near-dark text-white flex items-center justify-center shrink-0 shadow-soft">
                    <Key className="w-5 h-5 text-near-green" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
                        STAGE 1 AUTHORIZATION
                      </span>
                      {subaccountStatus.loading ? (
                        <span className="text-[10px] font-mono text-charcoal-400">Checking on-chain status...</span>
                      ) : subaccountStatus.exists ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ACCOUNT PROVISIONED ({subaccountStatus.balance})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-mono text-[10px] font-bold border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          READY FOR CREATION
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-charcoal-900 tracking-tight">
                      Provision Autonomous Agent Account: <code className="font-mono text-near-dark">agent.cleartoad8704.testnet</code>
                    </h3>
                    <p className="mt-1 text-xs text-charcoal-600 max-w-2xl font-sans leading-relaxed">
                      Creates the dedicated agent subaccount under <code className="font-mono font-bold text-charcoal-800">cleartoad8704.testnet</code>, funds it with exactly 0.10 NEAR, and assigns a restricted FunctionCall key with ZERO FullAccess keys.
                    </p>
                  </div>
                </div>

                {/* Provision Button */}
                <div className="shrink-0 flex items-center gap-2">
                  {subaccountStatus.exists ? (
                    <a
                      href={getExplorerAccountUrl('agent.cleartoad8704.testnet')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-near-light hover:bg-near-light/80 text-near-dark text-xs font-bold transition-all shadow-sm"
                    >
                      <span>View Account on Explorer</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : !isConnected ? (
                    <button
                      onClick={() => connectGenuineWallet('meteor-wallet')}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98]"
                    >
                      <Sparkles className="w-4 h-4 text-near-green" />
                      <span>Connect Meteor Wallet to Provision</span>
                    </button>
                  ) : !isOwner ? (
                    <div className="text-right">
                      <button
                        disabled
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-charcoal-200 text-charcoal-500 text-xs font-bold cursor-not-allowed"
                      >
                        <span>Owner Wallet Required</span>
                      </button>
                      <p className="text-[10px] text-charcoal-500 font-mono mt-1">Connected: {accountId}</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleProvisionSubaccount}
                      disabled={isProvisioning}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 text-near-green" />
                      <span>{isProvisioning ? 'Staging Transaction...' : 'Initiate Provisioning via Meteor'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Security Invariants Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
                <div className="p-3 rounded-2xl bg-white border border-charcoal-200/80 shadow-sm space-y-1">
                  <div className="text-[10px] uppercase font-bold text-charcoal-500">Initial Funding</div>
                  <div className="text-sm font-bold text-charcoal-900 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <span>0.10 NEAR</span>
                  </div>
                  <div className="text-[10px] text-charcoal-400">100,000,000,000,000,000,000,000 yocto</div>
                </div>

                <div className="p-3 rounded-2xl bg-white border border-charcoal-200/80 shadow-sm space-y-1">
                  <div className="text-[10px] uppercase font-bold text-charcoal-500">Access Key Security</div>
                  <div className="text-sm font-bold text-charcoal-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span>0 FullAccess Keys</span>
                  </div>
                  <div className="text-[10px] text-charcoal-400">FunctionCall only (request_payment)</div>
                </div>

                <div className="p-3 rounded-2xl bg-white border border-charcoal-200/80 shadow-sm space-y-1">
                  <div className="text-[10px] uppercase font-bold text-charcoal-500">Restricted Public Key</div>
                  <div className="text-xs font-bold text-near-dark truncate">
                    ed25519:E1dDCJ...vK24
                  </div>
                  <div className="text-[10px] text-charcoal-400">0.25 NEAR gas allowance on vault</div>
                </div>
              </div>
            </div>

            {/* REGISTERED AGENTS DIRECTORY */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/70">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal-500">
                  ON-CHAIN AUTHORIZED AGENTS ({allKnownAgents.length})
                </span>
                <span className="text-xs font-mono text-charcoal-400 hidden sm:inline">
                  Per-Agent Queue Bound: &le; 2 Concurrent Requests
                </span>
              </div>

              {allKnownAgents.length === 0 ? (
                <div className="p-8 rounded-3xl bg-white/80 border border-dashed border-charcoal-300 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-near-light text-near-dark flex items-center justify-center mx-auto">
                    <Bot className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-charcoal-900">No Autonomous Agents Registered Yet</h4>
                  <p className="text-xs text-charcoal-600 max-w-md mx-auto">
                    The vault contract currently has zero registered agent delegates. Use the &ldquo;Register Agent&rdquo; button above (calling <code className="font-mono text-near-dark font-bold">add_agent</code>) or verify any agent account ID below using the authoritative <code className="font-mono text-near-dark font-bold">is_agent_authorized()</code> method.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {allKnownAgents.map(agent => (
                    <div
                      key={agent.id}
                      className="p-5 sm:p-7 rounded-3xl border bg-white/85 border-white/90 shadow-card transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 bg-near-light text-near-dark">
                            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm sm:text-base font-extrabold text-charcoal-900">
                                {agent.label}
                              </h3>
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-near-light text-near-dark font-mono text-[10px] font-bold border border-near-green/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-near-green animate-pulse" />
                                AUTHORIZED SPENDER
                              </span>
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
                        {isOwner && (
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
              )}
            </div>

            {/* AUTHORITATIVE ON-CHAIN AGENT INSPECTOR (is_agent_authorized) */}
            <div className="p-5 sm:p-7 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/90 shadow-card space-y-4">
              <div className="border-b border-border/70 pb-3">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-near-dark bg-near-light px-2.5 py-0.5 rounded-full border border-near-green/30">
                  AUTHORITATIVE CONTRACT ABI READ
                </span>
                <h3 className="text-base sm:text-lg font-bold text-charcoal-900 mt-1">
                  On-Chain Agent Authorization Inspector
                </h3>
                <p className="text-xs text-charcoal-600">
                  Query the contract&rsquo;s live <code className="font-mono text-near-dark font-bold">is_agent_authorized(agent_id)</code> view method to verify whether an account has active spending delegation.
                </p>
              </div>

              <form onSubmit={handleCheckAgent} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  placeholder="Enter Account ID (e.g. agent.testnet)"
                  value={lookupAgentId}
                  onChange={e => setLookupAgentId(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-charcoal-800"
                />
                <button
                  type="submit"
                  disabled={lookupLoading || !lookupAgentId.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all disabled:opacity-50 touch-manipulation"
                >
                  <Search className="w-4 h-4" />
                  <span>Verify Authorization</span>
                </button>
              </form>

              {lookupResult && (
                <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between ${
                  lookupResult.isAuthorized
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50/80 border-rose-300 text-rose-900'
                }`}>
                  <div className="flex items-center gap-2.5">
                    {lookupResult.isAuthorized ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold">{lookupResult.queriedId}</span> is{' '}
                      <span className="font-bold underline">
                        {lookupResult.isAuthorized ? 'AUTHORIZED ON-CHAIN' : 'NOT AUTHORIZED'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                    is_agent_authorized &rarr; {String(lookupResult.isAuthorized)}
                  </span>
                </div>
              )}
            </div>

            {/* FUNCTION-CALL ACCESS KEY SECURITY DISCIPLINE */}
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
          </motion.div>
        )}
      </AnimatePresence>

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
