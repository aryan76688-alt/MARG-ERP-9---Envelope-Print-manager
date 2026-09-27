import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Users, 
  Clock, 
  PlusCircle, 
  Search, 
  Printer, 
  ChevronRight, 
  RotateCcw,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { fetchDashboard, fetchPrintJobs, fetchUnprintedPartiesToday } from '../api/client';
import { DashboardData } from '../types';

interface MobileHomeProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [unprintedCount, setUnprintedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, jobsRes, unprintedRes] = await Promise.all([
        fetchDashboard('today').catch(() => null),
        fetchPrintJobs({ page: 1, limit: 5 }).catch(() => ({ items: [] })),
        fetchUnprintedPartiesToday(true).catch(() => ({ total: 0 })),
      ]);

      if (statsRes) setStats(statsRes);
      if (jobsRes?.items) setRecentJobs(jobsRes.items);
      if (unprintedRes?.total !== undefined) setUnprintedCount(unprintedRes.total);
    } catch (e) {
      console.error('Failed to load mobile dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-4">
      {/* Welcome Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-slate-900 border border-blue-500/20 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-blue-300 font-medium">Namaste 🙏</div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {currentUser.username || 'Shreeji Team'}
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Live Cloud Database • Auto Synced
            </p>
          </div>
          <button 
            onClick={loadData}
            className={`p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 active:scale-95 transition-all ${loading ? 'animate-spin' : ''}`}
            title="Refresh Data"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Quick Counters */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-blue-500/20 text-center">
          <div className="bg-slate-950/40 rounded-xl p-2 border border-blue-500/10">
            <div className="text-[10px] text-slate-400 font-medium">Today's Jobs</div>
            <div className="text-base font-extrabold text-blue-400 mt-0.5">
              {stats?.metrics?.todays_prints ?? 0}
            </div>
          </div>
          <div className="bg-slate-950/40 rounded-xl p-2 border border-blue-500/10">
            <div className="text-[10px] text-slate-400 font-medium">Unprinted</div>
            <div className="text-base font-extrabold text-amber-400 mt-0.5">
              {unprintedCount}
            </div>
          </div>
          <div className="bg-slate-950/40 rounded-xl p-2 border border-blue-500/10">
            <div className="text-[10px] text-slate-400 font-medium">Total Parties</div>
            <div className="text-base font-extrabold text-emerald-400 mt-0.5">
              {stats?.metrics?.total_parties ?? 1836}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        onClick={() => onNavigate('new-job')}
        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-between active:scale-98 transition-all"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <PlusCircle className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-bold">Create New Envelope Job</div>
            <div className="text-[11px] text-blue-100 font-normal">Search party & save or print envelope</div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-blue-200" />
      </button>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => onNavigate('parties')}
          className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left active:scale-98 transition-all flex flex-col justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Browse Parties</div>
            <div className="text-[10px] text-slate-400">Search & quick dispatch</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('history')}
          className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left active:scale-98 transition-all flex flex-col justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Live Job History</div>
            <div className="text-[10px] text-slate-400">View user & sync feed</div>
          </div>
        </button>
      </div>

      {/* Recent Dispatches Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span>Recent Cloud Dispatches</span>
          </h3>
          <button 
            onClick={() => onNavigate('history')}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300"
          >
            See All →
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
            No dispatches recorded today yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div 
                key={job.id}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-bold text-xs text-white truncate">
                    {job.party_name_snap || job.party?.party_name || 'Party'}
                  </div>
                  {job.party_name_gu_snap && (
                    <div className="text-[11px] text-indigo-300 font-gujarati truncate">
                      {job.party_name_gu_snap}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                    <span className="font-medium text-slate-300">
                      {job.total_cases || 1} {job.total_cases === 1 ? 'Case' : 'Cases'}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      By: {job.created_by || 'Admin'}
                    </span>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    #{job.id}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {job.created_at ? new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
