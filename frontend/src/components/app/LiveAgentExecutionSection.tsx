import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultAccountOverview } from '../../types/contract';
import {
  Bot,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Play,
  RotateCcw,
  Lock,
  Terminal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Key,
  Coins,
  Send,
  Clock,
  Layers,
  Check,
  Copy,
  Info,
  Radio,
  FileText,
  Shield,
  Zap,
} from 'lucide-react';
import { getExplorerAccountUrl, getExplorerTxUrl } from '../../utils/formatters';

interface LiveAgentExecutionSectionProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
}

interface PreflightResponse {
  success: boolean;
  intentId: string;
  intent: {
    intentId: string;
    destination: string;
    amountNear: string;
    amountYocto: string;
    reason: string;
    ttlMinutes: number;
  };
  preflight: {
    success: boolean;
    checks: Array<{ check: string; passed: boolean; detail: string }>;
    predictedRouting?: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
    predictedReason?: string;
    error?: string;
  };
  preview: {
    network: string;
    signerId: string;
    receiverId: string;
    methodName: string;
    args: {
      destination: string;
      amount: string;
      reason: string;
      ttl_nanos?: number;
    };
    deposit: string;
    gas: string;
    publicKey: string;
  };
  expectedRoute: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
  expectedRouteLabel: string;
}

interface ExecutionResponse {
  success: boolean;
  status: string;
  intentId: string;
  txHash?: string;
  requestId?: number;
  explorerUrl?: string;
  message: string;
  error?: string;
}

