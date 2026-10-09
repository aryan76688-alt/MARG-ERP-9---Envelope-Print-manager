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
  FileSpreadsheet
} from 'lucide-react';
import { DashboardData, PrintJob } from '../types';
import { fetchDashboard, fetchPrintJobs } from '../api/client';
import { generateWhatsAppDispatchUrl } from '../utils/whatsapp';

interface MobileHomeProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

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
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      {/* 1. TOP HERO GREETING & QUICK REFRESH */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/20 rounded-2xl p-4 shadow-lg">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-1.5">
            <span>શ્રીજી ડિસ્પેચ હબ</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </h2>
          <p className="text-xs font-semibold text-slate-300 mt-0.5">
            કવર પ્રિન્ટ અને રૂટ મેનેજમેન્ટ
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 active:text-white active:bg-blue-600 transition-all shadow-sm"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* 2. STATS ROW */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Parties Card */}
        <div 
          onClick={() => onNavigate('parties')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400">કુલ પાર્ટીઓ</div>
            <div className="text-xl font-black text-white">
              {data?.metrics?.total_parties?.toLocaleString('en-IN') ?? '1,836'}
            </div>
            <div className="text-[10px] text-blue-400 font-semibold">100% સિંક</div>
          </div>
        </div>

        {/* Envelopes Printed */}
        <div 
          onClick={() => onNavigate('history')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400">પ્રિન્ટેડ કવર</div>
            <div className="text-xl font-black text-emerald-400">
              {data?.metrics?.total_envelopes_printed ?? 0}
            </div>
            <div className="text-[10px] text-emerald-300 font-semibold">કુલ ડિસ્પેચ</div>
          </div>
        </div>

        {/* Today's Cases */}
        <div 
          onClick={() => onNavigate('dispatch')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400">આજના કેસ</div>
            <div className="text-xl font-black text-amber-300">
              {data?.metrics?.total_cases ?? 0}
            </div>
            <div className="text-[10px] text-amber-400 font-semibold">દવા અને બોટલ</div>
          </div>
        </div>

        {/* Pending POD */}
        <div 
          onClick={() => onNavigate('driver')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex items-center gap-3 active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400">ડ્રાઈવર POD</div>
            <div className="text-xl font-black text-purple-300">
              {data?.print_summary?.pending ?? 0}
            </div>
            <div className="text-[10px] text-purple-400 font-semibold">ડિલિવરી ટ્રેક</div>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY ACTION: 1-TAP FAST ENVELOPE PRINT */}
      <button
        onClick={() => onNavigate('print')}
        className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl p-4 shadow-xl shadow-blue-600/30 border border-blue-400/40 flex items-center justify-between active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-inner flex-shrink-0">
            <Printer className="w-7 h-7 text-amber-300" />
          </div>
          <div className="text-left">
            <div className="text-base font-black text-white flex items-center gap-2">
              <span>ઝડપી કવર પ્રિન્ટ</span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 animate-pulse">
                FAST
              </span>
            </div>
            <div className="text-xs text-blue-100 font-semibold">
              પાર્ટી પસંદ કરો અને તરત જ પ્રિન્ટ કરો
            </div>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>

      {/* 4. QUICK ACTION SHORTCUTS GRID */}
      <div>
        <div className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2.5 px-1">
          ઝડપી શોર્ટકટ્સ (Quick Shortcuts)
        </div>
        <div className="grid grid-cols-3 gap-2">
          {/* Search Party */}
          <button
            onClick={() => onNavigate('parties')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-1.5">
              <Search className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">શોધો</span>
            <span className="text-[9px] text-slate-400">Search</span>
          </button>

          {/* Add New Party */}
          <button
            onClick={() => onNavigate('parties', { openAddModal: true })}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">નવી પાર્ટી</span>
            <span className="text-[9px] text-slate-400">Add Party</span>
          </button>

          {/* Delivery POD */}
          <button
            onClick={() => onNavigate('driver')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1.5">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">ડ્રાઈવર POD</span>
            <span className="text-[9px] text-slate-400">Driver</span>
          </button>

          {/* Dispatch Summary */}
          <button
            onClick={() => onNavigate('dispatch')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-1.5">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">સમરી</span>
            <span className="text-[9px] text-slate-400">Summary</span>
          </button>

          {/* Route Manager */}
          <button
            onClick={() => onNavigate('parties', { openRouteManager: true })}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-1.5">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">રૂટ મેનેજર</span>
            <span className="text-[9px] text-slate-400">Routes</span>
          </button>

          {/* All Parties Map */}
          <button
            onClick={() => onNavigate('map')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-emerald-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-1.5">
              <Map className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">પાર્ટી મેપ</span>
            <span className="text-[9px] text-emerald-400 font-semibold">Map</span>
          </button>

          {/* History */}
          <button
            onClick={() => onNavigate('history')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 active:bg-blue-600 active:text-white transition-all shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-1.5">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">ઇતિહાસ</span>
            <span className="text-[9px] text-slate-400">History</span>
          </button>
        </div>
      </div>

      {/* 5. RECENT PRINTS CAROUSEL WITH 1-TAP REPRINT & WHATSAPP */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
            તાજેતરના કવર (Recent Envelopes)
          </span>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-bold text-blue-400 hover:text-blue-300"
          >
            બધા જુઓ →
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs">
            આજે હજુ સુધી કોઈ કવર પ્રિન્ટ થયા નથી.
          </div>
        ) : (
          <div className="space-y-2">
            {recentJobs.slice(0, 5).map((job) => {
              const partyName = job.party_name || 'Party';
              const partyGu = job.party_name_gu || '';
              const cases = job.total_cases ?? 1;
              const dateStr = job.created_at ? new Date(job.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
              const waUrl = job.mobile 
                ? generateWhatsAppDispatchUrl({
                    partyName: job.party_name,
                    partyNameGu: job.party_name_gu || undefined,
                    phone: job.mobile,
                    jobNumber: job.job_number,
                    totalCases: cases,
                    city: job.city
                  }, 'gu') 
                : null;

              return (
                <div
                  key={job.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {job.party_code || 'MARG'}
                      </span>
                      <span className="text-[10px] text-slate-400">{dateStr}</span>
                    </div>
                    <div className="font-extrabold text-sm text-white truncate mt-1">
                      {partyGu ? `${partyGu} (${partyName})` : partyName}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="text-amber-400 font-bold">{cases} કેસ</span>
                      {job.city && (
                        <span>• {job.city}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Reprint Button */}
                    <button
                      onClick={() => onNavigate('print', { reprintJob: job })}
                      className="p-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1"
                      title="Reprint Envelope"
                    >
                      <Printer className="w-4 h-4" />
                      <span className="text-[11px]">ફરી</span>
                    </button>

                    {/* WhatsApp Button */}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-emerald-600 text-white active:scale-95 transition-all"
                        title="Share on WhatsApp"
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
    </div>
  );
};
