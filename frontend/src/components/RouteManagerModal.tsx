import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Save, 
  Calendar, 
  MapPin, 
  FileSpreadsheet, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Party, RouteBatchUpdateItem, GoogleSheetsSyncResult } from '../types';
import { syncGoogleSheetRoutes, getExportRoutesTemplateUrl, batchUpdateRoutes, fetchParties } from '../api/client';

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
  savedSheetId = '',
  savedApiKey = 'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg'
}) => {
  const [activeTab, setActiveTab] = useState<'sheets' | 'editor'>('sheets');
  const [sheetUrlOrId, setSheetUrlOrId] = useState<string>(savedSheetId || '');
  const [apiKey, setApiKey] = useState<string>(savedApiKey || 'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<GoogleSheetsSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Editor Table state
  const [internalParties, setInternalParties] = useState<Party[]>(parties);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [weekdayFilter, setWeekdayFilter] = useState<string>('ALL');
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

  // Load parties if not supplied or update internal list
  useEffect(() => {
    if (parties && parties.length > 0) {
      setInternalParties(parties);
    } else if (isOpen) {
      fetchParties({ limit: -1 }).then((res) => {
        if (res && res.items) setInternalParties(res.items);
      }).catch(console.error);
    }
  }, [parties, isOpen]);

  // Initialize edited routes from parties
  useEffect(() => {
    const list = internalParties.length > 0 ? internalParties : parties;
    if (list && list.length > 0) {
      const initialMap: Record<number, any> = {};
      for (const p of list) {
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
  }, [internalParties, parties]);

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

  // Google Sheets Sync
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
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync Google Sheet');
    } finally {
      setIsSyncing(false);
    }
  };

  // Direct Table Batch Save
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
      if (!matchCode && !matchName && !matchGu) return false;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30 text-blue-300">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg tracking-tight">Route System & Google Sheets Sync</h3>
                <span className="text-[10px] font-extrabold uppercase bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                  Max 3 Routes
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Set up to 3 delivery routes per party (Monday–Sunday) with auto-Gujarati translation and direct Google Sheets sync.
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
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Direct Route Editor</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                {parties.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={getExportRoutesTemplateUrl()}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="Download clean CSV prefilled with all party codes, names, and 3 route slots"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Download CSV Template</span>
            </a>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: GOOGLE SHEETS SYNC */}
          {activeTab === 'sheets' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Shortcut Banner: Direct Route Editor vs Google Sheets */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-black text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Want to Edit Routes Directly on Website Without Google Sheets?</span>
                  </h4>
                  <p className="text-blue-100 mt-0.5">
                    You can edit and set weekday routes directly on this page without creating a Google Sheet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className="px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 font-black rounded-xl shadow-sm transition-all whitespace-nowrap cursor-pointer shrink-0"
                >
                  Switch to Direct Route Editor &rarr;
                </button>
              </div>

              {/* 3 Simple Steps Card */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 text-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-black text-emerald-950 text-sm">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>How to Create & Link Your Google Sheet (3 Simple Steps)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={getExportRoutesTemplateUrl()}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Step 1: Download Parties CSV</span>
                    </a>
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg shadow-sm transition-colors text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Step 2: Open sheets.new</span>
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-slate-700">
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                    <strong className="text-emerald-800 block font-black">1. Upload CSV</strong>
                    <p className="text-[11px] leading-relaxed">
                      Download the CSV above, open <strong>sheets.new</strong>, and click <strong>File &rarr; Import &rarr; Upload</strong> to load all 1,836 parties.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                    <strong className="text-emerald-800 block font-black">2. Set Access to Public</strong>
                    <p className="text-[11px] leading-relaxed">
                      In Google Sheets, click the blue <strong>Share</strong> button (top right) &rarr; change General access to <strong>"Anyone with the link" (Viewer)</strong>.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1">
                    <strong className="text-emerald-800 block font-black">3. Paste Link & Sync</strong>
                    <p className="text-[11px] leading-relaxed">
                      Click <strong>Copy link</strong> in Google Sheets, paste it below, and click <strong>Sync Routes Now</strong>!
                    </p>
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
                        onChange={(e) => setSheetUrlOrId(e.target.value)}
                        placeholder="Paste your copied Google Sheet link here (e.g. https://docs.google.com/spreadsheets/d/...)"
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
                    <p className="text-[11px] text-slate-500 mt-1">
                      ⚠️ If you get <strong>HTTP 404</strong>, make sure you clicked <strong>Share</strong> in your Google Sheet &rarr; changed from <em>Restricted</em> to <strong>"Anyone with the link can view"</strong>!
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

                {/* Error Banner */}
                {syncError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                )}

                {/* Success Banner */}
                {syncResult && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{syncResult.message}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Total Rows:</span>
                        <strong className="text-slate-900">{syncResult.total_rows}</strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Updated Parties:</span>
                        <strong className="text-emerald-700">{syncResult.updated_count}</strong>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Unmatched / Not Found:</span>
                        <strong className="text-rose-600">{syncResult.not_found_count}</strong>
                      </div>
                    </div>
                    {syncResult.not_found && syncResult.not_found.length > 0 && (
                      <div className="pt-2 text-[10px] text-slate-600">
                        <span className="font-bold text-slate-700 block mb-0.5">Not found in system:</span>
                        <span className="font-mono bg-white p-1.5 rounded block border border-emerald-100 max-h-20 overflow-y-auto">
                          {syncResult.not_found.join(', ')}
                        </span>
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

          {/* TAB 2: DIRECT ROUTE EDITOR */}
          {activeTab === 'editor' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search by party code or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs bg-white"
                    />
                  </div>

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
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{isSaving ? 'Saving...' : 'Save All Route Changes'}</span>
                  </button>
                </div>
              </div>

              {/* High-density Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10 text-[11px] uppercase tracking-wider font-extrabold">
                    <tr>
                      <th className="py-2.5 px-3 w-28">Party Code</th>
                      <th className="py-2.5 px-3 w-52">Party Name</th>
                      <th className="py-2.5 px-3">Primary Route 1 (મુખ્ય રૂટ)</th>
                      <th className="py-2.5 px-3">Secondary Route 2 (બીજો રૂટ)</th>
                      <th className="py-2.5 px-3">Third Route 3 (ત્રીજો રૂટ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredParties.slice(0, 100).map((p) => {
                      const id = p.id!;
                      const r = editedRoutes[id] || { route_1: '', route_2: '', route_3: '', route_1_gu: '', route_2_gu: '', route_3_gu: '' };
                      return (
                        <tr key={id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Party Code */}
                          <td className="py-2.5 px-3 align-top">
                            <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shadow-xs inline-block">
                              {p.party_code || `P-${id}`}
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

              {filteredParties.length > 100 && (
                <p className="text-[11px] text-slate-400 text-center font-medium">
                  Showing first 100 of {filteredParties.length} parties. Use search or filter above to narrow down.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Each party is assigned at most 3 routes. Changes sync to envelopes & dispatch run-sheets.
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
