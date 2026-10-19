import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Printer, 
  Plus, 
  Minus, 
  Share2, 
  MapPin, 
  Truck, 
  X, 
  Phone, 
  CheckCircle2 
} from 'lucide-react';
import { Party, CaseBreakdownItem } from '../types';
import { autocompleteParties, createPrintJob, downloadEnvelopePDF } from '../api/client';
import { searchPartiesOffline, queueOfflineJob } from '../offline/db';
import { generateWhatsAppDispatchUrl } from '../utils/whatsapp';

interface MobilePrintProps {
  initialParty?: Party | null;
  reprintJob?: any | null;
  onNavigate: (tab: string, state?: any) => void;
  onJobCreated?: () => void;
}

export const MobilePrint: React.FC<MobilePrintProps> = ({
  initialParty,
  reprintJob,
  onNavigate,
  onJobCreated
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(initialParty || null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [language, setLanguage] = useState<'gu' | 'en'>('gu');

  // Case counts & Breakdown
  const [totalCases, setTotalCases] = useState<number>(1);
  const [deliveryRoute, setDeliveryRoute] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [printing, setPrinting] = useState<boolean>(false);
  const [successJob, setSuccessJob] = useState<any | null>(null);

  // IV Fluid items (200ML permanently excluded)
  const [caseItems, setCaseItems] = useState<CaseBreakdownItem[]>([]);
  const fluidTypes = ['NS', 'RL', 'DNS', 'METRO'];
  const fluidVolumes = ['100ML', '250ML', '500ML', '1LTR'];

  useEffect(() => {
    if (initialParty) {
      setSelectedParty(initialParty);
      setDeliveryRoute(initialParty.route_1 || initialParty.route || '');
    }
  }, [initialParty]);

  useEffect(() => {
    if (reprintJob) {
      setTotalCases(reprintJob.total_cases ?? 1);
      setDeliveryRoute(reprintJob.delivery_route || '');
      setDriverName(reprintJob.driver_name || '');
    }
  }, [reprintJob]);

  // Live Auto-complete
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await autocompleteParties(searchQuery);
        if (res && res.length > 0) {
          setSuggestions(res);
        } else {
          const off = await searchPartiesOffline(searchQuery);
          setSuggestions(off.slice(0, 10));
        }
      } catch {
        const off = await searchPartiesOffline(searchQuery);
        setSuggestions(off.slice(0, 10));
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectParty = (party: Party) => {
    setSelectedParty(party);
    setSearchQuery('');
    setSuggestions([]);
    setDeliveryRoute(party.route_1 || party.route || '');
  };

  const handleAddFluidItem = (fluidType: string, volume: string) => {
    const existingIndex = caseItems.findIndex(i => i.type === fluidType && i.volume === volume);
    if (existingIndex >= 0) {
      const updated = [...caseItems];
      updated[existingIndex].qty += 1;
      setCaseItems(updated);
    } else {
      setCaseItems([...caseItems, { type: fluidType, volume: volume, qty: 1 }]);
    }
  };

  const handleRemoveFluidItem = (index: number) => {
    setCaseItems(caseItems.filter((_, i) => i !== index));
  };

  const handleExecutePrint = async () => {
    if (!selectedParty) return;
    setPrinting(true);
    try {
      const jobPayload = {
        party_id: selectedParty.id!,
        party_name: selectedParty.party_name,
        party_code: selectedParty.party_code || undefined,
        address: selectedParty.address,
        address_line_2: selectedParty.address_line_2 || undefined,
        address_line_3: selectedParty.address_line_3 || undefined,
        city: selectedParty.city,
        state: selectedParty.state || 'Gujarat',
        mobile_no: selectedParty.mobile_no || undefined,
        gst_no: selectedParty.gst_no || undefined,
        parcel_type: 'Medicine',
        total_cases: totalCases,
        case_weights: Array(totalCases).fill(0),
        envelope_size: 'Medium (9x4)',
        orientation: 'Landscape',
        printer_name: 'Default',
        envelopes_per_page: 1,
        status: 'Printed',
        delivery_boy_name: driverName || undefined,
        delivery_route: deliveryRoute || selectedParty.route_1 || selectedParty.route || undefined,
        language: language,
        party_name_gu: selectedParty.party_name_gu || undefined,
        address_gu: selectedParty.address_gu || undefined,
        address_line_2_gu: selectedParty.address_line_2_gu || undefined,
        address_line_3_gu: selectedParty.address_line_3_gu || undefined,
        city_gu: selectedParty.city_gu || undefined,
        state_gu: selectedParty.state_gu || undefined,
        case_breakdown: caseItems.length > 0 ? caseItems : undefined
      };

      const res = await createPrintJob(jobPayload);
      setSuccessJob(res);
      if (onJobCreated) onJobCreated();
    } catch (err: any) {
      try {
        const offlineId = await queueOfflineJob({
          party_id: selectedParty.id!,
          party_name: selectedParty.party_name,
          party_name_gu: selectedParty.party_name_gu || undefined,
          party_code: selectedParty.party_code,
          address: selectedParty.address,
          city: selectedParty.city,
          mobile: selectedParty.mobile_no,
          total_cases: totalCases,
          language: language,
          delivery_route: deliveryRoute,
          driver_name: driverName
        });
        setSuccessJob({
          id: offlineId,
          job_number: `OFFLINE-${Date.now().toString().slice(-6)}`,
          is_offline: true
        });
        if (onJobCreated) onJobCreated();
      } catch (offErr) {
        alert("Failed to create print job: " + (err.message || "Unknown error"));
      }
    } finally {
      setPrinting(false);
    }
  };

  const resetForm = () => {
    setSelectedParty(null);
    setSearchQuery('');
    setTotalCases(1);
    setCaseItems([]);
    setSuccessJob(null);
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-32 font-sans">
      {/* 1. PARTY SEARCH & AUTOCOMPLETE (LIGHT THEME) */}
      <div className="relative">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5 px-1 font-mono">
          Select Recipient Party
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, code (e.g. MARG001837), city..."
            className="w-full bg-white border border-slate-300 rounded-2xl py-3.5 pl-11 pr-10 text-slate-900 placeholder-slate-400 text-sm font-semibold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/30 shadow-sm"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {suggestions.map((party) => (
              <div
                key={party.id}
                onClick={() => handleSelectParty(party)}
                className="p-3.5 hover:bg-slate-50 active:bg-blue-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {party.party_code || 'MARG'}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{party.city}</span>
                </div>
                <div className="font-extrabold text-slate-900 text-sm mt-1">
                  {party.party_name}
                </div>
                {party.party_name_gu && (
                  <div className="text-xs text-slate-500 font-medium">
                    {party.party_name_gu}
                  </div>
                )}
                {party.route_1 && (
                  <div className="text-[10px] text-amber-700 font-bold mt-0.5">
                    Route: {party.route_1}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. SELECTED PARTY CARD (LIGHT THEME) */}
      {selectedParty ? (
        <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-sm relative space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-sm">
                  {selectedParty.party_code || 'MARG'}
                </span>
                <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  Active Selection
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 mt-1.5 leading-snug">
                {selectedParty.party_name}
              </h3>
              {selectedParty.party_name_gu && (
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  {selectedParty.party_name_gu}
                </div>
              )}
            </div>

            {/* Clear Selection Button */}
            <button
              onClick={() => setSelectedParty(null)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all cursor-pointer"
              title="Clear Selected Party"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Address Details */}
          <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                {selectedParty.address}
                {selectedParty.city && `, ${selectedParty.city}`}
              </span>
            </div>
            {selectedParty.mobile_no && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>{selectedParty.mobile_no}</span>
              </div>
            )}
          </div>

          {/* Route Tags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedParty.route_1 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                R1: {selectedParty.route_1}
              </span>
            )}
            {selectedParty.route_2 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                R2: {selectedParty.route_2}
              </span>
            )}
          </div>

          {/* Envelope Print Language Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-600">Envelope Language:</span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setLanguage('gu')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === 'gu' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Gujarati
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-slate-500 text-xs shadow-sm">
          Search or select a party above to configure your envelope print.
        </div>
      )}

      {/* 3. TACTILE CASE STEPPER (LIGHT THEME) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">
            Total Dispatch Cases
          </label>
          <span className="text-[11px] font-bold text-blue-600">
            {totalCases === 0 ? 'Address-Only Envelope' : `${totalCases} Parcel Case(s)`}
          </span>
        </div>

        {/* Stepper Controls */}
        <div className="flex items-center justify-between gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          <button
            onClick={() => setTotalCases(prev => Math.max(0, prev - 1))}
            className="w-14 h-14 rounded-xl bg-white hover:bg-slate-100 text-rose-600 active:scale-90 transition-all flex items-center justify-center font-black text-2xl border border-slate-200 shadow-sm cursor-pointer"
          >
            <Minus className="w-6 h-6 text-rose-600" />
          </button>

          <div className="text-center min-w-[80px]">
            <div className="text-3xl font-black text-slate-900">{totalCases}</div>
            <div className="text-[10px] font-bold text-slate-500">
              {totalCases === 0 ? 'Address Only' : 'Cases'}
            </div>
          </div>

          <button
            onClick={() => setTotalCases(prev => prev + 1)}
            className="w-14 h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white active:scale-90 transition-all flex items-center justify-center font-black text-2xl shadow-sm cursor-pointer"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Quick Case Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTotalCases(0)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border cursor-pointer ${
              totalCases === 0 
                ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            0 (Address Only)
          </button>
          {[1, 2, 3, 5, 10].map(c => (
            <button
              key={c}
              onClick={() => setTotalCases(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border cursor-pointer ${
                totalCases === c 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c} {c === 1 ? 'Case' : 'Cases'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. IV FLUIDS BREAKDOWN (200ML EXCLUDED - LIGHT THEME) */}
      {totalCases > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">
              IV Fluids & Bottle Breakdown
            </span>
            <span className="text-[10px] text-amber-800 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              200ML Excluded
            </span>
          </div>

          {/* Quick Add Grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {fluidTypes.map(f => (
              <div key={f} className="space-y-1">
                <div className="text-[10px] font-black text-center text-slate-600">{f}</div>
                {fluidVolumes.map(v => (
                  <button
                    key={`${f}_${v}`}
                    onClick={() => handleAddFluidItem(f, v)}
                    className="w-full py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 active:scale-95 text-[10px] font-bold text-slate-700 border border-slate-200 transition-all text-center block cursor-pointer"
                  >
                    +{v}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Added items tags */}
          {caseItems.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
              {caseItems.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold"
                >
                  <span>{item.type} {item.volume} ({item.qty})</span>
                  <button
                    onClick={() => handleRemoveFluidItem(idx)}
                    className="text-slate-400 hover:text-rose-600 ml-1 font-black cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. SUCCESS CARD AFTER PRINT (LIGHT THEME) */}
      {successJob && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-black">Envelope Generated Successfully!</span>
          </div>
          <div className="text-xs text-slate-700">
            Job ID: <span className="font-mono font-bold text-slate-900">{successJob.job_number}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => downloadEnvelopePDF({ job_id: successJob.id, language: language })}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            {selectedParty?.mobile_no && (
              <a
                href={generateWhatsAppDispatchUrl({
                  partyName: selectedParty.party_name,
                  partyNameGu: selectedParty.party_name_gu || undefined,
                  phone: selectedParty.mobile_no,
                  totalCases: totalCases,
                  jobNumber: successJob.job_number,
                  city: selectedParty.city
                }, language) || '#'}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            )}

            <button
              onClick={resetForm}
              className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
            >
              New
            </button>
          </div>
        </div>
      )}

      {/* 6. STICKY BOTTOM PRINT BUTTON BAR (LIGHT THEME) */}
      <div className="fixed bottom-[max(env(safe-area-inset-bottom),64px)] left-0 right-0 p-3 bg-gradient-to-t from-slate-100 via-slate-100/95 to-transparent z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleExecutePrint}
            disabled={!selectedParty || printing}
            className={`w-full py-4 rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer ${
              !selectedParty
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 ring-2 ring-blue-300'
            }`}
          >
            <Printer className="w-6 h-6 text-amber-300" />
            <span>
              {printing 
                ? 'Generating Envelope...' 
                : totalCases === 0 
                ? 'Print Address-Only Envelope' 
                : `Print Envelope (${totalCases} Cases)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
