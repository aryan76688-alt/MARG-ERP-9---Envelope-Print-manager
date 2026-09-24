import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Printer, 
  Download, 
  Calendar, 
  UserCheck, 
  MapPin, 
  Truck, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  FileText,
  X
} from 'lucide-react';
import { fetchDispatchSummary, updateDispatchJobs, downloadDispatchSummaryPDF, printDispatchSummaryPDF } from '../api/client';
import { DispatchSummaryData, DispatchSummaryJob } from '../types';

export const DispatchSummary: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [data, setData] = useState<DispatchSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Selection for bulk assigning driver or route
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [assignDriverName, setAssignDriverName] = useState<string>('');
  const [assignRouteName, setAssignRouteName] = useState<string>('');

  const loadSummary = async () => {
    setIsLoading(true);
    try {
      const res = await fetchDispatchSummary({
        date: selectedDate,
        delivery_boy: selectedDriver || undefined,
        route: selectedRoute || undefined,
      });
      setData(res);
      setSelectedJobIds([]);
    } catch (err: any) {
      console.error('Failed to load dispatch summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [selectedDate, selectedDriver, selectedRoute]);

  // Handle assigning delivery boy / route
  const handleAssignDriver = async () => {
    if (selectedJobIds.length === 0) {
      alert('Please select at least one party/job to assign.');
      return;
    }
    if (!assignDriverName.trim() && !assignRouteName.trim()) {
      alert('Please enter a delivery boy name or route.');
      return;
    }

    setIsUpdating(true);
    try {
      await updateDispatchJobs({
        job_ids: selectedJobIds,
        delivery_boy_name: assignDriverName.trim() || undefined,
        delivery_route: assignRouteName.trim() || undefined,
      });
      setAssignDriverName('');
      setAssignRouteName('');
      await loadSummary();
    } catch (err: any) {
      alert('Failed to update: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Download printable PDF run-sheet (supports route and selected parties)
  const handleDownloadPDF = async (onlySelected = false) => {
    setIsDownloading(true);
    try {
      await downloadDispatchSummaryPDF({
        date: selectedDate,
        delivery_boy: selectedDriver || undefined,
        route: selectedRoute || undefined,
        job_ids: (onlySelected || selectedJobIds.length > 0) ? selectedJobIds : undefined,
      });
    } catch (err: any) {
      alert('Failed to download PDF: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Direct Vector PDF print run-sheet (never blank, supports route & selected parties)
  const handlePrintRunSheet = async (onlySelected = false) => {
    setIsDownloading(true);
    try {
      await printDispatchSummaryPDF({
        date: selectedDate,
        delivery_boy: selectedDriver || undefined,
        route: selectedRoute || undefined,
        job_ids: (onlySelected || selectedJobIds.length > 0) ? selectedJobIds : undefined,
      });
    } catch (err: any) {
      alert('Failed to print run-sheet: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Filtered dispatches
  const filteredDispatches = (data?.dispatches || []).filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.party_name.toLowerCase().includes(q) ||
      (d.city || '').toLowerCase().includes(q) ||
      (d.mobile || '').includes(q) ||
      (d.delivery_boy_name || '').toLowerCase().includes(q)
    );
  });

  const toggleSelectAll = () => {
    if (selectedJobIds.length === filteredDispatches.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(filteredDispatches.map((d) => d.id));
    }
  };

  const toggleJob = (id: number) => {
    setSelectedJobIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-12">
      {/* 1. Header & Quick Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Delivery Boy Dispatch Summary
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Daily run-sheet & customer verification manifest for delivery boys
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Print Run-Sheet & PDF */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {selectedJobIds.length > 0 && (
            <button
              onClick={() => setSelectedJobIds([])}
              className="px-2.5 py-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1"
              title="Clear Selection"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear ({selectedJobIds.length})</span>
            </button>
          )}

          <button
            onClick={loadSummary}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => handleDownloadPDF(false)}
            disabled={isDownloading || !data || data.dispatches.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all hover:scale-102 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>
              {isDownloading
                ? 'Generating...'
                : selectedJobIds.length > 0
                ? `Download Selected PDF (${selectedJobIds.length})`
                : 'Download PDF Run-Sheet'}
            </span>
          </button>

          <button
            onClick={() => handlePrintRunSheet(false)}
            disabled={!data || data.dispatches.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md shadow-blue-600/30 transition-all hover:scale-102 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>
              {selectedJobIds.length > 0
                ? `PRINT SELECTED (${selectedJobIds.length})`
                : 'PRINT RUN-SHEET'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Filters & KPIs Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {/* KPI 1: Total Stops / Parties */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-xl">
            {data?.total_parties || 0}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Stops (Parties)
            </div>
            <div className="text-sm font-extrabold text-slate-900">
              For {selectedDate}
            </div>
          </div>
        </div>

        {/* KPI 2: Total Packages */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xl">
            {data?.total_packages || 0}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Packages / Cases
            </div>
            <div className="text-sm font-extrabold text-slate-900">
              Ready for Dispatch
            </div>
          </div>
        </div>

        {/* Filter: Date Selector */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <Calendar className="w-3 h-3 text-blue-600" />
            <span>Dispatch Date</span>
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-extrabold text-slate-900 text-xs bg-slate-50 focus:bg-white"
          />
        </div>

        {/* Filter: Delivery Boy */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-emerald-600" />
            <span>Filter Delivery Boy</span>
          </span>
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 text-xs bg-slate-50 focus:bg-white"
          >
            <option value="">All Delivery Boys</option>
            {(data?.available_delivery_boys || []).map((boy) => (
              <option key={boy} value={boy}>{boy}</option>
            ))}
          </select>
        </div>

        {/* Filter: Route Wise */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <MapPin className="w-3 h-3 text-purple-600" />
            <span>Filter Route</span>
          </span>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 text-xs bg-slate-50 focus:bg-white"
          >
            <option value="">All Routes</option>
            {(data?.available_routes || []).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Case Types Breakdown Banner */}
      {data && data.breakdown_totals && Object.keys(data.breakdown_totals).length > 0 && (
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center gap-4">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-200 flex items-center gap-1.5 border-r border-slate-700 pr-4">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <span>Dispatched Items Breakdown:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(data.breakdown_totals).map(([name, qty]) => (
              <span
                key={name}
                className="bg-white/10 border border-white/20 px-3 py-1 rounded-lg text-xs font-bold tracking-tight text-white flex items-center gap-1.5"
              >
                <span>{name}:</span>
                <span className="font-black text-amber-300 bg-amber-950/60 px-1.5 py-0.2 rounded">
                  {qty}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Bulk Assign ToolBar (Assign Driver / Route to selected dispatches) */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 font-extrabold text-slate-700 hover:text-slate-900"
          >
            {selectedJobIds.length === filteredDispatches.length && filteredDispatches.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>Select All ({selectedJobIds.length}/{filteredDispatches.length})</span>
          </button>

          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by party, city, mobile..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800 text-xs"
            />
          </div>
        </div>

        {/* Quick Assign & Actions Form */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {selectedJobIds.length > 0 && (
            <div className="flex items-center gap-1.5 border-r border-slate-300 pr-2 mr-1">
              <button
                type="button"
                onClick={() => handlePrintRunSheet(true)}
                disabled={isDownloading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-sm transition-all"
                title="Print Selected Run-Sheet"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print ({selectedJobIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPDF(true)}
                disabled={isDownloading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
                title="Download Selected Run-Sheet PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          )}
          <input
            type="text"
            value={assignDriverName}
            onChange={(e) => setAssignDriverName(e.target.value)}
            placeholder="Delivery Boy Name..."
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs w-36"
          />
          <input
            type="text"
            value={assignRouteName}
            onChange={(e) => setAssignRouteName(e.target.value)}
            placeholder="Route / Area..."
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs w-28"
          />
          <button
            onClick={handleAssignDriver}
            disabled={isUpdating || selectedJobIds.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow disabled:opacity-50"
          >
            {isUpdating ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>

      {/* 4. Dispatches Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.length === filteredDispatches.length && filteredDispatches.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 text-blue-600 rounded"
                  />
                </th>
                <th className="p-3 w-12 text-center">Sr.</th>
                <th className="p-3">Party Name</th>
                <th className="p-3">Destination / City</th>
                <th className="p-3">Mobile No.</th>
                <th className="p-3">Case Breakdown</th>
                <th className="p-3 text-center">Pkgs</th>
                <th className="p-3">Delivery Boy</th>
                <th className="p-3">Route</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredDispatches.length > 0 ? (
                filteredDispatches.map((job, index) => {
                  const isSelected = selectedJobIds.includes(job.id);
                  
                  // Breakdown string formatting
                  const breakdownParts: string[] = [];
                  if (job.case_breakdown && job.case_breakdown.length > 0) {
                    job.case_breakdown.forEach((b) => {
                      if (b.qty > 0) {
                        const v = b.volume ? ` ${b.volume}` : '';
                        breakdownParts.push(`${b.type}${v}: ${b.qty}`);
                      }
                    });
                  } else {
                    breakdownParts.push(`CASE: ${job.total_cases}`);
                  }
                  const breakdownStr = breakdownParts.join(', ');

                  return (
                    <tr
                      key={job.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleJob(job.id)}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                      </td>
                      <td className="p-3 text-center font-bold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="p-3 font-extrabold text-slate-900">
                        <div>{job.party_name}</div>
                        {job.party_code && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {job.party_code}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-700">
                        {job.city}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-600">
                        {job.mobile || '-'}
                      </td>
                      <td className="p-3 font-bold text-blue-900">
                        <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {breakdownStr}
                        </span>
                      </td>
                      <td className="p-3 text-center font-black text-slate-900 text-sm">
                        {job.total_cases}
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        {job.delivery_boy_name ? (
                          <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-extrabold">
                            {job.delivery_boy_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-600">
                        {job.delivery_route || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800">
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          <span>{job.status}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 font-semibold">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Loading dispatch dispatches for {selectedDate}...</span>
                      </div>
                    ) : (
                      <div>No envelopes or print dispatches found for date {selectedDate}.</div>
                    )}
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
