import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  Save, 
  Printer, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Package, 
  MapPin, 
  Phone, 
  FileText,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronDown,
  X
} from 'lucide-react';
import { autocompleteParties, createPrintJob, downloadEnvelopePDF, fetchSettings } from '../api/client';
import { Party, CaseBreakdownItem } from '../types';

interface MobileNewJobProps {
  initialParty?: Party | null;
  onNavigate: (tab: string, state?: any) => void;
}

const FLUID_VOLUMES = ['100ML', '200ML', '250ML', '500ML', '1LTR'] as const;

export const MobileNewJob: React.FC<MobileNewJobProps> = ({ initialParty, onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [matchingParties, setMatchingParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(initialParty || null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Job parameters
  const [totalCases, setTotalCases] = useState<number>(1);
  const [weightKg, setWeightKg] = useState<string>('');
  const [parcelType, setParcelType] = useState<string>('Standard');
  const [deliveryRoute, setDeliveryRoute] = useState<string>('');
  const [deliveryBoy, setDeliveryBoy] = useState<string>('');
  const [language, setLanguage] = useState<'en' | 'gu'>('en');
  const [templateFormat, setTemplateFormat] = useState<'attachment_pdf' | 'marg_grid_22'>('attachment_pdf');
  
  // Breakdown
  const [caseBreakdown, setCaseBreakdown] = useState<CaseBreakdownItem[]>([]);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);

  // States
  const [saving, setSaving] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);
  const [successModal, setSuccessModal] = useState<{ open: boolean; jobId?: number; message?: string }>({ open: false });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const canPrintDirectly = currentUser.role === 'super_admin' || currentUser.role === 'admin' || currentUser.can_print !== false;

  // Autocomplete search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setMatchingParties([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await autocompleteParties(searchQuery.trim(), 'contains');
        setMatchingParties(results || []);
        setShowDropdown(true);
      } catch (e) {
        console.error('Failed to search parties', e);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectParty = (p: Party) => {
    setSelectedParty(p);
    setSearchQuery('');
    setShowDropdown(false);
    if (p.route) setDeliveryRoute(p.route);
  };

  const handleCaseChange = (newVal: number) => {
    const val = Math.max(1, Math.min(999, newVal));
    setTotalCases(val);
  };

  const addBreakdownVolume = (vol: string) => {
    setCaseBreakdown((prev) => {
      const existing = prev.find((item) => item.volume === vol);
      if (existing) {
        return prev.map((item) => item.volume === vol ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { type: 'CASE', volume: vol, qty: 1 }];
    });
  };

  const removeBreakdownItem = (index: number) => {
    setCaseBreakdown((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveJob = async (shouldPrint: boolean = false) => {
    if (!selectedParty) {
      setErrorMsg('Please select a recipient party first.');
      return;
    }

    setErrorMsg(null);
    if (shouldPrint) setPrinting(true);
    else setSaving(true);

    try {
      const payload: any = {
        party_id: selectedParty.id,
        party_name: selectedParty.party_name,
        party_name_gu: selectedParty.party_name_gu || undefined,
        party_code: selectedParty.party_code,
        address: selectedParty.address,
        address_gu: selectedParty.address_gu || undefined,
        address_line_2: selectedParty.address_line_2 || undefined,
        address_line_2_gu: selectedParty.address_line_2_gu || undefined,
        address_line_3: selectedParty.address_line_3 || undefined,
        address_line_3_gu: selectedParty.address_line_3_gu || undefined,
        city: selectedParty.city,
        city_gu: selectedParty.city_gu || undefined,
        state: selectedParty.state || undefined,
        state_gu: selectedParty.state_gu || undefined,
        mobile_no: selectedParty.mobile_no || undefined,
        gst_no: selectedParty.gst_no || undefined,
        total_cases: totalCases,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        parcel_type: parcelType,
        delivery_route: deliveryRoute || undefined,
        delivery_boy_name: deliveryBoy || undefined,
        envelope_size: '9x4',
        envelopes_per_page: 2,
        template_format: templateFormat,
        language: language,
        case_breakdown: caseBreakdown.length > 0 ? caseBreakdown : undefined,
        created_by: currentUser.username || 'Mobile User',
      };

      const res = await createPrintJob(payload);
      const jobId = res?.id || res?.job_id;

      if (shouldPrint && jobId) {
        // Trigger direct PDF download / view
        downloadEnvelopePDF(jobId);
      }

      setSuccessModal({
        open: true,
        jobId: jobId,
        message: shouldPrint 
          ? 'Envelope created and PDF generated successfully!' 
          : 'Job saved to Cloud Database! Visible instantly in Web Admin.',
      });

    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save job. Please try again.');
    } finally {
      setSaving(false);
      setPrinting(false);
    }
  };

  const resetForm = () => {
    setSelectedParty(null);
    setSearchQuery('');
    setTotalCases(1);
    setWeightKg('');
    setCaseBreakdown([]);
    setSuccessModal({ open: false });
    setErrorMsg(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Create Envelope Dispatch</h2>
          <p className="text-[10px] text-slate-400">Save to Cloud or Print PDF</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
              language === 'en' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('gu')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
              language === 'gu' ? 'bg-indigo-600 text-white shadow font-gujarati' : 'text-slate-400 hover:text-white'
            }`}
          >
            ગુજરાતી
          </button>
        </div>
      </div>

      {/* Party Search & Selection */}
      <div className="space-y-2 relative">
        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
          <span>Recipient Party</span>
          {selectedParty && (
            <button
              onClick={() => setSelectedParty(null)}
              className="text-[11px] text-red-400 hover:text-red-300 font-semibold"
            >
              Change Party
            </button>
          )}
        </label>

        {!selectedParty ? (
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Party Name, Code, City..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Suggestions */}
            {showDropdown && matchingParties.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-800">
                {matchingParties.map((party) => (
                  <button
                    key={party.id}
                    onClick={() => selectParty(party)}
                    className="w-full p-3 text-left hover:bg-slate-800/80 active:bg-blue-900/30 transition-all flex flex-col"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate">{party.party_name}</span>
                      {party.party_code && (
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                          {party.party_code}
                        </span>
                      )}
                    </div>
                    {party.party_name_gu && (
                      <div className="text-[11px] text-indigo-300 font-gujarati mt-0.5">
                        {party.party_name_gu}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 truncate mt-1">
                      {party.city || party.address}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Selected Party Card */
          <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-sm text-white">{selectedParty.party_name}</div>
                {selectedParty.party_name_gu && (
                  <div className="text-xs text-indigo-300 font-gujarati mt-0.5">
                    {selectedParty.party_name_gu}
                  </div>
                )}
              </div>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono font-bold">
                {selectedParty.party_code || `#${selectedParty.id}`}
              </span>
            </div>

            <div className="text-xs text-slate-300 space-y-0.5 pt-1 border-t border-blue-500/20">
              <div className="flex items-start gap-1.5 text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="leading-tight">
                  {selectedParty.address}, {selectedParty.city}
                </span>
              </div>
              {selectedParty.mobile_no && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>{selectedParty.mobile_no}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Case Quantity Stepper */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-blue-400" />
            Total Case Quantity
          </span>
          <span className="text-xs font-extrabold text-blue-400">
            {totalCases} {totalCases === 1 ? 'Case' : 'Cases'}
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleCaseChange(totalCases - 1)}
            className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-lg active:scale-95 transition-all"
          >
            <Minus className="w-5 h-5" />
          </button>

          <input
            type="number"
            min={1}
            max={999}
            value={totalCases}
            onChange={(e) => handleCaseChange(parseInt(e.target.value) || 1)}
            className="flex-1 h-12 bg-slate-950 border border-slate-700 rounded-xl text-center text-lg font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={() => handleCaseChange(totalCases + 1)}
            className="w-12 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-md shadow-blue-600/30"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stepper Chips */}
        <div className="flex items-center gap-2 pt-1">
          {[1, 2, 3, 5, 10].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleCaseChange(num)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                totalCases === num 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* Case Breakdown (Collapsible) */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-300"
        >
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-400" />
            Fluid Breakdown & Bottles (Optional)
          </span>
          <span className="text-[10px] text-purple-400">
            {caseBreakdown.length > 0 ? `${caseBreakdown.length} items` : '+ Add'}
          </span>
        </button>

        {showBreakdown && (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex flex-wrap gap-1.5">
              {FLUID_VOLUMES.map((vol) => (
                <button
                  key={vol}
                  type="button"
                  onClick={() => addBreakdownVolume(vol)}
                  className="px-2.5 py-1 bg-purple-950/60 border border-purple-800/60 hover:bg-purple-900 text-purple-200 rounded-lg text-xs font-semibold active:scale-95 transition-all"
                >
                  + {vol}
                </button>
              ))}
            </div>

            {caseBreakdown.length > 0 && (
              <div className="space-y-1.5">
                {caseBreakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                    <span className="font-bold text-slate-200">{item.volume || item.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{item.qty} items</span>
                      <button
                        type="button"
                        onClick={() => removeBreakdownItem(idx)}
                        className="text-red-400 p-1 hover:text-red-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Additional Details (Weight & Route) */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <label className="text-[11px] font-bold text-slate-400">Weight (KG)</label>
          <input
            type="number"
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="e.g. 2.5"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <label className="text-[11px] font-bold text-slate-400">Route</label>
          <input
            type="text"
            value={deliveryRoute}
            onChange={(e) => setDeliveryRoute(e.target.value)}
            placeholder="e.g. Dehgam Local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        {/* Primary Save Button (for all users / employees) */}
        <button
          type="button"
          onClick={() => handleSaveJob(false)}
          disabled={saving || printing || !selectedParty}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Syncing with Cloud...' : '💾 Save Job to Cloud Database'}</span>
        </button>

        {/* Print Button (Admins or permitted employees) */}
        {canPrintDirectly && (
          <button
            type="button"
            onClick={() => handleSaveJob(true)}
            disabled={saving || printing || !selectedParty}
            className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>{printing ? 'Generating Envelope...' : '🖨️ Save & Download Envelope PDF'}</span>
          </button>
        )}
      </div>

      {/* Success Modal */}
      {successModal.open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Job Synced Successfully!</h3>
              <p className="text-xs text-slate-300 mt-1">{successModal.message}</p>
            </div>

            {successModal.jobId && (
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400">
                Job Reference #{successModal.jobId}
              </div>
            )}

            <div className="space-y-2 pt-2">
              {successModal.jobId && (
                <button
                  onClick={() => downloadEnvelopePDF({ job_id: successModal.jobId! })}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Download / Print PDF</span>
                </button>
              )}

              <button
                onClick={resetForm}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                + Create Another Dispatch
              </button>

              <button
                onClick={() => onNavigate('history')}
                className="w-full py-2 text-xs text-slate-400 hover:text-white"
              >
                View History Feed →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
