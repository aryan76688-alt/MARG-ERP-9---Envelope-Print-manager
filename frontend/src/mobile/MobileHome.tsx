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
      {/* 1. TOP HERO GREETING & LIVE ERP SYNC */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white font-display">
                Shreeji Dispatch Command
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            </div>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              શ્રીજી ડિસ્પેચ હબ • ફાર્મા એન્વેલપ મેનેજર
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 active:text-white transition-colors shadow-xs cursor-pointer active:scale-98 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-50"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'motion-safe:animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. STATS 2x2 METRIC MATRIX */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Parties */}
        <div 
          onClick={() => onNavigate('parties')}
          className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-xs flex items-center gap-3 active:scale-98 transition-colors cursor-pointer hover:border-blue-500"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400 truncate">Total Parties</div>
            <div className="text-xl font-bold text-white font-display">
              {data?.metrics?.total_parties?.toLocaleString('en-IN') ?? '1,837'}
            </div>
            <div className="text-xs text-blue-300 font-medium">Offline DB</div>
          </div>
        </div>

        {/* Envelopes Printed */}
        <div 
          onClick={() => onNavigate('history')}
          className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-xs flex items-center gap-3 active:scale-98 transition-colors cursor-pointer hover:border-emerald-500"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Printer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400 truncate">Printed Today</div>
            <div className="text-xl font-bold text-emerald-400 font-display">
              {data?.metrics?.todays_prints ?? data?.metrics?.total_envelopes_printed ?? 0}
            </div>
            <div className="text-xs text-emerald-300 font-medium">Ready to Courier</div>
          </div>
        </div>

        {/* Cases Dispatched */}
        <div 
          onClick={() => onNavigate('dispatch')}
          className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-xs flex items-center gap-3 active:scale-98 transition-colors cursor-pointer hover:border-amber-500"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-950 border border-amber-800 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400 truncate">Cases Dispatched</div>
            <div className="text-xl font-bold text-amber-400 font-display">
              {data?.metrics?.total_cases ?? 0}
            </div>
            <div className="text-xs text-amber-300 font-medium">Cartons & Boxes</div>
          </div>
        </div>

        {/* Pending POD Stops */}
        <div 
          onClick={() => onNavigate('driver')}
          className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-xs flex items-center gap-3 active:scale-98 transition-colors cursor-pointer hover:border-blue-400"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400 truncate">Driver Stops</div>
            <div className="text-xl font-bold text-blue-300 font-display">
              {data?.print_summary?.pending ?? 0}
            </div>
            <div className="text-xs text-blue-300 font-medium">Route Queue</div>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY CALL TO ACTION: 1-TAP INSTANT PRINT HERO */}
      <button
        onClick={() => onNavigate('print')}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 shadow-sm border border-blue-500 flex items-center justify-between active:scale-[0.98] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-blue-700/80 border border-blue-400/40 flex items-center justify-center text-white flex-shrink-0">
            <Printer className="w-6 h-6 text-amber-300" />
          </div>
          <div className="text-left">
            <div className="text-base font-bold text-white flex items-center gap-2 font-display">
              <span>Print Envelope (પ્રિન્ટ કરો)</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                1-Tap
              </span>
            </div>
            <div className="text-xs text-blue-100 font-medium mt-0.5">
              Select chemist party & generate physical print
            </div>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>

      {/* 4. GPS ROUTE OPTIMIZER & LIVE DIRECTIONS BANNER */}
      <div 
        onClick={() => onNavigate('route-optimizer')}
        className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xs flex items-center justify-between gap-3 cursor-pointer active:scale-[0.98] transition-colors hover:border-blue-500"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Route className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white font-display">
                Route Optimizer & Road Navigation
              </span>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                Google Routes
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Shortest path TSP road-following directions & turns
            </p>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-slate-800 text-blue-400 border border-slate-700 flex-shrink-0">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      {/* 5. FULL DATABASE BACKUP & RESTORE HERO CARD */}
      <div className="bg-slate-800 text-white rounded-xl p-4 shadow-xs border border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white font-display">
                  Database Hub (ડેટાબેઝ બેકઅપ)
                </h3>
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                  SQLite .db
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Download or restore complete offline database
              </p>
            </div>
          </div>
          <button
            onClick={() => setDbModalOpen(true)}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-0.5 underline cursor-pointer"
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
            className="py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs active:scale-98 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export DB (ડાઉનલોડ)</span>
          </button>

          {/* Import Database Button */}
          <button
            type="button"
            onClick={() => setDbModalOpen(true)}
            className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs border border-slate-700 active:scale-98 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Import DB (રિસ્ટોર)</span>
          </button>
        </div>
      </div>

      {/* 6. QUICK SHORTCUTS GRID */}
      <div>
        <div className="text-xs font-medium text-slate-400 mb-2 px-1">
          Quick actions & operations
        </div>
        <div className="grid grid-cols-3 gap-2">
          {/* Search Party */}
          <button
            onClick={() => onNavigate('parties')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-blue-500 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-950 text-blue-400 flex items-center justify-center mb-1.5 border border-blue-800">
              <Search className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">Search</span>
            <span className="text-xs text-slate-400">Directory</span>
          </button>

          {/* Add New Party */}
          <button
            onClick={() => onNavigate('parties', { openAddModal: true })}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-emerald-500 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center mb-1.5 border border-emerald-800">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">New Party</span>
            <span className="text-xs text-slate-400">Add chemist</span>
          </button>

          {/* Delivery POD */}
          <button
            onClick={() => onNavigate('driver')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-blue-400 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-950 text-blue-300 flex items-center justify-center mb-1.5 border border-blue-800">
              <Truck className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">Driver POD</span>
            <span className="text-xs text-slate-400">Delivery</span>
          </button>

          {/* Dispatch Summary */}
          <button
            onClick={() => onNavigate('dispatch')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-amber-500 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-950 text-amber-400 flex items-center justify-center mb-1.5 border border-amber-800">
              <Package className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">Manifest</span>
            <span className="text-xs text-slate-400">Summary</span>
          </button>

          {/* GPS Map */}
          <button
            onClick={() => onNavigate('map')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-blue-400 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center mb-1.5 border border-slate-700">
              <Map className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">GPS Map</span>
            <span className="text-xs text-slate-400">Geofence</span>
          </button>

          {/* History */}
          <button
            onClick={() => onNavigate('history')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:border-rose-500 transition-colors shadow-xs cursor-pointer active:scale-98"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-rose-400 flex items-center justify-center mb-1.5 border border-slate-700">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-white">History</span>
            <span className="text-xs text-slate-400">Logs</span>
          </button>
        </div>
      </div>

      {/* 7. RECENT ENVELOPES FEED */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-slate-400">
            Recent print queue
          </span>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-800 border border-slate-700 text-center text-slate-400 text-xs shadow-xs">
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
                  className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 shadow-xs flex items-center justify-between gap-3 hover:border-slate-600 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                        {job.party_code || 'MARG'}
                      </span>
                      <span className="text-xs text-slate-400">{dateStr}</span>
                    </div>
                    <div className="font-semibold text-sm text-white truncate mt-1">
                      {partyName}
                    </div>
                    {partyGu && (
                      <div className="text-xs text-slate-400 truncate leading-tight font-medium mt-0.5">
                        {partyGu}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                      <span className="text-amber-300 font-semibold">{cases} {cases === 1 ? 'Case' : 'Cases'}</span>
                      {job.city && (
                        <span>• {job.city}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Reprint Button */}
                    <button
                      onClick={() => onNavigate('print', { reprintJob: job })}
                      className="px-2.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs active:scale-98 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Reprint Envelope"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Reprint</span>
                    </button>

                    {/* WhatsApp Button */}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98 transition-colors cursor-pointer shadow-xs"
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