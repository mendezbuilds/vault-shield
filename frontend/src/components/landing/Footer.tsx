import React from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowRight, ExternalLink } from 'lucide-react';
import { VAULT_CONTRACT_ID } from '../../types/contract';
import { getExplorerAccountUrl } from '../../utils/formatters';

interface FooterProps {
  onLaunchApp: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onLaunchApp }) => {
  return (
    <footer className="border-t border-border bg-ivory-warm/60 pt-24 pb-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Pre-footer Statement Box with Liquid Glass & Ambient Caustic Glow */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="p-8 sm:p-16 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-elevation text-center relative overflow-hidden mb-24"
        >
          {/* Subtle top reflection */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />

          <h2 className="text-4xl sm:text-6xl font-extrabold text-charcoal-900 tracking-tightest leading-tight">
            Ready to Protect Autonomous Agent Capital?
          </h2>
          <p className="mt-5 text-base sm:text-lg text-charcoal-600 max-w-xl mx-auto font-sans leading-relaxed">
            Experience smart-contract-enforced spending limits, automated settlement, and human-in-the-loop approvals on NEAR Testnet today.
          </p>
          <div className="mt-10 flex justify-center">
            <button
              onClick={onLaunchApp}
              className="inline-flex items-center gap-2.5 px-9 py-4 rounded-xl bg-near-dark hover:bg-near-green text-white text-sm font-bold tracking-tight shadow-elevation transition-all active:scale-[0.98] group"
            >
              <span>Enter Vault Console</span>
              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </motion.div>

        {/* Footer Meta */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-border/80">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-border flex items-center justify-center text-near-dark shadow-soft">
                <Shield className="w-4 h-4 text-near-dark" />
              </div>
              <span className="font-extrabold text-sm tracking-tight text-charcoal-900 uppercase">
                NEAR AI AGENT VAULT
              </span>
            </div>
            <p className="mt-4 text-xs text-charcoal-600 max-w-sm leading-relaxed font-sans">
              Non-custodial programmable spending security infrastructure on NEAR Protocol. Built for autonomous AI agents, enterprise treasuries, and automated Web3 workflows.
            </p>
            <div className="mt-3 text-[11px] font-mono text-charcoal-400">
              Target Contract: <span className="text-charcoal-700 font-semibold">{VAULT_CONTRACT_ID}</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-900 uppercase tracking-wider mb-3">
              NEAR Testnet Ecosystem
            </h4>
            <ul className="space-y-2.5 text-xs text-charcoal-600 font-sans">
              <li>
                <a
                  href="https://testnet.near.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-charcoal-900 transition-colors inline-flex items-center gap-1.5"
                >
                  NEAR Protocol Testnet
                  <ExternalLink className="w-3 h-3 text-near-dark" />
                </a>
              </li>
              <li>
                <a
                  href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-charcoal-900 transition-colors inline-flex items-center gap-1.5"
                >
                  NearBlocks Contract Explorer
                  <ExternalLink className="w-3 h-3 text-near-dark" />
                </a>
              </li>
              <li>
                <a
                  href="https://testnet.mynearwallet.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-charcoal-900 transition-colors inline-flex items-center gap-1.5"
                >
                  MyNearWallet Testnet
                  <ExternalLink className="w-3 h-3 text-near-dark" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-charcoal-900 uppercase tracking-wider mb-3">
              Sprint Verification
            </h4>
            <ul className="space-y-2 text-xs text-charcoal-600 font-sans">
              <li>Rust Contract: Frozen cc7760b</li>
              <li>Phase 2 Testnet Deployment</li>
              <li>Liquid 3D AI Orbs &amp; Glass Depth</li>
              <li>Living Node Network 60FPS</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-charcoal-500 font-mono gap-2">
          <div>&copy; 2026 NEAR AI Agent Vault &bull; Non-Custodial Security Infrastructure</div>
          <div>NEAR Public Testnet &bull; Shard 0</div>
        </div>
      </div>
    </footer>
  );
};
