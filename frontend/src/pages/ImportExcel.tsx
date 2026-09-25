import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  ArrowRight, 
  Layers, 
  RefreshCw,
  FileCheck,
  HelpCircle,
  Clock,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  uploadExcelFile, 
  validateImportRows, 
  confirmImport, 
  getSampleTemplateUrl,
  fetchImportHistory 
} from '../api/client';
import { ImportValidationResult } from '../types';

interface ImportExcelProps {
  onNavigate: (tab: string) => void;
}

export const ImportExcel: React.FC<ImportExcelProps> = ({ onNavigate }) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update' | 'allow'>('skip');
  const [showSkippedDetails, setShowSkippedDetails] = useState<boolean>(false);
  const [showPreviewRows, setShowPreviewRows] = useState<boolean>(true);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    duplicates: number;
    errors: number;
    skipped_parties?: string[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const TARGET_FIELDS = [
    { key: 'party_name', label: 'Party Name', required: true },
    { key: 'party_code', label: 'Party Code', required: false },
    { key: 'route', label: 'Delivery Route', required: false },
    { key: 'address', label: 'Address Line 1', required: true },
    { key: 'address_line_2', label: 'Address Line 2', required: false },
    { key: 'address_line_3', label: 'Address Line 3', required: false },
    { key: 'city', label: 'City / Town', required: true },
    { key: 'state', label: 'State', required: true },
    { key: 'mobile_no', label: 'Mobile No.', required: false },
    { key: 'landline', label: 'Landline Phone', required: false },
    { key: 'email', label: 'Email Address', required: false },
    { key: 'gst_no', label: 'GST Number', required: false },
    { key: 'notes', label: 'Notes / Remarks', required: false },
    // Direct Gujarati fields from Excel (No AI used)
    { key: 'party_name_gu', label: 'Party Name (ગુજરાતી)', required: false },
    { key: 'route_gu', label: 'Route (ગુજરાતી)', required: false },
    { key: 'address_gu', label: 'Address Line 1 (ગુજરાતી)', required: false },
    { key: 'address_line_2_gu', label: 'Address Line 2 (ગુજરાતી)', required: false },
    { key: 'address_line_3_gu', label: 'Address Line 3 (ગુજરાતી)', required: false },
    { key: 'city_gu', label: 'City (ગુજરાતી)', required: false },
    { key: 'state_gu', label: 'State (ગુજરાતી)', required: false },
  ];

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx') && !selectedFile.name.toLowerCase().endsWith('.xls')) {
      alert('Please select an Excel workbook (.xlsx or .xls)');
      return;
    }

    setFile(selectedFile);
    setAnalyzing(true);
    setValidation(null);
    setImportSummary(null);

    try {
      const data = await uploadExcelFile(selectedFile);
      setFileInfo(data);
      setMapping(data.detected_mapping || {});
      // Auto-trigger validation with detected mapping
      runValidation(data.all_rows, data.detected_mapping || {});
    } catch (err: any) {
      alert('Error parsing Excel: ' + err.message);
      setFile(null);
      setFileInfo(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const runValidation = async (rows: any[], currentMapping: Record<string, string | null>) => {
    setValidating(true);
    try {
      const val = await validateImportRows(rows, currentMapping);
      setValidation(val);
    } catch (err: any) {
      alert('Validation error: ' + err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleMappingChange = (fieldKey: string, selectedHeader: string) => {
    const updated = {
      ...mapping,
      [fieldKey]: selectedHeader === '__none__' ? null : selectedHeader,
    };
    setMapping(updated);
    if (fileInfo && fileInfo.all_rows) {
      runValidation(fileInfo.all_rows, updated);
    }
  };

  const handleConfirmImport = async (skipWarnings: boolean) => {
    if (!validation) return;
    setImporting(true);
    try {
      // Gather rows to import: all preview rows or valid+warning rows that have a party_name
      const candidateRows = validation.all_preview_rows && validation.all_preview_rows.length > 0
        ? validation.all_preview_rows
        : skipWarnings
        ? validation.valid_rows
        : [...validation.valid_rows, ...validation.warning_rows];

      const rowsToImport = candidateRows.filter(
        (r: any) => r.party_name && r.party_name.toString().trim().length > 0
      );

      if (rowsToImport.length === 0) {
        alert('No rows with a valid Party Name found to import. Please check your Excel column mapping.');
        setImporting(false);
        return;
      }

      const res = await confirmImport({
        rows: rowsToImport,
        skip_warnings: skipWarnings,
        duplicate_action: duplicateAction,
        filename: fileInfo.filename,
        file_size: fileInfo.file_size,
        sheet_name: fileInfo.sheet_name,
      });

      setImportSummary(res);
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const h = await fetchImportHistory();
      setHistoryList(h);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <span>Import MARG ERP Parties from Excel</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Upload .xlsx / .xls workbooks, automatically map columns, validate duplicate records, and bulk-load parties.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-md ${
                activeTab === 'upload' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Upload & Map
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                loadHistory();
              }}
              className={`px-3 py-1.5 rounded-md ${
                activeTab === 'history' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Past Imports
            </button>
          </div>

          <a
            href={getSampleTemplateUrl()}
            download
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 transition-colors shadow-sm"
            title="Download clean Excel template formatted with English (Sheet 1) and Gujarati (Sheet 2)"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Sample Template (English + Gujarati .xlsx)</span>
          </a>
        </div>
      </div>

      {activeTab === 'upload' ? (
        <>
          {/* Step 1: Drag & Drop Dropzone */}
          {!fileInfo && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-blue-300 hover:border-blue-600 bg-blue-50/40 hover:bg-blue-50/80 rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center space-y-3 group shadow-sm"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files && e.target.files[0] && handleFileChange(e.target.files[0])}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-white border border-blue-200 text-blue-600 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                DRAG & DROP EXCEL FILE HERE
              </h3>
              <p className="text-xs text-slate-500 font-medium max-w-sm">
                Supports Microsoft Excel (.xlsx, .xls) party lists exported directly from MARG ERP 9+. Supports Dual-Sheets (Sheet 1: English, Sheet 2: Gujarati).
              </p>
              <button
                type="button"
                className="mt-2 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-600/30 hover:bg-blue-500 transition-colors"
              >
                Choose File from Computer
              </button>
            </div>
          )}

          {/* Loading Indicator */}
          {analyzing && (
            <div className="p-8 bg-white rounded-xl border border-slate-200 text-center text-xs text-slate-600">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="font-bold">Analyzing Excel file & detecting columns...</p>
            </div>
          )}

          {/* File Uploaded & Validated View */}
          {fileInfo && (
            <div className="space-y-6">
              {/* File Info Strip */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-black border border-emerald-200">
                    XLS
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{fileInfo.filename}</h4>
                    <p className="text-slate-500 text-[11px]">
                      Sheet: <strong className="text-slate-700">{fileInfo.sheet_name}</strong> &bull; Size:{' '}
                      <strong>{(fileInfo.file_size / 1024).toFixed(1)} KB</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase">Rows Found</span>
                    <p className="text-base font-black text-slate-900">{fileInfo.total_rows} Rows</p>
                  </div>
                  {fileInfo.has_gujarati_data ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center gap-1 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>GUJARATI FROM EXCEL (NO AI)</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                      VALID FILE
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setFile(null);
                      setFileInfo(null);
                      setValidation(null);
                      setImportSummary(null);
                    }}
                    className="text-xs text-red-600 hover:underline font-bold"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Step 2: Column Mapping Accordion / Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Excel Column Mapping</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Auto-detected MARG columns. Adjust dropdowns if manual mapping is required. PIN Code strictly excluded.
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Auto-Detected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {TARGET_FIELDS.map((f) => {
                    const mappedCol = mapping[f.key] || '';
                    return (
                      <div key={f.key} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-800">
                            {f.label} {f.required && <span className="text-red-500">*</span>}
                          </span>
                          {mappedCol ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                              Mapped
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                              Unmapped
                            </span>
                          )}
                        </div>
                        <select
                          value={mappedCol || '__none__'}
                          onChange={(e) => handleMappingChange(f.key, e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="__none__">— Skip Field —</option>
                          {fileInfo.headers.map((h: string) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Validation Breakdown */}
              {validation && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-blue-600" />
                      <span>Pre-Import Validation Status</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      Checking duplicates & required fields
                    </span>
                  </div>

                  {/* 4 Status Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* New Parties */}
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">NEW PARTIES</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p className="text-2xl font-black text-emerald-950 mt-1">
                        {validation.new_count ?? validation.valid_count}
                      </p>
                      <p className="text-[10px] text-emerald-700 mt-0.5">Ready to add to ledger</p>
                    </div>

                    {/* Already Exists in DB (Vyapar Style) */}
                    <div className={`p-3.5 rounded-xl border ${
                      (validation.already_exists_count || 0) > 0 
                        ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/40' 
                        : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider">ALREADY EXISTS</span>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-2xl font-black text-amber-950 mt-1">
                        {validation.already_exists_count || 0}
                      </p>
                      <p className="text-[10px] text-amber-800 font-medium mt-0.5">Already in database (Vyapar notice)</p>
                    </div>

                    {/* Warnings */}
                    <div className="p-3.5 rounded-xl bg-yellow-50 border border-yellow-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-yellow-800 uppercase tracking-wider">WARNINGS</span>
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      </div>
                      <p className="text-2xl font-black text-yellow-950 mt-1">
                        {validation.warning_count}
                      </p>
                      <p className="text-[10px] text-yellow-700 mt-0.5">Minor issues / format</p>
                    </div>

                    {/* Errors */}
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-red-800 uppercase tracking-wider">ERRORS</span>
                        <XCircle className="w-4 h-4 text-red-600" />
                      </div>
                      <p className="text-2xl font-black text-red-950 mt-1">
                        {validation.error_count}
                      </p>
                      <p className="text-[10px] text-red-700 mt-0.5">Missing Name or Address</p>
                    </div>
                  </div>

                  {/* Vyapar App Style Duplicate Notice Banner & Controls */}
                  {(validation.already_exists_count || 0) > 0 && (
                    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
                        <span>Notice: {validation.already_exists_count} parties already exist in your database!</span>
                      </div>
                      <p className="text-xs text-amber-900 leading-relaxed font-medium">
                        Similar to Vyapar App, existing parties will be <strong>skipped automatically</strong> so duplicate parties are not added to your ledger. You can choose your preferred action below:
                      </p>

                      <div className="pt-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
                          Duplicate Handling Action:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <label
                            onClick={() => setDuplicateAction('skip')}
                            className={`p-3 rounded-lg border-2 cursor-pointer flex flex-col justify-between transition-all ${
                              duplicateAction === 'skip'
                                ? 'bg-amber-100/80 border-amber-600 shadow-sm ring-1 ring-amber-600'
                                : 'bg-white border-slate-200 hover:border-amber-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                              <input
                                type="radio"
                                name="duplicateAction"
                                checked={duplicateAction === 'skip'}
                                onChange={() => setDuplicateAction('skip')}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <span>Skip Existing (Vyapar Default)</span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">
                              Do not add existing parties. Only import {validation.new_count ?? validation.valid_count} clean new parties.
                            </p>
                          </label>

                          <label
                            onClick={() => setDuplicateAction('update')}
                            className={`p-3 rounded-lg border-2 cursor-pointer flex flex-col justify-between transition-all ${
                              duplicateAction === 'update'
                                ? 'bg-blue-50 border-blue-600 shadow-sm ring-1 ring-blue-600'
                                : 'bg-white border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                              <input
                                type="radio"
                                name="duplicateAction"
                                checked={duplicateAction === 'update'}
                                onChange={() => setDuplicateAction('update')}
                                className="text-blue-600 focus:ring-blue-500"
                              />
                              <span>Update Existing Records</span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">
                              Keep party records and update their address & mobile with the latest values from this file.
                            </p>
                          </label>

                          <label
                            onClick={() => setDuplicateAction('allow')}
                            className={`p-3 rounded-lg border-2 cursor-pointer flex flex-col justify-between transition-all ${
                              duplicateAction === 'allow'
                                ? 'bg-slate-100 border-slate-700 shadow-sm ring-1 ring-slate-700'
                                : 'bg-white border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                              <input
                                type="radio"
                                name="duplicateAction"
                                checked={duplicateAction === 'allow'}
                                onChange={() => setDuplicateAction('allow')}
                                className="text-slate-600 focus:ring-slate-500"
                              />
                              <span>Import as Duplicates</span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">
                              Add all entries unconditionally, creating duplicate party names in the ledger.
                            </p>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rows Preview with Status Badges */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div 
                      onClick={() => setShowPreviewRows(!showPreviewRows)}
                      className="px-4 py-2.5 bg-slate-50 flex items-center justify-between cursor-pointer border-b border-slate-200 hover:bg-slate-100"
                    >
                      <div className="flex items-center gap-2 font-extrabold text-slate-800">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                        <span>Preview Rows & Status ({validation.all_preview_rows?.length || 0} rows)</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-[11px] font-bold">
                        <span>{showPreviewRows ? 'Collapse Preview' : 'Expand Preview'}</span>
                        {showPreviewRows ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {showPreviewRows && (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-100 text-slate-600 font-extrabold text-[10px] uppercase sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2 w-10">#</th>
                              <th className="px-4 py-2">Party Name (English & Gujarati)</th>
                              <th className="px-3 py-2">Route</th>
                              <th className="px-3 py-2">Address (Lines 1, 2, 3)</th>
                              <th className="px-3 py-2">City</th>
                              <th className="px-3 py-2">State</th>
                              <th className="px-3 py-2">Mobile</th>
                              <th className="px-4 py-2">Status & Gujarati Notice</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {validation.all_preview_rows && validation.all_preview_rows.length > 0 ? (
                              validation.all_preview_rows.slice(0, 50).map((r, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-slate-400 font-bold">{r.row_index != null ? r.row_index + 1 : idx + 1}</td>
                                  <td className="px-4 py-2 text-slate-900">
                                    <div className="font-bold">{r.party_name || '—'}</div>
                                    {r.party_name_gu && (
                                      <div className="text-emerald-700 font-semibold text-[11px] font-['Noto_Sans_Gujarati'] flex items-center gap-1 mt-0.5">
                                        <span>{r.party_name_gu}</span>
                                        <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 py-0.2 rounded border border-emerald-200 font-sans">
                                          Excel GU
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-blue-700">
                                    <div>{r.route || '—'}</div>
                                    {r.route_gu && (
                                      <div className="text-emerald-700 text-[10px] font-['Noto_Sans_Gujarati']">
                                        {r.route_gu}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 max-w-[240px]" title={[r.address, r.address_line_2, r.address_line_3].filter(Boolean).join(', ')}>
                                    <div className="truncate">{[r.address, r.address_line_2, r.address_line_3].filter(Boolean).join(', ') || '—'}</div>
                                    {(r.address_gu || r.address_line_2_gu || r.address_line_3_gu) && (
                                      <div className="text-emerald-700 text-[10px] truncate font-['Noto_Sans_Gujarati'] mt-0.5">
                                        {[r.address_gu, r.address_line_2_gu, r.address_line_3_gu].filter(Boolean).join(', ')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">
                                    <div>{r.city || '—'}</div>
                                    {r.city_gu && (
                                      <div className="text-emerald-700 text-[10px] font-['Noto_Sans_Gujarati']">
                                        {r.city_gu}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{r.state || '—'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-600">{r.mobile_no || '—'}</td>
                                  <td className="px-4 py-2">
                                    {r.is_already_exists ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                        <span>ALREADY EXISTS {duplicateAction === 'skip' ? '(WILL SKIP)' : duplicateAction === 'update' ? '(WILL UPDATE)' : '(DUPLICATE)'}</span>
                                      </span>
                                    ) : r.status === 'valid' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        <span>NEW PARTY</span>
                                      </span>
                                    ) : r.status === 'warning' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-yellow-100 text-yellow-800 border border-yellow-300">
                                        <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                        <span>WARNING: {r.warnings?.[0]}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 border border-red-300">
                                        <XCircle className="w-3 h-3 text-red-600" />
                                        <span>ERROR: {r.errors?.[0]}</span>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                                  No rows to preview.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  {!importSummary ? (
                    <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3 text-xs font-bold">
                      <button
                        onClick={() => {
                          setFile(null);
                          setFileInfo(null);
                          setValidation(null);
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={() => handleConfirmImport(false)}
                        disabled={importing || ((validation.valid_count || 0) + (validation.warning_count || 0) + (validation.already_exists_count || 0) === 0)}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 disabled:opacity-50"
                      >
                        <FileCheck className="w-4 h-4" />
                        <span>
                          {importing
                            ? 'Processing Import...'
                            : duplicateAction === 'skip'
                            ? `Import Clean Parties (Add ${validation.new_count ?? validation.valid_count}, Skip ${validation.already_exists_count || 0} Duplicates)`
                            : duplicateAction === 'update'
                            ? `Import & Update Parties (${(validation.new_count || 0) + (validation.already_exists_count || 0)})`
                            : `Import Everything (${(validation.valid_count || 0) + (validation.warning_count || 0) + (validation.already_exists_count || 0)})`}
                        </span>
                      </button>
                    </div>
                  ) : (
                    /* Import Summary Modal / Box */
                    <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-300 space-y-3 text-xs">
                      <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Excel Import Completed Successfully!</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-semibold text-slate-800">
                        <div className="p-2.5 bg-white rounded-lg border border-emerald-200 shadow-sm">
                          <span className="text-[10px] text-slate-500 block uppercase">Imported Parties</span>
                          <strong className="text-emerald-700 text-base">{importSummary.imported}</strong>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-amber-200 shadow-sm">
                          <span className="text-[10px] text-amber-700 block uppercase">Skipped (Already Exists)</span>
                          <strong className="text-amber-800 text-base">{importSummary.skipped}</strong>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                          <span className="text-[10px] text-slate-500 block uppercase">Duplicates Allowed</span>
                          <strong className="text-slate-700 text-base">{importSummary.duplicates}</strong>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-red-200 shadow-sm">
                          <span className="text-[10px] text-red-500 block uppercase">Errors</span>
                          <strong className="text-red-600 text-base">{importSummary.errors}</strong>
                        </div>
                      </div>

                      {/* Skipped Parties List */}
                      {importSummary.skipped_parties && importSummary.skipped_parties.length > 0 && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200 text-xs">
                          <div
                            onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                            className="flex items-center justify-between cursor-pointer text-amber-900 font-bold"
                          >
                            <span>ℹ️ Notice: {importSummary.skipped} already existing parties were skipped (Vyapar protection)</span>
                            <span className="text-blue-600 text-[11px] underline">
                              {showSkippedDetails ? 'Hide List' : 'View Skipped Parties'}
                            </span>
                          </div>
                          {showSkippedDetails && (
                            <ul className="mt-2 text-[11px] text-slate-700 max-h-36 overflow-y-auto space-y-1 list-disc pl-5">
                              {importSummary.skipped_parties.map((pName: any, i) => (
                                <li key={i}>
                                  <strong className="text-slate-800">
                                    {typeof pName === 'object' ? pName.party_name : pName}
                                  </strong>
                                  {typeof pName === 'object' && pName.reason ? ` — ${pName.reason}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="pt-2 flex items-center gap-3">
                        <button
                          onClick={() => onNavigate('parties')}
                          className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-md"
                        >
                          View Parties List &rarr;
                        </button>
                        <button
                          onClick={() => onNavigate('print')}
                          className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500 shadow-md"
                        >
                          Go to Print Envelope &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Past Import History Tab */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Past Excel Import Logs</span>
            </h3>
            <button onClick={loadHistory} className="text-blue-600 hover:underline font-bold">
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3">Date & Time</th>
                  <th className="px-5 py-3">Filename</th>
                  <th className="px-5 py-3">Total Rows</th>
                  <th className="px-5 py-3">Imported</th>
                  <th className="px-5 py-3">Duplicates</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      Loading history...
                    </td>
                  </tr>
                ) : historyList.length > 0 ? (
                  historyList.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-600">{h.created_at}</td>
                      <td className="px-5 py-3 font-bold text-slate-900">{h.filename}</td>
                      <td className="px-5 py-3">{h.total_rows}</td>
                      <td className="px-5 py-3 font-bold text-emerald-700">{h.imported_rows}</td>
                      <td className="px-5 py-3 text-slate-600">{h.duplicate_rows}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      No import history found.
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
