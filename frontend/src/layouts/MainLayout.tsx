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
  Truck
} from 'lucide-react';

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

  let userRole = 'employee';
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    userRole = user.role || 'employee';
  } catch {}

  const navItemsRaw = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
    { id: 'print', label: 'Print Envelope', icon: Printer },
    { id: 'dispatch', label: 'Dispatch Summary', icon: Truck },
    { id: 'history', label: 'Print History', icon: History },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ...(userRole === 'super_admin' ? [{ id: 'users', label: 'User Management', icon: User }] : [])
  ];

  const navItems = navItemsRaw;

  const pageTitles: Record<string, string> = {
    dashboard: 'Dispatch Dashboard',
    parties: 'Parties Management',
    import: 'Import Excel',
    print: 'Print Envelope',
    dispatch: 'Dispatch Summary',
    history: 'Print History',
    settings: 'Settings',
    users: 'User Management',
  };
  const activeTitle = pageTitles[currentTab] || 'Envelope Print';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans">
      {/* 1. Left Sidebar: Dark Navy */}
      <aside className="hidden md:flex md:w-64 flex-col bg-slate-900 border-r border-slate-800 text-slate-200 select-none z-20 flex-shrink-0">
        {/* Brand Logo Header */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800/80 bg-slate-950/40">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-lg shadow-md shadow-blue-500/20">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-wider text-white flex items-center gap-1">
              Envelope Print
            </span>
            <span className="text-xs text-slate-400 font-medium tracking-wide">Dispatch Manager</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Main Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer System Info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400 space-y-2.5">
          <div className="flex items-center justify-between font-medium">
            <span>System Status</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Connected
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>PIN Code Policy</span>
            <span className="text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-700/60">
              Disabled
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
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-semibold ${
                      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-10 flex-shrink-0 shadow-sm no-print">
          {/* Left Title & Mobile Hamburger & Back Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {canGoBack && onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors border border-slate-300"
                title="Go back (or press Esc on desktop)"
              >
                <ArrowLeft className="w-4 h-4 text-blue-600" />
                <span>Back</span>
                <span className="hidden sm:inline text-[10px] text-slate-400 font-mono font-normal ml-0.5">[Esc]</span>
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                  <span className="text-slate-900 font-bold">{activeTitle}</span>
                </h1>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Professional Envelope Dispatch & Print Manager
              </p>
            </div>
          </div>

          {/* Right Controls: Date, Digital Clock, Notifications, Profile */}
          <div className="flex items-center gap-3 sm:gap-5">
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
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 relative"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full"></span>
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
                      ℹ️ PIN code field permanently removed as per policy.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 group relative">
              <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-xs shadow-inner cursor-pointer">
                {(() => {
                  try {
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
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

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
};
