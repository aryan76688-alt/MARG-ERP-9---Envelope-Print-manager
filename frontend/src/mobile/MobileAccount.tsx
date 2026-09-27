import React, { useState, useEffect } from 'react';
import { 
  User, 
  ShieldCheck, 
  Database, 
  Cloud, 
  LogOut, 
  Monitor, 
  CheckCircle2, 
  Sparkles,
  Info,
  Clock,
  HardDrive
} from 'lucide-react';
import { fetchBackupSettings } from '../api/client';

interface MobileAccountProps {
  onLogout?: () => void;
  onSwitchToDesktop: () => void;
}

export const MobileAccount: React.FC<MobileAccountProps> = ({ onLogout, onSwitchToDesktop }) => {
  const [backupInfo, setBackupInfo] = useState<any>(null);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    fetchBackupSettings()
      .then((res) => setBackupInfo(res))
      .catch(() => {});
  }, []);

  const roleName = currentUser.role === 'super_admin' 
    ? 'Super Admin' 
    : currentUser.role === 'admin' 
      ? 'Administrator' 
      : 'Employee / Staff';

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="p-4 bg-gradient-to-tr from-slate-900 via-blue-950/40 to-slate-900 border border-blue-500/20 rounded-2xl shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-600/30">
            {(currentUser.username || 'U')[0].toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              {currentUser.username || 'User Profile'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-300">{roleName}</span>
            </div>
          </div>
        </div>

        {/* User Permissions Summary */}
        <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Save Dispatches:</span>
            <span className="text-emerald-400 font-semibold">Enabled</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Print / PDF Envelopes:</span>
            <span className="text-emerald-400 font-semibold">
              {currentUser.role !== 'employee' || currentUser.can_print !== false ? 'Enabled' : 'Save Only'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Cloud Sync:</span>
            <span className="text-blue-400 font-semibold">Real-Time PostgreSQL</span>
          </div>
        </div>
      </div>

      {/* Cloud & Database Status */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Cloud Database & Storage</span>
        </h3>

        <div className="space-y-2 text-xs">
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="font-bold text-white text-[11px]">PostgreSQL Database</div>
                <div className="text-[10px] text-slate-400">Railway Cloud Managed</div>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
              Connected
            </span>
          </div>

          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <div>
                <div className="font-bold text-white text-[11px]">Daily Auto Cloud Backup</div>
                <div className="text-[10px] text-slate-400">Scheduled for 8:00 PM • Google Drive</div>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* System Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onSwitchToDesktop}
          className="w-full py-3 px-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            <span>Switch to Full Desktop View</span>
          </div>
          <span className="text-[10px] text-slate-400">Open Full UI →</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3 px-4 rounded-2xl bg-red-950/40 border border-red-900/60 hover:bg-red-900/40 text-red-300 text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Account</span>
        </button>
      </div>
    </div>
  );
};
