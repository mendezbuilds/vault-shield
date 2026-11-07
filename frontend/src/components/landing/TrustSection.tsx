import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { VAULT_CONTRACT_ID } from '../../types/contract';
import { getExplorerAccountUrl } from '../../utils/formatters';

export const TrustSection: React.FC = () => {
  const evidence = [
    {
      metric: 'Phase 1 Contract Freeze',
      val: 'Commit cc7760b',
      desc: 'Formally audited, zero-warning Rust contract implementing multi-stage solvency & circular audit buffer.',
    },
    {
      metric: 'Phase 2 Testnet Deployment',
      val: 'contract.vault-parent.testnet',
      desc: 'Live on NEAR Public Testnet with real gas fees, block times, and verifiable state transitions.',
    },
    {
      metric: 'Storage Solvency Enforced',
      val: '10,000 Byte Buffer (~0.1 NEAR)',
      desc: 'Storage reserve is dynamically calculated and protected from owner withdrawals and agent payments.',
    },
    {
      metric: 'Live Audit Log Sequence',
      val: '50-Slot Circular Ring Buffer',
      desc: 'Persistent on-chain history covering auto-pauses, invalidations, registrations, and payment events.',
    },
  ];

  return (
    <section id="proof" className="py-28 border-t border-border bg-ivory relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-near-dark">
            Verifiable Evidence
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            Live on NEAR Public Testnet
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            Every screen and action in this application interacts directly with real smart contract
            state on the NEAR Public Testnet. No simulated databases, no fabricated balances.
          </p>
        </motion.div>

        {/* 4-Grid of Evidence with Motion Stagger & Liquid Glass Surfaces */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {evidence.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-8 rounded-3xl bg-white/75 backdrop-blur-md border border-white/90 hover:border-near-green/40 shadow-soft hover:shadow-elevation transition-all flex flex-col justify-between group"
            >
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  {item.metric}
                </span>
                <div className="mt-2 text-base font-extrabold font-mono text-charcoal-900 truncate">
                  {item.val}
                </div>
                <p className="mt-3 text-xs sm:text-sm text-charcoal-600 leading-relaxed font-sans">
                  {item.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border/70 text-[11px] font-mono text-near-dark font-semibold">
                &check; Verified Invariant
              </div>
            </motion.div>
          ))}
        </div>

        {/* Contract & Explorer Quick Bar with Liquid Glass Sheen */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 p-6 sm:p-8 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div>
            <span className="text-xs font-mono text-charcoal-500 uppercase">Target Contract Account ID</span>
            <div className="text-base font-bold font-mono text-charcoal-900 mt-1">{VAULT_CONTRACT_ID}</div>
          </div>

          <a
            href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-ivory-warm text-xs font-bold text-charcoal-900 border border-border shadow-soft transition-all"
          >
            <span>Open NearBlocks Testnet Explorer</span>
            <ExternalLink className="w-3.5 h-3.5 text-near-dark" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};
