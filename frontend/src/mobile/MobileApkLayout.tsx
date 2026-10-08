import React, { useState, useEffect } from 'react';
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
  Package, 
  History, 
  FileSpreadsheet, 
  Settings as SettingsIcon, 
  LogOut,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { useNetworkSync } from '../offline/syncManager';

interface MobileApkLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string, state?: any) => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

export const MobileApkLayout: React.FC<MobileApkLayoutProps> = ({
  currentTab,
  setCurrentTab,
  canGoBack = false,
  onGoBack,
  onLogout,
  children
}) => {
  const [moreDrawerOpen, setMoreDrawerOpen] = useState<boolean>(false);
  const [currentDateGu, setCurrentDateGu] = useState<string>('');
  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkSync();

  // Gujarati day & date formatter
  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const weekdaysGu = ['રવિવાર', 'સોમવાર', 'મંગળવાર', 'બુધવાર', 'ગુરુવાર', 'શુક્રવાર', 'શનિવાર'];
      const dayGu = weekdaysGu[now.getDay()];
      const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      setCurrentDateGu(`${dayGu}, ${dateStr}`);
    };
    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleTabClick = (tabId: string) => {
    if (tabId === 'more') {
      setMoreDrawerOpen(true);
    } else {
      setMoreDrawerOpen(false);
      setCurrentTab(tabId);
    }
  };

  const navTabs = [
    { id: 'dashboard', label: 'હોમ', subLabel: 'Home', icon: LayoutDashboard },
    { id: 'print', label: 'પ્રિન્ટ', subLabel: 'Print', icon: Printer, isHighlight: true },
    { id: 'parties', label: 'પાર્ટી', subLabel: 'Parties', icon: Users },
    { id: 'driver', label: 'ડિલિવરી', subLabel: 'Driver', icon: Truck },
    { id: 'more', label: 'વધુ', subLabel: 'More', icon: Menu }
  ];

  const secondaryNav = [
    { id: 'dispatch', label: 'ડિસ્પેચ સમરી', subLabel: 'Dispatch Summary', icon: Package },
    { id: 'history', label: 'પ્રિન્ટ હિસ્ટ્રી', subLabel: 'Print History', icon: History },
    { id: 'import', label: 'એક્સેલ આયાત', subLabel: 'Import Excel', icon: FileSpreadsheet },
    { id: 'settings', label: 'સેટિંગ્સ', subLabel: 'Settings', icon: SettingsIcon },
  ];

  let username = 'User';
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    username = user.full_name || user.username || 'User';
  } catch {}

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. UPPER CAMERA & PANEL NOTCH-PROOF HEADER */}
      <header className="relative z-30 bg-slate-900 border-b border-slate-800/90 text-white shadow-xl flex-shrink-0 pt-[max(env(safe-area-inset-top),14px)] pb-2.5 px-3.5 transition-all">
        {/* Top Status & Brand Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back button or App Logo */}
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack && currentTab !== 'dashboard' ? (
              <button
                onClick={onGoBack}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800 active:bg-blue-600 text-slate-200 active:text-white border border-slate-700 active:border-blue-500 shadow-sm transition-all"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 border border-blue-400/30 flex-shrink-0">
                <Printer className="w-5 h-5 text-white" />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-black text-sm tracking-wide text-white">
                  MARG ENVELOPE
                </span>
                <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-500/30 text-blue-300 border border-blue-400/30">
                  APK
                </span>
              </div>
              <span className="text-[11px] font-bold text-amber-400 truncate leading-tight">
                શ્રીજી ડિસ્પેચ મેનેજર {currentDateGu && `• ${currentDateGu}`}
              </span>
            </div>
          </div>

          {/* Right: Network Status & Sync Trigger */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm ${
                isSyncing
                  ? 'bg-blue-900/50 text-blue-300 border-blue-500/50'
                  : !isOnline
                  ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                  : pendingCount > 0
                  ? 'bg-indigo-950/80 text-indigo-200 border-indigo-500/60'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40'
              }`}
              title="Click to sync data"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>સિંક...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>ઓફલાઇન</span>
                  {pendingCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </>
              ) : pendingCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>સિંક ({pendingCount})</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>લાઈવ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. SCROLLABLE MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 overscroll-contain">
        {children}
      </main>

      {/* 3. NATIVE BOTTOM NAVIGATION BAR */}
      <nav className="relative z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/90 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] flex-shrink-0 shadow-2xl">
        <div className="grid grid-cols-5 gap-1 items-end max-w-md mx-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            const isHighlight = tab.isHighlight;

            if (isHighlight) {
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex flex-col items-center justify-center -mt-5 group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shadow-xl transition-all active:scale-90 ${
                    isActive 
                      ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white ring-4 ring-blue-500/40 shadow-blue-500/50' 
                      : 'bg-gradient-to-tr from-blue-700 via-indigo-700 to-blue-600 text-white ring-2 ring-blue-400/30 shadow-blue-900/40 hover:brightness-110'
                  }`}>
                    <Icon className="w-6 h-6 text-white" />
                    <span className="text-[10px] font-black tracking-tight text-amber-300">
                      પ્રિન્ટ
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold text-blue-400 mt-0.5">
                    1-ટેપ
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all active:scale-95 ${
                  isActive
                    ? 'text-blue-400 font-black'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1 rounded-lg transition-all ${
                  isActive ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' : ''
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] leading-tight mt-0.5 font-bold">
                  {tab.label}
                </span>
                <span className="text-[8px] text-slate-500 leading-none">
                  {tab.subLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 4. MORE TOOLS DRAWER (Bottom Sheet for Secondary Functions) */}
      {moreDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" 
            onClick={() => setMoreDrawerOpen(false)} 
          />
          <div className="relative bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl z-10 max-h-[85vh] overflow-y-auto">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Menu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">વધુ ટૂલ્સ (More Tools)</h3>
                  <p className="text-xs text-slate-400">એડવાન્સ્ડ ફીચર્સ અને રિપોર્ટ્સ</p>
                </div>
              </div>
              <button 
                onClick={() => setMoreDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grid of secondary items */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
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
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-95 ${
                      isItemActive
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs text-white truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-400 truncate">{item.subLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* User Profile & Sign Out Card */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white font-black text-base flex items-center justify-center shadow-md">
                  {username[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-sm text-white">{username}</span>
                  <span className="text-xs text-emerald-400 font-semibold">લોગિન સક્રિય (Active)</span>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                  <span>લૉગઆઉટ</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
