import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  Upload,
  FileSpreadsheet,
  Printer, 
  Eye, 
  RotateCcw, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Package,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Edit3,
  MessageSquare,
  Mail,
  LayoutGrid,
  List,
  MapPin,
  Phone,
  Truck,
  Clock
} from 'lucide-react';
import { PrintJob, PrintJobDetails } from '../types';
import { 
  fetchPrintJobs, 
  fetchPrintJobDetails, 
  deletePrintJob, 
  downloadEnvelopePDF, 
  getExportHistoryUrl,
  sendGmailDispatchSummary,
  sendGmailInvoice,
  importPrintJobs
} from '../api/client';
import { getCachedPrintJobs, setCachedPrintJobs } from '../offline/db';
import { JobDetailsModal } from '../components/JobDetailsModal';
import { generateWhatsAppDispatchUrl } from '../utils/whatsapp';

interface PrintHistoryProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const PrintHistory: React.FC<PrintHistoryProps> = ({ onNavigate }) => {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [pages, setPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [uniquePerDay, setUniquePerDay] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    return (localStorage.getItem('envelope_history_view_mode') as 'cards' | 'table') || 'cards';
  });

  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('envelope_history_view_mode', mode);
  };

  // Selected job for modal
  const [selectedJob, setSelectedJob] = useState<PrintJobDetails | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<PrintJob | null>(null);
  const [emailingSummary, setEmailingSummary] = useState<boolean>(false);
  const [emailingJobId, setEmailingJobId] = useState<number | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await importPrintJobs(file);
      if (res.success) {
        alert(res.message || `Imported ${res.imported} print records successfully!`);
        loadJobs();
      } else {
        alert('Import failed: ' + (res.message || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error importing file: ' + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadJobs = async (silent: boolean = false) => {
    try {
      // 1. Instant Cache Render
      if (!silent) {
        try {
          const cached = await getCachedPrintJobs();
          if (cached && cached.length > 0) {
            setJobs(cached.slice(0, limit));
            setTotal(cached.length);
            setLoading(false);
          }
        } catch {}
      }

      if (!silent) setLoading(true);
      const res = await fetchPrintJobs({
        page,
        limit,
        search,
        status: statusFilter,
        parcel_type: typeFilter,
        date_from: dateFrom,
        date_to: dateTo,
        unique_per_day: uniquePerDay,
      });
      if (res && res.items) {
        setJobs(res.items);
        setTotal(res.total);
        setPages(res.pages);
        setCachedPrintJobs(res.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadJobs();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, statusFilter, typeFilter, dateFrom, dateTo, uniquePerDay, page, limit]);

  // Real-time Auto-Sync across all user sessions every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      loadJobs(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [search, statusFilter, typeFilter, dateFrom, dateTo, uniquePerDay, page, limit]);

  const handleViewDetails = async (jobId: number) => {
    try {
      const details = await fetchPrintJobDetails(jobId);
      setSelectedJob(details);
      setDetailsModalOpen(true);
    } catch (err: any) {
      alert('Failed to load job details: ' + err.message);
    }
  };

  const handleReprint = (job: PrintJobDetails | PrintJob) => {
    // Navigate to Print Envelope and load the party and cases
    onNavigate('print', {
      reprintJob: job,
    });
  };

  const handleDownloadPDF = async (jobId: number) => {
    try {
      await downloadEnvelopePDF({ job_id: jobId });
    } catch (err: any) {
      alert('Failed to download PDF: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmJob) return;
    try {
      await deletePrintJob(deleteConfirmJob.id);
      setDeleteConfirmJob(null);
      loadJobs();
    } catch (err: any) {
      alert('Failed to delete print job: ' + err.message);
    }
  };

  const handleEmailDispatchSummary = async () => {
    setEmailingSummary(true);
    try {
      const res = await sendGmailDispatchSummary({ limit: 50 });
      if (res.success) {
        alert('Dispatch summary report successfully sent to Gmail!');
      } else {
        alert('Failed to send email: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Email send error: ' + err.message);
    } finally {
      setEmailingSummary(false);
    }
  };

  const handleEmailInvoiceForJob = async (job: PrintJob) => {
    setEmailingJobId(job.id);
    try {
      const res = await sendGmailInvoice({
        party_name: job.party_name,
        party_id: job.party_id,
        invoice_no: job.job_number,
        cases: job.total_cases,
        transport: job.delivery_route || 'Direct Transport',
        notes: job.parcel_type
      });
      if (res.success) {
        alert(`Invoice notification sent to party / management for ${job.party_name}!`);
      } else {
        alert('Failed to send email: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Email send error: ' + err.message);
    } finally {
      setEmailingJobId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <span>Print History & Logs</span>
            <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
              {total} Print Records
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Database-backed audit trail of all courier envelopes generated, printed, and exported.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Auto-Sync: Live</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".xlsx,.xls,.csv,.json"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50/80 text-indigo-800 hover:bg-indigo-100 font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            title="Import print jobs from Excel (.xlsx/.xls), CSV, or JSON"
          >
            <Upload className={`w-4 h-4 ${importing ? 'animate-bounce text-indigo-600' : 'text-indigo-600'}`} />
            <span>{importing ? 'Importing...' : 'Import History'}</span>
          </button>

          <a
            href={getExportHistoryUrl()}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-colors"
            title="Download full history to Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export History XLSX</span>
          </a>

          <button
            onClick={handleEmailDispatchSummary}
            disabled={emailingSummary}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-800 hover:bg-blue-100 font-bold text-xs transition-colors disabled:opacity-50"
            title="Email last 50 dispatch jobs report to Gmail"
          >
            <Mail className={`w-4 h-4 ${emailingSummary ? 'animate-bounce text-blue-600' : 'text-blue-600'}`} />
            <span>{emailingSummary ? 'Emailing...' : 'Email Dispatch Report'}</span>
          </button>

          <button
            onClick={() => onNavigate('print')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>New Envelope</span>
          </button>
        </div>
      </div>

      {/* Filters Strip */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 text-xs items-center">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search job #, party name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        {/* Status */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="Printed">Printed</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
          </select>
        </div>

        {/* Parcel Type */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 bg-white"
          >
            <option value="all">All Parcel Types</option>
            <option value="Medicine">Medicine</option>
            <option value="Documents">Documents</option>
            <option value="Parcel">Parcel</option>
            <option value="Box">Box</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Date From */}
        <div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 bg-white"
          />
        </div>

        {/* Date To */}
        <div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold text-slate-700 bg-white"
          />
        </div>

        {/* Unique Party Per Day Toggle Button */}
        <div>
          <button
            type="button"
            onClick={() => {
              setUniquePerDay(!uniquePerDay);
              setPage(1);
            }}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all border ${
              uniquePerDay
                ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="When active, shows each party only once per day"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{uniquePerDay ? '✓ 1 Party / Day' : '1 Party / Day'}</span>
          </button>
        </div>
      </div>

      {/* View Mode & Count Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <span className="text-slate-500">Showing:</span>
          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-extrabold">{jobs.length} of {total}</span>
          <span>Print Jobs</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleViewModeChange('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show History in Card Layout"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards View</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show History in Table Layout"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
          </div>

          <button
            onClick={() => loadJobs()}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Refresh History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* History Container (Cards or Table) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {viewMode === 'cards' ? (
          <div className="p-4 bg-slate-50/50">
            {loading ? (
              <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <div className="inline-flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-bold text-sm">Loading print history cards...</span>
                </div>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                <Package className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
                <div className="text-sm font-extrabold text-slate-700">No print history records found</div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Printed envelopes and dispatches will appear here with parcel breakdown and re-print controls.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {jobs.map((j, idx) => {
                  let breakdown: any[] = [];
                  if (j.case_breakdown_json) {
                    try { breakdown = JSON.parse(j.case_breakdown_json); } catch {}
                  }
                  const isPrinted = j.status === 'Printed';
                  const waUrl = generateWhatsAppDispatchUrl({
                    partyName: j.party_name,
                    phone: j.mobile,
                    jobNumber: j.job_number,
                    totalCases: j.total_cases,
                    driverName: j.driver_name || j.delivery_boy_name,
                    deliveryRoute: j.delivery_route,
                    city: j.city
                  }, 'en');

                  return (
                    <div
                      key={j.id}
                      className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all p-4.5 flex flex-col justify-between group space-y-3.5 relative overflow-hidden"
                    >
                      {/* Top Bar: Sequence, Job Number, Status Badge */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            #{limit === -1 ? idx + 1 : (page - 1) * limit + idx + 1}
                          </span>
                          <span className="font-mono font-black text-xs px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200/80">
                            {j.job_number}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase ${
                            isPrinted ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {j.status}
                          </span>
                        </div>
                      </div>

                      {/* Party Name & Location */}
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-black text-slate-900 text-sm leading-snug tracking-tight">
                            {j.party_name}
                          </h3>
                          {j.party_code && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              {j.party_code}
                            </span>
                          )}
                        </div>
                        {j.party_name_gu && (
                          <div className="text-xs font-semibold text-slate-600 font-noto-gujarati">
                            {j.party_name_gu}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{j.city}, {j.state}</span>
                          {j.delivery_route && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 ml-auto shrink-0">
                              {j.delivery_route}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cases & Breakdown Strip */}
                      <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/60 space-y-2">
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="flex items-center gap-1.5 text-blue-900">
                            <Package className="w-4 h-4 text-blue-600" />
                            <span>{j.total_cases === 0 ? 'Address Only (0 Cases)' : `${j.total_cases} Case(s)`}</span>
                          </span>
                          <span className="text-emerald-700 font-bold text-[11px]">
                            {j.total_weight.toFixed(2)} KG
                          </span>
                        </div>

                        {/* Breakdown Tags */}
                        {breakdown && breakdown.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/50">
                            {breakdown.map((b: any, bIdx: number) => (
                              <span
                                key={bIdx}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 shadow-2xs"
                              >
                                {b.type}{b.volume ? ` ${b.volume}` : ''}: <strong className="text-blue-700">{b.qty}</strong>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-1">
                          <span>Format: <strong className="text-slate-700">{j.envelope_size}</strong></span>
                          <span className="truncate max-w-[130px]" title={j.printer_name}>🖨️ {j.printer_name}</span>
                        </div>
                      </div>

                      {/* Driver & Creation Meta */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 font-medium">
                        <div className="flex items-center gap-1 truncate">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{j.created_at}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          @{j.created_by || 'Admin'}
                        </span>
                      </div>

                      {/* Action Buttons Toolbar */}
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                        <button
                          onClick={() => handleReprint(j)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-black text-xs shadow-sm hover:shadow transition-all"
                          title="Edit Envelope & Reprint"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit & Reprint</span>
                        </button>

                        <button
                          onClick={() => handleDownloadPDF(j.id)}
                          className="p-2 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors"
                          title="Download PDF Envelope"
                          aria-label="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleViewDetails(j.id)}
                          className="p-2 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors"
                          title="View Full Details"
                          aria-label="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors"
                            title="Share on WhatsApp"
                            aria-label="WhatsApp Dispatch"
                          >
                            <MessageSquare className="w-4 h-4 text-emerald-600" />
                          </a>
                        )}

                        <button
                          onClick={() => handleEmailInvoiceForJob(j)}
                          disabled={emailingJobId === j.id}
                          className="p-2 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                          title="Email Invoice to Party"
                          aria-label="Email Invoice"
                        >
                          <Mail className={`w-4 h-4 ${emailingJobId === j.id ? 'animate-bounce text-blue-600' : 'text-blue-600'}`} />
                        </button>

                        <button
                          onClick={() => setDeleteConfirmJob(j)}
                          className="p-2 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-700 transition-colors"
                          title="Delete Job"
                          aria-label="Delete Job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Job ID</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Party Name</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3 text-center">Cases</th>
                  <th className="px-3 py-3">Total Weight</th>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-3 py-3">Printer</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading print logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : jobs.length > 0 ? (
                  jobs.map((j, idx) => (
                    <tr key={j.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-400">
                        {limit === -1 ? idx + 1 : (page - 1) * limit + idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-900">
                        {j.job_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {j.created_at}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-slate-950 text-sm">
                        <div>{j.party_name}</div>
                        <span className="text-[10px] font-normal text-slate-500">
                          {j.city}, {j.state}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                          {j.parcel_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-black text-center text-blue-800">
                        {j.total_cases}
                      </td>
                      <td className="px-3 py-3 font-bold text-emerald-800 whitespace-nowrap">
                        {j.total_weight.toFixed(2)} KG
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-semibold">{j.envelope_size}</td>
                      <td className="px-3 py-3 text-slate-500 truncate max-w-[120px]" title={j.printer_name}>
                        {j.printer_name}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          j.status === 'Printed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          @{j.created_by || 'Admin'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View */}
                          <button
                            onClick={() => handleViewDetails(j.id)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Download PDF */}
                          <button
                            onClick={() => handleDownloadPDF(j.id)}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* WhatsApp Dispatch Notification */}
                          {(() => {
                            const waUrl = generateWhatsAppDispatchUrl({
                              partyName: j.party_name,
                              phone: j.mobile,
                              jobNumber: j.job_number,
                              totalCases: j.total_cases,
                              driverName: j.driver_name || j.delivery_boy_name,
                              deliveryRoute: j.delivery_route,
                              city: j.city
                            }, 'en');
                            return (
                              <a
                                href={waUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Send WhatsApp Dispatch Notice"
                              >
                                <MessageSquare className="w-4 h-4 text-emerald-600" />
                              </a>
                            );
                          })()}

                          {/* Email Invoice & Dispatch Notification */}
                          <button
                            onClick={() => handleEmailInvoiceForJob(j)}
                            disabled={emailingJobId === j.id}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                            title="1-Click Email Invoice / Dispatch Details to Party via Gmail"
                          >
                            <Mail className={`w-4 h-4 ${emailingJobId === j.id ? 'animate-bounce text-blue-600' : 'text-blue-600'}`} />
                          </button>

                          {/* Edit & Reprint */}
                          <button
                            onClick={() => handleReprint(j)}
                            className="px-2 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 font-extrabold text-[11px]"
                            title="Edit Envelope & Reprint from History"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Edit & Reprint</span>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteConfirmJob(j)}
                            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                      No print history records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Limit */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Showing records per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={-1}>All</option>
            </select>
            <span className="text-slate-400">|</span>
            <span>Total: <strong>{total}</strong> print jobs</span>
          </div>

          {limit !== -1 && pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800">
                Page {page} of {pages}
              </span>
              <button
                onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
                disabled={page === pages}
                className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      <JobDetailsModal
        job={selectedJob}
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        onReprint={(job) => {
          setDetailsModalOpen(false);
          handleReprint(job);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 text-center mb-2">
              Delete Print Record
            </h3>
            <p className="text-slate-600 text-center mb-6">
              Are you sure you want to delete print job <strong className="text-slate-900">{deleteConfirmJob.job_number}</strong> ({deleteConfirmJob.party_name})?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmJob(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md"
              >
                Delete Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
