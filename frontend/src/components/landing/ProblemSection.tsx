import React from 'react';
import { motion } from 'framer-motion';

export const ProblemSection: React.FC = () => {
  const risks = [
    {
      num: '01',
      title: 'Runaway Spending Loops',
      desc: 'An LLM agent encountering a recursive tool invocation or execution error can initiate repetitive high-frequency transfers, draining accounts within minutes without deterministic hard caps.',
    },
    {
      num: '02',
      title: 'Unrestricted FullAccess Keys',
      desc: 'Handing an autonomous software agent a traditional Web3 signing key grants unlimited authority to delete keys, transfer smart contract bytecode, and manipulate treasury balances.',
    },
    {
      num: '03',
      title: 'Untrusted Destination Drain',
      desc: 'Prompt injection or tool output manipulation can redirect payments to malicious external addresses without explicit human-in-the-loop allowlist verification.',
    },
    {
      num: '04',
      title: 'Lack of Staged Approvals',
      desc: 'Without an asynchronous pending reservation queue, exceptional high-value payments either fail outright or execute without owner review and manual sign-off.',
    },
    {
      num: '05',
      title: 'Absence of Emergency Pause',
      desc: 'When anomalous behavior is detected across agent swarms, owners lack an instantaneous on-chain kill-switch to freeze capital outflows without revoking all keys.',
    },
    {
      num: '06',
      title: 'Storage Rent Insolvency',
      desc: 'Unchecked withdrawals on NEAR can exhaust the native balance required to collateralize on-chain byte storage, causing the contract to panic on subsequent state writes.',
    },
  ];

  return (
    <section id="problem" className="py-28 border-t border-border bg-ivory-warm/60 relative overflow-hidden">
      {/* Subtle ambient light gradient */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[400px] bg-gradient-to-b from-white/60 to-transparent rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-charcoal-500">
            The Autonomous Agent Dilemma
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            Autonomous Software Cannot Hold Unfettered Signing Keys.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            Giving autonomous agents direct wallet custody creates existential operational risks.
            Enterprise agent architectures require cryptographic separation between what an agent can request and what the blockchain is authorized to execute.
          </p>
        </motion.div>

        {/* Liquid Glass 6-Grid with Asymmetric Details */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {risks.map((r, i) => (
            <motion.div
              key={r.num}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-8 rounded-3xl bg-white/75 backdrop-blur-md border border-white/90 hover:border-near-green/40 shadow-soft hover:shadow-elevation transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono font-bold text-charcoal-400">
                    RISK REF {r.num}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-near-green/40 group-hover:bg-near-green transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-charcoal-900 tracking-tight">
                  {r.title}
                </h3>
                <p className="mt-3 text-sm text-charcoal-600 leading-relaxed font-sans">
                  {r.desc}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-border/70 text-[11px] font-mono text-charcoal-400">
                Threat Mitigation: Programmatic Smart Contract Invariants
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
