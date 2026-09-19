import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Printer, 
  Package, 
  Layers, 
  Calendar, 
  TrendingUp, 
  ArrowUpRight, 
  Plus, 
  FileSpreadsheet, 
  History, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { DashboardData } from '../types';
import { fetchDashboard } from '../api/client';

interface DashboardProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterPeriod, setFilterPeriod] = useState<string>('this_month');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadData = async (period: string) => {
    try {
      setRefreshing(true);
      const res = await fetchDashboard(period);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(filterPeriod);
  }, [filterPeriod]);

  const statCards = [
    {
      title: 'TOTAL PARTIES',
      value: data?.metrics.total_parties ?? 0,
      icon: Users,
      color: 'blue',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      action: () => onNavigate('parties'),
    },
    {
      title: 'TOTAL ENVELOPES PRINTED',
      value: data?.metrics.total_envelopes_printed ?? 0,
      icon: Printer,
      color: 'emerald',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      action: () => onNavigate('history'),
    },
    {
      title: 'TOTAL CASES',
      value: data?.metrics.total_cases ?? 0,
      icon: Package,
      color: 'purple',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      action: () => onNavigate('history'),
    },
    {
      title: 'PRINT JOBS',
      value: data?.metrics.print_jobs ?? 0,
      icon: Layers,
      color: 'amber',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      action: () => onNavigate('history'),
    },
    {
      title: "TODAY'S PRINTS",
      value: data?.metrics.todays_prints ?? 0,
      icon: Calendar,
      color: 'sky',
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-200',
      action: () => onNavigate('print'),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Dispatch Dashboard</h2>
          <p className="text-xs text-slate-500 font-medium">Real-time statistics & MARG courier dispatch metrics</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period Filter */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 text-xs font-semibold">
            {[
              { id: 'today', label: 'Today' },
              { id: '7_days', label: '7 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setFilterPeriod(p.id)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  filterPeriod === p.id
                    ? 'bg-white text-blue-900 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadData(filterPeriod)}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 5 Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.action}
              className={`p-4 rounded-xl bg-white border ${card.border} shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  {card.title}
                </span>
                <div className={`p-2 rounded-lg ${card.bg} ${card.text} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {loading ? '...' : card.value.toLocaleString()}
                </span>
                <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-blue-600 group-hover:underline">
                  <span>View Details</span>
                  <ArrowUpRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions Strip */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl p-5 text-white shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <span>Quick Dispatch Actions</span>
              <span className="text-[10px] bg-blue-700/80 px-2 py-0.5 rounded font-bold uppercase">Fast Track</span>
            </h3>
            <p className="text-xs text-blue-200 mt-0.5">Rapid access to high-frequency envelope management tools</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => onNavigate('print')}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white text-blue-950 font-extrabold text-xs shadow-md hover:bg-blue-50 transition-all hover:scale-105"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Print Envelope</span>
            </button>
            <button
              onClick={() => onNavigate('import')}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-800/80 hover:bg-blue-700 text-white font-bold text-xs border border-blue-600 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Excel</span>
            </button>
            <button
              onClick={() => onNavigate('parties', { openAddModal: true })}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-800/80 hover:bg-blue-700 text-white font-bold text-xs border border-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Party</span>
            </button>
            <button
              onClick={() => onNavigate('history')}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-800/80 hover:bg-blue-700 text-white font-bold text-xs border border-blue-600 transition-colors"
            >
              <History className="w-4 h-4" />
              <span>View History</span>
            </button>
          </div>
        </div>
      </div>

      {/* Middle Grid: Charts & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Print Summary Chart (Left 1 col) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>Print Status Summary</span>
              </h3>
              <span className="text-[11px] font-bold text-slate-400">Database Breakdown</span>
            </div>

            <div className="space-y-4">
              {/* Printed */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Successfully Printed
                  </span>
                  <span className="text-slate-900">{data?.print_summary.printed ?? 0}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data?.print_summary.printed ? Math.min(100, Math.max(10, (data.print_summary.printed / (data.metrics.print_jobs || 1)) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>

              {/* Pending */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-amber-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    Pending Confirmation
                  </span>
                  <span className="text-slate-900">{data?.print_summary.pending ?? 0}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data?.print_summary.pending ? Math.min(100, Math.max(10, (data.print_summary.pending / (data.metrics.print_jobs || 1)) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>

              {/* Failed */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-red-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    Failed / Cancelled
                  </span>
                  <span className="text-slate-900">{data?.print_summary.failed ?? 0}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data?.print_summary.failed ? Math.min(100, Math.max(10, (data.print_summary.failed / (data.metrics.print_jobs || 1)) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-6 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Overall Success Rate:</span>
            <span className="font-extrabold text-emerald-600">
              {data && data.metrics.print_jobs > 0 
                ? `${Math.round((data.print_summary.printed / data.metrics.print_jobs) * 100)}%` 
                : '100%'}
            </span>
          </div>
        </div>

        {/* Print Trend Chart (Right 2 cols) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Cases Dispatched (Last 7 Days)</span>
            </h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              Actual Database Records
            </span>
          </div>

          {/* SVG Bar Chart */}
          <div className="h-44 flex items-end justify-between gap-2 pt-4 px-2">
            {data?.trend.labels.map((label, idx) => {
              const val = data.trend.data[idx] || 0;
              const maxVal = Math.max(5, ...data.trend.data);
              const heightPercent = Math.max(12, (val / maxVal) * 100);

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[11px] font-black text-slate-700 opacity-80 group-hover:opacity-100">
                    {val}
                  </span>
                  <div className="w-full max-w-[48px] bg-slate-100 rounded-t-md relative flex items-end h-32 overflow-hidden">
                    <div
                      className="w-full bg-blue-600 group-hover:bg-blue-500 rounded-t-md transition-all duration-300 shadow-sm"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Peak Day Output: High volume courier dispatches</span>
            <button onClick={() => onNavigate('print')} className="font-bold text-blue-600 hover:underline">
              Create New Job &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">Recent Print Activity</h3>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
          >
            View Complete History &rarr;
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Time & Date</th>
                <th className="px-5 py-3">Job ID</th>
                <th className="px-5 py-3">Party Name</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Cases</th>
                <th className="px-5 py-3">Weight</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {data?.recent_activity && data.recent_activity.length > 0 ? (
                data.recent_activity.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-600">{item.time}</td>
                    <td className="px-5 py-3 font-mono font-bold text-blue-900">{item.job_number}</td>
                    <td className="px-5 py-3 font-extrabold text-slate-950">{item.party_name}</td>
                    <td className="px-5 py-3 text-slate-600">{item.action}</td>
                    <td className="px-5 py-3 font-bold text-blue-800">{item.cases} Case(s)</td>
                    <td className="px-5 py-3 font-semibold text-slate-700">{item.weight}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    No recent print activities. Go to Print Envelope to create your first courier envelope!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
