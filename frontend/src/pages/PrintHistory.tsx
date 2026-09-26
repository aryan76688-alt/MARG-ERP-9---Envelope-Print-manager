import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
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
  Edit3
} from 'lucide-react';
import { PrintJob, PrintJobDetails } from '../types';
import { fetchPrintJobs, fetchPrintJobDetails, deletePrintJob, downloadEnvelopePDF, getExportHistoryUrl } from '../api/client';
import { JobDetailsModal } from '../components/JobDetailsModal';

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
  const [uniquePerDay, setUniquePerDay] = useState<boolean>(false);

  // Selected job for modal
  const [selectedJob, setSelectedJob] = useState<PrintJobDetails | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<PrintJob | null>(null);

  const loadJobs = async (silent: boolean = false) => {
    try {
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
      setJobs(res.items);
      setTotal(res.total);
      setPages(res.pages);
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

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
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
