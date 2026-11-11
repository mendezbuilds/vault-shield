import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { VAULT_CONTRACT_ID, EXPECTED_OWNER_ID } from '../../types/contract';

export const ArchitectureSection: React.FC = () => {
  const steps = [
    {
      num: '01',
      phase: 'GOVERNANCE',
      title: 'Vault Owner',
      desc: 'Owner governance authority. Sets spending policies, approves exceptional payment intents, and initiates emergency pauses.',
      account: EXPECTED_OWNER_ID,
      highlight: false,
    },
    {
      num: '02',
      phase: 'PROVISIONING',
      title: 'Restricted Key',
      desc: 'Function-Call Access Key restricted exclusively to the target vault address and request_payment() method.',
      account: 'Method: request_payment',
      highlight: false,
    },
    {
      num: '03',
      phase: 'AUTONOMOUS',
      title: 'AI Agent Delegate',
      desc: 'Dispatches spending transactions using a restricted key to communicate payment intent, reason memo, and TTL window.',
      account: 'Delegated Agent ID',
      highlight: false,
    },
    {
      num: '04',
      phase: 'ENFORCEMENT',
      title: 'Vault Contract',
      desc: 'Evaluates limits, reserves liquidity, issues NEAR transfer promises, and records tamper-evident audit records.',
      account: VAULT_CONTRACT_ID,
      highlight: true,
    },
  ];

  return (
    <section id="architecture" className="py-28 border-t border-border bg-ivory-warm/40 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-charcoal-500">
            System Topology
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            Key Delegation &amp; Execution Topology
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            How permissions cascade from human governance keys through restricted cryptographic credentials to smart-contract payment promises and settlement.
          </p>
        </motion.div>

        {/* Visual Pipeline Container with Liquid Glass Sheen */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 p-8 sm:p-12 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-elevation relative overflow-hidden"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
            {steps.map((s, idx) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                  s.highlight
                    ? 'bg-near-light/60 border border-near-green/40 shadow-soft'
                    : 'bg-white/70 backdrop-blur-md border border-white/90 shadow-soft'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono font-bold text-charcoal-500 uppercase">
                    STEP {s.num} &bull; {s.phase}
                  </span>
                  <h4 className="mt-3 text-lg font-extrabold text-charcoal-900">{s.title}</h4>
                  <p className="mt-2 text-xs text-charcoal-600 leading-relaxed font-sans">
                    {s.desc}
                  </p>
                </div>
                <div className={`mt-6 pt-4 border-t text-[11px] font-mono ${
                  s.highlight ? 'border-near-green/30 text-near-dark font-bold' : 'border-border/70 text-charcoal-500'
                }`}>
                  {s.account}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Honest Operational Disclosure Banner */}
          <div className="mt-8 p-6 rounded-2xl bg-white/70 backdrop-blur-md border border-white/90 flex items-start gap-4 shadow-soft">
            <AlertCircle className="w-5 h-5 text-charcoal-700 shrink-0 mt-0.5" />
            <div className="text-xs text-charcoal-600 leading-relaxed font-sans">
              <span className="font-bold text-charcoal-900">Honest Operator Security Disclosure: </span>
              In Phase 2 Testnet deployment, the parent operator account holds FullAccess keys for deployment validation and testnet maintenance. The contract logic is strictly non-custodial and programmatic, but we do not falsely claim absolute immutability while deployment keys exist. For production mainnet hardening, this authority transitions to a multi-sig or DAO governance threshold.
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
