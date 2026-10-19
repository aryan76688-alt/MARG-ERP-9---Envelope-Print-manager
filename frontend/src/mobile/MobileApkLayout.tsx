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
  HardDrive
} from 'lucide-react';
import { useNetworkSync } from '../offline/syncManager';

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

  // Recreated Clean Scroll Functions (Both Up & Down)
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
      // Auto-scroll to top when switching tabs
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
    ...(userRole === 'super_admin' ? [
      { id: 'storage', label: 'Phone Local Storage', subLabel: 'Folder Creation & Host Storage (Super Admin)', icon: HardDrive }
    ] : []),
    { id: 'map', label: 'All Parties Map', subLabel: 'GPS Geofences & Chemist Radar', icon: MapPin },
    { id: 'dispatch', label: 'Dispatch Summary', subLabel: 'Courier Manifests & Sheets', icon: Package },
    { id: 'history', label: 'Print History', subLabel: 'Job Logs & Reprints', icon: History },
    { id: 'import', label: 'Excel Import', subLabel: 'Bulk MARG Ledger Ingestion', icon: FileSpreadsheet },
    { id: 'settings', label: 'Settings', subLabel: 'Server Config & Preferences', icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-100 font-sans">
      {/* 1. UPPER CAMERA NOTCH & STATUS BAR SAFE LIGHT HEADER */}
      <header className="relative z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900 shadow-sm flex-shrink-0 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 px-3.5 transition-all">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          {/* Left: Navigation back or Stitch Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            {canGoBack && currentTab !== 'dashboard' ? (
              <button
                onClick={onGoBack}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 active:bg-blue-600 text-slate-700 active:text-white border border-slate-200 shadow-sm transition-all cursor-pointer"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 border border-blue-400/30 flex-shrink-0">
                <Printer className="w-5 h-5 text-white" />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-black text-sm tracking-wide text-slate-900 font-display">
                  MARG ENVELOPE
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                  v2.0
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 truncate leading-tight flex items-center gap-1.5">
                <span className="text-amber-600 font-semibold">Dispatch Hub</span>
                {currentDateEn && <span>• {currentDateEn}</span>}
              </span>
            </div>
          </div>

          {/* Right: Emergency Call & Sync Trigger */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canInitiateCall && onOpenEmergencyCall && (
              <button
                onClick={onOpenEmergencyCall}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-black cursor-pointer shadow-sm transition-all active:scale-95"
                title="Emergency Direct Video/Voice Call"
              >
                <PhoneCall className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-rose-700">SOS</span>
              </button>
            )}

            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm cursor-pointer ${
                isSyncing
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : !isOnline
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : pendingCount > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
              title="Click to sync database"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Syncing...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>Offline</span>
                  {pendingCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sync ({pendingCount})</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-700">Live</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. RECREATED BI-DIRECTIONAL SCROLLABLE MAIN CONTENT AREA (LIGHT THEME) */}
      <main
        ref={mainScrollRef}
        id="mobile-main-scroll"
        className="flex-1 apk-scroll-container bg-slate-100 text-slate-900 relative"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overflowY: 'auto',
          overscrollBehaviorY: 'auto'
        }}
      >
        {children}

        {/* Recreated 1-Tap Quick Scroll to Top Action Button */}
        {showScrollTop && (
          <button
            onClick={handleScrollToTop}
            className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-blue-600 text-white font-bold text-xs shadow-xl shadow-blue-600/30 active:scale-95 transition-all border border-blue-400 cursor-pointer animate-in fade-in slide-in-from-bottom-2"
            aria-label="Scroll to top"
            title="Scroll back to top"
          >
            <ArrowUp className="w-4 h-4" />
            <span>Top</span>
          </button>
        )}
      </main>

      {/* 3. LIGHT THEME FLOATING BOTTOM NAVIGATION DOCK */}
      <nav className="relative z-30 px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 flex-shrink-0 bg-gradient-to-t from-slate-100 via-slate-100/90 to-transparent">
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-2xl px-2 py-1.5 shadow-xl max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
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
                      ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white ring-4 ring-blue-300 shadow-blue-500/40' 
                      : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white ring-2 ring-blue-200 shadow-md shadow-blue-500/20 hover:brightness-105'
                  }`}>
                    <Icon className="w-6 h-6 text-white" />
                    <span className="text-[10px] font-black tracking-tight text-white mt-0.5">
                      Print
                    </span>
                  </div>
                  <span className="text-[9px] font-extrabold text-blue-600 mt-0.5 font-mono uppercase">
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
                    ? 'text-blue-600 font-bold'
                    : 'text-slate-500 hover:text-slate-900 font-medium'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : ''
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

      {/* 4. LIGHT THEME MORE TOOLS SLIDE-UP DRAWER */}
      {moreDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setMoreDrawerOpen(false)} 
          />
          <div className="relative bg-white border-t border-slate-200 rounded-t-3xl p-5 shadow-2xl z-10 max-h-[85vh] apk-scroll-container max-w-lg mx-auto w-full">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Menu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base font-display">System Tools & Reports</h3>
                  <p className="text-xs text-slate-500">Executive logistics and batch operations</p>
                </div>
              </div>
              <button 
                onClick={() => setMoreDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer"
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
                      setCurrentTab(item.id);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer ${
                      isItemActive
                        ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-100/60 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs text-slate-900 truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-500 truncate">{item.subLabel}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* User Profile & Sign Out Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-blue-700 to-indigo-600 text-white font-black text-base flex items-center justify-center shadow-md border border-blue-300 flex-shrink-0">
                  {userAvatar ? (
                    <img src={userAvatar} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    username[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-extrabold text-sm text-slate-900 truncate">{username}</span>
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all active:scale-95 cursor-pointer flex-shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
