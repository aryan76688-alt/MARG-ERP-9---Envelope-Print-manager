import React, { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Parties } from './pages/Parties';
import { ImportExcel } from './pages/ImportExcel';
import { PrintEnvelope } from './pages/PrintEnvelope';
import { DispatchSummary } from './pages/DispatchSummary';
import { PrintHistory } from './pages/PrintHistory';
import { Settings } from './pages/Settings';
import { Party } from './types';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [historyStack, setHistoryStack] = useState<string[]>(['dashboard']);
  const [selectedPartyForPrint, setSelectedPartyForPrint] = useState<Party | null>(null);
  const [openAddPartyModal, setOpenAddPartyModal] = useState<boolean>(false);

  const navigateToTab = (tab: string, state?: any) => {
    if (tab === 'print' && state?.selectedParty) {
      setSelectedPartyForPrint(state.selectedParty);
    } else if (tab === 'print' && state?.reprintJob) {
      const job = state.reprintJob;
      setSelectedPartyForPrint({
        id: job.party_id,
        party_name: job.party_name || job.party_name_snap,
        party_code: job.party_code || job.party_code_snap,
        address: job.address || job.party_address_snap,
        address_line_2: job.address_line_2 || job.party_address_line_2_snap || null,
        address_line_3: job.address_line_3 || job.party_address_line_3_snap || null,
        city: job.city || job.party_city_snap,
        state: job.state || job.party_state_snap,
        mobile_no: job.mobile || job.party_mobile_snap,
        gst_no: job.gst_no || job.party_gst_snap,
      });
    }

    if (tab === 'parties' && state?.openAddModal) {
      setOpenAddPartyModal(true);
    } else {
      setOpenAddPartyModal(false);
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
      updated.pop(); // pop current
      const prevTab = updated[updated.length - 1] || 'dashboard';
      setHistoryStack(updated);
      setCurrentTab(prevTab);
    } else if (currentTab !== 'dashboard') {
      setHistoryStack(['dashboard']);
      setCurrentTab('dashboard');
    }
  }, [historyStack, currentTab]);

  // Sync mobile browser / hardware back button via popstate
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

  // Global Escape key navigation for desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a modal is open, let modal close handler take precedence
        const hasOpenModal = document.querySelector('.fixed.z-50, [role="dialog"]');
        if (!hasOpenModal && currentTab !== 'dashboard') {
          e.preventDefault();
          handleGoBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTab, handleGoBack]);

  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout 
        currentTab={currentTab} 
        setCurrentTab={navigateToTab}
        canGoBack={currentTab !== 'dashboard'}
        onGoBack={handleGoBack}
      >
        {currentTab === 'dashboard' && <Dashboard onNavigate={navigateToTab} />}
        {currentTab === 'parties' && (
          <Parties onNavigate={navigateToTab} initialAddModal={openAddPartyModal} />
        )}
        {currentTab === 'import' && <ImportExcel onNavigate={navigateToTab} />}
        {currentTab === 'print' && (
          <PrintEnvelope 
            initialParty={selectedPartyForPrint} 
            onJobCreated={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}
          />
        )}
        {currentTab === 'history' && <PrintHistory onNavigate={navigateToTab} />}
        {currentTab === 'dispatch' && <DispatchSummary />}
        {currentTab === 'settings' && <Settings />}
      </MainLayout>
    </QueryClientProvider>
  );
};

export default App;
