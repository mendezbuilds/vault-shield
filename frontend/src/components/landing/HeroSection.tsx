import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, ExternalLink, Sparkles } from 'lucide-react';
import { LivingNodeNetwork } from '../network/LivingNodeNetwork';
import { AiOrb } from '../common/AiOrb';
import { VaultAccountOverview, VAULT_CONTRACT_ID } from '../../types/contract';
import { formatNear, getExplorerAccountUrl } from '../../utils/formatters';

interface HeroSectionProps {
  onLaunchApp: () => void;
  onExploreSecurity: () => void;
  vaultData?: VaultAccountOverview | null;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onLaunchApp,
  onExploreSecurity,
  vaultData,
}) => {
  const liquidNear = vaultData ? formatNear(vaultData.availableLiquidBalance, 3) : '0.149';
  const totalNear = vaultData ? formatNear(vaultData.totalAccountBalance, 3) : '5.196';
  const dailyCap = vaultData ? formatNear(vaultData.policy.daily_cap, 1) : '2.0';

  return (
    <section id="hero" className="relative pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden bg-ivory">
      {/* Background subtle architectural lines & ambient radial gradient */}
      <div className="absolute inset-0 bg-subtle-lines opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-near-green/5 via-near-light/40 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Top Status Tag with Glass Sheen */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/90 shadow-soft mb-8 select-none"
          >
            <span className="w-2 h-2 rounded-full bg-near-green animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-charcoal-700 font-sans">
              NEAR Public Testnet &bull; Smart Contract Verified
            </span>
            <span className="text-[11px] font-mono text-near-dark bg-near-light px-2.5 py-0.5 rounded-full font-bold">
              cc7760b
            </span>
          </motion.div>

          {/* Oversized Confident Editorial Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tightest text-charcoal-900 leading-[1.04]"
          >
            Give AI Agents the Power to Act.{' '}
            <span className="italic font-serif font-normal text-charcoal-700 block sm:inline">
              Never the Power to Spend Freely.
            </span>
          </motion.h1>

          {/* Subtitle with controlled line length */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 text-lg sm:text-xl text-charcoal-600 max-w-2xl mx-auto leading-relaxed font-sans font-normal"
          >
            A programmable on-chain security layer separating autonomous software execution from capital custody.
            Deterministic spending caps, multi-stage solvency, and human-in-the-loop exception gates.
          </motion.p>

          {/* Primary Action Buttons with Liquid Glass & Elevated Accent */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={onLaunchApp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-near-dark hover:bg-near-green text-white text-sm font-bold tracking-tight shadow-elevation transition-all active:scale-[0.98] group"
            >
              <span>Launch Application</span>
              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={onExploreSecurity}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-white/80 hover:bg-white text-charcoal-800 border border-border shadow-soft backdrop-blur-md text-sm font-semibold transition-all"
            >
              <ShieldCheck className="w-4 h-4 text-near-dark" />
              <span>Explore Security Architecture</span>
            </button>
          </motion.div>

          {/* Floating Micro telemetry proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-charcoal-500"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-near-dark font-bold">&check;</span> Storage Reserve Ring-Fenced
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-near-dark font-bold">&check;</span> Restricted Function-Call Keys
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-near-dark font-bold">&check;</span> 50-Slot Circular Audit Buffer
            </span>
          </motion.div>
        </div>

        {/* SIGNATURE 3D AI ORB & LIVING NODE NETWORK SHOWCASE */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 max-w-5xl mx-auto relative"
        >
          {/* Dimensional Floating AI Orb Background Accent */}
          <div className="hidden lg:block absolute -top-24 -right-16 z-20 pointer-events-auto">
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
            >
              <AiOrb size={220} interactive={true} />
            </motion.div>
          </div>

          {/* Main Visual Window with Liquid Glass Sheen */}
          <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-elevation p-6 sm:p-8 relative overflow-hidden">
            {/* Top glass reflection line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />

            {/* Window bar */}
            <div className="flex flex-wrap items-center justify-between pb-6 border-b border-border/70 gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="w-3 h-3 rounded-full bg-near-green/70" />
                </div>
                <div className="text-xs font-mono font-medium text-charcoal-500">
                  Living Protocol Topology &bull; <span className="text-charcoal-900 font-bold">{VAULT_CONTRACT_ID}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-near-light text-near-dark font-semibold">
                  <span className="w-2 h-2 rounded-full bg-near-green animate-pulse" />
                  CONSENSUS SYNCHRONIZED
                </span>
                <a
                  href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-charcoal-500 hover:text-charcoal-900 inline-flex items-center gap-1 transition-colors"
                >
                  <span>Explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Dimensional Canvas Node Network */}
            <div className="mt-4">
              <LivingNodeNetwork
                variant="hero"
                vaultData={vaultData}
                height={380}
              />
            </div>

            {/* Bottom Real-time Telemetry Ribbons in Liquid Glass Cards */}
            <div className="mt-6 pt-6 border-t border-border/70 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
              <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/90 shadow-soft hover:bg-white/90 transition-all">
                <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  Available Liquid
                </span>
                <div className="mt-1 text-2xl font-extrabold font-mono text-charcoal-900">
                  {liquidNear} <span className="text-xs font-sans text-near-dark font-bold">NEAR</span>
                </div>
                <span className="text-[10px] text-charcoal-500">Unencumbered Solvency</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/90 shadow-soft hover:bg-white/90 transition-all">
                <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  Total Vault Balance
                </span>
                <div className="mt-1 text-2xl font-extrabold font-mono text-charcoal-900">
                  {totalNear} <span className="text-xs font-sans text-charcoal-500">NEAR</span>
                </div>
                <span className="text-[10px] text-charcoal-500">Includes Storage Reserve</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/90 shadow-soft hover:bg-white/90 transition-all">
                <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  24-Hour Daily Cap
                </span>
                <div className="mt-1 text-2xl font-extrabold font-mono text-charcoal-900">
                  {dailyCap} <span className="text-xs font-sans text-charcoal-500">NEAR</span>
                </div>
                <span className="text-[10px] text-charcoal-500">Rolling Bucket Limit</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/70 backdrop-blur-md border border-white/90 shadow-soft hover:bg-white/90 transition-all">
                <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500 block">
                  Auto-Approval Ceiling
                </span>
                <div className="mt-1 text-2xl font-extrabold font-mono text-near-dark">
                  0.200 <span className="text-xs font-sans text-charcoal-500">NEAR</span>
                </div>
                <span className="text-[10px] text-charcoal-500">1-Block Direct Dispatch</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
