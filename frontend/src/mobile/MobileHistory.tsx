import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Search, 
  RotateCcw, 
  Printer, 
  Download, 
  Package, 
  User, 
  Calendar,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowRight,
  X
} from 'lucide-react';
import { fetchPrintJobs, downloadEnvelopePDF } from '../api/client';

interface MobileHistoryProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const MobileHistory: React.FC<MobileHistoryProps> = ({ onNavigate }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'all'>('today');
  const [search, setSearch] = useState<string>('');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const queryParams: any = {
        page: 1,
        limit: 50,
      };

      if (filterPeriod === 'today') {
        queryParams.start_date = todayStr;
        queryParams.end_date = todayStr;
      }

      if (search.trim()) {
        queryParams.search = search.trim();
      }

      const res = await fetchPrintJobs(queryParams);
      setJobs(res?.items || []);
    } catch (e) {
      console.error('Failed to load print history', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [filterPeriod]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory();
  };

  const handleReDispatch = (job: any) => {
    onNavigate('new-job', {
      initialParty: {
        id: job.party_id,
        party_name: job.party_name || job.party_name_snap,
        party_name_gu: job.party_name_gu || job.party_name_gu_snap,
        party_code: job.party_code || job.party_code_snap,
        address: job.address || job.party_address_snap,
        city: job.city || job.party_city_snap,
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Header & Filter Strip */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Live Dispatch History</h2>
            <p className="text-[10px] text-slate-400">PostgreSQL Cloud Realtime Feed</p>
          </div>
          <button
            onClick={loadHistory}
            className={`p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl active:scale-95 transition-all ${loading ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filter Period Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setFilterPeriod('today')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filterPeriod === 'today' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Today's Feed
          </button>
          <button
            type="button"
            onClick={() => setFilterPeriod('all')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filterPeriod === 'all' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Time
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party or creator username..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); loadHistory(); }}
              className="absolute right-3 text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Feed Cards */}
      <div className="space-y-2">
        {loading && jobs.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            Loading cloud history...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
            No dispatch records found.
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className="p-3.5 bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl transition-all space-y-2"
            >
              {/* Top info */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-white leading-tight">
                    {job.party_name_snap || job.party?.party_name || 'Party'}
                  </div>
                  {job.party_name_gu_snap && (
                    <div className="text-[11px] text-indigo-300 font-gujarati mt-0.5">
                      {job.party_name_gu_snap}
                    </div>
                  )}
                </div>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono font-bold">
                  #{job.id}
                </span>
              </div>

              {/* Middle details */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-bold text-white">
                    {job.total_cases || 1} {job.total_cases === 1 ? 'Case' : 'Cases'}
                  </span>
                  {job.weight_kg ? ` (${job.weight_kg} KG)` : ''}
                </div>

                <div className="flex items-center gap-1.5 justify-end">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold truncate">
                    {job.created_by || 'Admin'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                <span>
                  {job.created_at ? new Date(job.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => downloadEnvelopePDF(job.id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Download className="w-3 h-3 text-blue-400" />
                    <span>PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReDispatch(job)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm"
                  >
                    <span>Dispatch</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
