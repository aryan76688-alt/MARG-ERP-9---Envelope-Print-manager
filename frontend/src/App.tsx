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
import { Users } from './pages/Users';
import { DriverMode } from './pages/DriverMode';
import { Login } from './pages/Login';
import { Party } from './types';
import { getAuthToken } from './api/client';
import { MobileApkLayout } from './mobile/MobileApkLayout';
import { MobileHome } from './mobile/MobileHome';
import { MobilePrint } from './mobile/MobilePrint';
import { MobileParties } from './mobile/MobileParties';
import { AllPartiesMap } from './pages/AllPartiesMap';
import { StorageManager } from './pages/StorageManager';
import { EmergencyCallModal } from './components/EmergencyCallModal';
import { ReceiverAutoConnectModal } from './components/ReceiverAutoConnectModal';
import { useEmergencyReceiver } from './hooks/useEmergencyReceiver';
import { NoteCalculator } from './components/NoteCalculator';
import { DeviceControls } from './pages/DeviceControls';
import { NearestParties } from './pages/NearestParties';
import { RouteOptimizer } from './pages/RouteOptimizer';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const token = getAuthToken();
    const storedUser = localStorage.getItem('user');
    if (!token || !storedUser || storedUser === 'undefined' || storedUser === 'null') {
      return false;
    }
    try {
      const u = JSON.parse(storedUser);
      return Boolean(u && (u.username || u.role));
    } catch {
      return false;
    }
  });
  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored && JSON.parse(stored).role === 'driver') {
        return 'driver';
      }
    } catch {}
    const hash = window.location.hash.replace('#', '');
    return hash && hash !== 'login' ? hash : 'dashboard';
  });
  const [historyStack, setHistoryStack] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored && JSON.parse(stored).role === 'driver') {
        return ['driver'];
      }
    } catch {}
    return ['dashboard'];
  });
  const [selectedPartyForPrint, setSelectedPartyForPrint] = useState<Party | null>(null);
  const [reprintJobData, setReprintJobData] = useState<any | null>(null);
  const [selectedPartyForRoute, setSelectedPartyForRoute] = useState<Party | null>(null);
  const [selectedPartiesForRoute, setSelectedPartiesForRoute] = useState<Party[] | null>(null);
  const [openAddPartyModal, setOpenAddPartyModal] = useState<boolean>(false);
  const [emergencyCallerOpen, setEmergencyCallerOpen] = useState<boolean>(false);
  const { incomingCall, isReceivingCall, dismissCall } = useEmergencyReceiver();

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#login') {
        setIsAuthenticated(false);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
    let targetTab = 'dashboard';
    try {
      const stored = localStorage.getItem('user');
      if (stored && JSON.parse(stored).role === 'driver') {
        targetTab = 'driver';
      }
    } catch {}
    window.location.hash = targetTab;
    setCurrentTab(targetTab);
    setHistoryStack([targetTab]);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    window.location.hash = '#login';
    setCurrentTab('dashboard');
    setHistoryStack(['dashboard']);
  };

  const navigateToTab = (tab: string, state?: any) => {
    const resolvedTab = tab === 'routes' ? 'route-optimizer' : tab;

    if (tab === 'print' && state?.selectedParty) {
      setSelectedPartyForPrint(state.selectedParty);
      setReprintJobData(null);
    } else if (tab === 'print' && state?.reprintJob) {
      const job = state.reprintJob;
      setReprintJobData(job);
      setSelectedPartyForPrint({
        id: job.party_id,
        party_name: job.party_name || job.party_name_snap,
        party_name_gu: job.party_name_gu || job.party?.party_name_gu || null,
        party_code: job.party_code || job.party_code_snap,
        address: job.address || job.party_address_snap,
        address_gu: job.address_gu || job.party?.address_gu || null,
        address_line_2: job.address_line_2 || job.party_address_line_2_snap || null,
        address_line_2_gu: job.address_line_2_gu || job.party?.address_line_2_gu || null,
        address_line_3: job.address_line_3 || job.party_address_line_3_snap || null,
        address_line_3_gu: job.address_line_3_gu || job.party?.address_line_3_gu || null,
        city: job.city || job.party_city_snap,
        city_gu: job.city_gu || job.party?.city_gu || null,
        state: job.state || job.party_state_snap,
        state_gu: job.state_gu || job.party?.state_gu || null,
        mobile_no: job.mobile || job.party_mobile_snap,
        gst_no: job.gst_no || job.party_gst_snap,
      });
    }

    if (resolvedTab === 'route-optimizer') {
      if (state?.selectedParties && state.selectedParties.length > 0) {
        setSelectedPartiesForRoute(state.selectedParties);
        setSelectedPartyForRoute(state.selectedParties[0] || null);
      } else if (state?.selectedParty) {
        setSelectedPartyForRoute(state.selectedParty);
        setSelectedPartiesForRoute([state.selectedParty]);
      }
    }

    if (resolvedTab === 'parties' && state?.openAddModal) {
      setOpenAddPartyModal(true);
    } else {
      setOpenAddPartyModal(false);
    }

    if (resolvedTab !== currentTab) {
      setHistoryStack((prev) => [...prev, resolvedTab]);
      window.history.pushState({ tab: resolvedTab }, '', '#' + resolvedTab);
      setCurrentTab(resolvedTab);
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

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const isApk = typeof window !== 'undefined' && (
    navigator.userAgent.includes('ShreejiEnvelopeApp') ||
    window.location.search.includes('mode=apk') ||
    (window as any).isAndroidApp === true ||
    (window as any).AndroidBridge !== undefined
  );

  return (
    <QueryClientProvider client={queryClient}>
      {isApk ? (
        <MobileApkLayout
          currentTab={currentTab}
          setCurrentTab={navigateToTab}
          canGoBack={currentTab !== 'dashboard'}
          onGoBack={handleGoBack}
          onLogout={handleLogout}
          onOpenEmergencyCall={() => setEmergencyCallerOpen(true)}
        >
          {currentTab === 'dashboard' && <MobileHome onNavigate={navigateToTab} />}
          {currentTab === 'print' && (
            <MobilePrint
              initialParty={selectedPartyForPrint}
              reprintJob={reprintJobData}
              onNavigate={navigateToTab}
              onJobCreated={() => {
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                setReprintJobData(null);
              }}
            />
          )}
          {currentTab === 'parties' && (
            <MobileParties
              onNavigate={navigateToTab}
              initialAddModal={openAddPartyModal}
            />
          )}
          {currentTab === 'nearby' && (
            <NearestParties
              onNavigate={navigateToTab}
              onPrintParty={(party) => navigateToTab('print', { selectedParty: party })}
            />
          )}
          {currentTab === 'route-optimizer' && (
            <RouteOptimizer
              onNavigate={navigateToTab}
              onOpenPrintModal={(party) => navigateToTab('print', { selectedParty: party })}
              initialParty={selectedPartyForRoute}
              initialParties={selectedPartiesForRoute}
            />
          )}
          {currentTab === 'map' && <AllPartiesMap onNavigate={navigateToTab} />}
          {currentTab === 'driver' && <DriverMode />}
          {currentTab === 'dispatch' && <DispatchSummary />}
          {currentTab === 'history' && <PrintHistory onNavigate={navigateToTab} />}
          {currentTab === 'import' && <ImportExcel onNavigate={navigateToTab} />}
          {currentTab === 'settings' && <Settings />}
          {currentTab === 'storage' && <StorageManager onNavigate={navigateToTab} />}
          {currentTab === 'devices' && <DeviceControls onNavigate={navigateToTab} />}
          {currentTab === 'calculator' && <div className="p-4"><NoteCalculator /></div>}
          {currentTab === 'users' && <Users />}
        </MobileApkLayout>
      ) : (
        <MainLayout 
          currentTab={currentTab} 
          setCurrentTab={navigateToTab}
          canGoBack={currentTab !== 'dashboard'}
          onGoBack={handleGoBack}
          onLogout={handleLogout}
          onOpenEmergencyCall={() => setEmergencyCallerOpen(true)}
        >
          {currentTab === 'dashboard' && <Dashboard onNavigate={navigateToTab} />}
          {currentTab === 'parties' && (
            <Parties onNavigate={navigateToTab} initialAddModal={openAddPartyModal} />
          )}
          {currentTab === 'nearby' && (
            <NearestParties
              onNavigate={navigateToTab}
              onPrintParty={(party) => navigateToTab('print', { selectedParty: party })}
            />
          )}
          {currentTab === 'route-optimizer' && (
            <RouteOptimizer
              onNavigate={navigateToTab}
              onOpenPrintModal={(party) => navigateToTab('print', { selectedParty: party })}
              initialParty={selectedPartyForRoute}
              initialParties={selectedPartiesForRoute}
            />
          )}
          {currentTab === 'map' && <AllPartiesMap onNavigate={navigateToTab} />}
          {currentTab === 'import' && <ImportExcel onNavigate={navigateToTab} />}
          {currentTab === 'print' && (
            <PrintEnvelope 
              initialParty={selectedPartyForPrint} 
              reprintJob={reprintJobData}
              onNavigate={navigateToTab}
              onJobCreated={() => {
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                setReprintJobData(null);
              }}
            />
          )}
          {currentTab === 'history' && <PrintHistory onNavigate={navigateToTab} />}
          {currentTab === 'driver' && <DriverMode />}
          {currentTab === 'dispatch' && <DispatchSummary />}
          {currentTab === 'calculator' && <div className="p-4 sm:p-6 overflow-y-auto"><NoteCalculator /></div>}
          {currentTab === 'storage' && <StorageManager onNavigate={navigateToTab} />}
          {currentTab === 'devices' && <DeviceControls onNavigate={navigateToTab} />}
          {currentTab === 'users' && <Users />}
          {currentTab === 'settings' && <Settings />}
        </MainLayout>
      )}

      {/* Receiver Direct Emergency Auto-Connect Modal (Zero Button Accept Barrier) */}
      {isReceivingCall && incomingCall && (
        <ReceiverAutoConnectModal call={incomingCall} onClose={dismissCall} />
      )}

      {/* Caller Emergency Voice/Video Modal (Admin & Super Admin Initiated) */}
      {emergencyCallerOpen && (
        <EmergencyCallModal
          isOpen={emergencyCallerOpen}
          onClose={() => setEmergencyCallerOpen(false)}
          isCaller={true}
        />
      )}
    </QueryClientProvider>
  );
};

export default App;
