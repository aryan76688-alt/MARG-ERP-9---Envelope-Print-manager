import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Save, 
  Calendar, 
  FileSpreadsheet, 
  Sparkles,
  Layers,
  Upload,
  AlertTriangle
} from 'lucide-react';
import { Party, RouteBatchUpdateItem, GoogleSheetsSyncResult } from '../types';
import { 
  syncGoogleSheetRoutes, 
  getExportRoutesTemplateUrl, 
  batchUpdateRoutes, 
  fetchParties,
  uploadRoutesFile,
  downloadRouteErrorReport
} from '../api/client';

interface RouteManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties?: Party[];
  onPartiesUpdated?: () => void;
  onRoutesUpdated?: () => void;
  savedSheetId?: string;
  savedApiKey?: string;
}

const WEEKDAYS = [
  { en: 'Monday', gu: 'સોમવાર', short: 'Mon' },
  { en: 'Tuesday', gu: 'મંગળવાર', short: 'Tue' },
  { en: 'Wednesday', gu: 'બુધવાર', short: 'Wed' },
  { en: 'Thursday', gu: 'ગુરુવાર', short: 'Thu' },
  { en: 'Friday', gu: 'શુક્રવાર', short: 'Fri' },
  { en: 'Saturday', gu: 'શનિવાર', short: 'Sat' },
  { en: 'Sunday', gu: 'રવિવાર', short: 'Sun' }
];

