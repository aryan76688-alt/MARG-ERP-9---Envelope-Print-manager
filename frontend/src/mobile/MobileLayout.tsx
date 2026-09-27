import React from 'react';
import { 
  Home, 
  PlusCircle, 
  Users, 
  History, 
  User as UserIcon,
  Cloud,
  CheckCircle2,
  Sparkles,
  ArrowLeft
} from 'lucide-react';

interface MobileLayoutProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  title?: string;
  children: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  currentTab,
  onTabChange,
  canGoBack = false,
  onGoBack,
  title,
  children
}) => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const roleName = currentUser.role === 'super_admin' 
    ? 'Super Admin' 
    : currentUser.role === 'admin' 
      ? 'Admin' 
      : 'Employee';

  const roleBadgeColor = currentUser.role === 'super_admin'
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    : currentUser.role === 'admin'
      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'new-job', label: 'New Job', icon: PlusCircle, highlight: true },
    { id: 'parties', label: 'Parties', icon: Users },
    { id: 'history', label: 'History', icon: History },
    { id: 'account', label: 'Account', icon: UserIcon },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 antialiased select-none pb-20">
      {/* Top Mobile App Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          {canGoBack && onGoBack ? (
            <button
              onClick={onGoBack}
              className="p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg active:scale-95 transition-all"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-inner">
              <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }} />
            </div>
          )}

          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              {title || 'Envelope Manager'}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold ${roleBadgeColor}`}>
                {roleName}
              </span>
              <span>•</span>
              <span className="text-slate-300 font-medium">{currentUser.username || 'User'}</span>
            </div>
          </div>
        </div>

        {/* Cloud Sync Status Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-[11px] font-medium shadow-sm">
          <Cloud className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>PostgreSQL Sync</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-3 py-3 overflow-y-auto">
        {children}
      </main>

      {/* Android System Style Bottom Navigation Bar */}
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)' }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          
          if (item.highlight) {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="flex flex-col items-center justify-center -mt-5 group active:scale-95 transition-transform"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isActive 
                    ? 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white ring-4 ring-blue-500/20 shadow-blue-500/40' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-semibold mt-1 ${
                  isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                }`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all active:scale-95 ${
                isActive 
                  ? 'text-blue-400 font-bold bg-blue-500/10' 
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-400 scale-110' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
