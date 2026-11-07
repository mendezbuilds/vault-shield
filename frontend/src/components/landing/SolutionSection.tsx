import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Shield, KeyRound, Cpu } from 'lucide-react';

export const SolutionSection: React.FC = () => {
  return (
    <section id="solution" className="py-28 border-t border-border bg-ivory relative overflow-hidden">
      {/* Ambient specular caustic gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-near-green/5 via-white/80 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-near-dark">
            Architectural Resolution
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            Cryptographic Separation of Intent &amp; Execution.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            AI Agent Vault places an incorruptible, smart-contract-enforced security perimeter
            between autonomous agent tools and treasury funds. The agent communicates intent; the contract enforces policy.
          </p>
        </motion.div>

        {/* Two-Column Asymmetric Comparative Cards with Slide Entrance */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Phase 1: Intent (Slide In Left) */}
          <motion.div
            initial={{ opacity: 0, x: -36 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="p-8 sm:p-12 rounded-3xl bg-white/75 backdrop-blur-xl border border-white/90 shadow-soft hover:shadow-elevation transition-all flex flex-col justify-between"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ivory-warm border border-border text-xs font-mono text-charcoal-700 font-bold mb-6">
                <span>PHASE A &bull; INTENT SUBMISSION</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight">
                Agents Submit Structured Intents, Never Raw Transfers
              </h3>
              <p className="mt-4 text-sm sm:text-base text-charcoal-600 leading-relaxed font-sans">
                The agent signs with a restricted Function-Call Access Key configured strictly to invoke{' '}
                <code className="text-xs font-mono bg-ivory-warm text-charcoal-900 px-2 py-0.5 rounded border border-border">
                  request_payment(destination, amount, reason, ttl)
                </code>.
              </p>

              <div className="mt-8 space-y-4 text-xs sm:text-sm text-charcoal-700">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>Agent key has zero permission to deploy bytecode or modify access keys</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>Requests mandate explicit TTL validity windows (5 minutes to 24 hours)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>Strict queue limits: Maximum 2 concurrent pending requests per agent</span>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-border/70 text-xs font-mono text-charcoal-500">
              Authentication: predecessor_account_id == authorized_agent
            </div>
          </motion.div>

          {/* Phase 2: On-Chain Invariant Enforcement (Slide In Right) */}
          <motion.div
            initial={{ opacity: 0, x: 36 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="p-8 sm:p-12 rounded-3xl bg-white/85 backdrop-blur-xl border border-near-green/35 shadow-elevation flex flex-col justify-between relative overflow-hidden"
          >
            {/* Ambient green top corner glow */}
            <div className="absolute top-0 right-0 w-44 h-44 bg-near-light/70 rounded-bl-full pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-near-light text-near-dark border border-near-green/30 text-xs font-mono font-bold mb-6">
                <span>PHASE B &bull; ON-CHAIN VALIDATION</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-charcoal-900 tracking-tight">
                The Vault Smart Contract Guarantees Invariants
              </h3>
              <p className="mt-4 text-sm sm:text-base text-charcoal-600 leading-relaxed font-sans">
                The contract independently verifies available liquid balance, daily rolling allowance, per-tx caps, and destination status before funds can move.
              </p>

              <div className="mt-8 space-y-4 text-xs sm:text-sm text-charcoal-700">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>Eligible micro-payments (&le; 0.2 NEAR &amp; allowlisted) execute automatically</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>New destinations &amp; above-threshold payments hold reservations in Owner Approval Queue</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-near-dark shrink-0 mt-0.5" />
                  <span>Forward-looking storage byte costs (~0.1 N buffer) are permanently protected</span>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-border/70 text-xs font-mono text-near-dark font-semibold relative z-10">
              Settlement: Asynchronous NEAR cross-contract promise with automated refund recovery
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
