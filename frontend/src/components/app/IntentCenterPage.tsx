import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  VaultAccountOverview,
  StoredIntent,
  IntentLifecycleStatus,
  IntentSource,
  AgentApiToken,
  ParsedNaturalLanguageIntent,
  EXTERNAL_HANDOFF_WINDOW_MS,
  DEFAULT_VAULT_TTL_SECONDS,
} from '../../types/contract';
import {
  Bot,
  Send,
  Layers,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Info,
  Terminal,
  RefreshCw,
  Eye,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  ArrowRight,
  Code,
  Lock,
} from 'lucide-react';
import { formatNear, getExplorerTxUrl, getExplorerAccountUrl } from '../../utils/formatters';
import { PaymentReceiptVerificationCard } from '../common/PaymentReceiptVerificationCard';

interface IntentCenterPageProps {
  overview: VaultAccountOverview;
  onRefresh: () => void;
  onNavigateToApprovals?: () => void;
}

export const IntentCenterPage: React.FC<IntentCenterPageProps> = ({
  overview,
  onRefresh,
  onNavigateToApprovals,
}) => {
  // Tabs: 'submit' | 'inbox' | 'tokens' | 'docs'
  const [activeTab, setActiveTab] = useState<'submit' | 'inbox' | 'tokens' | 'docs'>('submit');

  // Submit Intent Form State
  const [naturalPrompt, setNaturalPrompt] = useState(
    'Send 0.05 NEAR to merchant.vault-parent.testnet for completing the research task.'
  );
  const [destination, setDestination] = useState('merchant.vault-parent.testnet');
  const [amountNear, setAmountNear] = useState('0.05');
  const [reason, setReason] = useState('Completing the research task');
  const [ttlMinutes, setTtlMinutes] = useState('60');

  // Parsing & Review State
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedNaturalLanguageIntent | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Preflight & Simulation State
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightData, setPreflightData] = useState<any>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<StoredIntent | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Intent Inbox State
  const [intents, setIntents] = useState<StoredIntent[]>([]);
  const [loadingIntents, setLoadingIntents] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIntent, setSelectedIntent] = useState<StoredIntent | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Token Management State
  const [tokens, setTokens] = useState<AgentApiToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [newTokenAgentName, setNewTokenAgentName] = useState('');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [generatedTokenPlaintext, setGeneratedTokenPlaintext] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Operator Authentication State
  const [operatorSecret, setOperatorSecret] = useState<string>(() => {
    try {
      return sessionStorage.getItem('vs_runtime_secret') || '';
    } catch {
      return '';
    }
  });

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (operatorSecret.trim()) {
      headers['x-runtime-secret'] = operatorSecret.trim();
      headers['Authorization'] = `Bearer ${operatorSecret.trim()}`;
    }
    return headers;
  }, [operatorSecret]);

  // 1. Fetch Intent Inbox
  const fetchIntents = useCallback(async () => {
    setLoadingIntents(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/agent/intents?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.intents)) {
          setIntents(data.intents);
          // If a selected intent is open in drawer, update its live details
          if (selectedIntent) {
            const updated = data.intents.find((i: StoredIntent) => i.intentId === selectedIntent.intentId);
            if (updated) setSelectedIntent(updated);
          }
        }
      }
    } catch (err) {
      console.warn('Could not query /api/agent/intents', err);
    } finally {
      setLoadingIntents(false);
    }
  }, [statusFilter, sourceFilter, searchQuery, selectedIntent, getAuthHeaders]);

  // 2. Fetch API Tokens
  const fetchTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch('/api/agent/tokens', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tokens)) {
          setTokens(data.tokens);
        }
      }
    } catch (err) {
      console.warn('Could not query /api/agent/tokens', err);
    } finally {
      setLoadingTokens(false);
    }
  }, [getAuthHeaders]);

  // Poll intents every 10s if auto-refresh is on
  useEffect(() => {
    fetchIntents();
    if (!autoRefresh) return;
    const interval = setInterval(fetchIntents, 10000);
    return () => clearInterval(interval);
  }, [fetchIntents, autoRefresh]);

  useEffect(() => {
    if (activeTab === 'tokens') {
      fetchTokens();
    }
  }, [activeTab, fetchTokens]);

  // 3. Natural Language Parsing
  const handleParsePrompt = async () => {
    if (!naturalPrompt.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await fetch('/api/agent/intents?action=parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: naturalPrompt.trim() }),
      });
      const data = await res.json();
      if (data.success && data.parsed) {
        setParsedPreview(data.parsed);
        if (data.parsed.destination) setDestination(data.parsed.destination);
        if (data.parsed.amountNear) setAmountNear(data.parsed.amountNear);
        if (data.parsed.reason) setReason(data.parsed.reason);
        if (data.parsed.ttlMinutes) setTtlMinutes(String(data.parsed.ttlMinutes));

        // Automatically trigger advisory preflight check
        runPreflight(data.parsed.destination, data.parsed.amountNear, data.parsed.reason, data.parsed.ttlMinutes);
      } else {
        setParseError(data.error || 'Failed to parse natural language intent.');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Error communicating with parser.');
    } finally {
      setIsParsing(false);
    }
  };

  // 4. Advisory Preflight Simulation
  const runPreflight = async (dest: string, amt: string, rsn: string, ttlMin: number) => {
    if (!dest || !amt) return;
    setIsPreflighting(true);
    setPreflightError(null);
    try {
      const res = await fetch('/api/agent/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dest,
          amountNear: amt,
          reason: rsn,
          ttlMinutes: ttlMin || 60,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreflightData(data);
      } else {
        setPreflightError(data.error || 'Preflight check returned an error.');
      }
    } catch (err: any) {
      setPreflightError(err?.message || 'Failed to run preflight check.');
    } finally {
      setIsPreflighting(false);
    }
  };

  // 5. Submit Intent to Queue
  const handleSubmitIntent = async (processImmediately: boolean) => {
    if (!destination.trim() || !amountNear.trim()) {
      setSubmissionError('Please provide both destination account and NEAR amount.');
      return;
    }
    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionSuccess(null);

    try {
      const res = await fetch('/api/agent/intents', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          destination: destination.trim(),
          amountNear: amountNear.trim(),
          reason: reason.trim() || 'Native dashboard payment intent',
          ttlMinutes: Number(ttlMinutes) || 60,
          naturalPrompt: naturalPrompt.trim() || undefined,
          processNow: processImmediately,
          dryRun: true, // Safe preflight simulation: submission never triggers live on-chain execution directly
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmissionSuccess(data.intent);
        fetchIntents();
        onRefresh();
      } else {
        setSubmissionError(data.error || 'Failed to submit payment intent.');
      }
    } catch (err: any) {
      setSubmissionError(err?.message || 'Failed to submit payment intent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Token Generation
  const handleGenerateToken = async () => {
    if (!newTokenAgentName.trim()) return;
    setIsGeneratingToken(true);
    try {
      const res = await fetch('/api/agent/tokens', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ agentName: newTokenAgentName.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedTokenPlaintext(data.token);
        setNewTokenAgentName('');
        fetchTokens();
      } else {
        alert(data.error || 'Failed to generate token.');
      }
    } catch (err: any) {
      alert(err.message || 'Error generating token.');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  // 7. Token Revocation
  const handleRevokeToken = async (tokenId: string) => {
    if (!confirm('Are you sure you want to revoke this agent credential? External submissions using this token will be immediately blocked.')) {
      return;
    }
    try {
      const res = await fetch(`/api/agent/tokens?action=revoke&id=${tokenId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchTokens();
      } else {
        alert(data.error || 'Failed to revoke token.');
      }
    } catch (err: any) {
      alert(err.message || 'Error revoking token.');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Lifecycle status badge formatter
  const renderStatusBadge = (status: IntentLifecycleStatus) => {
    switch (status) {
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 animate-pulse" /> Received
          </span>
        );
      case 'INGESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <Zap className="w-3 h-3" /> Ingested
          </span>
        );
      case 'VALIDATING':
      case 'PREFLIGHT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
            <Shield className="w-3 h-3 animate-pulse" /> Preflight Simulation
          </span>
        );
      case 'AWAITING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3" /> Awaiting Approval
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
            <Zap className="w-3 h-3" /> Dispatched
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'HANDOFF_EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-300">
            <AlertTriangle className="w-3 h-3" /> Handoff Expired (300s)
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3 h-3" /> Vault TTL Expired (1h)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-surface-white border border-border rounded-3xl p-6 sm:p-8 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-near-dark text-near-green flex items-center justify-center shadow-soft">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-charcoal-900 uppercase">
                  AI AGENT INTENT CENTER
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-near-green/20 text-near-dark border border-near-green/40">
                  Dual-Channel Hub
                </span>
              </div>
              <p className="text-xs sm:text-sm text-charcoal-500">
                Native Dashboard submission and External AI Agent API unified into Vault Shield's restricted execution pipeline.
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats Counter */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-ivory border border-border rounded-2xl px-4 py-2.5 text-center">
            <div className="text-[10px] font-mono text-charcoal-400 uppercase">Queue Intents</div>
            <div className="text-lg font-bold text-charcoal-900">{intents.length}</div>
          </div>
          <div className="bg-ivory border border-border rounded-2xl px-4 py-2.5 text-center">
            <div className="text-[10px] font-mono text-charcoal-400 uppercase">Handoff Window</div>
            <div className="text-lg font-bold text-indigo-700 font-mono">300s</div>
          </div>
          <div className="bg-ivory border border-border rounded-2xl px-4 py-2.5 text-center">
            <div className="text-[10px] font-mono text-charcoal-400 uppercase">Vault Payment TTL</div>
            <div className="text-lg font-bold text-amber-700 font-mono">3,600s</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('submit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'submit'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-surface-white text-charcoal-600 hover:text-charcoal-900 border border-border'
          }`}
        >
          <Sparkles className="w-4 h-4 text-near-green" />
          Submit Intent
        </button>

        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'inbox'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-surface-white text-charcoal-600 hover:text-charcoal-900 border border-border'
          }`}
        >
          <Layers className="w-4 h-4" />
          Intent Inbox
          {intents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-near-green text-near-dark font-extrabold">
              {intents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tokens')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'tokens'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-surface-white text-charcoal-600 hover:text-charcoal-900 border border-border'
          }`}
        >
          <Key className="w-4 h-4" />
          Agent API Credentials
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'docs'
              ? 'bg-near-dark text-white shadow-soft'
              : 'bg-surface-white text-charcoal-600 hover:text-charcoal-900 border border-border'
          }`}
        >
          <Code className="w-4 h-4" />
          External Agent Integration API
        </button>
      </div>

      {/* TAB 1: SUBMIT INTENT */}
      {activeTab === 'submit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Natural Language Prompt & Input Card */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-surface-white border border-border rounded-3xl p-6 shadow-card space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-near-green" />
                  <h2 className="text-sm font-extrabold text-charcoal-900 uppercase tracking-tight">
                    Natural-Language Payment Instruction
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-charcoal-400 bg-ivory px-2 py-1 rounded border border-border">
                  Channel: Dashboard Native
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-charcoal-700">
                  Payment Instruction Prompt
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={naturalPrompt}
                    onChange={(e) => setNaturalPrompt(e.target.value)}
                    placeholder="e.g. Send 0.05 NEAR to merchant.vault-parent.testnet for completing the research task."
                    className="w-full px-4 py-3 text-xs bg-ivory border border-border rounded-2xl font-mono text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark resize-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-[10px] text-charcoal-400">Quick Examples:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNaturalPrompt('Send 0.05 NEAR to merchant.vault-parent.testnet for completing the research task.');
                      setDestination('merchant.vault-parent.testnet');
                      setAmountNear('0.05');
                      setReason('Completing the research task');
                    }}
                    className="text-[10px] font-mono text-indigo-700 hover:underline bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100"
                  >
                    0.05 NEAR to merchant.vault-parent.testnet (Auto-Dispatch)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNaturalPrompt('Send 0.50 NEAR to oracle.vault-parent.testnet for quarterly oracle subscription.');
                      setDestination('oracle.vault-parent.testnet');
                      setAmountNear('0.50');
                      setReason('Quarterly oracle subscription');
                    }}
                    className="text-[10px] font-mono text-amber-700 hover:underline bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                  >
                    0.50 NEAR to oracle.vault-parent.testnet (Pending Approval)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleParsePrompt}
                  disabled={isParsing || !naturalPrompt.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-near-dark text-white text-xs font-bold shadow-soft hover:bg-near-green hover:text-near-dark transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isParsing ? 'Parsing Instruction...' : 'Parse & Review Parameters'}
                </button>

                <div className="text-[11px] text-charcoal-400 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  Zero signing credentials accessible to AI prompt
                </div>
              </div>

              {parseError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>

            {/* Editable Structured Review Fields */}
            <div className="bg-surface-white border border-border rounded-3xl p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-near-dark" />
                  <h3 className="text-xs font-bold uppercase tracking-tight text-charcoal-900">
                    Structured Review & Manual Adjustments
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-charcoal-500">
                  Pre-Submission Review
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-charcoal-700">Recipient Account</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="account.testnet"
                    className="w-full px-3.5 py-2 text-xs bg-ivory border border-border rounded-xl font-mono text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-charcoal-700">Payment Amount (NEAR)</label>
                  <input
                    type="text"
                    value={amountNear}
                    onChange={(e) => setAmountNear(e.target.value)}
                    placeholder="0.05"
                    className="w-full px-3.5 py-2 text-xs bg-ivory border border-border rounded-xl font-mono text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-bold text-charcoal-700">Payment Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for disbursement"
                    className="w-full px-3.5 py-2 text-xs bg-ivory border border-border rounded-xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-charcoal-700">Vault Payment TTL (Minutes)</label>
                  <input
                    type="number"
                    value={ttlMinutes}
                    onChange={(e) => setTtlMinutes(e.target.value)}
                    min="5"
                    max="1440"
                    className="w-full px-3.5 py-2 text-xs bg-ivory border border-border rounded-xl font-mono text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark"
                  />
                  <div className="text-[10px] text-charcoal-400">Vault TTL (Active only after acceptance)</div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-charcoal-700">External Handoff Window</label>
                  <input
                    type="text"
                    disabled
                    value="300 seconds (5 min)"
                    className="w-full px-3.5 py-2 text-xs bg-ivory/60 border border-border rounded-xl font-mono text-charcoal-500 cursor-not-allowed"
                  />
                  <div className="text-[10px] text-indigo-700">Time allowed for ingestion by VaultAgent</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => runPreflight(destination, amountNear, reason, Number(ttlMinutes))}
                  disabled={isPreflighting || !destination || !amountNear}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-ivory border border-border hover:bg-ivory-warm text-charcoal-800 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <ShieldCheck className="w-4 h-4 text-near-dark" />
                  {isPreflighting ? 'Simulating...' : 'Run Advisory Preflight Check'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmitIntent(false)}
                  disabled={isSubmitting || !destination || !amountNear}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface-white border-2 border-near-dark text-near-dark text-xs font-extrabold hover:bg-near-dark hover:text-white transition-all shadow-soft flex items-center justify-center gap-2"
                >
                  <Layers className="w-4 h-4" />
                  Queue Intent Only (Staged)
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmitIntent(true)}
                  disabled={isSubmitting || !destination || !amountNear}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-near-dark hover:bg-near-green hover:text-near-dark text-white text-xs font-black transition-all shadow-elevation flex items-center justify-center gap-2 sm:ml-auto"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Ingesting Intent...' : 'Submit & Ingest to VaultAgent'}
                </button>
              </div>

              {submissionSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Intent Submitted Successfully: #{submissionSuccess.intentId}</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono">
                    Status: <strong className="underline">{submissionSuccess.status}</strong> | Handoff Window: 300s
                    {submissionSuccess.requestId !== undefined && ` | Request ID: #${submissionSuccess.requestId}`}
                    {submissionSuccess.txHash && ` | TxHash: ${submissionSuccess.txHash.slice(0, 10)}...`}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedIntent(submissionSuccess);
                        setActiveTab('inbox');
                      }}
                      className="px-3 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700"
                    >
                      Inspect in Inbox
                    </button>
                  </div>
                </div>
              )}

              {submissionError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Structured Review & Policy Evaluation Preview */}
          <div className="lg:col-span-5 space-y-6">
            {/* Structured Intent Review Card */}
            <div className="bg-surface-white border border-border rounded-3xl p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-near-dark" />
                  <h3 className="text-xs font-extrabold uppercase tracking-tight text-charcoal-900">
                    Structured Intent Summary
                  </h3>
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  Review Gate
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Recipient Account:</span>
                  <span className="font-mono font-bold text-charcoal-900">{destination || '—'}</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Payment Amount:</span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-near-dark">{amountNear || '0'} NEAR</span>
                    <div className="text-[10px] font-mono text-charcoal-400">
                      {overview?.contractId && `Target: ${overview.contractId}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Currency:</span>
                  <span className="font-mono font-bold text-charcoal-900">NEAR Protocol Native</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Submission Source:</span>
                  <span className="font-mono font-bold text-indigo-700">DASHBOARD NATIVE</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Handoff Window:</span>
                  <span className="font-mono font-bold text-indigo-800">300 seconds</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Vault Payment TTL:</span>
                  <span className="font-mono font-bold text-amber-800">{ttlMinutes} minutes (after ingest)</span>
                </div>

                <div className="p-3 rounded-xl bg-ivory border border-border space-y-1">
                  <span className="text-[11px] text-charcoal-500 font-medium">Payment Reason:</span>
                  <p className="text-xs text-charcoal-800 italic">"{reason || 'No description provided'}"</p>
                </div>
              </div>

              {/* Two Expiry Notice */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  Two Distinct Deadlines Enforced:
                </div>
                <p className="text-[10px] text-charcoal-600">
                  <strong>1. External Handoff (300s):</strong> Time allowed for submission to reach VaultAgent runtime.
                  <br />
                  <strong>2. Vault Payment TTL (1 hour):</strong> Starts only after VaultAgent accepts the intent on-chain.
                </p>
              </div>
            </div>

            {/* Advisory Preflight Simulation Results */}
            {preflightData && (
              <div className="bg-surface-white border border-border rounded-3xl p-6 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-near-dark" />
                    <h3 className="text-xs font-bold uppercase tracking-tight text-charcoal-900">
                      Advisory Preflight Evaluation
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      preflightData.preflight?.predictedRouting === 'AUTO_DISPATCH'
                        ? 'bg-emerald-100 text-emerald-800'
                        : preflightData.preflight?.predictedRouting === 'PENDING_APPROVAL'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {preflightData.preflight?.predictedRouting || 'EVALUATED'}
                  </span>
                </div>

                <div className="text-xs text-charcoal-700 font-medium">
                  {preflightData.expectedRouteLabel}
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {preflightData.preflight?.checks?.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-2 rounded-lg bg-ivory text-[11px] border border-border"
                    >
                      {c.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold text-charcoal-900">{c.check}: </span>
                        <span className="text-charcoal-600 font-mono text-[10px]">{c.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INTENT INBOX */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-surface-white border border-border rounded-2xl p-4 shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 text-charcoal-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Intent ID, recipient, reason..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-ivory border border-border rounded-xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-near-dark font-mono"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-ivory border border-border rounded-xl text-charcoal-900 font-bold focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="RECEIVED">Received</option>
                <option value="INGESTED">Ingested</option>
                <option value="AWAITING_APPROVAL">Awaiting Approval</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="HANDOFF_EXPIRED">Handoff Expired (300s)</option>
                <option value="EXPIRED">Vault TTL Expired</option>
              </select>

              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-ivory border border-border rounded-xl text-charcoal-900 font-bold focus:outline-none"
              >
                <option value="ALL">All Sources</option>
                <option value="DASHBOARD">Dashboard Native</option>
                <option value="EXTERNAL_AGENT">External AI Agent</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  autoRefresh
                    ? 'bg-near-green/15 text-near-dark border-near-green/30'
                    : 'bg-ivory text-charcoal-500 border-border'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-charcoal-300'}`} />
                {autoRefresh ? 'Live Sync Active' : 'Live Sync Paused'}
              </button>

              <button
                type="button"
                onClick={fetchIntents}
                disabled={loadingIntents}
                className="p-2 rounded-xl bg-ivory hover:bg-ivory-warm border border-border text-charcoal-700 transition-all"
                title="Refresh Intent Inbox"
              >
                <RefreshCw className={`w-4 h-4 ${loadingIntents ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Intents Table */}
          <div className="bg-surface-white border border-border rounded-3xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-ivory/50 text-[11px] font-mono text-charcoal-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Intent ID</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Handoff Window</th>
                    <th className="py-3 px-4">Vault TTL</th>
                    <th className="py-3 px-4">Request ID</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {intents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-charcoal-400">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        No payment intents found matching filters.
                      </td>
                    </tr>
                  ) : (
                    intents.map((intent) => {
                      const now = Date.now();
                      const handoffSecRemaining = Math.max(0, Math.round((intent.handoffDeadline - now) / 1000));
                      const isHandoffActive = intent.status === 'RECEIVED' && handoffSecRemaining > 0;

                      return (
                        <tr
                          key={intent.intentId}
                          onClick={() => setSelectedIntent(intent)}
                          className="hover:bg-ivory/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-near-dark">
                            {intent.intentId.slice(0, 18)}...
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                intent.source === 'DASHBOARD'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-purple-50 text-purple-800 border border-purple-200'
                              }`}
                            >
                              {intent.source === 'DASHBOARD' ? 'Dashboard' : 'External Agent'}
                            </span>
                            {intent.agentId && (
                              <div className="text-[10px] text-charcoal-400 truncate max-w-[120px]">
                                {intent.agentId}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-charcoal-900 font-semibold">
                            {intent.destination}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-charcoal-900">
                            {intent.amountNear} NEAR
                          </td>
                          <td className="py-3.5 px-4">{renderStatusBadge(intent.status)}</td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            {isHandoffActive ? (
                              <span className="text-indigo-700 font-bold">{handoSecRemaining(intent.handoffDeadline)}s left</span>
                            ) : intent.status === 'HANDOFF_EXPIRED' ? (
                              <span className="text-rose-700 font-bold">Expired (300s)</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">Ingested</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            {intent.vaultDeadline ? (
                              <span className="text-amber-800 font-bold">
                                {Math.max(0, Math.round((intent.vaultDeadline - now) / 60000))}m left
                              </span>
                            ) : (
                              <span className="text-charcoal-400">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-charcoal-700">
                            {intent.requestId !== undefined ? `#${intent.requestId}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIntent(intent);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-ivory hover:bg-near-dark hover:text-white border border-border text-[11px] font-bold transition-all"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AGENT API CREDENTIALS */}
      {activeTab === 'tokens' && (
        <div className="space-y-6">
          {/* Issue New API Token Card */}
          <div className="bg-surface-white border border-border rounded-3xl p-6 shadow-card space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Key className="w-4 h-4 text-near-dark" />
              <h2 className="text-xs font-extrabold uppercase tracking-tight text-charcoal-900">
                Generate External AI Agent API Token
              </h2>
            </div>
            <p className="text-xs text-charcoal-600">
              Create cryptographically secure, scoped API credentials for external AI agents (e.g. Autonome, LangChain, Eliza, custom autonomous daemons). Tokens are hashed with SHA-256 before storage.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newTokenAgentName}
                onChange={(e) => setNewTokenAgentName(e.target.value)}
                placeholder="Agent Name (e.g. Autonomous Research Worker A)"
                className="flex-1 px-4 py-2.5 text-xs bg-ivory border border-border rounded-xl text-charcoal-900 font-medium focus:outline-none focus:ring-2 focus:ring-near-dark"
              />
              <button
                type="button"
                onClick={handleGenerateToken}
                disabled={isGeneratingToken || !newTokenAgentName.trim()}
                className="px-5 py-2.5 rounded-xl bg-near-dark text-white hover:bg-near-green hover:text-near-dark text-xs font-bold transition-all shadow-soft flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Key className="w-4 h-4" />
                {isGeneratingToken ? 'Generating...' : 'Issue Agent Token'}
              </button>
            </div>

            {generatedTokenPlaintext && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Important: Save this token immediately. It will not be shown again.</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-white border border-amber-200">
                  <code className="text-xs font-mono text-charcoal-900 break-all select-all">
                    {generatedTokenPlaintext}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedTokenPlaintext);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2500);
                    }}
                    className="ml-3 px-3 py-1.5 rounded-lg bg-near-dark text-white text-[11px] font-bold hover:bg-near-green hover:text-near-dark shrink-0 flex items-center gap-1.5"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedToken ? 'Copied' : 'Copy Token'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active API Tokens Table */}
          <div className="bg-surface-white border border-border rounded-3xl shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-tight text-charcoal-900">
                Active & Revoked Agent Credentials
              </h3>
              <button
                type="button"
                onClick={fetchTokens}
                className="p-1.5 rounded-lg bg-ivory hover:bg-ivory-warm border border-border text-charcoal-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTokens ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-ivory/50 text-[11px] font-mono text-charcoal-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Agent Name</th>
                    <th className="py-3 px-4">Token Prefix</th>
                    <th className="py-3 px-4">Rate Limit</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {tokens.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-charcoal-400">
                        No agent credentials found.
                      </td>
                    </tr>
                  ) : (
                    tokens.map((tok) => (
                      <tr key={tok.tokenId} className="hover:bg-ivory/40">
                        <td className="py-3.5 px-4 font-bold text-charcoal-900">{tok.agentName}</td>
                        <td className="py-3.5 px-4 font-mono text-charcoal-700">{tok.tokenPrefix}</td>
                        <td className="py-3.5 px-4 font-mono text-charcoal-600">{tok.rateLimitPerMin} req/min</td>
                        <td className="py-3.5 px-4 font-mono text-charcoal-500">
                          {new Date(tok.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4">
                          {tok.revoked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              <XCircle className="w-3 h-3" /> Revoked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {!tok.revoked && (
                            <button
                              type="button"
                              onClick={() => handleRevokeToken(tok.tokenId)}
                              className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold transition-all"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EXTERNAL AGENT INTEGRATION GUIDE */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          <div className="bg-surface-white border border-border rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-near-dark" />
                <h2 className="text-base font-extrabold uppercase tracking-tight text-charcoal-900">
                  External AI Agent API Integration Guide
                </h2>
              </div>
              <p className="text-xs text-charcoal-600 mt-1">
                External AI agents submit payment intents via authenticated HTTP POST requests. The Vault Shield runtime enforces rate limiting, NEP-0010 syntax verification, deterministic 10-check policy preflight, and restricted key signing with 0 deposit.
              </p>
            </div>

            {/* Invariant Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-ivory border border-border space-y-1.5">
                <div className="text-xs font-bold text-charcoal-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" /> Zero Key Exposure
                </div>
                <p className="text-[11px] text-charcoal-600">
                  External agents never receive or touch private keys. All transactions are formulated server-side using a restricted FunctionCall key.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-ivory border border-border space-y-1.5">
                <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-700" /> 300s Handoff Window
                </div>
                <p className="text-[11px] text-charcoal-600">
                  The intent must reach VaultAgent within 300 seconds of creation. Unreceived intents transition to <code>HANDOFF_EXPIRED</code>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-ivory border border-border space-y-1.5">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-700" /> 3,600s Vault TTL
                </div>
                <p className="text-[11px] text-charcoal-600">
                  Once accepted into contract escrow (Route B), the Vault Owner has 1 hour to approve before funds return to available balance.
                </p>
              </div>
            </div>

            {/* Example cURL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-charcoal-800">1. Submit Intent (cURL Example)</span>
                <button
                  onClick={() => copyToClipboard(`curl -X POST https://vault-shield-two.vercel.app/api/agent/intents \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer vsa_live_demo_external_agent_token_2026_sec" \\
  -H "Idempotency-Key: task_4021_run_01" \\
  -d '{
    "destination": "merchant.vault-parent.testnet",
    "amountNear": "0.05",
    "reason": "Autonomous batch compute credit procurement",
    "ttlMinutes": 60,
    "processNow": true
  }'`, 'curl')}
                  className="px-2.5 py-1 rounded bg-ivory hover:bg-ivory-warm border border-border text-[11px] font-bold text-charcoal-700 flex items-center gap-1"
                >
                  {copiedText === 'curl' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedText === 'curl' ? 'Copied' : 'Copy cURL'}
                </button>
              </div>
              <pre className="p-4 rounded-2xl bg-near-dark text-white font-mono text-[11px] overflow-x-auto">
{`curl -X POST https://vault-shield-two.vercel.app/api/agent/intents \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer vsa_live_demo_external_agent_token_2026_sec" \\
  -H "Idempotency-Key: task_4021_run_01" \\
  -d '{
    "destination": "merchant.vault-parent.testnet",
    "amountNear": "0.05",
    "reason": "Autonomous batch compute credit procurement",
    "ttlMinutes": 60,
    "processNow": true
  }'`}
              </pre>
            </div>

            {/* Example Python */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-charcoal-800">2. Python (Requests / Autonome / LangChain)</span>
                <button
                  onClick={() => copyToClipboard(`import requests

headers = {
    "Authorization": "Bearer vsa_live_demo_external_agent_token_2026_sec",
    "Content-Type": "application/json"
}

payload = {
    "prompt": "Send 0.05 NEAR to merchant.vault-parent.testnet for compute credits",
    "processNow": True
}

res = requests.post("https://vault-shield-two.vercel.app/api/agent/intents", json=payload, headers=headers)
print(res.json())`, 'python')}
                  className="px-2.5 py-1 rounded bg-ivory hover:bg-ivory-warm border border-border text-[11px] font-bold text-charcoal-700 flex items-center gap-1"
                >
                  {copiedText === 'python' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedText === 'python' ? 'Copied' : 'Copy Python'}
                </button>
              </div>
              <pre className="p-4 rounded-2xl bg-near-dark text-white font-mono text-[11px] overflow-x-auto">
{`import requests

headers = {
    "Authorization": "Bearer vsa_live_demo_external_agent_token_2026_sec",
    "Content-Type": "application/json"
}

payload = {
    "prompt": "Send 0.05 NEAR to merchant.vault-parent.testnet for compute credits",
    "processNow": True
}

res = requests.post("https://vault-shield-two.vercel.app/api/agent/intents", json=payload, headers=headers)
print(res.json())`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* INTENT DETAILS INSPECTION MODAL / DRAWER */}
      <AnimatePresence>
        {selectedIntent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-surface-white border border-border rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-elevation space-y-6"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-charcoal-400">INTENT</span>
                    <h2 className="text-base sm:text-lg font-mono font-black text-charcoal-900">
                      {selectedIntent.intentId}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {renderStatusBadge(selectedIntent.status)}
                    <span className="text-charcoal-400">•</span>
                    <span className="text-charcoal-600 font-medium">Source: {selectedIntent.source}</span>
                    <span className="text-charcoal-400">•</span>
                    <span className="text-charcoal-600 font-mono">
                      {new Date(selectedIntent.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedIntent(null)}
                  className="p-2 rounded-xl bg-ivory hover:bg-ivory-warm text-charcoal-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Lifecycle Progress Bar */}
              <div className="p-4 rounded-2xl bg-ivory border border-border space-y-3">
                <div className="text-xs font-bold text-charcoal-900 uppercase tracking-tight">
                  Lifecycle Progression
                </div>
                <div className="flex items-center justify-between gap-1 overflow-x-auto text-[10px] font-bold font-mono">
                  {['RECEIVED', 'INGESTED', 'VALIDATING', 'PREFLIGHT', selectedIntent.status === 'DISPATCHED' ? 'DISPATCHED' : 'AWAITING_APPROVAL', 'COMPLETED'].map((step, idx) => {
                    const isStepPast = isPastStep(selectedIntent.status, step);
                    const isStepCurrent = selectedIntent.status === step;

                    return (
                      <div key={idx} className="flex items-center gap-1 shrink-0">
                        <div
                          className={`px-2 py-1 rounded-lg border text-center ${
                            isStepCurrent
                              ? 'bg-near-dark text-white border-near-dark'
                              : isStepPast
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-surface-white text-charcoal-400 border-border'
                          }`}
                        >
                          {step}
                        </div>
                        {idx < 5 && <ArrowRight className="w-3 h-3 text-charcoal-300 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Two Expiry Windows Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-indigo-900 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> External Handoff Window (300s)
                  </div>
                  <div className="text-xs font-mono text-indigo-950 font-bold">
                    Deadline: {new Date(selectedIntent.handoffDeadline).toLocaleTimeString()}
                  </div>
                  <p className="text-[10px] text-indigo-700">
                    {selectedIntent.ingestedAt
                      ? `Ingested in ${Math.round((selectedIntent.ingestedAt - selectedIntent.createdAt) / 1000)}s`
                      : 'Awaiting runtime ingestion'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-amber-900 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Vault Payment TTL (1 hour)
                  </div>
                  <div className="text-xs font-mono text-amber-950 font-bold">
                    {selectedIntent.vaultDeadline
                      ? `Expires: ${new Date(selectedIntent.vaultDeadline).toLocaleTimeString()}`
                      : 'Begins after VaultAgent acceptance'}
                  </div>
                  <p className="text-[10px] text-amber-800">
                    {selectedIntent.acceptedAt
                      ? `Active since ${new Date(selectedIntent.acceptedAt).toLocaleTimeString()}`
                      : 'Not yet established'}
                  </p>
                </div>
              </div>

              {/* Execution Details & Explorer Links */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Recipient Account:</span>
                  <a
                    href={getExplorerAccountUrl(selectedIntent.destination)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-near-dark hover:underline flex items-center gap-1"
                  >
                    {selectedIntent.destination}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-ivory border border-border">
                  <span className="text-charcoal-500 font-medium">Payment Amount:</span>
                  <span className="font-mono font-bold text-charcoal-900">{selectedIntent.amountNear} NEAR</span>
                </div>

                {selectedIntent.requestId !== undefined && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-ivory border border-border">
                    <span className="text-charcoal-500 font-medium">Payment Request ID:</span>
                    <span className="font-mono font-bold text-indigo-700">#{selectedIntent.requestId}</span>
                  </div>
                )}

                {selectedIntent.txHash && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-ivory border border-border">
                    <span className="text-charcoal-500 font-medium">Transaction Hash:</span>
                    <a
                      href={getExplorerTxUrl(selectedIntent.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      {selectedIntent.txHash.slice(0, 24)}...
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {selectedIntent.errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs">
                    <strong>Error / Policy Denial:</strong> {selectedIntent.errorMessage}
                  </div>
                )}
              </div>

              {/* Immutable Audit Log */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-charcoal-900 uppercase tracking-tight">
                  Lifecycle Audit Trail
                </div>
                <div className="border border-border rounded-2xl bg-ivory/50 p-3 space-y-2 max-h-56 overflow-y-auto">
                  {selectedIntent.auditTrail?.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <span className="text-[10px] font-mono text-charcoal-400 mt-0.5 shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <div>
                        <span className="font-bold text-charcoal-900 font-mono text-[11px]">
                          [{entry.status}]
                        </span>{' '}
                        <span className="text-charcoal-700">{entry.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedIntent(null)}
                  className="px-5 py-2.5 rounded-xl bg-near-dark text-white text-xs font-bold shadow-soft"
                >
                  Close Inspection View
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function handoSecRemaining(deadline: number): number {
  return Math.max(0, Math.round((deadline - Date.now()) / 1000));
}

function isPastStep(current: IntentLifecycleStatus, step: string): boolean {
  const order = ['RECEIVED', 'INGESTED', 'VALIDATING', 'PREFLIGHT', 'AWAITING_APPROVAL', 'DISPATCHED', 'COMPLETED'];
  const curIdx = order.indexOf(current);
  const stepIdx = order.indexOf(step);
  return curIdx >= stepIdx && stepIdx !== -1;
}
