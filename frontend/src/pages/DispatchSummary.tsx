import React, { useState, useEffect } from "react";
import { 
  ClipboardList, 
  Printer, 
  Download, 
  Calendar, 
  UserCheck, 
  MapPin, 
  Truck, 
  CheckCircle2, 
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  X,
  Languages,
  Sparkles,
  MessageSquare,
  Clock,
  LayoutGrid,
  List,
  Phone,
  Navigation,
  User
} from "lucide-react";
import { fetchDispatchSummary, updateDispatchJobs, downloadDispatchSummaryPDF, printDispatchSummaryPDF } from "../api/client";
import { DispatchSummaryData, DispatchSummaryJob } from "../types";
import { formatCaseBreakdownItem } from "../print/EnvelopeTemplate";
import { generateWhatsAppDispatchUrl } from "../utils/whatsapp";

export const DispatchSummary: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [language, setLanguage] = useState<"en" | "gu">("en");
  
  const [data, setData] = useState<DispatchSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Selection for bulk assigning driver or route
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [assignDriverName, setAssignDriverName] = useState<string>("");
  const [assignRouteName, setAssignRouteName] = useState<string>("");
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    return (localStorage.getItem('envelope_dispatch_view_mode') as 'cards' | 'table') || 'cards';
  });

  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('envelope_dispatch_view_mode', mode);
  };

  const handleToggleDeliveryStatus = async (job: DispatchSummaryJob) => {
    const nextStatus = job.delivery_status === 'Delivered' ? 'Pending' : 'Delivered';
    try {
      // Optimistic state update
      setData((prev) => {
        if (!prev) return prev;
        const updatedDispatches = prev.dispatches.map((d) => {
          if (d.id === job.id) {
            return {
              ...d,
              delivery_status: nextStatus,
              delivered_by: nextStatus === 'Delivered' ? (d.delivery_boy_name || 'Dispatcher') : null,
              delivered_at: nextStatus === 'Delivered' ? new Date().toISOString() : null,
            };
          }
          return d;
        });
        const deliveredCases = updatedDispatches
          .filter((d) => d.delivery_status === 'Delivered')
          .reduce((acc, curr) => acc + (curr.total_cases || 1), 0);
        const deliveredParties = updatedDispatches.filter((d) => d.delivery_status === 'Delivered').length;
        const pendingCases = updatedDispatches
          .filter((d) => d.delivery_status !== 'Delivered')
          .reduce((acc, curr) => acc + (curr.total_cases || 1), 0);
        const pendingParties = updatedDispatches.length - deliveredParties;

        return {
          ...prev,
          dispatches: updatedDispatches,
          delivered_cases: deliveredCases,
          delivered_parties: deliveredParties,
          pending_cases: pendingCases,
          pending_parties: pendingParties,
        };
      });

      await updateDispatchJobs({
        job_ids: [job.id],
        delivery_status: nextStatus,
      });
    } catch (err: any) {
      alert('Failed to update delivery status: ' + err.message);
      await loadSummary();
    }
  };

  const translateCaseToGu = (text: string): string => {
    if (!text) return text;
    // Strictly do NOT translate fluid cases like NS 100ML CASE: 1, DNS 100ML CASE: 1, etc.
    if (/\b(NS|DNS|RL|METRO)\b/i.test(text) || /\bCASE\b/i.test(text)) {
      return text;
    }
    return text
      .replace(/\bSTANDARD CASE\b/gi, "સ્ટાન્ડર્ડ કેસ")
      .replace(/\bPARCEL BAG\b/gi, "પાર્સલ બેગ")
      .replace(/\bBAG\b/gi, "બેગ")
      .replace(/\bBOX\b/gi, "બોક્સ");
  };

  const loadSummary = async () => {
    setIsLoading(true);
    try {
      const res = await fetchDispatchSummary({
        date: selectedDate,
        delivery_boy: selectedDriver || undefined,
        route: selectedRoute || undefined,
        language: language,
      });
      setData(res);
      setSelectedJobIds([]);
    } catch (err: any) {
      console.error("Failed to load dispatch summary:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [selectedDate, selectedDriver, selectedRoute, language]);

  // Handle assigning driver / route
  const handleAssignDriver = async () => {
    if (selectedJobIds.length === 0) {
      alert(language === "gu" ? "કૃપા કરીને સોંપવા માટે ઓછામાં ઓછી એક પાર્ટી/જોબ પસંદ કરો." : "Please select at least one party/job to assign.");
      return;
    }
    if (!assignDriverName.trim() && !assignRouteName.trim()) {
      alert(language === "gu" ? "કૃપા કરીને ડ્રાઈવરનું નામ અથવા રૂટ દાખલ કરો." : "Please enter a driver name or route.");
      return;
    }

    setIsUpdating(true);
    try {
      await updateDispatchJobs({
        job_ids: selectedJobIds,
        delivery_boy_name: assignDriverName.trim() || undefined,
        delivery_route: assignRouteName.trim() || undefined,
      });
      setAssignDriverName("");
      setAssignRouteName("");
      await loadSummary();
    } catch (err: any) {
      alert("Failed to update: " + err.message);
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
        language: language,
      });
    } catch (err: any) {
      alert("Failed to download PDF: " + err.message);
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
        language: language,
      });
    } catch (err: any) {
      alert("Failed to print run-sheet: " + err.message);
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
      (d.party_name_gu || "").toLowerCase().includes(q) ||
      (d.city || "").toLowerCase().includes(q) ||
      (d.city_gu || "").toLowerCase().includes(q) ||
      (d.mobile || "").includes(q) ||
      (d.delivery_boy_name || "").toLowerCase().includes(q) ||
      (d.delivery_route || "").toLowerCase().includes(q)
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

  const isGu = language === "gu";

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
                {isGu ? "ડ્રાઈવર ડિસ્પેચ રન શીટ (Driver Dispatch Summary)" : "Driver Dispatch Summary"}
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                {isGu 
                  ? "ડ્રાઈવર માટે દૈનિક રન-શીટ અને ગ્રાહક ચકાસણી મેનિફેસ્ટ" 
                  : "Daily run-sheet & customer verification manifest for drivers"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Language Selector, Print Run-Sheet & PDF */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Language Selector (English vs Gujarati) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setLanguage("en")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                language === "en"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="English Dispatch Summary"
            >
              <span>English</span>
            </button>
            <button
              onClick={() => setLanguage("gu")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                language === "gu"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="ગુજરાતી ડિસ્પેચ સમરી"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-100" />
              <span>ગુજરાતી</span>
            </button>
          </div>

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
            <RefreshCw className={`w-4 h-4 ${isLoading ? "motion-safe:animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => handleDownloadPDF(false)}
            disabled={isDownloading || !data || data.dispatches.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>
              {isDownloading
                ? (isGu ? "જનરેટ થઈ રહ્યું છે…" : "Generating…")
                : selectedJobIds.length > 0
                ? (isGu ? `પસંદ કરેલ PDF (${selectedJobIds.length})` : `Download Selected PDF (${selectedJobIds.length})`)
                : (isGu ? "PDF ડાઉનલોડ (PDF)" : "Download PDF Run-Sheet")}
            </span>
          </button>

          <button
            onClick={() => handlePrintRunSheet(false)}
            disabled={!data || data.dispatches.length === 0}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>
              {selectedJobIds.length > 0
                ? (isGu ? `પસંદ કરેલ પ્રિન્ટ (${selectedJobIds.length})` : `PRINT SELECTED (${selectedJobIds.length})`)
                : (isGu ? "ડિસ્પેચ રન શીટ પ્રિન્ટ (PRINT)" : "PRINT RUN-SHEET")}
            </span>
          </button>
        </div>
      </div>

      {/* 2. KPIs & Summary Stats Bar */}
      {(() => {
        const deliveredCases = filteredDispatches
          .filter((d) => d.delivery_status === "Delivered")
          .reduce((acc, curr) => acc + (curr.total_cases || 1), 0);
        const deliveredParties = filteredDispatches.filter((d) => d.delivery_status === "Delivered").length;
        const pendingCases = filteredDispatches
          .filter((d) => d.delivery_status !== "Delivered")
          .reduce((acc, curr) => acc + (curr.total_cases || 1), 0);
        const pendingParties = filteredDispatches.length - deliveredParties;

        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* KPI 1: Total Stops / Parties */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-lg border border-blue-100 shrink-0">
                  {data?.total_parties || 0}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">
                    {isGu ? "કુલ સ્ટોપ (પાર્ટી)" : "Total Stops (Parties)"}
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {data?.total_packages || 0} {isGu ? "કુલ કેસ" : "Total Cases"}
                  </div>
                </div>
              </div>

              {/* KPI 2: Delivered Cases & Parties */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-lg border border-emerald-300 shrink-0">
                  {deliveredCases}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{isGu ? "ડિલિવર થયેલ કેસ" : "Delivered Cases"}</span>
                  </div>
                  <div className="text-sm font-black text-emerald-950">
                    {deliveredParties} {isGu ? "પાર્ટી પૂર્ણ" : "Parties Completed"}
                  </div>
                </div>
              </div>

              {/* KPI 3: Pending Delivery Cases */}
              <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-lg border border-amber-300 shrink-0">
                  {pendingCases}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>{isGu ? "ડિલિવરી બાકી કેસ" : "Pending Cases"}</span>
                  </div>
                  <div className="text-sm font-black text-amber-950">
                    {pendingParties} {isGu ? "પાર્ટી બાકી" : "Parties Pending"}
                  </div>
                </div>
              </div>

              {/* KPI 4: Completion Rate */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-black text-sm border border-slate-200 shrink-0">
                  {data?.total_packages ? Math.round((deliveredCases / data.total_packages) * 100) : 0}%
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">
                    {isGu ? "પૂર્ણતા દર" : "Delivery Completion"}
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {deliveredCases}/{data?.total_packages || 0} {isGu ? "કેસ પૂરા" : "Cases Done"}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Controls Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Filter: Date Selector */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-600" />
                  <span>{isGu ? "તારીખ (Date)" : "Dispatch Date"}</span>
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-extrabold text-slate-900 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Filter: Driver Name */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-emerald-600" />
                  <span>{isGu ? "ડ્રાઈવર ફિલ્ટર (Driver)" : "Filter Driver"}</span>
                </span>
                <select
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 text-xs bg-slate-50 focus:bg-white"
                >
                  <option value="">{isGu ? "બધા ડ્રાઈવર (All Drivers)" : "All Drivers"}</option>
                  {(data?.available_delivery_boys || []).map((boy) => (
                    <option key={boy} value={boy}>{boy}</option>
                  ))}
                </select>
              </div>

              {/* Filter: Route Wise */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-purple-600" />
                  <span>{isGu ? "રૂટ ફિલ્ટર (Route)" : "Filter Route"}</span>
                </span>
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 text-xs bg-slate-50 focus:bg-white"
                >
                  <option value="">{isGu ? "બધા રૂટ (All Routes)" : "All Routes"}</option>
                  {(data?.available_routes || []).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Case Types Breakdown Banner */}
      {data && data.breakdown_totals && Object.keys(data.breakdown_totals).length > 0 && (
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center gap-4">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-r border-slate-700 pr-4">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <span>{isGu ? "ડિસ્પેચ કેસ વિગત ગણતરી:" : "Dispatched Items Breakdown:"}</span>
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
              placeholder={isGu ? "પાર્ટી, શહેર, મોબાઈલ દ્વારા શોધો..." : "Search by party, city, mobile..."}
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-sm transition-colors"
                title="Print Selected Run-Sheet"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print ({selectedJobIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPDF(true)}
                disabled={isDownloading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors"
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
            placeholder={isGu ? "ડ્રાઈવરનું નામ…" : "Driver Name…"}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs w-36"
          />
          <input
            type="text"
            value={assignRouteName}
            onChange={(e) => setAssignRouteName(e.target.value)}
            placeholder={isGu ? "રૂટ / વિસ્તાર…" : "Route / Area…"}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs w-28"
          />
          <button
            onClick={handleAssignDriver}
            disabled={isUpdating || selectedJobIds.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow disabled:opacity-50 transition-colors"
          >
            {isUpdating ? "Assigning…" : (isGu ? "સોંપો (Assign)" : "Assign Driver")}
          </button>
        </div>
      </div>

      {/* View Mode & Selection Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
          <span className="text-slate-500">{isGu ? "દર્શાવેલ:" : "Showing:"}</span>
          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-extrabold">
            {filteredDispatches.length} of {data?.dispatches?.length || 0}
          </span>
          <span>{isGu ? "ડિસ્પેચ જોબ્સ" : "Dispatch Jobs"}</span>
          {selectedJobIds.length > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-black border border-purple-200">
              {selectedJobIds.length} {isGu ? "પસંદ કરેલ" : "Selected"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleViewModeChange('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{isGu ? "કાર્ડ વ્યૂ (Cards)" : "Cards View"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>{isGu ? "ટેબલ વ્યૂ (Table)" : "Table View"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Dispatches Content (Cards or Table) */}
      {viewMode === 'cards' ? (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDispatches.length > 0 ? (
            filteredDispatches.map((job, index) => {
              const isSelected = selectedJobIds.includes(job.id);
              const isDelivered = job.delivery_status === 'Delivered' || Boolean(job.delivered_by);

              // Breakdown string formatting
              const breakdownParts: string[] = [];
              if (job.case_breakdown && job.case_breakdown.length > 0) {
                job.case_breakdown.forEach((b) => {
                  if (b.qty > 0) {
                    breakdownParts.push(formatCaseBreakdownItem(b.type, b.volume, b.qty));
                  }
                });
              } else if (job.total_cases > 0) {
                breakdownParts.push(`CASE: ${job.total_cases}`);
              }

              const displayName = isGu ? (job.party_name_gu || job.party_name) : job.party_name;
              const displayCity = isGu ? (job.city_gu || job.city) : job.city;

              const waUrl = generateWhatsAppDispatchUrl({
                partyName: job.party_name,
                partyNameGu: job.party_name_gu || undefined,
                phone: job.mobile,
                jobNumber: job.job_number,
                totalCases: job.total_cases,
                caseBreakdown: job.case_breakdown,
                driverName: job.delivery_boy_name,
                deliveryRoute: job.delivery_route,
                city: job.city
              }, isGu ? 'gu' : 'en');

              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-2xl border transition-colors shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                      : isDelivered
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3.5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleJob(job.id)}
                        className="w-4 h-4 text-blue-600 rounded cursor-pointer mt-0.5"
                      />
                      <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-black text-[11px] tracking-tight">
                        #{index + 1}
                      </span>
                      <span className="font-mono text-xs font-black text-slate-800 tracking-tight">
                        {job.job_number}
                      </span>
                    </div>

                    {/* Delivery Status Badge with 1-Tap Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleDeliveryStatus(job)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold border transition-colors cursor-pointer ${
                        isDelivered
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 shadow-2xs'
                          : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-2xs'
                      }`}
                      title={isGu ? "સ્થિતિ બદલવા ક્લિક કરો" : "Click to toggle delivery status"}
                    >
                      {isDelivered ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{isGu ? "ડિલિવર થયેલ" : "Delivered"}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          <span>{isGu ? "ડિલિવરી બાકી" : "Pending"}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3 flex-1">
                    {/* Party Name & Code */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-black text-slate-900 text-base leading-tight">
                          {displayName}
                        </h3>
                        {job.party_code && (
                          <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            {job.party_code}
                          </span>
                        )}
                      </div>
                      {isGu && job.party_name_gu && job.party_name !== job.party_name_gu && (
                        <div className="text-xs text-slate-500 font-semibold mt-0.5">
                          {job.party_name}
                        </div>
                      )}
                    </div>

                    {/* Destination & Route */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-1 font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{displayCity || '-'}</span>
                      </div>

                      {job.delivery_route && (
                        <div className="flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200">
                          <Navigation className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>{job.delivery_route}</span>
                        </div>
                      )}
                    </div>

                    {/* Cases & Breakdown */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-bold text-[10px]">
                          {isGu ? "કુલ પાર્સલ / કેસ:" : "Total Packages:"}
                        </span>
                        <span className="font-black text-blue-900 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded text-xs">
                          {job.total_cases} {job.total_cases === 1 ? 'Case' : 'Cases'}
                        </span>
                      </div>

                      {breakdownParts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/60">
                          {breakdownParts.map((part, pIdx) => (
                            <span
                              key={pIdx}
                              className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-white text-blue-900 border border-blue-200 shadow-2xs"
                            >
                              {part}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assigned Driver & Delivered Info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-500 font-bold text-[11px]">
                          {isGu ? "ડ્રાઈવર:" : "Driver:"}
                        </span>
                        {job.delivery_boy_name ? (
                          <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {job.delivery_boy_name}
                          </span>
                        ) : (
                          <span className="italic text-amber-700 font-semibold text-[11px]">
                            {isGu ? "બિન-સોંપાયેલ" : "Unassigned"}
                          </span>
                        )}
                      </div>

                      {isDelivered && (job.delivered_by || job.delivered_at) && (
                        <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                          <span>By: {job.delivered_by || job.delivery_boy_name || 'Driver'}</span>
                          {job.delivered_at && (
                            <span className="text-slate-400 font-mono text-[10px]">
                              ({new Date(job.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    {/* Call party button */}
                    {job.mobile ? (
                      <a
                        href={`tel:${job.mobile}`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-extrabold text-xs border border-slate-200 shadow-2xs transition-colors"
                        title={job.mobile}
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-mono">{job.mobile}</span>
                      </a>
                    ) : (
                      <span className="flex-1 text-center text-xs text-slate-400 font-semibold italic py-2">
                        {isGu ? "મોબાઈલ નથી" : "No Phone"}
                      </span>
                    )}

                    {/* WhatsApp Alert Button */}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-colors"
                        title="Send WhatsApp Dispatch Notice"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WA Alert</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 font-semibold">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-500">
                  <RefreshCw className="w-4 h-4 motion-safe:animate-spin" />
                  <span>Loading dispatch dispatches for {selectedDate}…</span>
                </div>
              ) : (
                <div>No envelopes or print dispatches found for date {selectedDate}.</div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold text-xs">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedJobIds.length === filteredDispatches.length && filteredDispatches.length > 0}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 text-blue-600 rounded"
                    />
                  </th>
                  <th className="p-3 w-12 text-center">{isGu ? "ક્રમ (Sr.)" : "Sr."}</th>
                  <th className="p-3">{isGu ? "પાર્ટીનું નામ (Party Name)" : "Party Name"}</th>
                  <th className="p-3">{isGu ? "મુકામ / શહેર (City)" : "Destination / City"}</th>
                  <th className="p-3">{isGu ? "મોબાઈલ નં." : "Mobile No."}</th>
                  <th className="p-3">{isGu ? "કેસ વિગત" : "Case Breakdown"}</th>
                  <th className="p-3 text-center">{isGu ? "પાર્સલ" : "Pkgs"}</th>
                  <th className="p-3">{isGu ? "સોંપાયેલ ડ્રાઈવર" : "Assigned Driver"}</th>
                  <th className="p-3">{isGu ? "રૂટ" : "Route"}</th>
                  <th className="p-3 text-center">{isGu ? "ડિલિવરી સ્થિતિ / કરનાર" : "Delivery Status / By"}</th>
                  <th className="p-3 text-center">{isGu ? "વોટ્સએપ" : "WhatsApp"}</th>
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
                          breakdownParts.push(formatCaseBreakdownItem(b.type, b.volume, b.qty));
                        }
                      });
                    } else {
                      breakdownParts.push(`CASE: ${job.total_cases}`);
                    }
                    const rawBreakdown = breakdownParts.join(", ");
                    const displayBreakdown = rawBreakdown;

                    const displayName = isGu ? (job.party_name_gu || job.party_name) : job.party_name;
                    const displayCity = isGu ? (job.city_gu || job.city) : job.city;

                    return (
                      <tr
                        key={job.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isSelected ? "bg-blue-50/70" : ""
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
                          <div className={isGu ? "text-slate-950 font-black text-sm" : ""}>{displayName}</div>
                          {isGu && job.party_name_gu && (
                            <div className="text-[10px] text-slate-500 font-bold">{job.party_name}</div>
                          )}
                          {job.party_code && (
                            <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                              {job.party_code}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-700">
                          <div>{displayCity}</div>
                          {isGu && job.city_gu && job.city_gu !== job.city && (
                            <div className="text-[10px] text-slate-400 font-semibold">{job.city}</div>
                          )}
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-600">
                          {job.mobile || "-"}
                        </td>
                        <td className="p-3 font-bold text-blue-900">
                          <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {displayBreakdown}
                          </span>
                        </td>
                        <td className="p-3 text-center font-black text-slate-900 text-sm">
                          {job.total_cases}
                        </td>
                        <td className="p-3 font-bold text-slate-800">
                          {job.delivery_boy_name ? (
                            <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 font-bold text-xs">
                              {job.delivery_boy_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">
                              {isGu ? "બિન-સોંપાયેલ" : "Unassigned"}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-600">
                          {job.delivery_route || "-"}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleDeliveryStatus(job)}
                            className="inline-flex cursor-pointer text-left focus:outline-none"
                            title={isGu ? "સ્થિતિ બદલવા ક્લિક કરો" : "Click to toggle delivery status"}
                          >
                            {job.delivery_status === 'Delivered' || job.delivered_by ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs hover:bg-emerald-200 transition-colors">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>{isGu ? "ડિલિવર થયેલ" : "Delivered"}</span>
                                </span>
                                <div className="text-[11px] font-extrabold text-emerald-950 flex items-center justify-center gap-1">
                                  <span className="text-slate-500 font-semibold">{isGu ? "દ્વારા:" : "By:"}</span>
                                  <span className="bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded border border-emerald-200 font-bold flex items-center gap-1">
                                    <User className="w-3 h-3 text-emerald-700 shrink-0" />
                                    <span>{job.delivered_by || job.delivery_boy_name || "Driver"}</span>
                                  </span>
                                </div>
                                {job.delivered_at && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {new Date(job.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors">
                                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>{isGu ? "બાકી (Pending)" : "Pending Delivery"}</span>
                                </span>
                              </div>
                            )}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          {(() => {
                            const waUrl = generateWhatsAppDispatchUrl({
                              partyName: job.party_name,
                              partyNameGu: job.party_name_gu || undefined,
                              phone: job.mobile,
                              jobNumber: job.job_number,
                              totalCases: job.total_cases,
                              caseBreakdown: job.case_breakdown,
                              driverName: job.delivery_boy_name,
                              deliveryRoute: job.delivery_route,
                              city: job.city
                            }, isGu ? 'gu' : 'en');
                            return waUrl ? (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 rounded-md text-[11px] font-bold border border-emerald-300 transition-colors shadow-xs"
                                title="Send WhatsApp Dispatch Notice"
                              >
                                <MessageSquare className="w-3 h-3 text-emerald-600" />
                                <span>WA Alert</span>
                              </a>
                            ) : (
                              <span className="text-slate-300 text-[10px]">-</span>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-400 font-semibold">
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <RefreshCw className="w-4 h-4 motion-safe:animate-spin" />
                          <span>Loading dispatch dispatches for {selectedDate}…</span>
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
      )}
    </div>
  );
};
