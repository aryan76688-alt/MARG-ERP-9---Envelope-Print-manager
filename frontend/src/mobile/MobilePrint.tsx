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
      setCaseItems([
        ...caseItems, 
        { title: `${fluidType} ${volume}`, type: fluidType, volume, qty: 1 }
      ]);
    }
  };

  const handleRemoveFluidItem = (index: number) => {
    const updated = caseItems.filter((_, i) => i !== index);
    setCaseItems(updated);
  };

  const handleExecutePrint = async () => {
    if (!selectedParty) {
      alert('Please select a party first.');
      return;
    }

    setPrinting(true);
    try {
      const isAddressOnly = totalCases === 0;
      const payload: any = {
        party_id: selectedParty.id,
        party_name: selectedParty.party_name,
        party_code: selectedParty.party_code,
        party_address: selectedParty.address,
        party_address_line_2: selectedParty.address_line_2,
        party_address_line_3: selectedParty.address_line_3,
        party_city: selectedParty.city,
        party_state: selectedParty.state,
        party_mobile: selectedParty.mobile_no,
        party_gst: selectedParty.gst_no,
        parcel_type: 'Medicine',
        total_cases: totalCases,
        total_weight: 0.0,
        envelope_size: 'A4',
        orientation: 'Landscape',
        language: language,
        driver_name: driverName,
        delivery_route: deliveryRoute,
        case_items: isAddressOnly ? [] : caseItems,
        is_address_only: isAddressOnly
      };

      const res = await createPrintJob(payload);
      if (res && res.job) {
        setSuccessJob(res.job);
        downloadEnvelopePDF({ job_id: res.job.id, language: language });
        if (onJobCreated) onJobCreated();
      }
    } catch (err: any) {
      console.error('Mobile print error:', err);
      try {
        const clientUuid = 'offline_' + Date.now();
        await queueOfflineJob({
          client_uuid: clientUuid,
          party_id: selectedParty.id,
          party_name_snap: selectedParty.party_name,
          party_code_snap: selectedParty.party_code,
          party_address_snap: selectedParty.address,
          party_city_snap: selectedParty.city,
          party_state_snap: selectedParty.state,
          party_mobile_snap: selectedParty.mobile_no,
          total_cases: totalCases,
          language: language,
          driver_name: driverName,
          delivery_route: deliveryRoute
        });
        alert('Saved offline: Will auto-sync once internet connection is available.');
      } catch (offlineErr: any) {
        alert('Print error: ' + (err.message || 'Unknown error'));
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
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-32">
      {/* 1. PARTY SEARCH & AUTOCOMPLETE */}
      <div className="relative">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">
          Select Recipient Party
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, code (e.g. MARG001837), city..."
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl py-3.5 pl-11 pr-10 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 shadow-md"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-40 max-h-72 overflow-y-auto divide-y divide-slate-800">
            {suggestions.map((party) => (
              <div
                key={party.id}
                onClick={() => handleSelectParty(party)}
                className="p-3.5 hover:bg-slate-800 active:bg-blue-600 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {party.party_code || 'MARG'}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">{party.city}</span>
                </div>
                <div className="font-extrabold text-white text-sm mt-1">
                  {party.party_name}
                </div>
                {party.party_name_gu && (
                  <div className="text-xs text-slate-400 font-medium">
                    {party.party_name_gu}
                  </div>
                )}
                {party.route_1 && (
                  <div className="text-[10px] text-amber-400 font-bold mt-0.5">
                    Route: {party.route_1}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. SELECTED PARTY CARD */}
      {selectedParty ? (
        <div className="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-4 shadow-xl relative space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-sm">
                  {selectedParty.party_code || 'MARG'}
                </span>
                <span className="text-xs text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  Active Selection
                </span>
              </div>
              <h3 className="text-base font-black text-white mt-1.5 leading-snug">
                {selectedParty.party_name}
              </h3>
              {selectedParty.party_name_gu && (
                <div className="text-xs text-slate-400 font-medium mt-0.5">
                  {selectedParty.party_name_gu}
                </div>
              )}
            </div>

            {/* Clear Selection Button */}
            <button
              onClick={() => setSelectedParty(null)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              title="Clear Selected Party"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Address Details */}
          <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <span>
                {selectedParty.address}
                {selectedParty.city && `, ${selectedParty.city}`}
              </span>
            </div>
            {selectedParty.mobile_no && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>{selectedParty.mobile_no}</span>
              </div>
            )}
          </div>

          {/* Route Tags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {selectedParty.route_1 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                R1: {selectedParty.route_1}
              </span>
            )}
            {selectedParty.route_2 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                R2: {selectedParty.route_2}
              </span>
            )}
          </div>

          {/* Envelope Print Language Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-400">Envelope Language:</span>
            <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700">
              <button
                onClick={() => setLanguage('gu')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                  language === 'gu' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Gujarati
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                  language === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-dashed border-slate-800 text-center text-slate-400 text-xs">
          Search or select a party above to configure your envelope print.
        </div>
      )}

      {/* 3. TACTILE CASE STEPPER */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-400">
            Total Dispatch Cases
          </label>
          <span className="text-[11px] font-bold text-blue-400">
            {totalCases === 0 ? 'Address-Only Envelope' : `${totalCases} Parcel Case(s)`}
          </span>
        </div>

        {/* Stepper Controls */}
        <div className="flex items-center justify-between gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800">
          <button
            onClick={() => setTotalCases(prev => Math.max(0, prev - 1))}
            className="w-14 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-white active:scale-90 transition-all flex items-center justify-center font-black text-2xl border border-slate-700 shadow-sm"
          >
            <Minus className="w-6 h-6 text-rose-400" />
          </button>

          <div className="text-center min-w-[80px]">
            <div className="text-3xl font-black text-white">{totalCases}</div>
            <div className="text-[10px] font-bold text-slate-400">
              {totalCases === 0 ? 'Address Only' : 'Cases'}
            </div>
          </div>

          <button
            onClick={() => setTotalCases(prev => prev + 1)}
            className="w-14 h-14 rounded-xl bg-blue-600 hover:bg-blue-500 text-white active:scale-90 transition-all flex items-center justify-center font-black text-2xl shadow-md shadow-blue-600/30"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Quick Case Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTotalCases(0)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
              totalCases === 0 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            0 (Address Only)
          </button>
          {[1, 2, 3, 5, 10].map(c => (
            <button
              key={c}
              onClick={() => setTotalCases(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
                totalCases === c 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {c} {c === 1 ? 'Case' : 'Cases'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. IV FLUIDS BREAKDOWN (200ML EXCLUDED) */}
      {totalCases > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              IV Fluids & Bottle Breakdown
            </span>
            <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
              200ML Excluded
            </span>
          </div>

          {/* Quick Add Grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {fluidTypes.map(f => (
              <div key={f} className="space-y-1">
                <div className="text-[10px] font-black text-center text-slate-400">{f}</div>
                {fluidVolumes.map(v => (
                  <button
                    key={`${f}_${v}`}
                    onClick={() => handleAddFluidItem(f, v)}
                    className="w-full py-1 rounded-lg bg-slate-800 hover:bg-blue-600 active:scale-95 text-[10px] font-bold text-slate-200 border border-slate-700 transition-all text-center block"
                  >
                    +{v}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Added items tags */}
          {caseItems.length > 0 && (
            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
              {caseItems.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-200 border border-blue-500/30 text-xs font-bold"
                >
                  <span>{item.type} {item.volume} ({item.qty})</span>
                  <button
                    onClick={() => handleRemoveFluidItem(idx)}
                    className="text-slate-400 hover:text-rose-400 ml-1 font-black"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. SUCCESS CARD AFTER PRINT */}
      {successJob && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-300">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-black">Envelope Generated Successfully!</span>
          </div>
          <div className="text-xs text-slate-200">
            Job ID: <span className="font-mono font-bold text-white">{successJob.job_number}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => downloadEnvelopePDF({ job_id: successJob.id, language: language })}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
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
                className="py-2.5 px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            )}

            <button
              onClick={resetForm}
              className="py-2.5 px-3 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs hover:bg-slate-700 active:scale-95 transition-all"
            >
              New
            </button>
          </div>
        </div>
      )}

      {/* 6. STICKY BOTTOM PRINT BUTTON BAR */}
      <div className="fixed bottom-[max(env(safe-area-inset-bottom),64px)] left-0 right-0 p-3 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleExecutePrint}
            disabled={!selectedParty || printing}
            className={`w-full py-4 rounded-2xl font-black text-base shadow-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] ${
              !selectedParty
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/40 ring-2 ring-amber-400'
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
