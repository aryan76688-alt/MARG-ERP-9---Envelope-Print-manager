import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  HardDrive,
  FileCode,
  ShieldCheck,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  fetchDatabaseInfo,
  DatabaseInfo,
  getBackupSqliteUrl,
  getBackupExportUrl,
  importDatabaseFile
} from '../api/client';

interface DatabaseBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DatabaseBackupModal: React.FC<DatabaseBackupModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isApk = typeof window !== 'undefined' && (
    navigator.userAgent.includes('ShreejiEnvelopeApp') ||
    window.location.search.includes('mode=apk') ||
    (window as any).isAndroidApp === true ||
    (window as any).AndroidBridge !== undefined
  );

  const loadInfo = async () => {
    try {
      setLoading(true);
      const info = await fetchDatabaseInfo();
      setDbInfo(info);
    } catch (err: any) {
      console.warn('Could not load database info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadInfo();
      setStatusMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handle Binary SQLite Export / Download
  const handleDownloadSqlite = async () => {
    try {
      setExporting(true);
      setStatusMessage(null);
      const url = getBackupSqliteUrl();
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to download database from server');
      const blob = await res.blob();

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `envelope_manager_${dateStr}.db`;

      // Android Bridge storage save if inside APK
      if (isApk && (window as any).AndroidBridge && typeof (window as any).AndroidBridge.saveDatabaseToStorage === 'function') {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1];
          const success = (window as any).AndroidBridge.saveDatabaseToStorage(base64Data, filename);
          if (success) {
            setStatusMessage({
              type: 'success',
              text: `✅ Saved to Android Storage: Downloads/ShreejiBackups/${filename}`
            });
          } else {
            // Fallback to browser blob
            triggerBlobDownload(blob, filename);
          }
          setExporting(false);
        };
        reader.readAsDataURL(blob);
      } else {
        triggerBlobDownload(blob, filename);
        setStatusMessage({
          type: 'success',
          text: `✅ Full SQLite database downloaded (${filename})`
        });
        setExporting(false);
      }
    } catch (err: any) {
      setExporting(false);
      setStatusMessage({
        type: 'error',
        text: '❌ Failed to download database: ' + err.message
      });
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  // Handle Database File Import / Restore
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const isDb = fileName.endsWith('.db') || fileName.endsWith('.sqlite') || fileName.endsWith('.sqlite3');
    const isJson = fileName.endsWith('.json');

    if (!isDb && !isJson) {
      alert('Please select a valid .db, .sqlite, or .json database file.');
      e.target.value = '';
      return;
    }

    const confirmMsg = isDb
      ? `⚠️ સાવધાન (Warning): શું તમે '${fileName}' ડેટાબેઝ ફાઇલ ઇમ્પોર્ટ કરવા માંગો છો?\n\nઆનાથી તમામ વર્તમાન પાર્ટીઓ અને રેકોર્ડ્સ અપડેટ થશે. હાલના ડેટાબેઝનું સેફ્ટી બેકઅપ (.bak) આપોઆપ બની જશે.`
      : `શું તમે '${fileName}' JSON બેકઅપ ફાઇલ ઇમ્પોર્ટ કરવા માંગો છો?`;

    if (!window.confirm(confirmMsg)) {
      e.target.value = '';
      return;
    }

    try {
      setImporting(true);
      setStatusMessage(null);
      const res = await importDatabaseFile(file);
      setStatusMessage({
        type: 'success',
        text: `✅ ${res.message || 'Database restored successfully!'}`
      });

      if (onSuccess) onSuccess();

      setTimeout(() => {
        if (window.confirm('ડેટાબેઝ સફળતાપૂર્વક ઇમ્પોર્ટ થયો છે! નવા ડેટાને લોડ કરવા માટે પેજ રિલોડ કરીએ? (Reload now?)')) {
          window.location.reload();
        }
      }, 1000);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: '❌ Import failed: ' + (err.message || 'Unknown error occurred')
      });
    } finally {
      setImporting(false);
      e.target.value = '';
      loadInfo();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto font-sans">
        
        {/* 1. Header (Stitch Dark Slate Glassmorphism) */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <Database className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white font-display">
                  Database Hub (ડેટાબેઝ)
                </h2>
                <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  SQLite WAL
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Export full database for download or import / restore from file.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Live Database Stats Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3.5 sm:px-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-bold flex items-center gap-1.5 text-slate-700">
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <span>Database Status (લાઈવ સ્થિતિ)</span>
            </span>
            <button
              onClick={loadInfo}
              disabled={loading}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              title="Refresh database info"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Parties</div>
              <div className="text-base font-black text-slate-900 font-mono">
                {dbInfo?.parties_count?.toLocaleString('en-IN') ?? '...'}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Envelopes</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {dbInfo?.jobs_count?.toLocaleString('en-IN') ?? '...'}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">DB Size</div>
              <div className="text-base font-black text-indigo-600 font-mono">
                {dbInfo?.file_size_formatted ?? '...'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Main Action Panels */}
        <div className="p-4 sm:p-5 space-y-4">
          
          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold border flex items-center gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="flex-1">{statusMessage.text}</span>
            </div>
          )}

          {/* SECTION A: EXPORT FULL DATABASE */}
          <div className="p-4 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 to-blue-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-indigo-950">
                    Export Full Database (ડાઉનલોડ)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Download complete SQLite database with all master data & GPS pins
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {/* Primary: Full SQLite .db Download */}
              <button
                type="button"
                onClick={handleDownloadSqlite}
                disabled={exporting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
                <span>
                  {exporting
                    ? 'Flushing WAL & Downloading...'
                    : 'Download Full SQLite Database (.db)'}
                </span>
              </button>

              {/* Secondary: JSON Backup Export */}
              <a
                href={getBackupExportUrl()}
                download="MARG_Envelope_Backup.json"
                className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 transition-colors"
              >
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                <span>Download JSON Backup (ટેક્સ્ટ બેકઅપ .json)</span>
              </a>
            </div>
          </div>

          {/* SECTION B: IMPORT FULL DATABASE */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center">
                  <Upload className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Import Database (રિસ્ટોર / અપલોડ)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Restore database from a previous SQLite <code className="font-mono text-indigo-700">.db</code> or <code className="font-mono text-indigo-700">.json</code> file
                  </p>
                </div>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,.json"
              onChange={handleFileSelected}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>Restoring Database & Syncing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Select & Import Database File (.db / .json)</span>
                </>
              )}
            </button>

            <div className="flex items-start gap-1.5 text-[10px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Safety First: Before replacing, a backup copy (<code className="font-mono text-slate-700">.db.bak</code>) is automatically generated.
              </span>
            </div>
          </div>

        </div>

        {/* 4. Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Shreeji Healthcare Logistics • Dahegam
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors"
          >
            Close (બંધ કરો)
          </button>
        </div>

      </div>
    </div>
  );
};
