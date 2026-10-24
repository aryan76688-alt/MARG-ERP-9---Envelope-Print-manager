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
  Database
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
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#0B0F19] text-slate-100 font-sans">
      {/* 1. UPPER CAMERA NOTCH & STATUS BAR SAFE TACTICAL DARK HEADER */}
      <header className="relative z-30 bg-[#0F131D]/95 backdrop-blur-md border-b border-slate-800/90 text-slate-100 shadow-lg flex-shrink-0 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 px-3.5 transition-all">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          {/* Left: Navigation back or Branded Stitch Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            {canGoBack && currentTab !== 'dashboard' ? (
              <button
                onClick={onGoBack}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/90 active:bg-blue-600 text-slate-200 active:text-white border border-slate-700 shadow-md transition-all cursor-pointer active:scale-95"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-blue-400/30 flex-shrink-0">
                <Printer className="w-5 h-5 text-white" />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-black text-sm tracking-wide text-white font-display">
                  MARG ENVELOPE
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/60 font-mono">
                  v2.4
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400 truncate leading-tight flex items-center gap-1.5">
                <span className="text-amber-400 font-semibold">Dispatch Hub</span>
                {currentDateEn && <span className="text-slate-400">• {currentDateEn}</span>}
              </span>
            </div>
          </div>

          {/* Right: Actions, SOS & Real-time Telemetry Sync Trigger */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Database Quick Button */}
            <button
              onClick={() => setDbModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 text-[11px] font-black cursor-pointer shadow-sm transition-all active:scale-95"
              title="Full Database Backup, Export & Import"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>DB</span>
            </button>

            {canInitiateCall && onOpenEmergencyCall && (
              <button
                onClick={onOpenEmergencyCall}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 border border-rose-700/60 text-[11px] font-black cursor-pointer shadow-sm transition-all active:scale-95"
                title="Emergency Direct Video/Voice Call"
              >
                <PhoneCall className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-rose-400">SOS</span>
              </button>
            )}

            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm cursor-pointer ${
                isSyncing
                  ? 'bg-blue-950/80 text-blue-300 border-blue-700/70'
                  : !isOnline
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/70'
                  : pendingCount > 0
                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/70'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70'
              }`}
              title="Click to sync database"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>Syncing...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Offline</span>
                  {pendingCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Sync ({pendingCount})</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
        className="flex-1 apk-scroll-container bg-[#0B0F19] text-slate-100 relative"
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
            className="fixed bottom-22 right-4 z-40 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xl shadow-blue-600/40 active:scale-95 transition-all border border-blue-400/50 cursor-pointer animate-in fade-in slide-in-from-bottom-2"
            aria-label="Scroll to top"
            title="Scroll back to top"
          >
            <ArrowUp className="w-4 h-4" />
            <span>Top</span>
          </button>
        )}
      </main>

      {/* 3. GOOGLE STITCH FLOATING BOTTOM NAVIGATION DOCK (DARK GLASSMORPHISM) */}
      <nav className="relative z-30 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 flex-shrink-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/90 to-transparent">
        <div className="bg-[#111827]/95 backdrop-blur-xl border border-slate-800/90 rounded-2xl px-2 py-1.5 shadow-2xl max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            const isHighlight = tab.isHighlight;

            if (isHighlight) {
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex flex-col items-center justify-center -mt-6 group cursor-pointer"
                  aria-label="Print Envelope"
                >
                  <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shadow-xl transition-all active:scale-90 ${
                    isActive 
                      ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white ring-4 ring-blue-500/40 shadow-blue-500/50' 
                      : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/30 hover:brightness-110'
                  }`}>
                    <Icon className="w-6 h-6 text-white" />
                    <span className="text-[10px] font-black tracking-tight text-white mt-0.5">
                      Print
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold text-blue-400 mt-0.5 font-mono uppercase">
                    1-Tap
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                  isActive
                    ? 'text-blue-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-blue-950/80 text-blue-400 ring-1 ring-blue-700/60' : ''
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] leading-tight mt-1 font-semibold">
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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            onClick={() => setMoreDrawerOpen(false)} 
          />
          <div className="relative bg-[#111827] border-t border-slate-700/80 rounded-t-3xl p-5 shadow-2xl z-10 max-h-[85vh] apk-scroll-container max-w-lg mx-auto w-full text-slate-100">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-700/70 flex items-center justify-center text-blue-400">
                  <Menu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base font-display">System Tools & Reports</h3>
                  <p className="text-xs text-slate-400">Executive logistics and batch operations</p>
                </div>
              </div>
              <button 
                onClick={() => setMoreDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
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
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer ${
                      isItemActive
                        ? 'bg-blue-950/60 border-blue-600/80 text-blue-300 shadow-md'
                        : 'bg-[#161C28] hover:bg-[#1A202C] border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-blue-400 flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs text-white truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-400 truncate">{item.subLabel}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* User Profile & Sign Out Card */}
            <div className="p-3.5 rounded-2xl bg-[#161C28] border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-blue-700 to-indigo-600 text-white font-black text-base flex items-center justify-center shadow-md border border-blue-400/40 flex-shrink-0">
                  {userAvatar ? (
                    <img src={userAvatar} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    username[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-extrabold text-sm text-white truncate">{username}</span>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Role: {userRole.toUpperCase()}
                  </span>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-bold transition-all active:scale-95 cursor-pointer flex-shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
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