export const RouteManagerModal: React.FC<RouteManagerModalProps> = ({
  isOpen,
  onClose,
  parties = [],
  onPartiesUpdated,
  onRoutesUpdated,
  savedSheetId = '1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg',
  savedApiKey = 'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg'
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'sheets' | 'editor'>('upload');
  
  // File Upload State (myBillBook style)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Sheets state
  const [sheetUrlOrId, setSheetUrlOrId] = useState<string>(savedSheetId || '1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg');
  const [apiKey, setApiKey] = useState<string>(savedApiKey || 'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  
  // Shared Sync / Upload Result & Errors state (myBillBook style)
  const [syncResult, setSyncResult] = useState<GoogleSheetsSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState<boolean>(false);

  // Direct Route Editor State - ALWAYS ALL PARTIES
  const [internalParties, setInternalParties] = useState<Party[]>([]);
  const [isLoadingAllParties, setIsLoadingAllParties] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [weekdayFilter, setWeekdayFilter] = useState<string>('ALL');
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [editedRoutes, setEditedRoutes] = useState<Record<number, {
    route_1: string;
    route_2: string;
    route_3: string;
    route_1_gu: string;
    route_2_gu: string;
    route_3_gu: string;
  }>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Always fetch ALL parties when modal opens so editor is never restricted to 25 items
  useEffect(() => {
    if (isOpen) {
      setIsLoadingAllParties(true);
      fetchParties({ limit: -1 })
        .then((res) => {
          if (res && res.items) {
            setInternalParties(res.items);
          } else if (parties && parties.length > 0) {
            setInternalParties(parties);
          }
        })
        .catch((err) => {
          console.error('Failed to load all parties for route editor:', err);
          if (parties && parties.length > 0) {
            setInternalParties(parties);
          }
        })
        .finally(() => setIsLoadingAllParties(false));
    }
  }, [isOpen]);

  // Initialize edited routes map whenever internalParties changes
  useEffect(() => {
    if (internalParties && internalParties.length > 0) {
      const initialMap: Record<number, any> = {};
      for (const p of internalParties) {
        if (p.id) {
          initialMap[p.id] = {
            route_1: p.route_1 || p.route || '',
            route_2: p.route_2 || '',
            route_3: p.route_3 || '',
            route_1_gu: p.route_1_gu || '',
            route_2_gu: p.route_2_gu || '',
            route_3_gu: p.route_3_gu || ''
          };
        }
      }
      setEditedRoutes(initialMap);
    }
  }, [internalParties]);

  // Reset page when search or weekday filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, weekdayFilter]);

  if (!isOpen) return null;

  // Auto-translate weekday helper
  const getGujaratiWeekday = (eng: string) => {
    const found = WEEKDAYS.find((w) => w.en.toLowerCase() === eng.toLowerCase());
    return found ? found.gu : '';
  };

  const handleSetWeekday = (partyId: number, slot: 1 | 2 | 3, weekdayEn: string, weekdayGu: string) => {
    setEditedRoutes((prev) => {
      const current = prev[partyId] || { route_1: '', route_2: '', route_3: '', route_1_gu: '', route_2_gu: '', route_3_gu: '' };
      return {
        ...prev,
        [partyId]: {
          ...current,
          [`route_${slot}`]: weekdayEn,
          [`route_${slot}_gu`]: weekdayGu
        }
      };
    });
  };

  const handleRouteChange = (partyId: number, slot: 1 | 2 | 3, value: string) => {
    const guAuto = getGujaratiWeekday(value);
    setEditedRoutes((prev) => {
      const current = prev[partyId] || { route_1: '', route_2: '', route_3: '', route_1_gu: '', route_2_gu: '', route_3_gu: '' };
      return {
        ...prev,
        [partyId]: {
          ...current,
          [`route_${slot}`]: value,
          [`route_${slot}_gu`]: guAuto || current[`route_${slot}_gu` as keyof typeof current]
        }
      };
    });
  };

  // 1. myBillBook Direct Excel / CSV File Upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setSyncError('Please choose an Excel (.xlsx/.xls) or CSV (.csv) file to upload.');
      return;
    }
    setIsUploadingFile(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res = await uploadRoutesFile(selectedFile);
      setSyncResult(res);
      onPartiesUpdated?.();
      onRoutesUpdated?.();
      fetchParties({ limit: -1 }).then((r) => {
        if (r && r.items) setInternalParties(r.items);
      }).catch(console.error);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to process route file');
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 2. Google Sheets Sync
  const handleSyncSheets = async () => {
    if (!sheetUrlOrId.trim()) {
      setSyncError('Please enter a Google Sheet URL or Spreadsheet ID.');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res = await syncGoogleSheetRoutes({
        sheet_url_or_id: sheetUrlOrId.trim(),
        api_key: apiKey.trim()
      });
      setSyncResult(res);
      onPartiesUpdated?.();
      onRoutesUpdated?.();
      fetchParties({ limit: -1 }).then((r) => {
        if (r && r.items) setInternalParties(r.items);
      }).catch(console.error);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync Google Sheet');
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Download myBillBook Error Report
  const handleDownloadErrors = async () => {
    if (!syncResult?.errors || syncResult.errors.length === 0) return;
    setIsDownloadingReport(true);
    try {
      await downloadRouteErrorReport(syncResult.errors);
    } catch (err: any) {
      alert('Failed to download error report: ' + err.message);
    } finally {
      setIsDownloadingReport(false);
    }
  };

  // 4. Direct Table Batch Save
  const handleSaveEditor = async () => {
    setIsSaving(true);
    setSaveSuccessMsg(null);
    try {
      const updates: RouteBatchUpdateItem[] = Object.entries(editedRoutes).map(([idStr, r]) => ({
        id: Number(idStr),
        route_1: r.route_1,
        route_2: r.route_2,
        route_3: r.route_3,
        route_1_gu: r.route_1_gu,
        route_2_gu: r.route_2_gu,
        route_3_gu: r.route_3_gu
      }));

      const res = await batchUpdateRoutes(updates);
      setSaveSuccessMsg(`Successfully saved routes for ${res.updated_count} parties!`);
      onPartiesUpdated?.();
      onRoutesUpdated?.();
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Failed to save routes: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter parties for direct editor
  const filteredParties = internalParties.filter((p) => {
    if (!p.id) return false;
    const q = searchQuery.trim().toUpperCase();
    if (q) {
      const matchCode = (p.party_code || '').toUpperCase().includes(q);
      const matchName = (p.party_name || '').toUpperCase().includes(q);
      const matchGu = (p.party_name_gu || '').toUpperCase().includes(q);
      const matchCity = (p.city || '').toUpperCase().includes(q);
      if (!matchCode && !matchName && !matchGu && !matchCity) return false;
    }
    if (weekdayFilter !== 'ALL') {
      const rData = editedRoutes[p.id];
      if (!rData) return false;
      const allR = [rData.route_1, rData.route_2, rData.route_3, rData.route_1_gu, rData.route_2_gu, rData.route_3_gu]
        .map((s) => (s || '').toUpperCase());
      if (!allR.some((s) => s.includes(weekdayFilter.toUpperCase()))) return false;
    }
    return true;
  });

  // Pagination calculations
  const totalFiltered = filteredParties.length;
  const effectivePageSize = pageSize === -1 ? totalFiltered : pageSize;
  const totalPages = effectivePageSize > 0 ? Math.ceil(totalFiltered / effectivePageSize) : 1;
  const paginatedParties = effectivePageSize === -1 
    ? filteredParties 
    : filteredParties.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-xl border border-blue-400/30 text-blue-300">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg tracking-tight">Party Route Manager & Sync</h3>
                <span className="text-[10px] font-extrabold uppercase bg-emerald-500/30 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                  Max 3 Routes
                </span>
                <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded border border-blue-400/20">
                  MARG Codes
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Set up to 3 delivery routes per party (Monday–Sunday) with auto-Gujarati conversion, direct Excel upload, or Google Sheets sync.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle Navigation */}
        <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            {/* Tab 1: Direct File Upload (myBillBook style) */}
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Excel / CSV</span>
              <span className="text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase">
                myBillBook
              </span>
            </button>

            {/* Tab 2: Google Sheets Sync */}
            <button
              onClick={() => setActiveTab('sheets')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'sheets'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Google Sheets Sync</span>
            </button>

            {/* Tab 3: Direct Route Editor (All Parties) */}
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Direct Route Editor</span>
              <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.2 rounded font-black border border-slate-200">
                {isLoadingAllParties ? '...' : internalParties.length} Parties
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={getExportRoutesTemplateUrl()}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="Download pre-filled CSV with all MARG party codes, names, and 3 route slots"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Download Pre-filled Template (CSV)</span>
            </a>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: DIRECT FILE UPLOAD (myBillBook style) */}
          {activeTab === 'upload' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              {/* myBillBook style Upload Banner */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50 border border-blue-200 rounded-2xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-600 text-white">
                        myBillBook Style
                      </span>
                      <h4 className="font-black text-slate-900 text-base">
                        Direct Excel / CSV Route Import
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                      Upload your Excel (.xlsx / .xls) or CSV (.csv) file directly from your computer or phone.
                      No Google Drive permissions or API keys required!
                    </p>
                  </div>

                  <a
                    href={getExportRoutesTemplateUrl()}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Blank Template</span>
                  </a>
                </div>
              </div>

              {/* Upload Dropzone Form */}
              <div className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-8 text-center transition-all bg-slate-50/50">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files[0]) {
                      setSelectedFile(files[0]);
                      setSyncError(null);
                      setSyncResult(null);
                    }
                  }}
                />

                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
                    <Upload className="w-8 h-8" />
                  </div>

                  <div>
                    <h5 className="font-extrabold text-slate-900 text-sm">
                      {selectedFile ? selectedFile.name : 'Choose or Drag & Drop Excel / CSV file here'}
                    </h5>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      {selectedFile 
                        ? `File size: ${(selectedFile.size / 1024).toFixed(1)} KB. Ready to process.`
                        : 'Supports .xlsx, .xls, or .csv files with columns: party_code, party_name, primary_route_1, secondary_route_2, third_route_3'}
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {selectedFile ? 'Change File' : 'Browse Files'}
                    </button>

                    {selectedFile && (
                      <button
                        type="button"
                        onClick={handleFileUpload}
                        disabled={isUploadingFile}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        {isUploadingFile ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Processing File...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Upload & Apply Routes</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Banner with solution */}
              {syncError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                  <div className="flex items-start gap-2 font-bold">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                </div>
              )}

              {/* myBillBook Reconciliation & Error Report Display */}
              {syncResult && (
                <div className="space-y-4 pt-2">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
                      <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Rows Processed</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">{syncResult.total_rows}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Rows read from spreadsheet</div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl shadow-xs">
                      <div className="text-emerald-700 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Successfully Updated</span>
                      </div>
                      <div className="text-2xl font-black text-emerald-800 mt-1">{syncResult.updated_count}</div>
                      <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">Parties matched and routes assigned</div>
                    </div>

                    <div className={`p-4 rounded-xl shadow-xs border ${
                      syncResult.errors && syncResult.errors.length > 0 
                        ? 'bg-rose-50/80 border-rose-200' 
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        syncResult.errors && syncResult.errors.length > 0 ? 'text-rose-700' : 'text-slate-600'
                      }`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Errors / Unmatched</span>
                      </div>
                      <div className={`text-2xl font-black mt-1 ${
                        syncResult.errors && syncResult.errors.length > 0 ? 'text-rose-800' : 'text-slate-700'
                      }`}>
                        {syncResult.errors?.length || syncResult.not_found_count || 0}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Parties requiring correction</div>
                    </div>
                  </div>

                  {/* If Errors Exist: myBillBook Style Error Report Table & CSV Download */}
                  {syncResult.errors && syncResult.errors.length > 0 && (
                    <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-rose-100 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                            <h5 className="font-extrabold text-rose-950 text-sm">
                              Route Reconciliation Error Report ({syncResult.errors.length} Failed Rows)
                            </h5>
                          </div>
                          <p className="text-xs text-rose-700 mt-0.5 font-medium">
                            The rows below could not be updated because the party code or name was not found in your ledger.
                          </p>
                        </div>

                        {/* Download Error Report Button (myBillBook Feature) */}
                        <button
                          type="button"
                          onClick={handleDownloadErrors}
                          disabled={isDownloadingReport}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
                        >
                          {isDownloadingReport ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>Download Error Report (CSV)</span>
                        </button>
                      </div>

                      {/* Reconciliation Table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 text-[10px] uppercase font-black">
                            <tr>
                              <th className="py-2 px-3 w-16">Row #</th>
                              <th className="py-2 px-3 w-32">Party Code</th>
                              <th className="py-2 px-3">Party Name</th>
                              <th className="py-2 px-3 w-40">Routes in File</th>
                              <th className="py-2 px-3">Failure Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {syncResult.errors.map((errItem, idx) => (
                              <tr key={idx} className="hover:bg-rose-50/40 transition-colors">
                                <td className="py-2 px-3 font-mono font-bold text-slate-500">
                                  #{errItem.row}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-rose-700">
                                  {errItem.party_code || '—'}
                                </td>
                                <td className="py-2 px-3 font-bold text-slate-900">
                                  {errItem.party_name || 'UNKNOWN'}
                                </td>
                                <td className="py-2 px-3 text-[11px] text-slate-600">
                                  {[errItem.route_1, errItem.route_2, errItem.route_3].filter(Boolean).join(', ') || '—'}
                                </td>
                                <td className="py-2 px-3 text-rose-600 font-semibold text-[11px]">
                                  {errItem.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium leading-relaxed">
                        💡 <strong>How to fix:</strong> Click <strong>Download Error Report (CSV)</strong> to get a spreadsheet containing only these failed rows. Correct the party codes (e.g. <span className="font-mono font-bold">MARG000001</span>) and re-upload here.
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: GOOGLE SHEETS SYNC */}
          {activeTab === 'sheets' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              {/* Live Auto-Sync Status Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-emerald-950 font-black text-sm">Auto-Sync Active (Every 3 Mins)</strong>
                      <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                        Connected
                      </span>
                    </div>
                    <p className="text-emerald-800 text-xs font-medium mt-0.5">
                      Connected Sheet: <code className="font-mono font-bold text-emerald-900 bg-emerald-100 px-1 py-0.2 rounded">1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg</code>. Any edit made in Google Sheets updates your parties automatically!
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSyncSheets}
                  disabled={isSyncing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer text-xs"
                >
                  {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>

              {/* Quick Choice Banner */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-extrabold text-blue-950 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Want an easier way?</span>
                  </h4>
                  <p className="text-blue-800 mt-0.5 leading-relaxed font-medium">
                    You can also use our <strong>Upload Excel / CSV</strong> tab to upload files directly without needing Google Drive permissions!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-sm hover:shadow transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>Go to Direct File Upload</span>
                </button>
              </div>

              {/* 3-Step Setup Guide */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>How to Set Up & Sync Your Google Sheet (3 Simple Steps)</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Step 1 */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 font-black text-slate-900">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">1</span>
                      <span>Create & Open Sheet</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed font-medium">
                      Download the CSV template with all your parties, or open a blank Google Sheet.
                    </p>
                    <div className="pt-1 flex flex-col gap-1.5">
                      <a
                        href={getExportRoutesTemplateUrl()}
                        download
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV Template</span>
                      </a>
                      <a
                        href="https://sheets.new"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open sheets.new (1-Click)</span>
                      </a>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 font-black text-slate-900">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                      <span>Share as "Anyone with link"</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed font-medium">
                      In your Google Sheet, click the blue <strong>"Share" (શેર)</strong> button in the top-right corner.
                    </p>
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-semibold text-[11px] leading-tight">
                      ⚠️ Change General access from <strong>"Restricted"</strong> to <strong>"Anyone with the link can view"</strong> (Viewer).
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 font-black text-slate-900">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">3</span>
                      <span>Paste Link & Sync</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed font-medium">
                      Copy your Google Sheet link, paste it in the box below, and click <strong>Sync Routes Now</strong>!
                    </p>
                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-bold text-[11px]">
                      ✨ All English weekdays (Mon-Sun) auto-convert to Gujarati!
                    </div>
                  </div>
                </div>
              </div>

              {/* Sync Form Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Connect Your Google Sheet</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Google Sheet Link or Spreadsheet ID <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={sheetUrlOrId}
                        onChange={(e) => {
                          setSheetUrlOrId(e.target.value);
                          if (syncError) setSyncError(null);
                        }}
                        placeholder="Paste link: https://docs.google.com/spreadsheets/d/.../edit"
                        className="w-full pl-3 pr-24 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono"
                      />
                      {sheetUrlOrId && (
                        <a
                          href={sheetUrlOrId.startsWith('http') ? sheetUrlOrId : `https://docs.google.com/spreadsheets/d/${sheetUrlOrId}/edit`}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute right-2 top-2 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open</span>
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                      Ensure General access is set to <strong>"Anyone with the link can view"</strong> so Google's server allows importing.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Google Sheets API Key
                    </label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono bg-slate-50 text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Pre-filled with your Google Sheets & Docs API Key.
                    </p>
                  </div>
                </div>

                {/* Error Banner with Guided Solution */}
                {syncError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                    <div className="flex items-start gap-2 font-bold">
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <span>{syncError}</span>
                    </div>
                    <div className="pt-1 text-[11px] text-rose-900 bg-white/70 p-2.5 rounded-lg border border-rose-200 leading-relaxed">
                      <strong>Why HTTP 404 Occurred:</strong>
                      <ol className="list-decimal pl-4 space-y-1 mt-1 font-medium">
                        <li>In Google Sheets, new sheets are <strong>"Restricted"</strong> by default. Google intentionally returns HTTP 404 to avoid leaking private filenames.</li>
                        <li>To fix: Open your sheet, click blue <strong>"Share"</strong> button top-right, change to <strong>"Anyone with the link" (Viewer)</strong>, and retry!</li>
                        <li>Or simply use the <strong>"Upload Excel / CSV"</strong> tab above to upload the file directly with zero Google settings.</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Success Banner */}
                {syncResult && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{syncResult.message}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Total Rows:</span>
                        <strong className="text-slate-900 text-base">{syncResult.total_rows}</strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Updated Parties:</span>
                        <strong className="text-emerald-700 text-base">{syncResult.updated_count}</strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Errors / Unmatched:</span>
                        <strong className="text-rose-600 text-base">{syncResult.errors?.length || syncResult.not_found_count || 0}</strong>
                      </div>
                    </div>

                    {syncResult.errors && syncResult.errors.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleDownloadErrors}
                          disabled={isDownloadingReport}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Error Report (CSV)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSyncSheets}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSyncing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>{isSyncing ? 'Syncing Routes from Sheet...' : 'Sync Routes from Google Sheet Now'}</span>
                  </button>

                  <a
                    href={getExportRoutesTemplateUrl()}
                    download
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Download Pre-filled Template (CSV)</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DIRECT ROUTE EDITOR - ALL PARTIES */}
          {activeTab === 'editor' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                  {/* Search query input */}
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search code (MARG000001), name, city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs bg-white font-medium"
                    />
                  </div>

                  {/* Weekday filter */}
                  <select
                    value={weekdayFilter}
                    onChange={(e) => setWeekdayFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs bg-white font-bold text-slate-700"
                  >
                    <option value="ALL">All Days / Routes</option>
                    {WEEKDAYS.map((w) => (
                      <option key={w.en} value={w.en}>
                        {w.en} ({w.gu})
                      </option>
                    ))}
                  </select>

                  {/* Rows per page selector */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                    <span>Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-bold text-slate-800"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={-1}>All ({internalParties.length})</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {saveSuccessMsg && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {saveSuccessMsg}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveEditor}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{isSaving ? 'Saving...' : 'Save All Route Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Status Header: Showing all parties */}
              <div className="flex items-center justify-between text-xs px-1 text-slate-600 font-medium">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">
                    Showing {paginatedParties.length} of {totalFiltered} matching parties
                  </span>
                  <span className="text-[11px] text-slate-400">
                    (Total in database: {internalParties.length})
                  </span>
                  {isLoadingAllParties && (
                    <span className="flex items-center gap-1 text-blue-600 font-bold animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Loading all parties...
                    </span>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="font-bold text-slate-700">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* High-density Table for ALL Parties */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-[62vh] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10 text-[11px] uppercase tracking-wider font-extrabold">
                    <tr>
                      <th className="py-2.5 px-3 w-32">Party Code</th>
                      <th className="py-2.5 px-3 w-56">Party Name</th>
                      <th className="py-2.5 px-3">Primary Route 1 (મુખ્ય રૂટ)</th>
                      <th className="py-2.5 px-3">Secondary Route 2 (બીજો રૂટ)</th>
                      <th className="py-2.5 px-3">Third Route 3 (ત્રીજો રૂટ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {paginatedParties.map((p) => {
                      const id = p.id!;
                      const r = editedRoutes[id] || { route_1: '', route_2: '', route_3: '', route_1_gu: '', route_2_gu: '', route_3_gu: '' };
                      return (
                        <tr key={id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Party Code (MARG000001) */}
                          <td className="py-2.5 px-3 align-top">
                            <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shadow-xs inline-block">
                              {p.party_code || `MARG${String(id).padStart(6, '0')}`}
                            </span>
                          </td>

                          {/* Party Name */}
                          <td className="py-2.5 px-3 align-top">
                            <div className="font-black text-slate-900 leading-tight uppercase">
                              {p.party_name}
                            </div>
                            {p.party_name_gu && (
                              <div className="text-[11px] font-bold text-purple-700 mt-0.5">
                                {p.party_name_gu}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {p.city}
                            </div>
                          </td>

                          {/* Route 1 */}
                          <td className="py-2 px-3 align-top space-y-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={r.route_1}
                                onChange={(e) => handleRouteChange(id, 1, e.target.value)}
                                placeholder="e.g. Monday"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-bold uppercase"
                              />
                              {r.route_1_gu && (
                                <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200 whitespace-nowrap">
                                  {r.route_1_gu}
                                </span>
                              )}
                            </div>
                            {/* Weekday Quick Pills */}
                            <div className="flex flex-wrap gap-1">
                              {WEEKDAYS.map((w) => (
                                <button
                                  key={w.short}
                                  type="button"
                                  onClick={() => handleSetWeekday(id, 1, w.en, w.gu)}
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                                    r.route_1.toUpperCase() === w.en.toUpperCase()
                                      ? 'bg-blue-600 text-white shadow-xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  }`}
                                  title={`${w.en} (${w.gu})`}
                                >
                                  {w.short}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Route 2 */}
                          <td className="py-2 px-3 align-top space-y-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={r.route_2}
                                onChange={(e) => handleRouteChange(id, 2, e.target.value)}
                                placeholder="e.g. Thursday"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-purple-500 font-bold uppercase"
                              />
                              {r.route_2_gu && (
                                <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200 whitespace-nowrap">
                                  {r.route_2_gu}
                                </span>
                              )}
                            </div>
                            {/* Weekday Quick Pills */}
                            <div className="flex flex-wrap gap-1">
                              {WEEKDAYS.map((w) => (
                                <button
                                  key={w.short}
                                  type="button"
                                  onClick={() => handleSetWeekday(id, 2, w.en, w.gu)}
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                                    r.route_2.toUpperCase() === w.en.toUpperCase()
                                      ? 'bg-purple-600 text-white shadow-xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  }`}
                                  title={`${w.en} (${w.gu})`}
                                >
                                  {w.short}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Route 3 */}
                          <td className="py-2 px-3 align-top space-y-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={r.route_3}
                                onChange={(e) => handleRouteChange(id, 3, e.target.value)}
                                placeholder="e.g. Saturday"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-amber-500 font-bold uppercase"
                              />
                              {r.route_3_gu && (
                                <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200 whitespace-nowrap">
                                  {r.route_3_gu}
                                </span>
                              )}
                            </div>
                            {/* Weekday Quick Pills */}
                            <div className="flex flex-wrap gap-1">
                              {WEEKDAYS.map((w) => (
                                <button
                                  key={w.short}
                                  type="button"
                                  onClick={() => handleSetWeekday(id, 3, w.en, w.gu)}
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                                    r.route_3.toUpperCase() === w.en.toUpperCase()
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  }`}
                                  title={`${w.en} (${w.gu})`}
                                >
                                  {w.short}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between py-2 text-xs text-slate-600">
                  <span>Page {currentPage} of {totalPages} ({totalFiltered} parties)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer shadow-xs"
                    >
                      Previous Page
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer shadow-xs"
                    >
                      Next Page
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Each party is assigned at most 3 routes. Changes sync immediately to envelope printing & dispatch run-sheets.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