export const LiveAgentExecutionSection: React.FC<LiveAgentExecutionSectionProps> = ({
  overview,
  onRefresh,
}) => {
  // Input fields (pre-populated with default test intent as specified)
  const [destination, setDestination] = useState('whiteice2105.testnet');
  const [amountNear, setAmountNear] = useState('0.01');
  const [reason, setReason] = useState('Autonomous test disbursement of 0.01 NEAR');
  const [ttlMinutes, setTtlMinutes] = useState('60');
  const [naturalPrompt, setNaturalPrompt] = useState('');

  // Live status from runtime
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Preflight state
  const [preflightData, setPreflightData] = useState<PreflightResponse | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isPreflightDetailsOpen, setIsPreflightDetailsOpen] = useState(true);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);

  const AGENT_ACCOUNT_ID = 'agent.cleartoad8704.testnet';
  const VAULT_CONTRACT_ID = overview?.contractId || 'vault-cleartoad8704.testnet';
  const RESTRICTED_PUBLIC_KEY = 'ed25519:E1dDCJgqc7AEhM57PsmXzorNoVTiGBBUgWxHz35bvK24';

  // Fetch live agent status from runtime endpoint
  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/agent/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAgentStatus(data.status);
        }
      }
    } catch (e) {
      console.warn('Could not query /api/agent/status', e);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(RESTRICTED_PUBLIC_KEY);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const loadDefaultIntent = () => {
    setDestination('whiteice2105.testnet');
    setAmountNear('0.01');
    setReason('Autonomous test disbursement of 0.01 NEAR');
    setTtlMinutes('60');
    setNaturalPrompt('');
    setPreflightData(null);
    setExecutionResult(null);
    setPreflightError(null);
  };

  const handleParsePrompt = () => {
    if (!naturalPrompt.trim()) return;
    const destMatch = naturalPrompt.match(/([a-zA-Z0-9._-]+\.testnet)/i);
    const amtMatch = naturalPrompt.match(/(\d+(?:\.\d+)?)\s*NEAR/i);
    if (destMatch) setDestination(destMatch[1]);
    if (amtMatch) setAmountNear(amtMatch[1]);
    setReason(naturalPrompt);
  };

  // Step 1: Preflight Intent via runtime API
  const handlePreflight = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!destination.trim() || !amountNear.trim()) return;

    setIsPreflighting(true);
    setPreflightError(null);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/agent/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.trim(),
          amountNear: amountNear.trim(),
          reason: reason.trim() || 'Autonomous payment disbursement',
          ttlMinutes: Number(ttlMinutes) || 60,
          naturalPrompt: naturalPrompt.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok && !data.preflight) {
        throw new Error(data.error || 'Preflight request failed');
      }

      setPreflightData(data);
      setIsReviewModalOpen(true);
    } catch (err: any) {
      setPreflightError(err?.message || 'Preflight evaluation failed');
    } finally {
      setIsPreflighting(false);
    }
  };

  // Step 2: Live Execution or Safe Dry-Run Execution
  const handleExecute = async (dryRun = false) => {
    if (!preflightData) return;

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: preflightData.intentId,
          destination: destination.trim(),
          amountNear: amountNear.trim(),
          reason: reason.trim() || 'Autonomous payment disbursement',
          ttlMinutes: Number(ttlMinutes) || 60,
          dryRun,
        }),
      });

      const data = await res.json();
      setExecutionResult(data);

      if (data.success) {
        setIsReviewModalOpen(false);
        onRefresh();
        fetchStatus();
      } else {
        setExecutionError(data.error || data.message || 'Execution failed');
      }
    } catch (err: any) {
      setExecutionError(err?.message || 'Execution failed on agent runtime');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 1. AGENT IDENTITY & CONFINEMENT BANNER */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-white via-white to-near-light/30 border-2 border-near-dark/15 shadow-card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-40 bg-gradient-to-bl from-near-green/10 via-transparent to-transparent pointer-events-none rounded-bl-full" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-border/70">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white bg-near-dark px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3 h-3 text-near-green" />
                <span>LIVE AUTONOMOUS AGENT EXECUTION</span>
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>ON-CHAIN AUTHORIZED AGENT</span>
              </span>
              <span className="text-[10px] font-mono text-charcoal-400">
                ZERO-CUSTODY FUNCTION-CALL DELEGATION
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-charcoal-900 tracking-tight flex items-center gap-2.5">
              <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-near-dark shrink-0" />
              <span>Autonomous Agent Payment Dispatch</span>
            </h2>

            <p className="mt-1.5 text-xs sm:text-sm text-charcoal-600 max-w-2xl font-sans leading-relaxed">
              Dispatches authentic NEAR Testnet payment intents directly through the local autonomous agent runtime. The authorized agent account signs using its dedicated restricted Function-Call Access Key. <strong>The owner wallet does NOT sign.</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={getExplorerAccountUrl(AGENT_ACCOUNT_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold transition-all shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5 text-charcoal-500" />
              <span>Agent Account on Explorer</span>
            </a>

            <button
              onClick={loadDefaultIntent}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-near-light hover:bg-near-light/80 text-near-dark text-xs font-bold transition-all shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 text-near-dark" />
              <span>Reset 0.01 NEAR Default</span>
            </button>
          </div>
        </div>

        {/* Cryptographic Confinement Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5 text-xs font-mono">
          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-xs space-y-1">
            <span className="text-[10px] text-charcoal-400 uppercase font-bold block">Agent Signer Account</span>
            <span className="font-extrabold text-charcoal-900 text-sm truncate block">{AGENT_ACCOUNT_ID}</span>
            <span className="text-[10px] text-emerald-700 font-bold block">Verified Active Delegate</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-xs space-y-1">
            <span className="text-[10px] text-charcoal-400 uppercase font-bold block">Signer Access Key</span>
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold text-charcoal-800 text-[11px] truncate">{RESTRICTED_PUBLIC_KEY.slice(0, 16)}...</span>
              <button
                onClick={handleCopyKey}
                className="text-charcoal-400 hover:text-charcoal-700 p-0.5 rounded transition-all"
                title="Copy full public key"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <span className="text-[10px] text-charcoal-500 block">FunctionCall (0 FullAccess)</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-xs space-y-1">
            <span className="text-[10px] text-charcoal-400 uppercase font-bold block">Permitted Contract Method</span>
            <span className="font-bold text-near-dark text-sm block">request_payment()</span>
            <span className="text-[10px] text-emerald-700 font-bold block">Deposit: Strictly 0 yoctoNEAR</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-xs space-y-1">
            <span className="text-[10px] text-charcoal-400 uppercase font-bold block">Target Vault Contract</span>
            <span className="font-extrabold text-charcoal-900 text-sm truncate block">{VAULT_CONTRACT_ID}</span>
            <span className="text-[10px] text-charcoal-500 block">Network: NEAR Testnet</span>
          </div>
        </div>
      </div>

      {/* 2. LIVE INTENT SUBMISSION FORM */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-border shadow-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-charcoal-900 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-near-dark" />
              <span>Configure Live Payment Intent</span>
            </h3>
            <p className="text-xs text-charcoal-500 font-sans mt-0.5">
              Submit intent parameters or use natural language. Preflight will deterministically simulate contract policy constraints before review.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-charcoal-500 bg-ivory-warm px-2.5 py-1 rounded-lg border border-border">
              Solvency: {agentStatus?.availableLiquidNear || '5.10'} NEAR
            </span>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
              Auto-Approval Threshold: 0.20 NEAR
            </span>
          </div>
        </div>

        {/* Natural Language Prompt Input (Optional AI Layer) */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-ivory-warm/60 to-near-light/20 border border-border/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-charcoal-800 flex items-center gap-1.5 font-sans">
              <Sparkles className="w-3.5 h-3.5 text-near-dark" />
              <span>Natural Language Task Input (AI Interpreter Layer)</span>
            </label>
            <span className="text-[10px] font-mono text-charcoal-400">OPTIONAL</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={naturalPrompt}
              onChange={e => setNaturalPrompt(e.target.value)}
              placeholder='e.g. "Send 0.01 NEAR to whiteice2105.testnet for compute quota"'
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-border text-xs sm:text-sm font-sans text-charcoal-900 focus:outline-none focus:border-near-dark shadow-xs"
            />
            <button
              type="button"
              onClick={handleParsePrompt}
              disabled={!naturalPrompt.trim()}
              className="px-4 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold transition-all shadow-xs disabled:opacity-40 shrink-0"
            >
              Parse
            </button>
          </div>
          <p className="text-[10px] text-charcoal-500 font-sans">
            The AI intelligence layer parses user prompts into strict parameters without ever touching signing keys.
          </p>
        </div>

        {/* Structured Intent Form */}
        <form onSubmit={handlePreflight} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Destination */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-charcoal-800 block">
                Destination Recipient Account
              </label>
              <input
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-near-dark"
                placeholder="merchant.testnet"
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDestination('whiteice2105.testnet')}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-bold"
                >
                  whiteice2105.testnet (Allowlisted)
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('unlisted-vendor.testnet')}
                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-mono font-bold"
                >
                  unlisted-vendor.testnet (Approval Queue)
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-charcoal-800 block">
                Disbursement Amount (NEAR)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={amountNear}
                  onChange={e => setAmountNear(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-near-dark pr-16"
                  placeholder="0.01"
                  required
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-charcoal-500">
                  NEAR
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAmountNear('0.01')}
                  className="px-2 py-0.5 rounded-md bg-near-light hover:bg-near-light/80 text-near-dark border border-near-green/30 text-[10px] font-mono font-bold"
                >
                  0.01 NEAR (Hackathon Test)
                </button>
                <button
                  type="button"
                  onClick={() => setAmountNear('0.15')}
                  className="px-2 py-0.5 rounded-md bg-ivory-warm hover:bg-charcoal-100 text-charcoal-700 border border-border text-[10px] font-mono"
                >
                  0.15 NEAR (&le; 0.20 Threshold)
                </button>
                <button
                  type="button"
                  onClick={() => setAmountNear('0.50')}
                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-mono"
                >
                  0.50 NEAR (Queued)
                </button>
                <button
                  type="button"
                  onClick={() => setAmountNear('1.50')}
                  className="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-mono"
                >
                  1.50 NEAR (&gt; 1.0 Max Tx)
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Reason */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-charcoal-800 block">
                Payment Reason (Immutable Audit Memo)
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-sans text-charcoal-900 focus:outline-none focus:border-near-dark"
                placeholder="Autonomous test disbursement of 0.01 NEAR"
                required
              />
            </div>

            {/* TTL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-charcoal-800 block">
                Expiry TTL (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={ttlMinutes}
                onChange={e => setTtlMinutes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ivory-warm border border-border text-xs sm:text-sm font-mono text-charcoal-900 focus:outline-none focus:border-near-dark"
                required
              />
            </div>
          </div>

          {preflightError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{preflightError}</span>
            </div>
          )}

          {/* Action Button: Review & Preflight */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-charcoal-500 font-sans">
              <strong>Step 1 of 2:</strong> Preflight evaluates all 10 policy constraints before displaying unbroadcast staged payload for your explicit approval.
            </div>

            <button
              type="submit"
              disabled={isPreflighting || !destination || !amountNear}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98] disabled:opacity-50 touch-manipulation"
            >
              <ShieldCheck className="w-4 h-4 text-near-green" />
              <span>{isPreflighting ? 'Simulating Preflight...' : 'Review & Preflight Intent'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. TRANSACTION REVIEW & STAGING MODAL (Section 5 Strict Review) */}
      <AnimatePresence>
        {isReviewModalOpen && preflightData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-3xl border border-white/80 shadow-2xl max-w-2xl w-full p-6 sm:p-7 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-near-dark text-white flex items-center justify-center shrink-0 shadow-soft">
                    <ShieldCheck className="w-5 h-5 text-near-green" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-charcoal-900 tracking-tight">
                      Transaction Review & Authorization
                    </h3>
                    <p className="text-xs text-charcoal-500 font-sans">
                      Verify exact unbroadcast parameters before authorizing the autonomous agent runtime.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsReviewModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-charcoal-100 text-charcoal-400 hover:text-charcoal-700 transition-all"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Expected Route Banner */}
              <div
                className={`p-4 rounded-2xl border text-xs font-mono space-y-1 ${
                  preflightData.expectedRoute === 'AUTO_DISPATCH'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : preflightData.expectedRoute === 'PENDING_APPROVAL'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="uppercase tracking-wider text-[10px]">
                    Expected Contract Route:
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 text-[10px]">
                    {preflightData.expectedRoute}
                  </span>
                </div>
                <div className="text-xs font-sans font-medium">
                  {preflightData.expectedRouteLabel}
                </div>
              </div>

              {/* Exact Staged Transaction Parameters Table */}
              <div className="p-4 rounded-2xl bg-ivory-warm/60 border border-border text-xs font-mono space-y-2.5">
                <div className="text-[10px] uppercase font-bold text-charcoal-400 tracking-wider">
                  STAGED TRANSACTION PAYLOAD (UNBROADCAST)
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Network:</span>
                    <span className="font-bold text-charcoal-900">NEAR Public Testnet</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Signer Account:</span>
                    <span className="font-bold text-near-dark truncate block">{preflightData.preview.signerId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Target Contract:</span>
                    <span className="font-bold text-charcoal-900 truncate block">{preflightData.preview.receiverId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Method Name:</span>
                    <span className="font-bold text-near-dark block">{preflightData.preview.methodName}()</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Recipient Destination:</span>
                    <span className="font-bold text-charcoal-900 truncate block">{preflightData.preview.args.destination}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Disbursement Amount:</span>
                    <span className="font-extrabold text-near-dark text-sm block">{preflightData.intent.amountNear} NEAR</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Attached Deposit:</span>
                    <span className="font-bold text-emerald-700 block">{preflightData.preview.deposit}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-charcoal-400 block uppercase">Prepaid Gas:</span>
                    <span className="font-bold text-charcoal-900 block">{preflightData.preview.gas}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] text-charcoal-400 block uppercase">Memo Reason:</span>
                    <span className="font-medium text-charcoal-800 font-sans block">{preflightData.preview.args.reason}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] text-charcoal-400 block uppercase">Signer Public Key:</span>
                    <span className="font-bold text-charcoal-700 text-[10px] truncate block">{preflightData.preview.publicKey}</span>
                  </div>
                </div>
              </div>

              {/* 10 Preflight Policy Checks Accordion */}
              <div className="border border-border rounded-2xl overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setIsPreflightDetailsOpen(!isPreflightDetailsOpen)}
                  className="w-full px-4 py-3 bg-white hover:bg-ivory-warm flex items-center justify-between text-left transition-all"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-charcoal-900">
                      Deterministic Pre-Flight Checks ({preflightData.preflight.checks.filter(c => c.passed).length}/{preflightData.preflight.checks.length} Passed)
                    </span>
                  </div>
                  {isPreflightDetailsOpen ? <ChevronUp className="w-4 h-4 text-charcoal-400" /> : <ChevronDown className="w-4 h-4 text-charcoal-400" />}
                </button>

                {isPreflightDetailsOpen && (
                  <div className="p-3 bg-ivory-warm/40 border-t border-border space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px]">
                    {preflightData.preflight.checks.map((chk, idx) => (
                      <div key={idx} className="flex items-start gap-2 py-0.5">
                        {chk.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className={`font-bold ${chk.passed ? 'text-charcoal-900' : 'text-rose-900'}`}>
                            {chk.check}:
                          </span>{' '}
                          <span className="text-charcoal-600 font-sans text-[11px]">{chk.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error Banner if Execution Failed */}
              {executionError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{executionError}</span>
                </div>
              )}

              {/* Security Invariant Guarantee */}
              <div className="p-3 rounded-xl bg-near-light/40 border border-near-green/30 text-[11px] text-near-dark font-sans leading-relaxed">
                <strong>Zero-Custody Cryptographic Invariant:</strong> Execution will use ONLY the agent&apos;s restricted Function-Call Access Key (<code className="font-mono font-bold text-near-dark">ed25519:E1dDCJ...vK24</code>) confined strictly to <code className="font-mono font-bold text-near-dark">request_payment</code>. The private key remains in the secure server runtime. The owner wallet does NOT sign.
              </div>

              {/* Modal Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  disabled={isExecuting}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-charcoal-100 text-charcoal-700 border border-border text-xs font-bold transition-all"
                >
                  Cancel / Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleExecute(true)}
                  disabled={isExecuting || !preflightData.success}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface-white hover:bg-ivory-warm text-charcoal-800 border border-border text-xs font-bold transition-all shadow-xs disabled:opacity-40"
                >
                  <span>Simulate in Dry-Run</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExecute(false)}
                  disabled={isExecuting || !preflightData.success}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold shadow-soft transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5 text-near-green" />
                  <span>{isExecuting ? 'Signing & Broadcasting...' : 'Approve & Execute (Live Broadcast)'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. EXECUTION OUTCOME CARD */}
      {executionResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-6 sm:p-7 rounded-3xl border shadow-card space-y-4 ${
            executionResult.success
              ? 'bg-gradient-to-br from-white via-white to-emerald-50/30 border-emerald-300'
              : 'bg-rose-50/80 border-rose-300'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-soft ${
                  executionResult.success ? 'bg-near-dark text-white' : 'bg-rose-600 text-white'
                }`}
              >
                {executionResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-near-green" />
                ) : (
                  <XCircle className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-charcoal-500">
                  EXECUTION OUTCOME
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-charcoal-900">
                  {executionResult.status}
                </h3>
              </div>
            </div>

            {executionResult.explorerUrl && (
              <a
                href={executionResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-near-dark text-white hover:bg-near-green text-xs font-bold transition-all shadow-soft shrink-0"
              >
                <span>Inspect on NearBlocks</span>
                <ExternalLink className="w-3.5 h-3.5 text-near-green" />
              </a>
            )}
          </div>

          <p className="text-xs text-charcoal-700 font-sans leading-relaxed">
            {executionResult.message}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono pt-2">
            <div className="p-3 rounded-xl bg-white border border-border">
              <span className="text-[10px] text-charcoal-400 block uppercase">Intent Identifier:</span>
              <span className="font-bold text-charcoal-900 truncate block">{executionResult.intentId}</span>
            </div>
            {executionResult.requestId !== undefined && (
              <div className="p-3 rounded-xl bg-white border border-border">
                <span className="text-[10px] text-charcoal-400 block uppercase">Contract Request ID:</span>
                <span className="font-bold text-near-dark block">#{executionResult.requestId}</span>
              </div>
            )}
            {executionResult.txHash && (
              <div className="p-3 rounded-xl bg-white border border-border sm:col-span-2">
                <span className="text-[10px] text-charcoal-400 block uppercase">Transaction Hash:</span>
                <span className="font-bold text-charcoal-900 text-[11px] truncate block">{executionResult.txHash}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
