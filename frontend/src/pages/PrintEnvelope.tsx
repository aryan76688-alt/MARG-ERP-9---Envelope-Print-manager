import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Printer, 
  Download, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  Building, 
  Sliders, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Scale, 
  Layers,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { Party, SenderSettings, AppSettings, CaseItem } from '../types';
import { autocompleteParties, createPrintJob, downloadEnvelopePDF, fetchSettings, fetchPrintJobs } from '../api/client';
import { EnvelopeTemplate } from '../print/EnvelopeTemplate';
import { FullScreenPreviewModal } from '../components/FullScreenPreviewModal';

interface PrintEnvelopeProps {
  initialParty?: Party | null;
  onJobCreated?: (jobId: number) => void;
}

export const PrintEnvelope: React.FC<PrintEnvelopeProps> = ({ initialParty, onJobCreated }) => {
  // Party selection state
  const [partySearch, setPartySearch] = useState<string>('');
  const [matchingParties, setMatchingParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(initialParty || null);
  const [searchMode, setSearchMode] = useState<'starts_with' | 'contains'>('contains');
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Settings & Sender state
  const [sender, setSender] = useState<SenderSettings>({
    business_name: 'SHREEJI HEALTHCARE-HEALTHCARE',
    address: 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305',
    city: 'DEHGAM',
    state: 'GUJARAT',
    mobile: '+91 99245 44283',
    email: 'SHREEJISEVEN@GMAIL.COM',
  });
  const [appSettings, setAppSettings] = useState<Partial<AppSettings>>({
    default_envelope_size: 'A4',
    default_orientation: 'Landscape',
    envelopes_per_page: 2,
    show_barcode: true,
    show_case_number: true,
    show_weight: true,
    show_mobile: true,
    show_party_code: true,
    show_date: false,
  });

  // Parcel & Case state
  const [totalCases, setTotalCases] = useState<number>(3);
  const [weightMode, setWeightMode] = useState<'uniform' | 'individual'>('uniform');
  const [uniformWeight, setUniformWeight] = useState<number>(2.5);
  const [individualWeights, setIndividualWeights] = useState<number[]>([2.5, 2.5, 2.5]);
  const [parcelType, setParcelType] = useState<string>('Medicine');
  const [printCaseNumber, setPrintCaseNumber] = useState<boolean>(true);
  const [showCaseBreakdown, setShowCaseBreakdown] = useState<boolean>(false);

  // Print settings
  const [envelopeSize, setEnvelopeSize] = useState<string>('A4');
  const [printerName, setPrinterName] = useState<string>('Microsoft Print to PDF');
  const [envelopesPerPage, setEnvelopesPerPage] = useState<number>(2);

  // Live Preview controls
  const [currentPreviewCase, setCurrentPreviewCase] = useState<number>(0);
  const [previewZoom, setPreviewZoom] = useState<number>(1.0);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [hasPrintedToday, setHasPrintedToday] = useState<boolean>(false);
  const [printedTodayCount, setPrintedTodayCount] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check if selected party was already printed today
  useEffect(() => {
    if (!selectedParty?.party_name) {
      setHasPrintedToday(false);
      setPrintedTodayCount(0);
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    fetchPrintJobs({ search: selectedParty.party_name, limit: 15 })
      .then((res) => {
        const todayJobs = (res.items || []).filter((j) => {
          const jobDate = (j.created_at || '').slice(0, 10);
          return jobDate === todayStr && j.party_name.toUpperCase() === selectedParty.party_name.toUpperCase();
        });
        if (todayJobs.length > 0) {
          setHasPrintedToday(true);
          setPrintedTodayCount(todayJobs.length);
        } else {
          setHasPrintedToday(false);
          setPrintedTodayCount(0);
        }
      })
      .catch(() => {
        setHasPrintedToday(false);
      });
  }, [selectedParty?.party_name]);

  // Load Settings & Sender on mount
  useEffect(() => {
    fetchSettings()
      .then((data) => {
        if (data.sender) setSender(data.sender);
        if (data.app) {
          setAppSettings(data.app);
          setEnvelopeSize(data.app.default_envelope_size || 'A4');
          setEnvelopesPerPage(data.app.envelopes_per_page || 2);
        }
      })
      .catch(console.error);
  }, []);

  // Set default demo party if none selected
  useEffect(() => {
    if (!selectedParty) {
      autocompleteParties('JODHPUR', 'contains').then((results) => {
        if (results && results.length > 0) {
          setSelectedParty(results[0]);
        }
      });
    }
  }, []);

  // Instant Autocomplete Search (triggers even on 1 character, e.g. 'J')
  useEffect(() => {
    if (!partySearch.trim()) {
      // Show default top list
      autocompleteParties('J', 'contains').then(setMatchingParties);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      autocompleteParties(partySearch, searchMode)
        .then((res) => {
          setMatchingParties(res);
          setActiveSearchIndex(0);
        })
        .finally(() => setIsSearching(false));
    }, 100);

    return () => clearTimeout(timer);
  }, [partySearch, searchMode]);

  // Adjust individualWeights array when totalCases changes
  useEffect(() => {
    setIndividualWeights((prev) => {
      const updated = [...prev];
      if (totalCases > updated.length) {
        while (updated.length < totalCases) {
          updated.push(uniformWeight);
        }
      } else if (totalCases < updated.length) {
        return updated.slice(0, totalCases);
      }
      return updated;
    });
    if (currentPreviewCase >= totalCases) {
      setCurrentPreviewCase(0);
    }
  }, [totalCases, uniformWeight]);

  // Calculate Total Weight dynamically
  const totalWeight =
    weightMode === 'uniform'
      ? totalCases * uniformWeight
      : individualWeights.slice(0, totalCases).reduce((acc, w) => acc + (w || 0), 0);

  // Generated Cases Array
  const casesList: CaseItem[] = Array.from({ length: totalCases }, (_, i) => ({
    case_number: i + 1,
    case_total: totalCases,
    weight: weightMode === 'uniform' ? uniformWeight : individualWeights[i] || uniformWeight,
    barcode_value: `MRG-2026-000001-C${i + 1}`,
  }));

  // Keyboard navigation for party search dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (matchingParties.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSearchIndex((prev) => (prev + 1) % matchingParties.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSearchIndex((prev) => (prev - 1 + matchingParties.length) % matchingParties.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingParties[activeSearchIndex]) {
        setSelectedParty(matchingParties[activeSearchIndex]);
      }
    } else if (e.key === 'Escape') {
      setPartySearch('');
    }
  };

  // Validation
  const isValidToPrint = selectedParty && selectedParty.party_name && selectedParty.address && totalCases >= 1;

  // Print Envelope (Creates real database transaction & triggers browser print)
  const handlePrintEnvelope = async () => {
    if (!isValidToPrint || !selectedParty) {
      alert('Please select a party with valid address before printing.');
      return;
    }

    setIsPrinting(true);
    try {
      const weights = casesList.map((c) => c.weight);
      const res = await createPrintJob({
        party_id: selectedParty.id,
        party_name: selectedParty.party_name,
        party_code: selectedParty.party_code,
        address: selectedParty.address,
        address_line_2: selectedParty.address_line_2 || undefined,
        address_line_3: selectedParty.address_line_3 || undefined,
        city: selectedParty.city,
        state: selectedParty.state,
        mobile_no: selectedParty.mobile_no,
        gst_no: selectedParty.gst_no,
        parcel_type: parcelType,
        total_cases: totalCases,
        case_weights: weights,
        envelope_size: envelopeSize,
        orientation: 'Landscape',
        printer_name: printerName,
        envelopes_per_page: envelopesPerPage,
        status: 'Printed',
        sender: sender,
      });

      if (onJobCreated) onJobCreated(res.id);

      // Trigger browser print
      window.print();
    } catch (err: any) {
      alert('Failed to process print job: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Download PDF
  const handleDownloadPDF = async () => {
    if (!selectedParty) {
      alert('Please select a party first.');
      return;
    }

    setIsDownloading(true);
    try {
      await downloadEnvelopePDF({
        party_name: selectedParty.party_name,
        party_code: selectedParty.party_code || undefined,
        address: selectedParty.address,
        address_line_2: selectedParty.address_line_2 || undefined,
        address_line_3: selectedParty.address_line_3 || undefined,
        city: selectedParty.city,
        state: selectedParty.state,
        mobile_no: selectedParty.mobile_no || undefined,
        gst_no: selectedParty.gst_no || undefined,
        parcel_type: parcelType,
        total_cases: totalCases,
        case_weights: casesList.map((c) => c.weight),
        sender: sender,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
        margin_top_mm: appSettings.margin_top_mm,
        margin_bottom_mm: appSettings.margin_bottom_mm,
        margin_left_mm: appSettings.margin_left_mm,
        margin_right_mm: appSettings.margin_right_mm,
        scale_percent: appSettings.scale_percent,
      });
    } catch (err: any) {
      alert('Failed to download PDF: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto">
      {/* 3-Column Layout: LEFT (Search/Parties) | CENTER (Controls/Forms) | RIGHT (Live Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ========================================== */}
        {/* 1. LEFT COLUMN: SELECT PARTY (3 COLS)      */}
        {/* ========================================== */}
        <div className="lg:col-span-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>Select Party</span>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                1-Letter Search
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Type any letter to search MARG party ledger
            </p>
          </div>

          {/* Search Input & Mode Selector */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search name, code, mobile..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold uppercase"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold px-1">
              <span>Mode:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearchMode('contains')}
                  className={`px-2 py-0.5 rounded ${
                    searchMode === 'contains'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Contains
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('starts_with')}
                  className={`px-2 py-0.5 rounded ${
                    searchMode === 'starts_with'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Starts With
                </button>
              </div>
            </div>
          </div>

          {/* Matching Parties List */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {matchingParties.length > 0 ? (
              matchingParties.map((p, idx) => {
                const isSelected = selectedParty?.id === p.id || selectedParty?.party_name === p.party_name;
                return (
                  <div
                    key={p.id || idx}
                    onClick={() => setSelectedParty(p)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-600/20'
                        : idx === activeSearchIndex
                        ? 'bg-blue-50 border-blue-300 text-slate-900'
                        : 'bg-white border-slate-200 hover:border-blue-300 text-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-black text-[13px] leading-tight">
                        {p.party_name}
                      </div>
                      {p.party_code && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            isSelected
                              ? 'bg-blue-800 text-blue-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {p.party_code}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] mt-1 truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                      {p.address}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] font-bold">
                      <span className={isSelected ? 'text-blue-200' : 'text-blue-700'}>
                        {p.city}, {p.state}
                      </span>
                      {p.mobile_no && (
                        <span className={isSelected ? 'text-blue-200' : 'text-slate-600 font-mono'}>
                          Mo: {p.mobile_no}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs">
                No matching parties found.
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* 2. CENTER COLUMN: DETAILS & CONTROLS (4 COLS) */}
        {/* ========================================== */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Card A: Selected Party Details */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Building className="w-4 h-4 text-blue-600" />
                <span>Recipient (Party Details)</span>
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                NO PIN CODE
              </span>
            </div>

            {selectedParty ? (
              <div className="space-y-2 text-xs">
                {/* Same-day deduplication warning notice */}
                {hasPrintedToday && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Already printed today ({printedTodayCount} job{printedTodayCount > 1 ? 's' : ''}).</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded uppercase font-extrabold">
                      PRINTED TODAY
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Party Name *</span>
                  <input
                    type="text"
                    value={selectedParty.party_name}
                    onChange={(e) => setSelectedParty({ ...selectedParty, party_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-extrabold text-slate-950 uppercase"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Address Line 1 *</span>
                  <input
                    type="text"
                    value={selectedParty.address}
                    onChange={(e) => setSelectedParty({ ...selectedParty, address: e.target.value })}
                    placeholder="Shop / Building / Premises"
                    className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-semibold text-slate-800 uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Address Line 2</span>
                    <input
                      type="text"
                      value={selectedParty.address_line_2 || ''}
                      onChange={(e) => setSelectedParty({ ...selectedParty, address_line_2: e.target.value })}
                      placeholder="Street / Area / Colony"
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-semibold text-slate-800 uppercase"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Address Line 3</span>
                    <input
                      type="text"
                      value={selectedParty.address_line_3 || ''}
                      onChange={(e) => setSelectedParty({ ...selectedParty, address_line_3: e.target.value })}
                      placeholder="Landmark / Station Road"
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-semibold text-slate-800 uppercase"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">City *</span>
                    <input
                      type="text"
                      value={selectedParty.city}
                      onChange={(e) => setSelectedParty({ ...selectedParty, city: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-bold text-slate-800 uppercase"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">State *</span>
                    <input
                      type="text"
                      value={selectedParty.state}
                      onChange={(e) => setSelectedParty({ ...selectedParty, state: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-bold text-slate-800 uppercase"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Mobile No.</span>
                    <input
                      type="text"
                      value={selectedParty.mobile_no || ''}
                      onChange={(e) => setSelectedParty({ ...selectedParty, mobile_no: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">GST No.</span>
                    <input
                      type="text"
                      value={selectedParty.gst_no || ''}
                      onChange={(e) => setSelectedParty({ ...selectedParty, gst_no: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 rounded border border-slate-200 font-mono text-slate-700 uppercase"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs">
                Select a party from the left list to populate details.
              </div>
            )}
          </div>

          {/* Card B: From Address (Sender) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-600" />
                <span>FROM (Sender Configuration)</span>
              </h3>
              <span className="text-[10px] font-bold text-slate-500">Default Company</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-snug">
              <div className="font-black text-slate-900">{sender.business_name}</div>
              <div className="text-slate-600 font-semibold">{sender.address}</div>
              <div className="text-blue-900 font-bold mt-1">Mobile: {sender.mobile}</div>
            </div>
          </div>

          {/* Card C: Parcel / Case Details (Most Important Feature) */}
          <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Parcel / Case Details</span>
              </h3>
              <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Multi-Case Engine
              </span>
            </div>

            {/* Inputs: Number of Cases & Parcel Type */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  No. of Cases (Parcel) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={totalCases}
                  onChange={(e) => setTotalCases(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-black text-blue-950 text-base focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Parcel Type
                </label>
                <select
                  value={parcelType}
                  onChange={(e) => setParcelType(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Medicine">Medicine</option>
                  <option value="Documents">Documents</option>
                  <option value="Parcel">Parcel</option>
                  <option value="Box">Box</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Remarks / Doctor Notes (As shown in MARG envelope, e.g. DR.FIROZ) */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
              <label className="block font-bold text-slate-700">
                Doctor / Remarks / Attention Notes (Optional)
              </label>
              <input
                type="text"
                value={selectedParty?.notes || ''}
                onChange={(e) => {
                  if (selectedParty) {
                    setSelectedParty({ ...selectedParty, notes: e.target.value.toUpperCase() });
                  }
                }}
                placeholder="e.g. DR.FIROZ"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-bold text-slate-900 uppercase focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Appears beside state in envelope (e.g. RAJASTHAN DR.FIROZ)</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  NO BARCODE • NO WEIGHT
                </span>
              </div>
            </div>

            {/* Print Case Number Checkbox */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={printCaseNumber}
                  onChange={(e) => setPrintCaseNumber(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <span>Print Case Number (e.g. CASE: 1)</span>
              </label>

              <div className="text-[11px] font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                📦 {totalCases} Envelopes will generate
              </div>
            </div>
          </div>

          {/* Card D: Print & Layout Settings */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-slate-600" />
                <span>Envelope & Page Setup</span>
              </h3>
              <span className="text-[10px] font-bold text-slate-400">Sheet Config</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Paper / Envelope Size</span>
                <select
                  value={envelopeSize}
                  onChange={(e) => setEnvelopeSize(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-semibold text-slate-800"
                >
                  <option value="A4">A4 (Portrait / MARG Standard)</option>
                  <option value="A5">A5 Sheet</option>
                  <option value="DL">DL (220 × 110 mm)</option>
                  <option value="DL Long">DL Long</option>
                  <option value="Custom">Custom Size</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Envelopes Per Page</span>
                <select
                  value={envelopesPerPage}
                  onChange={(e) => setEnvelopesPerPage(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-semibold text-slate-800"
                >
                  <option value={1}>1 Envelope / Page</option>
                  <option value={2}>2 Envelopes / Page (A4)</option>
                  <option value={4}>4 Envelopes / Page</option>
                </select>
              </div>
            </div>

            {/* Print Options Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appSettings.show_mobile}
                  onChange={(e) => setAppSettings({ ...appSettings, show_mobile: e.target.checked })}
                  className="w-3.5 h-3.5 text-blue-600 rounded"
                />
                <span>Show Mobile No.</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appSettings.show_party_code}
                  onChange={(e) => setAppSettings({ ...appSettings, show_party_code: e.target.checked })}
                  className="w-3.5 h-3.5 text-blue-600 rounded"
                />
                <span>Show Party Code</span>
              </label>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* 3. RIGHT COLUMN: LIVE ENVELOPE PREVIEW (5 COLS) */}
        {/* ========================================== */}
        <div className="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          
          {/* Header & Controls */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-600" />
                <span>Live Envelope Preview</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                100% WYSIWYG matching printed envelope & PDF
              </p>
            </div>

            {/* Zoom & Fullscreen Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPreviewZoom((z) => Math.max(0.6, z - 0.1))}
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-600">
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                onClick={() => setPreviewZoom((z) => Math.min(1.4, z + 0.1))}
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsFullScreen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors ml-1"
                title="Full Screen Preview"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Full Screen</span>
              </button>
            </div>
          </div>

          {/* Case Navigation Bar */}
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Previewing:</span>
              <span className="px-2 py-0.5 rounded bg-blue-900 text-white font-extrabold text-[11px]">
                CASE {currentPreviewCase + 1} / {totalCases}
              </span>
              <span className="font-extrabold text-emerald-800">
                ({(casesList[currentPreviewCase]?.weight || uniformWeight).toFixed(2)} KG)
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPreviewCase((prev) => (prev > 0 ? prev - 1 : totalCases - 1))}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                title="Previous Case"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPreviewCase((prev) => (prev < totalCases - 1 ? prev + 1 : 0))}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                title="Next Case"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Envelope Preview Canvas */}
          <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center min-h-[380px] shadow-inner relative">
            {selectedParty ? (
              <div className="overflow-auto max-w-full flex justify-center py-2">
                <EnvelopeTemplate
                  party={selectedParty}
                  sender={sender}
                  caseItem={casesList[currentPreviewCase] || casesList[0]}
                  parcelType={parcelType}
                  settings={{
                    ...appSettings,
                    show_case_number: printCaseNumber,
                  }}
                  scale={previewZoom}
                  className="shadow-lg border-2 border-blue-900"
                />
              </div>
            ) : (
              <div className="text-center text-slate-400 text-xs py-12">
                Select a party to view live envelope preview.
              </div>
            )}
          </div>

          {/* Sheet Details Info Box */}
          <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-xs text-blue-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>
                Sheet Layout: <strong>{envelopesPerPage} Envelopes per {envelopeSize} Sheet</strong>
              </span>
            </div>
            <span className="font-extrabold text-blue-950">
              Total Pages: {Math.ceil(totalCases / envelopesPerPage)} Page(s)
            </span>
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handlePrintEnvelope}
              disabled={!isValidToPrint || isPrinting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition-all hover:scale-102 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-5 h-5" />
              <span>{isPrinting ? 'Preparing Print...' : 'PRINT ENVELOPE'}</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={!isValidToPrint || isDownloading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-102 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-5 h-5" />
              <span>{isDownloading ? 'Generating PDF...' : 'DOWNLOAD PDF'}</span>
            </button>
          </div>

          {/* Status message */}
          <div className="text-center text-[11px] font-semibold text-slate-500">
            {isValidToPrint ? (
              <span className="text-emerald-600 font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ready to Print ({totalCases} Envelopes)
              </span>
            ) : (
              <span className="text-red-500 font-bold flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Missing required information: Please select a party.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Page Margin & Layout Injection for window.print() */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: ${appSettings.margin_top_mm ?? 15}mm ${appSettings.margin_right_mm ?? 3}mm ${appSettings.margin_bottom_mm ?? 10}mm ${appSettings.margin_left_mm ?? 3}mm !important;
          }
          .sheet-page-wrapper {
            page-break-after: always;
            break-after: page;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            box-sizing: border-box;
          }
          .sheet-page-wrapper:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          .print-envelope-half {
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            box-sizing: border-box;
            margin-bottom: 2mm;
          }
        }
      `}</style>

      {/* Hidden print sheet container for window.print() */}
      <div className="print-only-sheet hidden">
        {Array.from({ length: Math.ceil(totalCases / envelopesPerPage) }, (_, pageIndex) => {
          const firstCase = casesList[pageIndex * envelopesPerPage];
          const secondCase = casesList[pageIndex * envelopesPerPage + 1];
          return (
            <div key={pageIndex} className="sheet-page-wrapper">
              {firstCase && (
                <div className="print-envelope-half">
                  <EnvelopeTemplate
                    party={selectedParty || {}}
                    sender={sender}
                    caseItem={firstCase}
                    parcelType={parcelType}
                    settings={appSettings}
                    isPrintMode={true}
                  />
                </div>
              )}
              {envelopesPerPage === 2 && (
                <>
                  <div className="cut-guide my-1 border-t border-dashed border-slate-500 text-center text-[9px] py-0.5 text-slate-600">
                    ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂
                  </div>
                  {secondCase ? (
                    <div className="print-envelope-half">
                      <EnvelopeTemplate
                        party={selectedParty || {}}
                        sender={sender}
                        caseItem={secondCase}
                        parcelType={parcelType}
                        settings={appSettings}
                        isPrintMode={true}
                      />
                    </div>
                  ) : (
                    <div className="print-envelope-half opacity-0"></div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Full Screen Preview Modal */}
      <FullScreenPreviewModal
        isOpen={isFullScreen}
        onClose={() => setIsFullScreen(false)}
        party={selectedParty || {}}
        sender={sender}
        cases={casesList}
        parcelType={parcelType}
        settings={appSettings}
        onPrint={handlePrintEnvelope}
        onDownloadPdf={handleDownloadPDF}
      />
    </div>
  );
};
