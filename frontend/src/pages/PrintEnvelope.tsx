import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Sparkles,
  Globe,
  Languages,
  Grid,
  FileText,
  Weight,
  Edit3,
  Lock,
  History,
  X
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
  printEnvelopePDF,
  fetchSettings, 
  fetchPrintJobs, 
  fetchUnprintedPartiesToday,
  translatePartyToGujarati,
  parseMargTextWithAI,
  batchTranslateParties
} from '../api/client';
import { EnvelopeTemplate } from '../print/EnvelopeTemplate';
import { FullScreenPreviewModal } from '../components/FullScreenPreviewModal';

interface PrintEnvelopeProps {
  initialParty?: Party | null;
  reprintJob?: any | null;
  onNavigate?: (tab: string, state?: any) => void;
  onJobCreated?: (jobId: number) => void;
}

const FLUID_VOLUMES = ['100ML', '200ML', '250ML', '500ML', '1LTR'] as const;

export const PrintEnvelope: React.FC<PrintEnvelopeProps> = ({ initialParty, reprintJob, onNavigate, onJobCreated }) => {
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

  // Language & Template Format selections
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'gu'>('en');
  const [selectedTemplate, setSelectedTemplate] = useState<'attachment_pdf' | 'marg_grid_22'>('attachment_pdf');

  // Case Breakdown Mode: 'fluid' (current) vs 'standard' (previous function)
  const [caseMode, setCaseMode] = useState<'fluid' | 'standard'>('fluid');

  // Standard Cases & Weight Mode (Previous Function Restored)
  const [parcelType, setParcelType] = useState<string>('Medicine');
  const [standardCasesCount, setStandardCasesCount] = useState<number>(1);
  const [uniformWeight, setUniformWeight] = useState<number>(1.0);
  const [useIndividualWeights, setUseIndividualWeights] = useState<boolean>(false);
  const [individualWeights, setIndividualWeights] = useState<number[]>([1.0]);

  // AI Translation & Smart Paste state
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiInputText, setAiInputText] = useState<string>('');
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [isBatchTranslating, setIsBatchTranslating] = useState<boolean>(false);
  const [isEditingGujarati, setIsEditingGujarati] = useState<boolean>(false);

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
  const [isEditReprintMode, setIsEditReprintMode] = useState<boolean>(!!reprintJob);
  const [editingJobId, setEditingJobId] = useState<number | null>(reprintJob?.id || null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Compute Active Non-Zero Breakdown Items (0 quantities excluded)
  const activeCaseBreakdown = useMemo<CaseBreakdownItem[]>(() => {
    if (caseMode === 'standard') {
      return [{ type: 'CASE', qty: standardCasesCount }];
    }

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
  }, [caseMode, standardCasesCount, standardCaseQty, parcelBagQty, nsCaseVolumes, rlCaseVolumes, dnsCaseVolumes, metroCaseVolumes]);

  // Total Packages Count
  const totalPackagesCount = useMemo<number>(() => {
    if (caseMode === 'standard') return standardCasesCount;
    const sum = activeCaseBreakdown.reduce((acc, curr) => acc + curr.qty, 0);
    return sum > 0 ? sum : 1;
  }, [caseMode, standardCasesCount, activeCaseBreakdown]);

  // Sync individual weights array when totalPackagesCount changes
  useEffect(() => {
    setIndividualWeights((prev) => {
      const arr = [...prev];
      while (arr.length < totalPackagesCount) arr.push(uniformWeight);
      return arr.slice(0, totalPackagesCount);
    });
  }, [totalPackagesCount, uniformWeight]);

  // Generated Cases Array for preview & print
  const casesList: CaseItem[] = useMemo(() => {
    return Array.from({ length: totalPackagesCount }, (_, i) => ({
      case_number: i + 1,
      case_total: totalPackagesCount,
      weight: useIndividualWeights ? (individualWeights[i] || uniformWeight) : uniformWeight,
      barcode_value: `MRG-2026-000001-C${i + 1}`,
    }));
  }, [totalPackagesCount, useIndividualWeights, individualWeights, uniformWeight]);

  // Reset all quantities to 0
  const handleResetQuantities = () => {
    setStandardCaseQty(0);
    setParcelBagQty(0);
    setNsCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setRlCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setDnsCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
    setMetroCaseVolumes({ '100ML': 0, '200ML': 0, '250ML': 0, '500ML': 0, '1LTR': 0 });
  };

  // Check if selected party was printed today and auto-populate party route
  useEffect(() => {
    if (!selectedParty?.party_name) {
      setHasPrintedToday(false);
      setPrintedTodayCount(0);
      return;
    }

    // Auto-populate route from selected party if route is assigned and not in reprint mode
    if (selectedParty?.route && !isEditReprintMode) {
      setDeliveryRoute(selectedParty.route);
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
  }, [selectedParty?.party_name, selectedParty?.route]);

  // Load from reprintJob if navigated from Print History
  useEffect(() => {
    if (reprintJob) {
      setIsEditReprintMode(true);
      setEditingJobId(reprintJob.id || null);
      if (reprintJob.template_format) {
        setSelectedTemplate(reprintJob.template_format);
      }
      if (reprintJob.language) {
        setSelectedLanguage(reprintJob.language);
      }
      if (reprintJob.delivery_boy_name) {
        setDeliveryBoyName(reprintJob.delivery_boy_name);
      }
      if (reprintJob.delivery_route) {
        setDeliveryRoute(reprintJob.delivery_route);
      }
      if (reprintJob.total_cases) {
        setStandardCasesCount(reprintJob.total_cases);
      }
      
      let bList = reprintJob.case_breakdown;
      if (!bList && reprintJob.case_breakdown_json) {
        try {
          bList = typeof reprintJob.case_breakdown_json === 'string' ? JSON.parse(reprintJob.case_breakdown_json) : reprintJob.case_breakdown_json;
        } catch (e) {
          bList = [];
        }
      }

      if (bList && Array.isArray(bList) && bList.length > 0) {
        handleResetQuantities();
        bList.forEach((b: any) => {
          const qty = Number(b.qty) || 0;
          const type = (b.type || '').toUpperCase();
          const vol = (b.volume || '').toUpperCase();
          if (type.includes('NS')) {
            setNsCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('RL')) {
            setRlCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('DNS')) {
            setDnsCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('METRO')) {
            setMetroCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('BAG') || type.includes('PARCEL')) {
            setParcelBagQty(qty);
          } else {
            setStandardCaseQty((q) => q + qty);
          }
        });
        setCaseMode('fluid');
      }
    }
  }, [reprintJob]);

  // Load Settings & Sender
  useEffect(() => {
    fetchSettings()
      .then((data) => {
        if (data.sender) setSender(data.sender);
        if (data.app) {
          setAppSettings(data.app);
          setEnvelopeSize(data.app.default_envelope_size || 'A4');
          setEnvelopesPerPage(data.app.envelopes_per_page || 2);
          if (data.app.default_language) {
            setSelectedLanguage(data.app.default_language as any);
          }
          if (data.app.envelope_template_format) {
            setSelectedTemplate(data.app.envelope_template_format as any);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Translate active party to Gujarati with Gemini AI
  const handleTranslateParty = async () => {
    if (!selectedParty) return;
    setIsTranslating(true);
    try {
      const res = await translatePartyToGujarati({
        party_id: selectedParty.id,
        party_name: selectedParty.party_name,
        address: selectedParty.address,
        city: selectedParty.city,
        state: selectedParty.state,
        save_to_db: true,
      });

      setSelectedParty({
        ...selectedParty,
        party_name_gu: res.party_name_gu,
        address_gu: res.address_gu,
        city_gu: res.city_gu,
        state_gu: res.state_gu,
      });
      setSelectedLanguage('gu');
    } catch (err: any) {
      alert('Translation to Gujarati failed: ' + err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  // AI Smart Paste / Parse MARG ERP text
  const handleParseMargText = async () => {
    if (!aiInputText.trim()) return;
    setIsAiParsing(true);
    setAiParseError(null);
    try {
      const res = await parseMargTextWithAI(aiInputText);
      if (!res.success || !res.data) {
        throw new Error('AI could not parse structured fields from text');
      }

      const d = res.data;
      const parsedParty: Party = {
        party_name: d.party_name || 'UNKNOWN PARTY',
        party_code: d.party_code || undefined,
        address: d.address || '',
        city: d.city || '',
        state: d.state || 'GUJARAT',
        mobile_no: d.mobile || undefined,
        gst_no: d.gst_no || undefined,
        is_active: true,
      };

      setSelectedParty(parsedParty);

      // Populate detected cases
      if (d.cases_breakdown && d.cases_breakdown.length > 0) {
        handleResetQuantities();
        d.cases_breakdown.forEach((b) => {
          const qty = Number(b.qty) || 0;
          const type = (b.type || '').toUpperCase();
          const vol = (b.volume || '').toUpperCase();
          if (type.includes('NS')) {
            setNsCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('RL')) {
            setRlCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('DNS')) {
            setDnsCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('METRO')) {
            setMetroCaseVolumes((prev) => ({ ...prev, [vol]: qty }));
          } else if (type.includes('PARCEL')) {
            setParcelBagQty(qty);
          } else {
            setStandardCaseQty((q) => q + qty);
          }
        });
        setCaseMode('fluid');
      } else if (d.total_cases && d.total_cases > 0) {
        setStandardCasesCount(d.total_cases);
        setStandardCaseQty(d.total_cases);
      }

      setIsAiModalOpen(false);
      setAiInputText('');
    } catch (err: any) {
      setAiParseError(err.message || 'Failed to parse text with Gemini AI');
    } finally {
      setIsAiParsing(false);
    }
  };

  // Bulk Batch Translate to Gujarati
  const handleBatchTranslateBulk = async () => {
    if (bulkSelectedIds.length === 0) {
      alert('Please select parties to batch translate.');
      return;
    }
    setIsBatchTranslating(true);
    try {
      const res = await batchTranslateParties(bulkSelectedIds);
      alert(`Successfully translated ${res.updated_count} parties to Gujarati via Gemini AI!`);
      setSelectedLanguage('gu');
      loadUnprintedParties();
    } catch (err: any) {
      alert('Batch translation failed: ' + err.message);
    } finally {
      setIsBatchTranslating(false);
    }
  };

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

    if (hasPrintedToday && !isEditReprintMode) {
      alert('This party has already been printed today and is locked to prevent duplicate dispatches. Please use Print History to reprint or edit.');
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
        parcel_type: caseMode === 'standard' ? parcelType : 'Medicine',
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
        template_format: selectedTemplate,
        language: selectedLanguage,
        party_name_gu: selectedParty.party_name_gu || undefined,
        address_gu: selectedParty.address_gu || undefined,
        address_line_2_gu: selectedParty.address_line_2_gu || undefined,
        address_line_3_gu: selectedParty.address_line_3_gu || undefined,
        city_gu: selectedParty.city_gu || undefined,
        state_gu: selectedParty.state_gu || undefined,
        allow_duplicate: isEditReprintMode,
      });

      if (onJobCreated) onJobCreated(res.id);

      // Trigger high-resolution vector PDF print directly (eliminates blank pages issue completely)
      try {
        await printEnvelopePDF({
          job_id: res.id,
          party_name: selectedParty.party_name,
          party_code: selectedParty.party_code || undefined,
          address: selectedParty.address,
          address_line_2: selectedParty.address_line_2 || undefined,
          address_line_3: selectedParty.address_line_3 || undefined,
          city: selectedParty.city,
          state: selectedParty.state,
          mobile_no: selectedParty.mobile_no || undefined,
          gst_no: selectedParty.gst_no || undefined,
          parcel_type: caseMode === 'standard' ? parcelType : 'Medicine',
          total_cases: totalPackagesCount,
          case_weights: weights,
          sender: sender,
          case_breakdown: activeCaseBreakdown,
          envelopes_per_page: envelopesPerPage,
          envelope_size: envelopeSize,
          template_format: selectedTemplate,
          language: selectedLanguage,
          party_name_gu: selectedParty.party_name_gu || undefined,
          address_gu: selectedParty.address_gu || undefined,
          address_line_2_gu: selectedParty.address_line_2_gu || undefined,
          address_line_3_gu: selectedParty.address_line_3_gu || undefined,
          city_gu: selectedParty.city_gu || undefined,
          state_gu: selectedParty.state_gu || undefined,
        });
      } catch (pdfErr) {
        console.warn('Direct PDF print failed, falling back to browser print:', pdfErr);
        document.body.classList.add('printing-envelope');
        setTimeout(() => {
          window.print();
          setTimeout(() => {
            document.body.classList.remove('printing-envelope');
          }, 1500);
        }, 200);
      }
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

    if (hasPrintedToday && !isEditReprintMode) {
      alert('This party has already been printed today and is locked to prevent duplicate dispatches. Please use Print History to reprint or edit.');
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
        parcel_type: caseMode === 'standard' ? parcelType : 'Medicine',
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
        template_format: selectedTemplate,
        language: selectedLanguage,
        party_name_gu: selectedParty.party_name_gu || undefined,
        address_gu: selectedParty.address_gu || undefined,
        address_line_2_gu: selectedParty.address_line_2_gu || undefined,
        address_line_3_gu: selectedParty.address_line_3_gu || undefined,
        city_gu: selectedParty.city_gu || undefined,
        state_gu: selectedParty.state_gu || undefined,
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

    const confirmMsg = `Are you sure you want to print envelopes for ${bulkSelectedIds.length} parties?\n\nLanguage: ${selectedLanguage === 'gu' ? 'ગુજરાતી' : 'English'}\nFormat: ${selectedTemplate === 'marg_grid_22' ? 'Classic 22-Row Grid' : 'Attachment PDF 123'}\n\nThis will mark them as printed for today so they are not printed twice.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkPrinting(true);
    try {
      const res = await createBulkPrintJobs({
        party_ids: bulkSelectedIds,
        case_breakdown: activeCaseBreakdown,
        total_cases: totalPackagesCount,
        parcel_type: caseMode === 'standard' ? parcelType : 'Medicine',
        delivery_boy_name: deliveryBoyName.trim() || undefined,
        delivery_route: deliveryRoute.trim() || undefined,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
        template_format: selectedTemplate,
        language: selectedLanguage,
      });

      alert(`Successfully generated print jobs for ${res.created_count} parties! Downloading combined PDF...`);

      // Download combined PDF of all bulk envelopes
      await downloadEnvelopePDF({
        job_ids: res.job_ids,
        sender: sender,
        envelopes_per_page: envelopesPerPage,
        envelope_size: envelopeSize,
        template_format: selectedTemplate,
        language: selectedLanguage,
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
      {/* Top Banner: Mode, Language & Template Format Selectors */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
              Mode:
            </span>
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setPrintMode('single')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  printMode === 'single'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Single Party</span>
              </button>
              <button
                onClick={() => setPrintMode('bulk')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  printMode === 'bulk'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Bulk Daily (Select All)</span>
                <span className="bg-amber-400 text-slate-900 text-[10px] px-1 py-0.2 rounded font-black">
                  1-Time/Day
                </span>
              </button>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Language Selector (English vs Gujarati with Gemini AI) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Languages className="w-3.5 h-3.5 text-purple-600" />
              <span>Language:</span>
            </span>
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setSelectedLanguage('en')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  selectedLanguage === 'en'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>English</span>
              </button>
              <button
                onClick={() => {
                  setSelectedLanguage('gu');
                  if (selectedParty && !selectedParty.party_name_gu) {
                    handleTranslateParty();
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  selectedLanguage === 'gu'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>ગુજરાતી</span>
              </button>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Template Format Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Format:</span>
            </span>
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setSelectedTemplate('attachment_pdf')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  selectedTemplate === 'attachment_pdf'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Attachment PDF 123</span>
              </button>
              <button
                onClick={() => setSelectedTemplate('marg_grid_22')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  selectedTemplate === 'marg_grid_22'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Classic MARG 22-Row Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Info: 0-Quantity Rule Guarantee & AI ready badge */}
        <div className="flex items-center gap-2 self-end xl:self-center">
          <span className="text-[10px] font-extrabold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Gemini AI Active
          </span>
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>0 Qty Not Printed</span>
          </div>
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

            {/* Bulk Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={handleBatchTranslateBulk}
                disabled={isBatchTranslating || bulkSelectedIds.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition-colors disabled:opacity-50"
                title="Translate all selected parties to Gujarati using Gemini AI"
              >
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>
                  {isBatchTranslating
                    ? 'Translating with AI...'
                    : `Translate Selected (${bulkSelectedIds.length}) to Gujarati`}
                </span>
              </button>

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

          {/* Search Input & AI Smart Paste Button */}
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

            {/* AI Smart Paste Button */}
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md shadow-purple-600/20 transition-all hover:scale-101"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>✨ AI Smart Paste / Parse MARG Text</span>
            </button>
          </div>

          {/* Search Results Dropdown List */}
          <div className="space-y-1 max-h-[260px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
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
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Active Party
                </span>
                <button
                  type="button"
                  onClick={handleTranslateParty}
                  disabled={isTranslating}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200 text-[10px] font-black transition-colors disabled:opacity-50"
                  title="Translate party details to Gujarati with Gemini AI"
                >
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>{isTranslating ? 'Translating...' : '✨ Translate (GU)'}</span>
                </button>
              </div>

              {/* English Details */}
              <div className="space-y-1">
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
              </div>

              {/* Gujarati Transliteration Preview / Edit Box */}
              {(selectedParty.party_name_gu || selectedLanguage === 'gu') && (
                <div className="mt-2 p-2.5 bg-purple-50/70 border border-purple-200 rounded-lg space-y-1.5 text-purple-950">
                  <div className="flex items-center justify-between border-b border-purple-200/60 pb-1">
                    <span className="text-[10px] font-black text-purple-800 uppercase flex items-center gap-1">
                      <Languages className="w-3 h-3" />
                      <span>ગુજરાતી વિગતો (Gujarati Details)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingGujarati(!isEditingGujarati)}
                      className="text-[10px] text-purple-700 hover:text-purple-900 font-bold flex items-center gap-0.5"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditingGujarati ? 'Done' : 'Edit'}</span>
                    </button>
                  </div>

                  {isEditingGujarati ? (
                    <div className="space-y-1.5 pt-1 text-[11px]">
                      <div>
                        <span className="text-[10px] text-purple-700 font-bold block">પાર્ટી નામ:</span>
                        <input
                          type="text"
                          value={selectedParty.party_name_gu || ''}
                          onChange={(e) => setSelectedParty({ ...selectedParty, party_name_gu: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-purple-300 font-bold bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-purple-700 font-bold block">સરનામું:</span>
                        <input
                          type="text"
                          value={selectedParty.address_gu || ''}
                          onChange={(e) => setSelectedParty({ ...selectedParty, address_gu: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-purple-300 font-bold bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <span className="text-[10px] text-purple-700 font-bold block">શહેર / ગામ:</span>
                          <input
                            type="text"
                            value={selectedParty.city_gu || ''}
                            onChange={(e) => setSelectedParty({ ...selectedParty, city_gu: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-purple-300 font-bold bg-white"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-purple-700 font-bold block">રાજ્ય:</span>
                          <input
                            type="text"
                            value={selectedParty.state_gu || ''}
                            onChange={(e) => setSelectedParty({ ...selectedParty, state_gu: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-purple-300 font-bold bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12px] font-bold leading-snug space-y-0.5">
                      <div className="font-black text-purple-900">
                        {selectedParty.party_name_gu || selectedParty.party_name}
                      </div>
                      <div>{selectedParty.address_gu || selectedParty.address}</div>
                      <div>
                        {selectedParty.city_gu || selectedParty.city},{' '}
                        {selectedParty.state_gu || selectedParty.state}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Party Lock Status */}
              {hasPrintedToday && !isEditReprintMode ? (
                <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 font-bold space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span>PARTY LOCKED — PRINTED TODAY</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-tight">
                    This party was printed {printedTodayCount} time(s) today. Further direct printing is locked to avoid duplicate courier dispatches.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate && onNavigate('history', { search: selectedParty.party_name })}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black shadow-sm flex items-center gap-1.5 transition-all"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Open in History to Edit & Reprint</span>
                    </button>
                  </div>
                </div>
              ) : isEditReprintMode ? (
                <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-lg text-blue-900 font-extrabold text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Editing Job #{editingJobId} (Unlocked for Reprint)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditReprintMode(false);
                      setEditingJobId(null);
                    }}
                    className="text-xs text-blue-600 hover:underline font-bold"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 2. CENTER COLUMN: CASE BREAKDOWN BUILDER (4 COLS)          */}
        {/* ========================================================== */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Card: Case Breakdown Builder (Dual Mode: Fluid vs Quick Standard) */}
          <div className="bg-white p-4 rounded-xl border-2 border-blue-600 shadow-sm space-y-4">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setCaseMode('fluid')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  caseMode === 'fluid'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Fluid & Volume Breakdown</span>
              </button>
              <button
                type="button"
                onClick={() => setCaseMode('standard')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  caseMode === 'standard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Weight className="w-3.5 h-3.5" />
                <span>Quick Cases & Weights</span>
              </button>
            </div>

            {/* MODE 1: FLUID & SPECIAL BREAKDOWN */}
            {caseMode === 'fluid' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h3 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                      <span>Multi-Fluid & Case Breakdown</span>
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold">
                      0-quantity items are NOT printed on envelope
                    </p>
                  </div>

                  <button
                    type="button"
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
                        type="button"
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
                        type="button"
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
                        type="button"
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
                        type="button"
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
                          type="button"
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

                  {/* Volume Options Matrix for Selected Tab */}
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
                                type="button"
                                onClick={() => setMap({ ...currentMap, [vol]: Math.max(0, val - 1) })}
                                className="w-4 h-4 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center justify-center"
                              >
                                -
                              </button>
                              <button
                                type="button"
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
              </div>
            ) : (
              /* MODE 2: QUICK CASES & WEIGHTS (PREVIOUS FUNCTION RESTORED) */
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-2">
                  <h3 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <span>Quick Standard Cases & Weights</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Classic mode with parcel type and KG weights
                  </p>
                </div>

                {/* Parcel Type Dropdown */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-tight mb-1">
                    Parcel / Goods Type
                  </label>
                  <select
                    value={parcelType}
                    onChange={(e) => setParcelType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-xs bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Medicine">Medicine (Default)</option>
                    <option value="Syrups">Syrups</option>
                    <option value="Tablets">Tablets</option>
                    <option value="Ointments">Ointments</option>
                    <option value="Cosmetics">Cosmetics</option>
                    <option value="Surgical Items">Surgical Items</option>
                    <option value="Sample Pack">Sample Pack</option>
                    <option value="Documents">Documents</option>
                  </select>
                </div>

                {/* Total Cases Counter */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="font-extrabold text-slate-800 text-[11px] uppercase flex items-center justify-between">
                    <span>Total Cases to Print</span>
                    <span className="text-blue-600 font-black">CASE: 1 to {standardCasesCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setStandardCasesCount((c) => Math.max(1, c - 1))}
                      className="w-10 h-9 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-base"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={standardCasesCount}
                      onChange={(e) => setStandardCasesCount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="w-20 text-center font-black text-lg text-blue-950 py-1 bg-white border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setStandardCasesCount((c) => c + 1)}
                      className="w-10 h-9 rounded-lg bg-white border border-slate-300 font-black text-slate-700 hover:bg-slate-100 flex items-center justify-center text-base"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Weight Options */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-800 uppercase">
                      Package Weight (KG)
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useIndividualWeights}
                        onChange={(e) => setUseIndividualWeights(e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span>Individual Weights</span>
                    </label>
                  </div>

                  {!useIndividualWeights ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={uniformWeight}
                        onChange={(e) => setUniformWeight(Math.max(0.1, parseFloat(e.target.value || '1.0')))}
                        className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-black text-xs text-blue-950"
                      />
                      <span className="text-xs font-bold text-slate-500">KG per envelope</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pt-1">
                      {Array.from({ length: standardCasesCount }).map((_, i) => (
                        <div key={i} className="bg-white p-1.5 rounded border border-slate-200 text-center">
                          <div className="text-[10px] font-bold text-slate-500">Case {i + 1}</div>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={individualWeights[i] ?? uniformWeight}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value || '1.0');
                              setIndividualWeights((prev) => {
                                const arr = [...prev];
                                arr[i] = val;
                                return arr;
                              });
                            }}
                            className="w-full text-center font-bold text-xs py-0.5 text-blue-950"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Active Items to Print Preview Banner */}
            <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-blue-300">
                <span>ACTIVE ITEMS TO PRINT ON ENVELOPE:</span>
                <span className="text-amber-400 font-black">
                  Total: {totalPackagesCount} Case(s)
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
                  parcelType={caseMode === 'standard' ? parcelType : 'Medicine'}
                  settings={appSettings}
                  scale={previewZoom}
                  templateFormat={selectedTemplate}
                  language={selectedLanguage}
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
                Format: <strong>{selectedTemplate === 'marg_grid_22' ? 'Classic 22-Row Grid' : 'Attachment PDF 123 (Borderless)'}</strong> ({selectedLanguage === 'gu' ? 'ગુજરાતી' : 'English'})
              </span>
            </div>
            <span className="font-extrabold text-blue-950">
              Total Pages: {Math.ceil(totalPackagesCount / 2)} Page(s)
            </span>
          </div>

          {/* Primary Action Buttons */}
          {hasPrintedToday && !isEditReprintMode ? (
            <div className="pt-2 space-y-2">
              <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-900">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>PRINT LOCKED — ALREADY PRINTED TODAY</span>
                </div>
                <p className="text-[11px] text-amber-800 font-semibold leading-tight">
                  This party was already printed today. To prevent accidental duplicates, printing from here is locked.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('history', { search: selectedParty?.party_name })}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-all"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Go to History to Reprint or Edit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handlePrintEnvelope}
                disabled={!isValidToPrint || isPrinting}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition-all hover:scale-102 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-5 h-5" />
                <span>
                  {isPrinting ? 'Preparing Print...' : isEditReprintMode ? 'UPDATE & REPRINT' : 'PRINT ENVELOPE'}
                </span>
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
          )}

          {/* Status message */}
          <div className="text-center text-[11px] font-semibold text-slate-500">
            {isValidToPrint ? (
              <span className="text-emerald-600 font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ready to Print ({totalPackagesCount} Cases) • {selectedLanguage === 'gu' ? 'ગુજરાતી' : 'English'}
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
          parcelType={caseMode === 'standard' ? parcelType : 'Medicine'}
          settings={appSettings}
          templateFormat={selectedTemplate}
          language={selectedLanguage}
          onPrint={handlePrintEnvelope}
          onDownloadPdf={handleDownloadPDF}
        />
      )}

      {/* ========================================================== */}
      {/* AI SMART PASTE / PARSE MARG TEXT MODAL                    */}
      {/* ========================================================== */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    ✨ AI Smart Paste / Parse MARG Text
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Powered by Google Gemini AI with Automatic Fallbacks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAiModalOpen(false);
                  setAiParseError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Paste copied MARG bill, invoice printout, or party ledger text below:
              </label>
              <textarea
                value={aiInputText}
                onChange={(e) => setAiInputText(e.target.value)}
                rows={7}
                placeholder="Example:
INVOICE NO: 1245
PARTY: SHREE RADHE PHARMA
ADDRESS: NEAR OLD BUS STAND, MODASA
CITY: MODASA, GUJARAT
MOB: 9876543210
CASE: 3 NS: 2 (500ML)"
                className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none bg-slate-50"
              />
              <p className="text-[11px] text-slate-500">
                Gemini AI will intelligently extract party name, address, city, state, mobile number, and case breakdowns.
              </p>
            </div>

            {aiParseError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{aiParseError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAiModalOpen(false);
                  setAiParseError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleParseMargText}
                disabled={isAiParsing || !aiInputText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 transition-all hover:scale-102 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isAiParsing ? 'Analyzing with Gemini AI...' : '🤖 Extract & Fill Envelope'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print sheet container for window.print() rendered directly to body */}
      {selectedParty && createPortal(
        <div className="print-only-sheet">
          {Array.from({ length: Math.ceil(totalPackagesCount / envelopesPerPage) }, (_, pageIndex) => {
            const firstCase = casesList[pageIndex * envelopesPerPage] || casesList[0];
            const secondCase = casesList[pageIndex * envelopesPerPage + 1];
            return (
              <div key={pageIndex} className="sheet-page-wrapper">
                {firstCase && (
                  <div className="print-envelope-half">
                    <EnvelopeTemplate
                      party={selectedParty}
                      sender={sender}
                      caseItem={firstCase}
                      caseBreakdown={activeCaseBreakdown}
                      parcelType={caseMode === 'standard' ? parcelType : 'Medicine'}
                      settings={appSettings}
                      templateFormat={selectedTemplate}
                      language={selectedLanguage}
                      isPrintMode={true}
                    />
                  </div>
                )}
                {envelopesPerPage === 2 && (
                  <>
                    <div className="cut-guide">
                      ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂
                    </div>
                    {secondCase ? (
                      <div className="print-envelope-half">
                        <EnvelopeTemplate
                          party={selectedParty}
                          sender={sender}
                          caseItem={secondCase}
                          caseBreakdown={activeCaseBreakdown}
                          parcelType={caseMode === 'standard' ? parcelType : 'Medicine'}
                          settings={appSettings}
                          templateFormat={selectedTemplate}
                          language={selectedLanguage}
                          isPrintMode={true}
                        />
                      </div>
                    ) : (
                      <div className="print-envelope-half" style={{ visibility: 'hidden' }}></div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
