import React from 'react';
import { Shield, ExternalLink, ArrowRight } from 'lucide-react';
import { VAULT_CONTRACT_ID } from '../../types/contract';
import { getExplorerAccountUrl } from '../../utils/formatters';

interface LandingNavbarProps {
  onLaunchApp: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onLaunchApp }) => {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-ivory/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <div className="w-10 h-10 rounded-xl bg-surface-white border border-border flex items-center justify-center text-near-dark shadow-soft group-hover:border-near-green/40 transition-colors">
            <Shield className="w-5 h-5 text-near-dark" />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight text-charcoal-900 uppercase">
              NEAR AI AGENT VAULT
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-charcoal-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-near-green" />
              <span>TESTNET LIVE &bull; cc7760b</span>
            </div>
          </div>
        </div>

        {/* Editorial Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-charcoal-600">
          <button onClick={() => scrollTo('architecture')} className="hover:text-charcoal-900 transition-colors">
            Architecture
          </button>
          <button onClick={() => scrollTo('how-it-works')} className="hover:text-charcoal-900 transition-colors">
            Protocol
          </button>
          <button onClick={() => scrollTo('security')} className="hover:text-charcoal-900 transition-colors">
            Security Guarantees
          </button>
          <button onClick={() => scrollTo('proof')} className="hover:text-charcoal-900 transition-colors">
            On-Chain Evidence
          </button>
        </div>

        {/* Right Action */}
        <div className="flex items-center gap-3">
          <a
            href={getExplorerAccountUrl(VAULT_CONTRACT_ID)}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-charcoal-500 hover:text-charcoal-900 font-mono transition-colors"
          >
            <span>Contract</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onLaunchApp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-near-dark hover:bg-near-green text-white text-xs font-bold tracking-tight shadow-soft transition-all active:scale-[0.98]"
          >
            <span>Launch App</span>
            <ArrowRight className="w-3.5 h-3.5 text-white/80" />
          </button>
        </div>
      </div>
    </nav>
  );
};
