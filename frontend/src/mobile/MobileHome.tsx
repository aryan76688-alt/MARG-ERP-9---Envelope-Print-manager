import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Printer, 
  Package, 
  Truck, 
  Plus, 
  Search, 
  RefreshCw, 
  Share2, 
  Calendar, 
  ArrowRight, 
  Clock, 
  Sparkles, 
  MapPin, 
  Map, 
  FileSpreadsheet,
  CheckCircle2,
  TrendingUp,
  Radio,
  Database,
  Download,
  Upload,
  Compass,
  Route,
  ChevronRight
} from 'lucide-react';
import { DashboardData, PrintJob } from '../types';
import { fetchDashboard, fetchPrintJobs } from '../api/client';
import { generateWhatsAppDispatchUrl } from '../utils/whatsapp';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';

interface MobileHomeProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [dbModalOpen, setDbModalOpen] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [dashRes, jobsRes] = await Promise.all([
        fetchDashboard('today'),
        fetchPrintJobs({ page: 1, limit: 10 }).catch(() => ({ items: [] }))
      ]);
      setData(dashRes);
      setRecentJobs(jobsRes.items || []);
    } catch (err) {
      console.warn('MobileHome load notice:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-10 font-sans text-slate-100">
      {/* 1. TOP HERO GREETING & LIVE ERP SYNC (STITCH DARK TACTICAL) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#111827] via-[#1A202C] to-[#111827] border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white font-display flex items-center gap-1.5">
                <span>Shreeji Dispatch Command</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              શ્રીજી ડિસ્પેચ હબ • ફાર્મા એન્વેલપ મેનેજર
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 active:text-white active:bg-blue-600 transition-all shadow-md cursor-pointer active:scale-95"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. STATS 2x2 METRIC MATRIX (STITCH DARK TACTICAL CARDS) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Parties */}
        <div 
          onClick={() => onNavigate('parties')}
          className="bg-[#111827] border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer hover:border-blue-500/50"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">Total Parties</div>
            <div className="text-xl font-black text-white font-display">
              {data?.metrics?.total_parties?.toLocaleString('en-IN') ?? '1,837'}
            </div>
            <div className="text-[10px] text-blue-400 font-semibold font-mono">100% Offline DB</div>
          </div>
        </div>

        {/* Envelopes Printed */}
        <div 
          onClick={() => onNavigate('history')}
          className="bg-[#111827] border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer hover:border-emerald-500/50"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Printer className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">Printed Today</div>
            <div className="text-xl font-black text-emerald-400 font-display">
              {data?.metrics?.todays_prints ?? data?.metrics?.total_envelopes_printed ?? 0}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold font-mono">Ready to Courier</div>
          </div>
        </div>

        {/* Cases Dispatched */}
        <div 
          onClick={() => onNavigate('dispatch')}
          className="bg-[#111827] border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer hover:border-amber-500/50"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">Cases Dispatched</div>
            <div className="text-xl font-black text-amber-400 font-display">
              {data?.metrics?.total_cases ?? 0}
            </div>
            <div className="text-[10px] text-amber-400 font-semibold font-mono">Cartons & Boxes</div>
          </div>
        </div>

        {/* Pending POD Stops */}
        <div 
          onClick={() => onNavigate('driver')}
          className="bg-[#111827] border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer hover:border-purple-500/50"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400 flex-shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">Driver Stops</div>
            <div className="text-xl font-black text-purple-400 font-display">
              {data?.print_summary?.pending ?? 0}
            </div>
            <div className="text-[10px] text-purple-400 font-semibold font-mono">Live Route Queue</div>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY CALL TO ACTION: 1-TAP INSTANT PRINT HERO */}
      <button
        onClick={() => onNavigate('print')}
        className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl p-4 shadow-xl shadow-blue-600/30 border border-blue-400/40 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner flex-shrink-0">
            <Printer className="w-7 h-7 text-amber-300" />
          </div>
          <div className="text-left">
            <div className="text-base font-black text-white flex items-center gap-2 font-display">
              <span>Print Envelope (પ્રિન્ટ કરો)</span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono">
                1-TAP
              </span>
            </div>
            <div className="text-xs text-blue-100 font-medium mt-0.5">
              Select chemist party & generate physical print
            </div>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
          <ArrowRight className="w-5 h-5" />
        </div>
      </button>

      {/* 4. GPS ROUTE OPTIMIZER & LIVE DIRECTIONS BANNER */}
      <div 
        onClick={() => onNavigate('route-optimizer')}
        className="bg-gradient-to-r from-blue-950/60 via-indigo-950/50 to-slate-900 border border-blue-800/60 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 cursor-pointer active:scale-[0.98] transition-all hover:border-blue-500/70"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-900/60 border border-blue-700/60 flex items-center justify-center text-cyan-400 flex-shrink-0 shadow-inner">
            <Route className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white font-display">
                Route Optimizer & Road Navigation
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
                Google Routes
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              Shortest path TSP road-following directions & turns
            </p>
          </div>
        </div>
        <div className="p-2 rounded-xl bg-slate-800/90 text-cyan-400 border border-slate-700 flex-shrink-0">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      {/* 5. FULL DATABASE BACKUP & RESTORE HERO CARD */}
      <div className="bg-[#161C28] text-white rounded-2xl p-4 shadow-lg border border-indigo-900/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-700/70 flex items-center justify-center text-indigo-400 shadow-inner">
              <Database className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-white font-display">
                  Database Hub (ડેટાબેઝ બેકઅપ)
                </h3>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
                  SQLite .db
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Download or restore complete offline database
              </p>
            </div>
          </div>
          <button
            onClick={() => setDbModalOpen(true)}
            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 underline decoration-indigo-500/50 cursor-pointer"
          >
            <span>Options</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Export Full Database Button */}
          <button
            type="button"
            onClick={() => setDbModalOpen(true)}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold text-xs shadow-md shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export DB (ડાઉનલોડ)</span>
          </button>

          {/* Import Database Button */}
          <button
            type="button"
            onClick={() => setDbModalOpen(true)}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Import DB (રિસ્ટોર)</span>
          </button>
        </div>
      </div>

      {/* 6. QUICK SHORTCUTS GRID (STITCH TACTICAL) */}
      <div>
        <div className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2.5 px-1 font-mono">
          Quick Actions & Operations
        </div>
        <div className="grid grid-cols-3 gap-2">
          {/* Search Party */}
          <button
            onClick={() => onNavigate('parties')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-blue-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-950/80 text-blue-400 flex items-center justify-center mb-1.5 border border-blue-800/60">
              <Search className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Search</span>
            <span className="text-[10px] text-slate-400">Directory</span>
          </button>

          {/* Add New Party */}
          <button
            onClick={() => onNavigate('parties', { openAddModal: true })}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-emerald-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center mb-1.5 border border-emerald-800/60">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">New Party</span>
            <span className="text-[10px] text-slate-400">Add Chemist</span>
          </button>

          {/* Delivery POD */}
          <button
            onClick={() => onNavigate('driver')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-purple-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-950/80 text-purple-400 flex items-center justify-center mb-1.5 border border-purple-800/60">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Driver POD</span>
            <span className="text-[10px] text-slate-400">Delivery</span>
          </button>

          {/* Dispatch Summary */}
          <button
            onClick={() => onNavigate('dispatch')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-amber-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-950/80 text-amber-400 flex items-center justify-center mb-1.5 border border-amber-800/60">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Manifest</span>
            <span className="text-[10px] text-slate-400">Summary</span>
          </button>

          {/* GPS Map */}
          <button
            onClick={() => onNavigate('map')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-cyan-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 text-cyan-400 flex items-center justify-center mb-1.5 border border-cyan-800/60">
              <Map className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">GPS Map</span>
            <span className="text-[10px] text-slate-400">Radar Geofence</span>
          </button>

          {/* History */}
          <button
            onClick={() => onNavigate('history')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#111827] border border-slate-800 text-slate-200 active:border-rose-500/60 transition-all shadow-md cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-950/80 text-rose-400 flex items-center justify-center mb-1.5 border border-rose-800/60">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">History</span>
            <span className="text-[10px] text-slate-400">Logs & Reprints</span>
          </button>
        </div>
      </div>

      {/* 7. RECENT ENVELOPES FEED (STITCH TACTICAL FEED) */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">
            Recent Print Queue
          </span>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-bold text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 text-center text-slate-400 text-xs shadow-md">
            No envelopes printed today yet. Click Print Envelope above to start.
          </div>
        ) : (
          <div className="space-y-2">
            {recentJobs.slice(0, 5).map((job) => {
              const partyName = job.party_name || 'Party';
              const partyGu = job.party_name_gu || '';
              const cases = job.total_cases ?? 1;
              const dateStr = job.created_at ? new Date(job.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
              const waUrl = job.mobile 
                ? generateWhatsAppDispatchUrl({
                    partyName: job.party_name,
                    partyNameGu: job.party_name_gu || undefined,
                    phone: job.mobile,
                    jobNumber: job.job_number,
                    totalCases: cases,
                    city: job.city
                  }, 'en') 
                : null;

              return (
                <div
                  key={job.id}
                  className="bg-[#111827] border border-slate-800/90 rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/60">
                        {job.party_code || 'MARG'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{dateStr}</span>
                    </div>
                    <div className="font-extrabold text-sm text-white truncate mt-1">
                      {partyName}
                    </div>
                    {partyGu && (
                      <div className="text-xs text-slate-400 truncate leading-tight font-medium mt-0.5">
                        {partyGu}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                      <span className="text-amber-400 font-bold font-mono">{cases} {cases === 1 ? 'Case' : 'Cases'}</span>
                      {job.city && (
                        <span>• {job.city}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Reprint Button */}
                    <button
                      onClick={() => onNavigate('print', { reprintJob: job })}
                      className="px-2.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                      title="Reprint Envelope"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Reprint</span>
                    </button>

                    {/* WhatsApp Button */}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 transition-all cursor-pointer shadow-md shadow-emerald-600/30"
                        title="Share Dispatch on WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Database Export & Import Modal */}
      <DatabaseBackupModal
        isOpen={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
      />
    </div>
  );
};