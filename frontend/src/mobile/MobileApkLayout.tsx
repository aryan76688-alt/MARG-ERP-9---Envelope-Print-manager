import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Printer, 
  Truck, 
  Menu, 
  X, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  ArrowLeft, 
  ArrowUp,
  Package, 
  History, 
  FileSpreadsheet, 
  Settings as SettingsIcon, 
  LogOut,
  Calendar,
  Layers,
  Sparkles,
  MapPin,
  CheckCircle2,
  ChevronRight,
  PhoneCall,
  HardDrive,
  Smartphone,
  Compass,
  Route,
  Database,
  Download
} from 'lucide-react';
import { useNetworkSync } from '../offline/syncManager';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';

interface MobileApkLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string, state?: any) => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  onLogout?: () => void;
  onOpenEmergencyCall?: () => void;
  children: React.ReactNode;
}

export const MobileApkLayout: React.FC<MobileApkLayoutProps> = ({
  currentTab,
  setCurrentTab,
  canGoBack = false,
  onGoBack,
  onLogout,
  onOpenEmergencyCall,
  children
}) => {
  const [moreDrawerOpen, setMoreDrawerOpen] = useState<boolean>(false);
  const [dbModalOpen, setDbModalOpen] = useState<boolean>(false);
  const [currentDateEn, setCurrentDateEn] = useState<string>('');
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkSync();

  // Real-time English day & date formatter
  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short' };
      setCurrentDateEn(now.toLocaleDateString('en-US', options));
    };
    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => clearInterval(interval);
  }, []);

  // Bi-Directional Scroll Monitor for Quick Scroll Button
  useEffect(() => {
    const scrollEl = mainScrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      if (scrollEl.scrollTop > 160) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [currentTab]);

  // Clean Scroll to Top
  const handleScrollToTop = () => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === 'more') {
      setMoreDrawerOpen(true);
    } else {
      setMoreDrawerOpen(false);
      setCurrentTab(tabId);
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  };

  const navTabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'print', label: 'Print', icon: Printer, isHighlight: true },
    { id: 'driver', label: 'Delivery', icon: Truck },
    { id: 'more', label: 'More', icon: Menu }
  ];

  let username = 'Dispatch Staff';
  let userAvatar: string | null = null;
  let userRole = 'staff';
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    username = user.full_name || user.username || 'Dispatch Staff';
    userAvatar = user.avatar_url || null;
    userRole = user.role || 'staff';
  } catch {}

  const canInitiateCall = userRole === 'admin' || userRole === 'super_admin';

  const secondaryNav = [
    { 
      id: 'storage', 
      label: userRole === 'super_admin' ? 'Mobile Storage' : 'My Mobile Storage', 
      subLabel: userRole === 'super_admin' ? 'User-Wise Host Storage & Folders' : 'Personal Documents & Files', 
      icon: HardDrive 
    },
    ...(userRole === 'super_admin' ? [
      { id: 'devices', label: 'Device Controls', subLabel: 'Storage, Camera, Mic Hardware', icon: Smartphone }
    ] : []),
    ...(['super_admin', 'owner', 'admin'].includes(userRole) ? [
      { id: 'users', label: 'User Management', subLabel: 'Access, Roles & App Users', icon: Users }
    ] : []),
    { id: 'nearby', label: 'Nearest Parties', subLabel: 'GPS Distance & Chemist Radar', icon: Compass },
    { id: 'fleet', label: 'Fleet & Tracking', subLabel: 'Live GPS, Speed & Telemetry', icon: Truck },
    { id: 'route-optimizer', label: 'Route Optimizer', subLabel: 'TSP Shortest Delivery Path', icon: Route },
    { id: 'map', label: 'All Parties Map', subLabel: 'GPS Geofences & Chemist Radar', icon: MapPin },
    { id: 'dispatch', label: 'Dispatch Summary', subLabel: 'Courier Manifests & Sheets', icon: Package },
    { id: 'history', label: 'Print History', subLabel: 'Job Logs & Reprints', icon: History },
    { id: 'import', label: 'Excel Import', subLabel: 'Bulk MARG Ledger Ingestion', icon: FileSpreadsheet },
    { id: 'database', label: 'Database Backup (ડેટાબેઝ)', subLabel: 'Export & Import Full SQLite DB', icon: Database },
    { id: 'settings', label: 'Settings', subLabel: 'Server Config & Preferences', icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* 1. UPPER CAMERA NOTCH & STATUS BAR SAFE TACTICAL DARK HEADER */}
      <header className="relative z-30 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-sm flex-shrink-0 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 px-3.5 transition-colors">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          {/* Left: Navigation back or Branded Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            {canGoBack && currentTab !== 'dashboard' ? (
              <button
                onClick={onGoBack}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800 active:bg-blue-600 text-slate-200 active:text-white border border-slate-700 shadow-xs transition-colors cursor-pointer active:scale-98"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs border border-blue-500 flex-shrink-0">
                <Printer className="w-5 h-5 text-white" />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-bold text-sm text-white font-display">
                  MARG ENVELOPE
                </span>
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                  v2.4
                </span>
              </div>
              <span className="text-xs font-medium text-slate-400 truncate leading-tight flex items-center gap-1.5">
                <span className="text-amber-400 font-medium">Dispatch Hub</span>
                {currentDateEn && <span className="text-slate-400">• {currentDateEn}</span>}
              </span>
            </div>
          </div>

          {/* Right: Actions, SOS & Real-time Telemetry Sync Trigger */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Database Quick Button */}
            <button
              onClick={() => setDbModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer shadow-xs transition-colors active:scale-98"
              title="Full Database Backup, Export & Import"
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>DB</span>
            </button>

            {canInitiateCall && onOpenEmergencyCall && (
              <button
                onClick={onOpenEmergencyCall}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors active:scale-98"
                title="Emergency Direct Video/Voice Call"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">SOS</span>
              </button>
            )}

            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                isSyncing
                  ? 'bg-blue-950 text-blue-300 border-blue-800'
                  : !isOnline
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : pendingCount > 0
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-800'
              }`}
              title="Click to sync database"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin text-blue-400" />
                  <span>Syncing</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Offline</span>
                  {pendingCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sync ({pendingCount})</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300">Live</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. GOOGLE STITCH TACTICAL SCROLLABLE MAIN CONTENT AREA */}
      <main
        ref={mainScrollRef}
        id="mobile-main-scroll"
        className="flex-1 apk-scroll-container bg-slate-950 text-slate-100 relative"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overflowY: 'auto',
          overscrollBehaviorY: 'auto'
        }}
      >
        {children}

        {/* 1-Tap Quick Scroll to Top Action Button */}
        {showScrollTop && (
          <button
            onClick={handleScrollToTop}
            className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md active:scale-98 transition-colors border border-blue-400 cursor-pointer"
            aria-label="Scroll to top"
            title="Scroll back to top"
          >
            <ArrowUp className="w-4 h-4" />
            <span>Top</span>
          </button>
        )}
      </main>

      {/* 3. WAYFIND BOTTOM NAVIGATION DOCK */}
      <nav className="relative z-30 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 flex-shrink-0 bg-slate-900">
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 shadow-md max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            const isHighlight = tab.isHighlight;

            if (isHighlight) {
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex flex-col items-center justify-center -mt-5 group cursor-pointer"
                  aria-label="Print Envelope"
                >
                  <div className={`w-13 h-13 rounded-xl flex flex-col items-center justify-center shadow-md transition-colors active:scale-95 ${
                    isActive 
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400'
                  }`}>
                    <Icon className="w-5 h-5 text-white" />
                    <span className="text-xs font-semibold text-white mt-0.5">
                      Print
                    </span>
                  </div>
                  <span className="text-xs font-medium text-blue-300 mt-0.5">
                    1-Tap
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex flex-col items-center justify-center py-1 px-1 rounded-lg transition-colors active:scale-98 cursor-pointer ${
                  isActive
                    ? 'text-blue-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-950 text-blue-300 border border-blue-800' : ''
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs leading-tight mt-1 font-medium">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 4. GOOGLE STITCH SYSTEM TOOLS SLIDE-UP DRAWER */}
      {moreDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="fixed inset-0 bg-black/75 transition-opacity" 
            onClick={() => setMoreDrawerOpen(false)} 
          />
          <div className="relative bg-slate-900 border-t border-slate-700/80 rounded-t-3xl p-5 shadow-2xl z-10 max-h-[85vh] apk-scroll-container max-w-lg mx-auto w-full text-slate-100">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-700/70 flex items-center justify-center text-blue-400">
                  <Menu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base font-display">System Tools & Reports</h3>
                  <p className="text-xs text-slate-400">Executive logistics and batch operations</p>
                </div>
              </div>
              <button 
                onClick={() => setMoreDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grid of secondary items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-5">
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                const isItemActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMoreDrawerOpen(false);
                      if (item.id === 'database') {
                        setDbModalOpen(true);
                      } else {
                        setCurrentTab(item.id);
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors active:scale-98 cursor-pointer ${
                      isItemActive
                        ? 'bg-blue-950 border-blue-700 text-blue-300 shadow-xs'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-semibold text-xs text-white truncate">{item.label}</span>
                      <span className="text-xs text-slate-400 truncate">{item.subLabel}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Direct APK Download Link */}
            <div className="mb-4">
              <a
                href="/downloads/EnvelopeManager.apk"
                download="EnvelopeManager.apk"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs border border-emerald-500 active:scale-98 transition-colors text-center"
              >
                <Download className="w-4 h-4 text-emerald-100" />
                <span>Download Android Mobile App (.APK)</span>
              </a>
            </div>

            {/* User Profile & Sign Out Card */}
            <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-xs border border-blue-500 flex-shrink-0">
                  {userAvatar ? (
                    <img src={userAvatar} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    username[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-white truncate">{username}</span>
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Role: {userRole}
                  </span>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-medium transition-colors active:scale-98 cursor-pointer flex-shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Database Export & Import Modal */}
      <DatabaseBackupModal
        isOpen={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
      />
    </div>
  );
};