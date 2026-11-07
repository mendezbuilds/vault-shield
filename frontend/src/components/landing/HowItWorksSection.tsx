import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const HowItWorksSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'auto' | 'queue' | 'denial'>('all');

  const steps = [
    {
      num: '01',
      title: 'Policy Configuration',
      desc: 'Owner configures max per-tx cap (1.0 N), daily rolling limit (2.0 N), auto-approval threshold (0.2 N), and approved merchant allowlist.',
      category: 'setup',
      tag: 'Owner Governance',
    },
    {
      num: '02',
      title: 'Agent Key Provisioning',
      desc: 'Owner registers agent account with add_agent(). Restricted Function-Call keys allow execution only of request_payment().',
      category: 'setup',
      tag: 'Key Authorization',
    },
    {
      num: '03',
      title: 'Payment Intent Submission',
      desc: 'Agent requests funds for an API, GPU cluster, or vendor with an explicit audit memo and bounded TTL window (5m to 24h).',
      category: 'intent',
      tag: 'Intent Ingestion',
    },
    {
      num: '04',
      title: 'Deterministic Invariant Evaluation',
      desc: 'Smart contract verifies: Is vault active? Is agent authorized? Does amount fit per-tx cap? Does daily commitment fit cap? Is liquid balance solvent?',
      category: 'eval',
      tag: 'Contract Logic',
    },
    {
      num: '05',
      title: 'Route A &bull; Immediate Auto-Execution',
      desc: 'If destination is allowlisted AND amount <= auto_approval_threshold: Amount shifts to InFlight and dispatches transfer promise in 1 block.',
      category: 'auto',
      highlight: 'border-near-green/40 bg-near-light/50',
      tag: 'Auto-Dispatch',
    },
    {
      num: '06',
      title: 'Route B &bull; Approval Queue Allocation',
      desc: 'If destination is unlisted OR amount > threshold: Vault allocates an on-chain pending reservation and routes to Owner Approval Queue.',
      category: 'queue',
      highlight: 'border-amber-500/40 bg-amber-500/10',
      tag: 'Owner Approval',
    },
    {
      num: '07',
      title: 'Route C &bull; Hard Policy Denial',
      desc: 'If amount breaches daily cap, per-tx cap, or solvency reserve: Contract immediately returns Denied with zero state creation.',
      category: 'denial',
      highlight: 'border-rose-500/40 bg-rose-500/10',
      tag: 'Zero-State Block',
    },
    {
      num: '08',
      title: 'Audit Ring Inscription',
      desc: 'Every transition records a compact record into the bounded 50-slot on-chain circular audit buffer with monotonic sequence ID.',
      category: 'audit',
      tag: 'Circular Buffer',
    },
  ];

  const filteredSteps = steps.filter(s => {
    if (activeTab === 'auto') return s.category === 'setup' || s.category === 'intent' || s.category === 'eval' || s.category === 'auto' || s.category === 'audit';
    if (activeTab === 'queue') return s.category === 'setup' || s.category === 'intent' || s.category === 'eval' || s.category === 'queue' || s.category === 'audit';
    if (activeTab === 'denial') return s.category === 'intent' || s.category === 'eval' || s.category === 'denial' || s.category === 'audit';
    return true;
  });

  return (
    <section id="how-it-works" className="py-28 border-t border-border bg-ivory-warm/40 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-charcoal-500">
            Protocol Mechanics
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            The Eight-Stage Verification Pipeline
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            Every transaction undergoes deterministic validation. Observe how routine micro-payments execute in a single block while anomalous requests enter human-authorized approval queues.
          </p>

          {/* Editorial Route Switcher with Liquid Glass Sheen */}
          <div className="mt-10 inline-flex flex-wrap p-1.5 rounded-2xl bg-white/80 backdrop-blur-md border border-white/90 shadow-soft gap-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-near-dark text-white shadow-soft'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Full Pipeline (Stages 1-8)
            </button>
            <button
              onClick={() => setActiveTab('auto')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'auto'
                  ? 'bg-near-dark text-white shadow-soft'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Route A &bull; Auto-Execution
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'queue'
                  ? 'bg-amber-600 text-white shadow-soft'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Route B &bull; Approval Queue
            </button>
            <button
              onClick={() => setActiveTab('denial')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'denial'
                  ? 'bg-rose-600 text-white shadow-soft'
                  : 'text-charcoal-600 hover:text-charcoal-900'
              }`}
            >
              Route C &bull; Hard Policy Denial
            </button>
          </div>
        </motion.div>

        {/* 8-Grid of Pipeline Cards with Staggered Entrance */}
        <motion.div
          layout
          className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <AnimatePresence>
            {filteredSteps.map((s, idx) => (
              <motion.div
                key={s.num}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`p-7 rounded-3xl border transition-all duration-200 flex flex-col justify-between ${
                  s.highlight || 'bg-white/75 backdrop-blur-md border-white/90 shadow-soft hover:shadow-elevation'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-charcoal-400">STAGE {s.num}</span>
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-ivory-warm text-charcoal-700 border border-border font-semibold">
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-charcoal-900 tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-charcoal-600 leading-relaxed font-sans">
                    {s.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-border/70 text-[11px] font-mono text-charcoal-400">
                  Verified on NEAR Testnet
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
};
