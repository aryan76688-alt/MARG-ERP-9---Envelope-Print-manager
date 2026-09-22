import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings as SettingsIcon, 
  Building, 
  Sliders, 
  Printer, 
  Layout, 
  FileText, 
  Database, 
  Save, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { SenderSettings, AppSettings } from '../types';
import { fetchSettings, saveSettings, getBackupExportUrl, getExportPartiesUrl, getExportHistoryUrl } from '../api/client';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('company');
  const [sender, setSender] = useState<SenderSettings>({
    business_name: 'SHREEJI HEALTHCARE-HEALTHCARE',
    address: 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305',
    city: 'DEHGAM',
    state: 'GUJARAT',
    mobile: '+91 99245 44283',
    landline: '02716-245123',
    email: 'SHREEJISEVEN@GMAIL.COM',
    gst_no: '24AAACS1234F1Z5',
  });

  const [app, setApp] = useState<AppSettings>({
    default_envelope_size: 'A4',
    default_orientation: 'Landscape',
    default_copies: 1,
    default_printer: 'Microsoft Print to PDF',
    margin_top_mm: 15.0,
    margin_left_mm: 3.0,
    margin_right_mm: 3.0,
    margin_bottom_mm: 10.0,
    scale_percent: 100,
    envelopes_per_page: 2,
    show_header: true,
    show_footer: false,
    show_barcode: true,
    show_case_number: true,
    show_weight: true,
    show_mobile: true,
    show_party_code: true,
    show_date: false,
    show_gst: false,
    show_pan: false,
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings()
      .then((res) => {
        if (res.sender) setSender(res.sender);
        if (res.app) setApp(res.app);
      })
      .catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    try {
      await saveSettings({ sender, app });
      setSuccessMsg('Settings updated and saved successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error('Restore failed');
      alert('Database backup restored successfully!');
      window.location.reload();
    } catch (err: any) {
      alert('Failed to restore backup: ' + err.message);
    }
  };

  const tabs = [
    { id: 'company', label: 'COMPANY DETAILS', icon: Building },
    { id: 'general', label: 'GENERAL', icon: SettingsIcon },
    { id: 'printer', label: 'PRINTER', icon: Printer },
    { id: 'layout', label: 'LAYOUT & MARGINS', icon: Layout },
    { id: 'template', label: 'TEMPLATE TOGGLES', icon: FileText },
    { id: 'backup', label: 'BACKUP & EXPORTS', icon: Database },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            <span>Application Settings & Configuration</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Configure sender details, default printer, envelope layout, template elements, and database backups.
          </p>
        </div>

        {successMsg && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto text-xs font-bold select-none">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form Area */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-xs space-y-6">
        
        {/* TAB 1: COMPANY DETAILS */}
        {activeTab === 'company' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Sender Business Information</h3>
              <p className="text-slate-500">
                This appears in the "FROM" section of every printed MARG courier envelope.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company / Business Name *</label>
                <input
                  type="text"
                  value={sender.business_name}
                  onChange={(e) => setSender({ ...sender, business_name: e.target.value })}
                  placeholder="e.g. SHREEJI 7"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-extrabold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  value={sender.mobile}
                  onChange={(e) => setSender({ ...sender, mobile: e.target.value })}
                  placeholder="e.g. 9924544283"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={sender.address}
                  onChange={(e) => setSender({ ...sender, address: e.target.value })}
                  placeholder="e.g. DAHEGAM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">City *</label>
                <input
                  type="text"
                  value={sender.city}
                  onChange={(e) => setSender({ ...sender, city: e.target.value })}
                  placeholder="e.g. DAHEGAM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">State *</label>
                <input
                  type="text"
                  value={sender.state}
                  onChange={(e) => setSender({ ...sender, state: e.target.value })}
                  placeholder="e.g. GUJARAT"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={sender.email || ''}
                  onChange={(e) => setSender({ ...sender, email: e.target.value })}
                  placeholder="contact@shreeji7.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">GST Number (Optional)</label>
                <input
                  type="text"
                  value={sender.gst_no || ''}
                  onChange={(e) => setSender({ ...sender, gst_no: e.target.value })}
                  placeholder="e.g. 24AAACS1234F1Z5"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GENERAL */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">General Print Preferences</h3>
              <p className="text-slate-500">Default options loaded when opening Print Envelope screen.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Envelope Size</label>
                <select
                  value={app.default_envelope_size}
                  onChange={(e) => setApp({ ...app, default_envelope_size: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="A4">A4 (2 Envelopes/Page)</option>
                  <option value="A5">A5 Sheet</option>
                  <option value="DL">DL (220 × 110 mm)</option>
                  <option value="DL Long">DL Long</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Orientation</label>
                <select
                  value={app.default_orientation}
                  onChange={(e) => setApp({ ...app, default_orientation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="Landscape">Landscape</option>
                  <option value="Portrait">Portrait</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Copies</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={app.default_copies}
                  onChange={(e) => setApp({ ...app, default_copies: parseInt(e.target.value || '1', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRINTER */}
        {activeTab === 'printer' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Printer Setup</h3>
              <p className="text-slate-500">Select target printer device or virtual PDF driver.</p>
            </div>

            <div className="max-w-md space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Selected Default Printer</label>
                <select
                  value={app.default_printer}
                  onChange={(e) => setApp({ ...app, default_printer: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-800"
                >
                  <option value="Microsoft Print to PDF">Microsoft Print to PDF</option>
                  <option value="Default System Printer">Default System Printer</option>
                  <option value="HP LaserJet Professional">HP LaserJet Professional</option>
                  <option value="Canon LBP2900B">Canon LBP2900B</option>
                  <option value="Epson L3150 Series">Epson L3150 Series</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                <span className="font-bold">Tip:</span> Selecting "Microsoft Print to PDF" allows you to digitally save all dispatched envelopes for paperless filing.
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LAYOUT & MARGINS */}
        {activeTab === 'layout' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Layout & Page Margins</h3>
              <p className="text-slate-500">Fine-tune millimeter margins for precise printer hardware feeding.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Top Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_top_mm}
                  onChange={(e) => setApp({ ...app, margin_top_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bottom Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_bottom_mm}
                  onChange={(e) => setApp({ ...app, margin_bottom_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Left Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_left_mm}
                  onChange={(e) => setApp({ ...app, margin_left_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Right Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_right_mm}
                  onChange={(e) => setApp({ ...app, margin_right_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Scale Percentage</label>
                <input
                  type="number"
                  min={50}
                  max={150}
                  value={app.scale_percent}
                  onChange={(e) => setApp({ ...app, scale_percent: parseInt(e.target.value || '100', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Envelopes Per Page</label>
                <select
                  value={app.envelopes_per_page}
                  onChange={(e) => setApp({ ...app, envelopes_per_page: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                >
                  <option value={2}>2 Envelopes / Page (A4 Top & Bottom)</option>
                  <option value={1}>1 Envelope / Page</option>
                  <option value={4}>4 Envelopes / Page</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: TEMPLATE TOGGLES */}
        {activeTab === 'template' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Envelope Elements & Display Toggles</h3>
              <p className="text-slate-500">Toggle individual sections shown on the printed courier envelope.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { key: 'show_header', label: 'Show Header (MARG COURIER Branding Strip)' },
                { key: 'show_barcode', label: 'Show Code128 Barcode & Case Identifier' },
                { key: 'show_case_number', label: 'Show Case Number Badge (e.g. CASE 1/3)' },
                { key: 'show_weight', label: 'Show Case Weight Badge (e.g. WT: 2.50 KG)' },
                { key: 'show_mobile', label: 'Show Recipient Mobile Number' },
                { key: 'show_party_code', label: 'Show Recipient Party Code Tag' },
                { key: 'show_date', label: 'Show Print Date on Envelope' },
                { key: 'show_footer', label: 'Show Disclaimer & Instructions Footer' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(app as any)[item.key] ?? false}
                    onChange={(e) => setApp({ ...app, [item.key]: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="font-bold text-slate-800">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: BACKUP & EXPORTS */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Data Backup & Bulk Exports</h3>
              <p className="text-slate-500">
                Full relational database backups (JSON) and Microsoft Excel (.xlsx) exports.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Database Export */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                <div className="font-bold text-blue-950 text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Full Database JSON Backup</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Exports all parties, sender details, application settings, and print history into a structured JSON file.
                </p>
                <a
                  href={getBackupExportUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Backup JSON</span>
                </a>
              </div>

              {/* Database Import */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Restore from Backup JSON</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Restore previously saved database JSON backup. Safely merges parties and updates configuration.
                </p>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => e.target.files && e.target.files[0] && handleImportBackup(e.target.files[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Backup JSON File</span>
                </button>
              </div>

              {/* Excel Exports */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-600" />
                  <span>Export Parties Spreadsheet (.xlsx)</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Clean Microsoft Excel spreadsheet of all parties, codes, addresses, and contacts. NO PIN code.
                </p>
                <a
                  href={getExportPartiesUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Parties (.xlsx)</span>
                </a>
              </div>

              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
                <div className="font-bold text-purple-950 text-sm flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  <span>Export Print History (.xlsx)</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Full historical dispatch records including dates, parties, cases, weights, and status.
                </p>
                <a
                  href={getExportHistoryUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Export History (.xlsx)</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Save Footer Button */}
        {activeTab !== 'backup' && (
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Settings...' : 'Save Configuration'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
