import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Layers,
  ZoomIn,
  ZoomOut,
  Users,
  CheckSquare,
  Square,
  Plus,
  Minus,
  Info,
  Truck,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { 
  Party, 
  SenderSettings, 
  AppSettings, 
  CaseItem, 
  CaseBreakdownItem, 
  UnprintedPartyItem 
} from '../types';
import { 
  autocompleteParties, 
  createPrintJob, 
  createBulkPrintJobs, 
  downloadEnvelopePDF, 
  fetchSettings, 
  fetchPrintJobs, 
  fetchUnprintedPartiesToday 
} from '../api/client';
import { EnvelopeTemplate } from '../print/EnvelopeTemplate';
import { FullScreenPreviewModal } from '../components/FullScreenPreviewModal';

interface PrintEnvelopeProps {
  initialParty?: Party | null;
  onJobCreated?: (jobId: number) => void;
}

const FLUID_VOLUMES = ['100ML', '200ML', '250ML', '500ML', '1LTR'] as const;

export const PrintEnvelope: React.FC<PrintEnvelopeProps> = ({ initialParty, onJobCreated }) => {
  // Mode: Single Party vs Bulk Daily Select All
  const [printMode, setPrintMode] = useState<'single' | 'bulk'>('single');

  // Party selection state
  const [partySearch, setPartySearch] = useState<string>('');
  const [matchingParties, setMatchingParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(initialParty || null);
  const [searchMode, setSearchMode] = useState<'starts_with' | 'contains'>('contains');
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Bulk Daily Print state
  const [unprintedParties, setUnprintedParties] = useState<UnprintedPartyItem[]>([]);
  const [unprintedOnlyFilter, setUnprintedOnlyFilter] = useState<boolean>(true);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkSearch, setBulkSearch] = useState<string>('');
  const [isBulkLoading, setIsBulkLoading] = useState<boolean>(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState<boolean>(false);

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
    margin_top_mm: 15.0,
    margin_left_mm: 3.0,
    margin_right_mm: 3.0,
    margin_bottom_mm: 10.0,
    show_case_number: true,
  });

  // ==========================================================
  // CASE BREAKDOWN STATE (All default to 0; 0 will NOT print!)
  // ==========================================================
  const [standardCaseQty, setStandardCaseQty] = useState<number>(0);
  const [parcelBagQty, setParcelBagQty] = useState<number>(0);

  const [nsCaseVolumes, setNsCaseVolumes] = useState<Record<string, number>>({
    '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0,
  });
  const [rlCaseVolumes, setRlCaseVolumes] = useState<Record<string, number>>({
    '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0,
  });
  const [dnsCaseVolumes, setDnsCaseVolumes] = useState<Record<string, number>>({
    '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0,
  });
  const [metroCaseVolumes, setMetroCaseVolumes] = useState<Record<string, number>>({
    '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0,
  });

  // Active IV Fluid Tab in Case Builder
  const [activeFluidTab, setActiveFluidTab] = useState<'NS' | 'RL' | 'DNS' | 'METRO'>('NS');

  // Delivery Boy & Route Assignment (Optional)
  const [deliveryBoyName, setDeliveryBoyName] = useState<string>('');
  const [deliveryRoute, setDeliveryRoute] = useState<string>('');

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

  // Compute Active Non-Zero Breakdown Items (0 quantities excluded)
  const activeCaseBreakdown = useMemo<CaseBreakdownItem[]>(() => {
    const list: CaseBreakdownItem[] = [];
    if (standardCaseQty > 0) list.push({ type: 'CASE', qty: standardCaseQty });
    if (parcelBagQty > 0) list.push({ type: 'PARCEL BAG', qty: parcelBagQty });

    FLUID_VOLUMES.forEach((vol) => {
      const q = nsCaseVolumes[vol] || 0;
      if (q > 0) list.push({ type: 'NS CASE', volume: vol, qty: q });
    });
    FLUID_VOLUMES.forEach((vol) => {
      const q = rlCaseVolumes[vol] || 0;
      if (q > 0) list.push({ type: 'RL CASE', volume: vol, qty: q });
    });
    FLUID_VOLUMES.forEach((vol) => {
      const q = dnsCaseVolumes[vol] || 0;
      if (q > 0) list.push({ type: 'DNS CASE', volume: vol, qty: q });
    });
    FLUID_VOLUMES.forEach((vol) => {
      const q = metroCaseVolumes[vol] || 0;
      if (q > 0) list.push({ type: 'METRO CASE', volume: vol, qty: q });
    });

    return list;
  }, [standardCaseQty, parcelBagQty, nsCaseVolumes, rlCaseVolumes, dnsCaseVolumes, metroCaseVolumes]);

  // Total Packages Count
  const totalPackagesCount = useMemo<number>(() => {
    const sum = activeCaseBreakdown.reduce((acc, curr) => acc + curr.qty, 0);
    return sum > 0 ? sum : 1;
  }, [activeCaseBreakdown]);

  // Generated Cases Array for preview
  const casesList: CaseItem[] = Array.from({ length: totalPackagesCount }, (_, i) => ({
    case_number: i + 1,
    case_total: totalPackagesCount,
    weight: 1.0,
    barcode_value: `MRG-2026-000001-C${i + 1}`,
  }));

  // Reset all quantities to 0
  const handleResetQuantities = () => {
    setStandardCaseQty(0);
    setParcelBagQty(0);
    setNsCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setRlCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setDnsCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setMetroCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
  };

  // Check if selected party was printed today
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
      .catch(() => setHasPrintedToday(false));
  }, [selectedParty?.party_name]);

  // Load Settings & Sender
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

  // Load default party
  useEffect(() => {
    if (!selectedParty) {
      autocompleteParties('JODHPUR', 'contains').then((results) => {
        if (results && results.length > 0) {
          setSelectedParty(results[0]);
        }
      });
    }
  }, []);

  // Instant Autocomplete Search for Single Party
  useEffect(() => {
    if (!partySearch.trim()) {
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

  // Load Unprinted Parties for Bulk Mode
  const loadUnprintedParties = () => {
    setIsBulkLoading(true);
    fetchUnprintedPartiesToday(unprintedOnlyFilter)
      .then((res) => {
        setUnprintedParties(res.items || []);
        // Automatically select all unprinted parties
        const unprintedIds = (res.items || []).filter((p) => !p.printed_today).map((p) => p.id as number);
        setBulkSelectedIds(unprintedIds);
      })
      .catch(console.error)
      .finally(() => setIsBulkLoading(false));
  };

  useEffect(() => {
    if (printMode === 'bulk') {
      loadUnprintedParties();
    }
  }, [printMode, unprintedOnlyFilter]);

  // Filtered Bulk Parties
  const filteredBulkParties = useMemo(() => {
    if (!bulkSearch.trim()) return unprintedParties;
    const q = bulkSearch.toLowerCase();
    return unprintedParties.filter(
      (p) =>
        p.party_name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.party_code || '').toLowerCase().includes(q)
    );
  }, [unprintedParties, bulkSearch]);

  const toggleSelectAllBulk = () => {
    if (bulkSelectedIds.length === filteredBulkParties.length) {
      setBulkSelectedIds([]);
    } else {
      setBulkSelectedIds(filteredBulkParties.map((p) => p.id as number));
    }
  };

  const togglePartyInBulk = (id: number) => {
    setBulkSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

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

  // Validation for single print
  const isValidToPrint = selectedParty && selectedParty.party_name && selectedParty.address;

  // Single Envelope Print
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
        parcel_type: 'Medicine',
        total_cases: totalPackagesCount,
        case_weights: weights,
        envelope_size: envelopeSize,
        orientation: 'Landscape',
        printer_name: printerName,
        envelopes_per_page: envelopesPerPage,
        status: 'Printed',
        sender: sender,
        case_breakdown: activeCaseBreakdown,
        delivery_boy_name: deliveryBoyName.trim() || undefined,
        delivery_route: deliveryRoute.trim() || undefined,
      });

      if (onJobCreated) onJobCreated(res.id);
      window.print();
    } catch (err: any) {
      alert('Failed to process print job: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Single Envelope PDF Download
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
        parcel_type: 'Medicine',
        total_cases: totalPackagesCount,
        case_weights: casesList.map((c) => c.weight),
        sender: sender,
        case_breakdown: activeCaseBreakdown,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
        margin_top_mm: appSettings.margin_top_mm,
        margin_bottom_mm: appSettings.margin_bottom_mm,
        margin_left_mm: appSettings.margin_left_mm,
        margin_right_mm: appSettings.margin_right_mm,
      });
    } catch (err: any) {
      alert('Failed to download PDF: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  // Bulk Daily Print (One-time on day)
  const handleBulkPrint = async () => {
    if (bulkSelectedIds.length === 0) {
      alert('Please select at least one party to print.');
      return;
    }

    const confirmMsg = `Are you sure you want to print envelopes for ${bulkSelectedIds.length} parties?\n\nThis will mark them as printed for today so they are not printed twice.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkPrinting(true);
    try {
      const res = await createBulkPrintJobs({
        party_ids: bulkSelectedIds,
        case_breakdown: activeCaseBreakdown,
        total_cases: totalPackagesCount,
        delivery_boy_name: deliveryBoyName.trim() || undefined,
        delivery_route: deliveryRoute.trim() || undefined,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
      });

      alert(`Successfully generated print jobs for ${res.created_count} parties! Downloading combined PDF...`);

      // Download combined PDF of all bulk envelopes
      await downloadEnvelopePDF({
        job_ids: res.job_ids,
        sender: sender,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
      });

      // Refresh list
      loadUnprintedParties();
      if (onJobCreated && res.job_ids[0]) onJobCreated(res.job_ids[0]);
    } catch (err: any) {
      alert('Failed to execute bulk print: ' + err.message);
    } finally {
      setIsBulkPrinting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-10">
      {/* Top Banner: Mode Selector */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-900 uppercase tracking-wider px-2">
            Print Mode:
          </span>
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => setPrintMode('single')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                printMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Single Party Print</span>
            </button>
            <button
              onClick={() => setPrintMode('bulk')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                printMode === 'bulk'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Bulk Daily Print (Select All)</span>
              <span className="bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.2 rounded font-black">
                1-Time/Day
              </span>
            </button>
          </div>
        </div>

        {/* Right Info: 0-Quantity Rule Guarantee */}
        <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Items with 0 Quantity will NOT print on envelope</span>
        </div>
      </div>

      {/* ========================================================== */}
      {/* BULK DAILY PRINT VIEW (All Parties Select & Print 1x/Day)  */}
      {/* ========================================================== */}
      {printMode === 'bulk' && (
        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>Daily Bulk Party Selection</span>
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Select all parties or choose unprinted parties to generate dispatches once per day.
              </p>
            </div>

            {/* Bulk Action Button */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleBulkPrint}
                disabled={isBulkPrinting || bulkSelectedIds.length === 0}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm shadow-lg shadow-blue-600/30 transition-all hover:scale-102 disabled:opacity-50"
              >
                <Printer className="w-5 h-5" />
                <span>
                  {isBulkPrinting
                    ? 'Processing Bulk Print...'
                    : `PRINT ALL SELECTED (${bulkSelectedIds.length} PARTIES)`}
                </span>
              </button>
            </div>
          </div>

          {/* Bulk Controls & Filter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={bulkSearch}
                onChange={(e) => setBulkSearch(e.target.value)}
                placeholder="Search parties in list..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={unprintedOnlyFilter}
                  onChange={(e) => setUnprintedOnlyFilter(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>Show Unprinted Today Only</span>
              </label>
            </div>

            <div className="flex items-center justify-between bg-blue-50/70 px-4 py-2 rounded-xl border border-blue-100 text-xs font-bold text-blue-900">
              <span>Selected Parties:</span>
              <span className="font-black text-base text-blue-950">
                {bulkSelectedIds.length} / {filteredBulkParties.length}
              </span>
            </div>
          </div>

          {/* Optional Delivery Boy Assignment */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-600 block mb-1">Assign Delivery Boy (Optional):</span>
              <input
                type="text"
                value={deliveryBoyName}
                onChange={(e) => setDeliveryBoyName(e.target.value)}
                placeholder="e.g. Ramesh Bhai"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold"
              />
            </div>
            <div>
              <span className="font-bold text-slate-600 block mb-1">Assign Route (Optional):</span>
              <input
                type="text"
                value={deliveryRoute}
                onChange={(e) => setDeliveryRoute(e.target.value)}
                placeholder="e.g. Dehgam City Route"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold"
              />
            </div>
          </div>

          {/* Table of Parties for Bulk Printing */}
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-900 text-white font-black uppercase text-[10px] tracking-wider z-10">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={bulkSelectedIds.length === filteredBulkParties.length && filteredBulkParties.length > 0}
                      onChange={toggleSelectAllBulk}
                      className="w-3.5 h-3.5 text-blue-600 rounded"
                    />
                  </th>
                  <th className="p-3">Party Name</th>
                  <th className="p-3">Station / City</th>
                  <th className="p-3">Mobile No.</th>
                  <th className="p-3 text-center">Today's Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredBulkParties.map((p) => {
                  const isChecked = bulkSelectedIds.includes(p.id as number);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => togglePartyInBulk(p.id as number)}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                        isChecked ? 'bg-blue-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePartyInBulk(p.id as number)}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                      </td>
                      <td className="p-3 font-extrabold text-slate-900">{p.party_name}</td>
                      <td className="p-3 font-bold text-slate-700">{p.city}</td>
                      <td className="p-3 font-mono text-slate-600">{p.mobile_no || '-'}</td>
                      <td className="p-3 text-center">
                        {p.printed_today ? (
                          <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Printed Today
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                            Not Printed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 3-COLUMN MAIN LAYOUT (Search | Case Breakdown | Preview)   */}
      {/* ========================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ========================================== */}
        {/* 1. LEFT COLUMN: SELECT PARTY (3 COLS)      */}
        {/* ========================================== */}
        <div className="lg:col-span-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>Select Party</span>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                1-Letter Instant
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Instant search from 2,339 parties
            </p>
          </div>

          {/* Search Input */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type party name or city..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 uppercase focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Search Results Dropdown List */}
          <div className="space-y-1 max-h-[300px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {matchingParties.map((p, idx) => (
              <div
                key={p.id || idx}
                onClick={() => setSelectedParty(p)}
                className={`p-2 cursor-pointer transition-colors text-xs ${
                  selectedParty?.id === p.id
                    ? 'bg-blue-600 text-white font-bold'
                    : idx === activeSearchIndex
                    ? 'bg-blue-50 text-blue-900'
                    : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="font-extrabold uppercase">{p.party_name}</div>
                <div className="text-[10px] opacity-80 flex items-center justify-between">
                  <span>{p.city}</span>
                  {p.mobile_no && <span>{p.mobile_no}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Selected Party Summary Card */}
          {selectedParty && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="font-black text-slate-900 text-sm uppercase">
                {selectedParty.party_name}
              </div>
              <div className="text-slate-600 font-semibold uppercase leading-snug">
                {selectedParty.address}
              </div>
              <div className="text-slate-700 font-bold uppercase">
                {selectedParty.city}, {selectedParty.state}
              </div>
              {selectedParty.mobile_no && (
                <div className="text-blue-900 font-extrabold">
                  MOB: {selectedParty.mobile_no}
                </div>
              )}

              {/* Already Printed Today Badge */}
              {hasPrintedToday && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-extrabold text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Already printed {printedTodayCount} time(s) today!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 2. CENTER COLUMN: CASE BREAKDOWN BUILDER (4 COLS)          */}
        {/* ========================================================== */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Card: Case Breakdown Builder (0 Default Guarantee) */}
          <div className="bg-white p-4 rounded-xl border-2 border-blue-600 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>Case & Fluid Breakdown</span>
                </h3>
                <p className="text-[10px] text-slate-500 font-bold">
                  0-quantity items are NOT printed on envelope
                </p>
              </div>

              <button
                onClick={handleResetQuantities}
                className="text-[10px] font-bold text-slate-500 hover:text-red-600 flex items-center gap-1"
                title="Reset all to 0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Section A: Standard Case & Parcel Bag (Counters) */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* CASE (Standard) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-extrabold text-slate-800 text-[11px] uppercase">
                  Standard Case
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => setStandardCaseQty((q) => Math.max(0, q - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={standardCaseQty}
                    onChange={(e) => setStandardCaseQty(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-14 text-center font-black text-base text-blue-950 py-1 bg-white border border-slate-300 rounded-lg"
                  />
                  <button
                    onClick={() => setStandardCaseQty((q) => q + 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] font-bold text-slate-500 text-center">
                  Prints: {standardCaseQty > 0 ? `CASE: ${standardCaseQty}` : 'None'}
                </div>
              </div>

              {/* PARCEL BAG */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-extrabold text-slate-800 text-[11px] uppercase">
                  Parcel Bag
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => setParcelBagQty((q) => Math.max(0, q - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={parcelBagQty}
                    onChange={(e) => setParcelBagQty(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-14 text-center font-black text-base text-blue-950 py-1 bg-white border border-slate-300 rounded-lg"
                  />
                  <button
                    onClick={() => setParcelBagQty((q) => q + 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] font-bold text-slate-500 text-center">
                  Prints: {parcelBagQty > 0 ? `PARCEL BAG: ${parcelBagQty}` : 'None'}
                </div>
              </div>
            </div>

            {/* Section B: IV Fluid Case Types (NS, RL, DNS, METRO) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  IV Fluids (NS, RL, DNS, METRO)
                </span>
                <span className="text-[10px] font-extrabold text-blue-700">
                  Select Multiple Volumes
                </span>
              </div>

              {/* Tabs for Fluid Types */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                {(['NS', 'RL', 'DNS', 'METRO'] as const).map((tab) => {
                  const count =
                    tab === 'NS'
                      ? Object.values(nsCaseVolumes).reduce((a, b) => a + b, 0)
                      : tab === 'RL'
                      ? Object.values(rlCaseVolumes).reduce((a, b) => a + b, 0)
                      : tab === 'DNS'
                      ? Object.values(dnsCaseVolumes).reduce((a, b) => a + b, 0)
                      : Object.values(metroCaseVolumes).reduce((a, b) => a + b, 0);

                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveFluidTab(tab)}
                      className={`py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${
                        activeFluidTab === tab
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{tab}</span>
                      {count > 0 && (
                        <span className="bg-amber-400 text-slate-950 text-[10px] px-1 py-0.2 rounded-full font-black">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Volume Options Matrix for Selected Tab (100ML, 200ML, 250ML, 500ML, 1LTR) */}
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-2">
                <div className="text-[11px] font-extrabold text-blue-900 flex items-center justify-between">
                  <span>{activeFluidTab} CASE Volumes:</span>
                  <span className="text-[10px] text-blue-700 font-bold">
                    Multi-Volume Selection
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {FLUID_VOLUMES.map((vol) => {
                    const currentMap =
                      activeFluidTab === 'NS'
                        ? nsCaseVolumes
                        : activeFluidTab === 'RL'
                        ? rlCaseVolumes
                        : activeFluidTab === 'DNS'
                        ? dnsCaseVolumes
                        : metroCaseVolumes;

                    const setMap =
                      activeFluidTab === 'NS'
                        ? setNsCaseVolumes
                        : activeFluidTab === 'RL'
                        ? setRlCaseVolumes
                        : activeFluidTab === 'DNS'
                        ? setDnsCaseVolumes
                        : setMetroCaseVolumes;

                    const val = currentMap[vol] || 0;

                    return (
                      <div
                        key={vol}
                        className={`p-1.5 rounded-lg border transition-all ${
                          val > 0
                            ? 'bg-white border-blue-500 shadow-sm'
                            : 'bg-white/80 border-slate-200'
                        }`}
                      >
                        <div className="text-[10px] font-black text-slate-700">{vol}</div>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={val}
                          onChange={(e) => {
                            const newQ = Math.max(0, parseInt(e.target.value || '0', 10));
                            setMap({ ...currentMap, [vol]: newQ });
                          }}
                          className="w-full text-center font-black text-xs text-blue-950 py-1 bg-transparent border-none focus:outline-none"
                        />
                        <div className="flex items-center justify-center gap-1 pt-1">
                          <button
                            onClick={() => setMap({ ...currentMap, [vol]: Math.max(0, val - 1) })}
                            className="w-4 h-4 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center justify-center"
                          >
                            -
                          </button>
                          <button
                            onClick={() => setMap({ ...currentMap, [vol]: val + 1 })}
                            className="w-4 h-4 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Items to Print Preview Banner */}
            <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-blue-300">
                <span>ACTIVE ITEMS TO PRINT ON ENVELOPE:</span>
                <span className="text-amber-400 font-black">
                  Total: {totalPackagesCount} Cases
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeCaseBreakdown.length > 0 ? (
                  activeCaseBreakdown.map((item, idx) => (
                    <span
                      key={idx}
                      className="bg-white/10 px-2 py-0.5 rounded border border-white/20 font-black text-[11px] text-white"
                    >
                      {item.type} {item.volume ? item.volume : ''}: {item.qty}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 italic text-[11px]">
                    No cases selected yet (will fallback to CASE: 1)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Delivery Boy & Route Assignment */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>Delivery Boy & Route (Optional)</span>
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Delivery Boy</span>
                <input
                  type="text"
                  value={deliveryBoyName}
                  onChange={(e) => setDeliveryBoyName(e.target.value)}
                  placeholder="e.g. Ramesh"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Route / Area</span>
                <input
                  type="text"
                  value={deliveryRoute}
                  onChange={(e) => setDeliveryRoute(e.target.value)}
                  placeholder="e.g. Modasa Road"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================== */}
        {/* 3. RIGHT COLUMN: LIVE ENVELOPE PREVIEW (5 COLS)            */}
        {/* ========================================================== */}
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

          {/* Envelope Preview Canvas */}
          <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center min-h-[380px] shadow-inner relative">
            {selectedParty ? (
              <div className="overflow-auto max-w-full flex justify-center py-2">
                <EnvelopeTemplate
                  party={selectedParty}
                  sender={sender}
                  caseItem={casesList[currentPreviewCase] || casesList[0]}
                  caseBreakdown={activeCaseBreakdown}
                  settings={appSettings}
                  scale={previewZoom}
                  className="shadow-xl border border-slate-300"
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
                Sheet Layout: <strong>2 Envelopes per A4 Sheet (Clean Borderless)</strong>
              </span>
            </div>
            <span className="font-extrabold text-blue-950">
              Total Pages: {Math.ceil(totalPackagesCount / 2)} Page(s)
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
                Ready to Print ({totalPackagesCount} Cases)
              </span>
            ) : (
              <span className="text-red-500 font-bold flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Please select a valid party with address
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Full Screen Modal */}
      {selectedParty && (
        <FullScreenPreviewModal
          isOpen={isFullScreen}
          onClose={() => setIsFullScreen(false)}
          party={selectedParty}
          sender={sender}
          cases={casesList}
          caseBreakdown={activeCaseBreakdown}
          parcelType="Medicine"
          settings={appSettings}
          onPrint={handlePrintEnvelope}
          onDownloadPdf={handleDownloadPDF}
        />
      )}
    </div>
  );
};
