import React from 'react';
import { X, Printer, Download, Package, Calendar, MapPin, Building, RotateCcw } from 'lucide-react';
import { PrintJobDetails } from '../types';
import { downloadEnvelopePDF } from '../api/client';

interface JobDetailsModalProps {
  job: PrintJobDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onReprint: (job: PrintJobDetails) => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  job,
  isOpen,
  onClose,
  onReprint,
}) => {
  if (!isOpen || !job) return null;

  const handleDownload = async () => {
    try {
      await downloadEnvelopePDF({ job_id: job.id });
    } catch (err: any) {
      alert('Failed to download PDF: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-extrabold text-base tracking-wide flex items-center gap-2">
                <span>Print Job Details</span>
                <span className="text-xs font-mono bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                  {job.job_number}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3 h-3" />
                <span>{job.created_at}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Summary Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-800 uppercase">Total Cases</span>
              <p className="text-lg font-black text-blue-950 mt-0.5">{job.total_cases} Case(s)</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Total Weight</span>
              <p className="text-lg font-black text-emerald-950 mt-0.5">{job.total_weight.toFixed(2)} KG</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <span className="text-[10px] font-bold text-purple-800 uppercase">Parcel Type</span>
              <p className="text-base font-black text-purple-950 mt-0.5">{job.parcel_type}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-600 uppercase">Status</span>
              <p className="text-base font-black text-emerald-700 mt-0.5">{job.status}</p>
            </div>
          </div>

          {/* Addresses: Sender & Recipient */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sender */}
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-2 border-b border-slate-200 pb-1">
                <Building className="w-4 h-4 text-slate-500" />
                <span>FROM (Sender)</span>
              </div>
              <p className="font-black text-slate-900 text-sm">{job.sender?.business_name || 'SHREEJI 7'}</p>
              <p className="text-slate-600 mt-1">{job.sender?.address}</p>
              <p className="text-slate-600">{job.sender?.city}, {job.sender?.state}</p>
              <p className="text-blue-900 font-bold mt-1.5">Mobile: {job.sender?.mobile}</p>
            </div>

            {/* Recipient */}
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/30">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-2 border-b border-blue-200 pb-1">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>TO (Recipient)</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="font-black text-slate-950 text-sm">{job.party_name}</p>
                {job.party_code && (
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-mono">
                    [{job.party_code}]
                  </span>
                )}
              </div>
              <p className="text-slate-700 mt-1">{job.address}</p>
              <p className="text-blue-900 font-extrabold">{job.city}, {job.state}</p>
              {job.mobile && <p className="text-slate-800 font-semibold mt-1">Mobile: {job.mobile}</p>}
              {job.gst_no && <p className="text-slate-500 font-mono mt-0.5">GSTIN: {job.gst_no}</p>}
            </div>
          </div>

          {/* Cases Breakdown Table */}
          <div>
            <h4 className="font-extrabold text-slate-900 mb-2 text-xs uppercase tracking-wide">
              Case Breakdown & Barcodes
            </h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Case #</th>
                    <th className="px-3 py-2">Weight</th>
                    <th className="px-3 py-2">Barcode Tracking ID</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {job.cases?.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-blue-900">
                        Case {c.case_number}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-800">
                        {c.weight.toFixed(2)} KG
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                        {c.barcode_value}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => onReprint(job)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Load in Print Envelope (Reprint)</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
