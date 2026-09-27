import React, { useState, useEffect, useCallback } from 'react';
import { MobileLayout } from './MobileLayout';
import { MobileHome } from './MobileHome';
import { MobileNewJob } from './MobileNewJob';
import { MobileParties } from './MobileParties';
import { MobileHistory } from './MobileHistory';
import { MobileAccount } from './MobileAccount';
import { Party } from '../types';

interface MobileAppProps {
  onLogout: () => void;
  onSwitchToDesktop: () => void;
}

export const MobileApp: React.FC<MobileAppProps> = ({ onLogout, onSwitchToDesktop }) => {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [historyStack, setHistoryStack] = useState<string[]>(['home']);
  const [selectedPartyForJob, setSelectedPartyForJob] = useState<Party | null>(null);

  const navigateToTab = (tab: string, state?: any) => {
    if (tab === 'new-job' && state?.selectedParty) {
      setSelectedPartyForJob(state.selectedParty);
    } else if (tab === 'new-job' && !state?.selectedParty) {
      // keep or reset as needed
    }

    if (tab !== currentTab) {
      setHistoryStack((prev) => [...prev, tab]);
      window.history.pushState({ tab }, '', '#' + tab);
      setCurrentTab(tab);
    }
  };

  const handleGoBack = useCallback(() => {
    if (historyStack.length > 1) {
      const updated = [...historyStack];
      updated.pop();
      const prevTab = updated[updated.length - 1] || 'home';
      setHistoryStack(updated);
      setCurrentTab(prevTab);
    } else if (currentTab !== 'home') {
      setHistoryStack(['home']);
      setCurrentTab('home');
    }
  }, [historyStack, currentTab]);

  // Handle hardware Android back button & browser back
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.tab) {
        setCurrentTab(e.state.tab);
      } else {
        handleGoBack();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleGoBack]);

  const getTitle = () => {
    switch (currentTab) {
      case 'home': return 'Envelope Manager';
      case 'new-job': return 'New Dispatch';
      case 'parties': return 'Party Directory';
      case 'history': return 'Dispatch History';
      case 'account': return 'My Account';
      default: return 'Envelope Manager';
    }
  };

  return (
    <MobileLayout
      currentTab={currentTab}
      onTabChange={navigateToTab}
      canGoBack={currentTab !== 'home'}
      onGoBack={handleGoBack}
      title={getTitle()}
    >
      {currentTab === 'home' && <MobileHome onNavigate={navigateToTab} />}
      {currentTab === 'new-job' && (
        <MobileNewJob 
          initialParty={selectedPartyForJob} 
          onNavigate={navigateToTab} 
        />
      )}
      {currentTab === 'parties' && <MobileParties onNavigate={navigateToTab} />}
      {currentTab === 'history' && <MobileHistory onNavigate={navigateToTab} />}
      {currentTab === 'account' && (
        <MobileAccount 
          onLogout={onLogout} 
          onSwitchToDesktop={onSwitchToDesktop} 
        />
      )}
    </MobileLayout>
  );
};
