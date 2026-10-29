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
  CheckCircle2,
  Box,
  FileText,
  RotateCcw
} from 'lucide-react';
import { Party, CaseBreakdownItem, Item } from '../types';
import { autocompleteParties, createPrintJob, updatePrintJob, downloadEnvelopePDF, searchItems } from '../api/client';
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
  const [editingJobId, setEditingJobId] = useState<number | null>(reprintJob?.id || null);
  const [isEditReprintMode, setIsEditReprintMode] = useState<boolean>(!!reprintJob);

  // IV Fluid items (200ML permanently excluded, PCS included)
  const [caseItems, setCaseItems] = useState<CaseBreakdownItem[]>([]);
  const fluidTypes = ['NS', 'RL', 'DNS', 'METRO'];
  const fluidVolumes = ['100ML', '250ML', '500ML', '1LTR', 'PCS'];

  // Item Full Cases search state (4,343 stock catalog items)
  const [mobileItemQuery, setMobileItemQuery] = useState<string>('');
  const [mobileItemResults, setMobileItemResults] = useState<Item[]>([]);
  const [isSearchingMobileItems, setIsSearchingMobileItems] = useState<boolean>(false);
  const [showMobileItemDropdown, setShowMobileItemDropdown] = useState<boolean>(false);

  useEffect(() => {
    if (initialParty) {
      setSelectedParty(initialParty);
      setDeliveryRoute(initialParty.route_1 || initialParty.route || '');
    }
  }, [initialParty]);

  useEffect(() => {
    if (reprintJob) {
      setEditingJobId(reprintJob.id || null);
      setIsEditReprintMode(true);
      setTotalCases(reprintJob.total_cases ?? 1);
      setDeliveryRoute(reprintJob.delivery_route || '');
      setDriverName(reprintJob.driver_name || '');
      if (reprintJob.party) {
        setSelectedParty(reprintJob.party);
      } else if (reprintJob.party_name || reprintJob.party_name_snap) {
        setSelectedParty({
          id: reprintJob.party_id,
          party_name: reprintJob.party_name || reprintJob.party_name_snap,
          party_name_gu: reprintJob.party_name_gu,
          party_code: reprintJob.party_code || reprintJob.party_code_snap,
          address: reprintJob.address || reprintJob.party_address_snap || '',
          city: reprintJob.city || reprintJob.party_city_snap || '',
          state: reprintJob.state || reprintJob.party_state_snap || '',
          mobile_no: reprintJob.mobile || reprintJob.party_mobile_snap || ''
        } as any);
      }
      if (reprintJob.case_breakdown && Array.isArray(reprintJob.case_breakdown)) {
        setCaseItems(reprintJob.case_breakdown);
      } else if (reprintJob.case_breakdown_json) {
        try {
          const parsed = typeof reprintJob.case_breakdown_json === 'string' ? JSON.parse(reprintJob.case_breakdown_json) : reprintJob.case_breakdown_json;
          if (Array.isArray(parsed)) setCaseItems(parsed);
        } catch {}
      }
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

  const handleSearchMobileItems = async (q: string) => {
    if (!q || q.trim().length < 1) {
      setMobileItemResults([]);
      setShowMobileItemDropdown(false);
      return;
    }
    setIsSearchingMobileItems(true);
    setShowMobileItemDropdown(true);
    try {
      const res = await searchItems(q.trim(), 20);
      setMobileItemResults(res || []);
    } catch {
      setMobileItemResults([]);
    } finally {
      setIsSearchingMobileItems(false);
    }
  };

  const handleAddItemCaseMobile = (item: Item, volume: string = 'PCS') => {
    const typeLabel = `${item.item_name} CASE`;
    const vol = volume || (item.unit && item.unit.toUpperCase().includes('PCS') ? 'PSC (PIECES)' : item.unit || 'PCS');
    const existingIdx = caseItems.findIndex(i => i.type === typeLabel && i.volume === vol);
    if (existingIdx >= 0) {
      const updated = [...caseItems];
      updated[existingIdx].qty += 1;
      setCaseItems(updated);
    } else {
      setCaseItems([...caseItems, { type: typeLabel, volume: vol, qty: 1 }]);
    }
    setMobileItemQuery('');
    setMobileItemResults([]);
    setShowMobileItemDropdown(false);
    setTotalCases(prev => prev + 1);
  };

  const handleRemoveFluidItem = (index: number) => {
    const item = caseItems[index];
    setCaseItems(caseItems.filter((_, i) => i !== index));
    if (item) {
      setTotalCases(prev => Math.max(0, prev - item.qty));
    }
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

      let res;
      if (isEditReprintMode && editingJobId) {
        res = await updatePrintJob(editingJobId, jobPayload);
      } else {
        res = await createPrintJob({
          ...jobPayload,
          allow_duplicate: true
        });
      }
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
    setEditingJobId(null);
    setIsEditReprintMode(false);
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-36 font-sans text-slate-100">
      {/* 1. PARTY SEARCH & AUTOCOMPLETE (STITCH TACTICAL) */}
      <div className="relative">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1 font-mono">
          Select Recipient Party
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, code (e.g. MARG001837), city..."
            className="w-full bg-[#111827] border border-slate-800 rounded-2xl py-3.5 pl-11 pr-10 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 shadow-md"
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
          <div className="absolute left-0 right-0 top-full mt-2 bg-[#111827] border border-slate-700/90 rounded-2xl shadow-2xl z-40 max-h-72 overflow-y-auto divide-y divide-slate-800 apk-scroll-container">
            {suggestions.map((party) => (
              <div
                key={party.id}
                onClick={() => handleSelectParty(party)}
                className="p-3.5 hover:bg-[#1A202C] active:bg-blue-950 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-black px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800/60">
                    {party.party_code || 'MARG'}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">{party.city}</span>
                </div>
                <div className="font-extrabold text-white text-sm mt-1">
                  {party.party_name}
                </div>
                {party.party_name_gu && (
                  <div className="text-xs text-slate-400 font-medium mt-0.5">
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

      {/* 2. SELECTED PARTY CARD (STITCH DARK TACTICAL) */}
      {selectedParty ? (
        <div className="bg-[#111827] border border-blue-600/60 rounded-2xl p-4 shadow-lg relative space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-sm">
                  {selectedParty.party_code || 'MARG'}
                </span>
                <span className="text-xs text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 rounded-md">
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
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer border border-slate-700"
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
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/60">
                R1: {selectedParty.route_1}
              </span>
            )}
            {selectedParty.route_2 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                R2: {selectedParty.route_2}
              </span>
            )}
          </div>

          {/* Envelope Print Language Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-400">Envelope Language:</span>
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700">
              <button
                onClick={() => setLanguage('gu')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === 'gu' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Gujarati
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-[#111827] border border-dashed border-slate-800 text-center text-slate-400 text-xs shadow-md">
          Search or select a chemist party above to configure your envelope print.
        </div>
      )}

      {/* 3. TACTILE CASE STEPPER (STITCH TACTICAL) */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
            Total Dispatch Cases
          </label>
          <span className="text-[11px] font-bold text-blue-400">
            {totalCases === 0 ? 'Address-Only Envelope' : `${totalCases} Parcel Case(s)`}
          </span>
        </div>

        {/* Stepper Controls */}
        <div className="flex items-center justify-between gap-3 bg-[#161C28] p-2 rounded-2xl border border-slate-800">
          <button
            onClick={() => setTotalCases(prev => Math.max(0, prev - 1))}
            className="w-14 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 active:scale-90 transition-all flex items-center justify-center font-black text-2xl border border-slate-700 shadow-md cursor-pointer"
          >
            <Minus className="w-6 h-6 text-rose-400" />
          </button>

          <div className="text-center min-w-[80px]">
            <div className="text-3xl font-black text-white font-mono">{totalCases}</div>
            <div className="text-[10px] font-bold text-slate-400">
              {totalCases === 0 ? 'Address Only' : 'Cases'}
            </div>
          </div>

          <button
            onClick={() => setTotalCases(prev => prev + 1)}
            className="w-14 h-14 rounded-xl bg-blue-600 hover:bg-blue-500 text-white active:scale-90 transition-all flex items-center justify-center font-black text-2xl shadow-md shadow-blue-600/30 cursor-pointer"
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
                ? 'bg-amber-950/80 text-amber-300 border-amber-700/70 shadow-sm' 
                : 'bg-[#161C28] text-slate-400 border-slate-800 hover:text-white'
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
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30' 
                  : 'bg-[#161C28] text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {c} {c === 1 ? 'Case' : 'Cases'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. IV FLUIDS BREAKDOWN (STITCH TACTICAL) */}
      {totalCases > 0 && (
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
              IV Fluids & Bottle Breakdown
            </span>
            <span className="text-[10px] text-amber-400 font-bold bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded-md">
              200ML Excluded
            </span>
          </div>

          {/* Quick Add Grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {fluidTypes.map(f => (
              <div key={f} className="space-y-1">
                <div className="text-[10px] font-black text-center text-slate-300">{f}</div>
                {fluidVolumes.map(v => (
                  <button
                    key={`${f}_${v}`}
                    onClick={() => handleAddFluidItem(f, v)}
                    className="w-full py-1.5 rounded-lg bg-[#161C28] hover:bg-blue-950 hover:text-blue-300 active:scale-95 text-[10px] font-bold text-slate-300 border border-slate-800 transition-all text-center block cursor-pointer"
                  >
                    +{v === 'PCS' ? 'PSC' : v}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Item Full Cases Search on Mobile */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-indigo-400 flex items-center gap-1">
                <Box className="w-3.5 h-3.5" /> Item Full Case (આઇટમ કેસ)
              </span>
              <span className="text-[9px] text-slate-400 font-bold">4,343 items</span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={mobileItemQuery}
                onChange={(e) => {
                  setMobileItemQuery(e.target.value);
                  handleSearchMobileItems(e.target.value);
                }}
                placeholder="Search catalog item (e.g. SYRINGE, ATPL)..."
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-800 bg-[#0D131F] text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {mobileItemQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileItemQuery('');
                    setMobileItemResults([]);
                    setShowMobileItemDropdown(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {showMobileItemDropdown && mobileItemResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[#111827] border border-slate-700 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-800 apk-scroll-container">
                  {mobileItemResults.map((it) => (
                    <div
                      key={it.id || it.item_code}
                      onClick={() => handleAddItemCaseMobile(it, 'PSC (PIECES)')}
                      className="p-2 hover:bg-[#1A202C] active:bg-indigo-950 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-black text-xs text-white truncate">{it.item_name}</div>
                        <div className="text-[10px] text-slate-400 font-bold">
                          {it.company} • Stock: {it.stock_qty ?? 0} {it.unit || 'PCS'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-black"
                      >
                        + Case
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Added items tags */}
          {caseItems.length > 0 && (
            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
              {caseItems.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/80 text-blue-300 border border-blue-800/70 text-xs font-bold"
                >
                  <span>{item.type} {item.volume} ({item.qty})</span>
                  <button
                    onClick={() => handleRemoveFluidItem(idx)}
                    className="text-slate-400 hover:text-rose-400 ml-1 font-black cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. SUCCESS CARD AFTER PRINT (STITCH TACTICAL) */}
      {successJob && (
        <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-black">Envelope Generated Successfully!</span>
          </div>
          <div className="text-xs text-slate-300">
            Job ID: <span className="font-mono font-bold text-white">{successJob.job_number}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => downloadEnvelopePDF({ job_id: successJob.id, language: language })}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
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
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            )}

            <button
              onClick={resetForm}
              className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              New
            </button>
          </div>
        </div>
      )}

      {/* 6. STICKY BOTTOM PRINT BUTTON BAR (STITCH TACTICAL) */}
      <div className="fixed bottom-[max(env(safe-area-inset-bottom),64px)] left-0 right-0 p-3 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/95 to-transparent z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleExecutePrint}
            disabled={!selectedParty || printing}
            className={`w-full py-4 rounded-2xl font-black text-base shadow-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer ${
              !selectedParty
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/40 ring-2 ring-blue-400/40'
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