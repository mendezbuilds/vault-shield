import React, { useState, useEffect } from 'react';
import { WalletProvider } from './context/WalletContext';
import { useVaultData } from './hooks/useVaultData';
import { LandingNavbar } from './components/landing/LandingNavbar';
import { HeroSection } from './components/landing/HeroSection';
import { ProblemSection } from './components/landing/ProblemSection';
import { SolutionSection } from './components/landing/SolutionSection';
import { HowItWorksSection } from './components/landing/HowItWorksSection';
import { SecurityFeaturesSection } from './components/landing/SecurityFeaturesSection';
import { ArchitectureSection } from './components/landing/ArchitectureSection';
import { TrustSection } from './components/landing/TrustSection';
import { Footer } from './components/landing/Footer';
import { AppLayout } from './components/app/AppLayout';

export const AppContent: React.FC = () => {
  const [view, setView] = useState<'landing' | 'app'>(() =>
    typeof window !== 'undefined' && window.location.hash.startsWith('#app') ? 'app' : 'landing'
  );
  const { data: vaultData, loading, error, refresh } = useVaultData(15000);

  // Sync hash routing e.g. #app
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.startsWith('#app')) {
        setView('app');
      } else {
        setView('landing');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLaunchApp = () => {
    window.location.hash = '#app';
    setView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExitToLanding = () => {
    window.location.hash = '';
    setView('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSecurity = () => {
    const el = document.getElementById('security');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  if (view === 'app') {
    return (
      <AppLayout
        overview={vaultData}
        loading={loading}
        error={error}
        onRefresh={refresh}
        onExitToLanding={handleExitToLanding}
      />
    );
  }

  return (
    <div className="min-h-screen bg-ivory text-charcoal-900 selection:bg-near-green/15 selection:text-near-dark font-sans">
      <LandingNavbar onLaunchApp={handleLaunchApp} />
      <HeroSection
        onLaunchApp={handleLaunchApp}
        onExploreSecurity={scrollToSecurity}
        vaultData={vaultData}
      />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <SecurityFeaturesSection />
      <ArchitectureSection />
      <TrustSection />
      <Footer onLaunchApp={handleLaunchApp} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
};

export default App;
