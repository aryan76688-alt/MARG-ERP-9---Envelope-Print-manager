import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileSpreadsheet, 
  Printer, 
  History, 
  Settings as SettingsIcon, 
  Bell, 
  User, 
  Menu, 
  X,
  Package,
  Calendar,
  Clock,
  ChevronRight,
  ArrowLeft,
  Truck,
  Wifi,
  WifiOff,
  RefreshCw,
  MapPin
} from 'lucide-react';
import { useNetworkSync } from '../offline/syncManager';

interface MainLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ 
  currentTab, 
  setCurrentTab, 
  canGoBack = false,
  onGoBack,
  onLogout,
  children 
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [tabHistory, setTabHistory] = useState<string[]>(['dashboard']);

  const isApk = typeof window !== 'undefined' && (
    navigator.userAgent.includes('ShreejiEnvelopeApp') ||
    window.location.search.includes('mode=apk') ||
    (window as any).isAndroidApp === true ||
    (window as any).AndroidBridge !== undefined
  );

  const handleTabChange = (newTab: string) => {
    if (newTab !== currentTab) {
      setTabHistory((prev) => [...prev, newTab]);
      setCurrentTab(newTab);
    }
  };

  const handleMobileBack = () => {
    if (canGoBack && onGoBack) {
      onGoBack();
      return;
    }
    if (tabHistory.length > 1) {
      const nextHistory = [...tabHistory];
      nextHistory.pop(); // remove current
      const prevTab = nextHistory[nextHistory.length - 1];
      setTabHistory(nextHistory);
      setCurrentTab(prevTab);
    } else if (currentTab !== 'dashboard') {
      setCurrentTab('dashboard');
    }
  };

  // Live Digital Clock & Date
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkSync();

  let userRole = 'employee';
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    userRole = user.role || 'employee';
  } catch {}

  const navItemsRaw = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'map', label: 'Parties Map', icon: MapPin },
    { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
    { id: 'print', label: 'Print Envelope', icon: Printer },
    { id: 'driver', label: 'Driver Mode', icon: Truck },
    { id: 'dispatch', label: 'Dispatch Summary', icon: Package },
    { id: 'history', label: 'Print History', icon: History },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ...(userRole === 'super_admin' ? [{ id: 'users', label: 'User Management', icon: User }] : [])
  ];

  const navItems = navItemsRaw;

  const pageTitles: Record<string, string> = {
    dashboard: 'Dispatch Dashboard',
    parties: 'Parties Management',
    map: 'All Parties Map (પાર્ટી મેપ)',
    import: 'Import Excel',
    print: 'Print Envelope',
    driver: 'Driver Mode (POD)',
    dispatch: 'Dispatch Summary',
    history: 'Print History',
    settings: 'Settings',
    users: 'User Management',
  };
  const activeTitle = pageTitles[currentTab] || 'Envelope Print';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* 1. Left Sidebar: Dark Navy Executive Dock */}
      <aside className="hidden md:flex md:w-64 flex-col bg-slate-900 border-r border-slate-800 text-slate-200 select-none z-20 flex-shrink-0 shadow-xl">
        {/* Brand Logo Header */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800/80 bg-slate-950/60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-500/25 border border-blue-400/30">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-wider text-white font-display flex items-center gap-1.5">
              <span>MARG ERP 9</span>
              <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-400/30">
                PRO
              </span>
            </span>
            <span className="text-xs text-slate-400 font-medium tracking-wide">Envelope Manager</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Executive Modules
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isPrint = item.id === 'print';
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? isPrint
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white shadow-lg shadow-blue-500/40 ring-1 ring-blue-400/80 font-black'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-bold'
                    : isPrint
                    ? 'bg-gradient-to-r from-blue-950/70 via-indigo-950/60 to-blue-900/70 text-slate-100 border border-blue-500/50 shadow-sm hover:border-blue-400 hover:from-blue-900 font-bold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : isPrint ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isPrint && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 shadow-sm animate-pulse">
                    FAST
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer System Info & Telemetry */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 space-y-2.5">
          <div className="flex items-center justify-between font-medium">
            <span className="font-mono text-[11px] text-slate-400">ERP Sync Telemetry</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Port 8089 LIVE
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span className="text-[11px]">Active Engine</span>
            <span className="text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-blue-800/60">
              Stitch Executive
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 bg-slate-900 text-white flex flex-col h-full shadow-2xl z-10">
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">
                  <Printer className="w-4 h-4 text-white" />
                </div>
                <span className="font-extrabold text-white">Envelope Print</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-2 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                const isPrint = item.id === 'print';
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-sm font-semibold transition-all ${
                      isActive
                        ? isPrint
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white shadow-lg ring-2 ring-blue-400 font-black'
                          : 'bg-blue-600 text-white shadow-md'
                        : isPrint
                        ? 'bg-gradient-to-r from-blue-950/90 to-indigo-950/90 text-white border border-blue-500/60 shadow-md font-extrabold ring-1 ring-blue-500/30'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : isPrint ? 'text-blue-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {isPrint && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                        FAST
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 z-10 flex-shrink-0 shadow-sm no-print">
          {/* Left Title & Mobile Hamburger & Back Button */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {(canGoBack || currentTab !== 'dashboard') && (
              <button
                onClick={handleMobileBack}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors border border-slate-300 shrink-0"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4 text-blue-600" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 truncate">
                <h1 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight truncate font-display">
                  {activeTitle}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  ERP: LIVE 8089
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block truncate">
                MARG ERP 9 • Professional Envelope Dispatch & Print Manager
              </p>
            </div>
          </div>

          {/* Right Controls: Date, Digital Clock, Notifications, Profile */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Offline & Sync Status Indicator */}
            <button
              onClick={() => triggerSync()}
              title={isOnline ? (pendingCount > 0 ? `${pendingCount} offline actions pending sync` : 'All changes synced') : 'Offline mode active'}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded-lg border transition-all ${
                isSyncing
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : !isOnline
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : pendingCount > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span className="hidden sm:inline">Syncing...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>Offline{pendingCount > 0 ? ` (${pendingCount})` : ''}</span>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Sync ({pendingCount})</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Online</span>
                </>
              )}
            </button>

            {/* Live Date */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>{currentDate}</span>
            </div>

            {/* Live Digital Clock */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-800 font-mono font-bold bg-blue-50/80 px-2.5 py-1.5 rounded-md border border-blue-100 text-blue-900">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>{currentTime}</span>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-1.5 sm:p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 relative"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full"></span>
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-30 text-xs">
                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
                    <span>Notifications</span>
                    <span className="text-[10px] text-blue-600 cursor-pointer">Mark read</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2 rounded bg-blue-50 text-blue-900 font-medium">
                      🚀 System Ready: MARG ERP Envelope Manager online.
                    </div>
                    <div className="p-2 rounded bg-slate-50 text-slate-600">
                      ℹ️ All parties cached for offline and instant printing.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1 sm:pl-2 border-l border-slate-200 group relative">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-blue-900 text-white flex items-center justify-center font-bold text-xs shadow-inner cursor-pointer border border-blue-400/40">
                {(() => {
                  try {
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                    if (user.avatar_url) {
                      return <img src={user.avatar_url} alt={user.full_name || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
                    }
                    return (user.username?.[0] || 'U').toUpperCase();
                  } catch { return 'U'; }
                })()}
              </div>
              <div className="hidden md:flex flex-col">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {(() => {
                    try {
                      return JSON.parse(localStorage.getItem('user') || '{}').full_name || 'User';
                    } catch { return 'User'; }
                  })()}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold leading-tight capitalize">
                  {(() => {
                    try {
                      return JSON.parse(localStorage.getItem('user') || '{}').role?.replace('_', ' ') || 'Employee';
                    } catch { return 'Employee'; }
                  })()}
                </span>
              </div>
              
              {/* Logout Dropdown */}
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border border-slate-200 shadow-lg rounded-lg min-w-[120px] overflow-hidden z-50">
                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Top Navigation Pills Bar (Replaces bottom buttons for clean 1-tap switching) */}
        <div className="md:hidden flex items-center gap-1.5 px-2.5 py-2 bg-slate-900 border-b border-slate-800 overflow-x-auto no-scrollbar shadow-inner text-xs flex-shrink-0 z-10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isPrint = item.id === 'print';
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? isPrint
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white shadow-md shadow-blue-600/40 ring-2 ring-amber-400 font-black'
                      : 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-white/20'
                    : isPrint
                    ? 'bg-gradient-to-r from-blue-950 via-indigo-950 to-blue-900 text-white border border-blue-400/80 shadow-sm font-black ring-1 ring-blue-500/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isPrint ? 'text-blue-400' : ''}`} />
                <span>{item.label}</span>
                {isPrint && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Page Content Body (Fixed smooth touch scrolling with natural bottom padding) */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-100 pb-10 overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
};
