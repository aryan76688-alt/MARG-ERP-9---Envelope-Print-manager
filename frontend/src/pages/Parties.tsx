import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  FileSpreadsheet, 
  Download, 
  Edit, 
  Trash2, 
  Printer, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  CheckSquare,
  Square,
  AlertTriangle,
  AlertOctagon,
  Layers,
  Building2,
  MapPin,
  X,
  Languages,
  RefreshCw,
  LayoutGrid,
  List,
  Phone,
  MessageCircle,
  Calendar,
  ExternalLink,
  Mail,
  Compass,
  MapPinOff,
  Route,
  Check,
  ChevronDown,
  CheckCircle2,
  Share2,
  Sparkles,
  Lightbulb
} from 'lucide-react';
import { VoiceSearchInput } from '../components/VoiceSearchInput';
import { ShareDailyRouteModal } from '../components/ShareDailyRouteModal';
import { Party } from '../types';
import { 
  fetchParties, 
  createParty, 
  updateParty, 
  deleteParty, 
  bulkDeleteParties, 
  deleteAllParties, 
  exportSelectedParties, 
  getExportPartiesUrl,
  bulkAssignPartyRoute,
  fetchPartyRoutes,
  triggerBackgroundTranslation,
  fetchTranslationStatus,
  printEnvelopePDF,
  createBulkPrintJobs,
  sendGmailPartiesList,
  getApiBase,
  unsetPartyLocation,
  bulkUnsetPartyLocations
} from '../api/client';
import { getPartiesOffline, ensureInitialPartiesLoaded } from '../offline/db';
import { PartyModal } from '../components/PartyModal';
import { RouteManagerModal } from '../components/RouteManagerModal';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';

interface PartiesProps {
  onNavigate: (tab: string, state?: any) => void;
  initialAddModal?: boolean;
}

export const Parties: React.FC<PartiesProps> = ({ onNavigate, initialAddModal = false }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [pages, setPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [routeFilter, setRouteFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  // loop: Multi-filter select and GPS location status
  const [locationFilter, setLocationFilter] = useState<'all' | 'set' | 'not_set'>('all');
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [locationStats, setLocationStats] = useState<{ set: number; notSet: number }>({ set: 0, notSet: 0 });
  const [routeDropdownOpen, setRouteDropdownOpen] = useState<boolean>(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState<boolean>(false);
  const [routeSearchQ, setRouteSearchQ] = useState<string>('');
  const [citySearchQ, setCitySearchQ] = useState<string>('');
  const routeDropdownRef = useRef<HTMLDivElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (routeDropdownRef.current && !routeDropdownRef.current.contains(e.target as Node)) {
        setRouteDropdownOpen(false);
      }
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals & Operations
  const [partyModalOpen, setPartyModalOpen] = useState<boolean>(initialAddModal);
  const [routeManagerOpen, setRouteManagerOpen] = useState<boolean>(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [mapPickerParty, setMapPickerParty] = useState<Party | null>(null);
  const [deleteConfirmParty, setDeleteConfirmParty] = useState<Party | null>(null);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState<boolean>(false);
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState<boolean>(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Bulk Route Assignment Modal
  const [bulkRouteModalOpen, setBulkRouteModalOpen] = useState<boolean>(false);
  const [bulkRouteName, setBulkRouteName] = useState<string>('');
  const [existingRoutes, setExistingRoutes] = useState<string[]>([]);
  const [isAssigningRoute, setIsAssigningRoute] = useState<boolean>(false);

  // Daily Route Creation & Share Modal
  const [shareRouteModalOpen, setShareRouteModalOpen] = useState<boolean>(false);
  const [shareRouteParties, setShareRouteParties] = useState<Party[]>([]);

  // Background Google Translation state
  const [translating, setTranslating] = useState<boolean>(false);
  const [translationStats, setTranslationStats] = useState<{ is_running: boolean; total: number; processed: number; status: string } | null>(null);
  const [emailSending, setEmailSending] = useState<boolean>(false);

  const handleEmailPartiesList = async () => {
    setEmailSending(true);
    try {
      const res = await sendGmailPartiesList({});
      if (res.success) {
        alert('Master parties CSV list has been emailed to management via Gmail!');
      } else {
        alert('Failed to send email: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Email send error: ' + err.message);
    } finally {
      setEmailSending(false);
    }
  };

  const [syncingOrderBook, setSyncingOrderBook] = useState<boolean>(false);

  const isNewParty = (party: Party): boolean => {
    if (!party.created_at) return false;
    try {
      const createdDate = new Date(party.created_at).getTime();
      const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
      return createdDate >= tenDaysAgo;
    } catch {
      return false;
    }
  };

  const handleSyncAllToOrderBook = async () => {
    if (!window.confirm(`Sync all ${total} parties to Shreeji Healthcare Order Book app now?`)) return;
    setSyncingOrderBook(true);
    try {
      const res = await fetch(`${getApiBase()}/parties/sync-all-to-orderbook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Successfully synced ${data.synced} parties to Order Book!`);
      } else {
        alert('Sync failed: ' + (data.message || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error during Order Book sync: ' + err.message);
    } finally {
      setSyncingOrderBook(false);
    }
  };

  const checkTranslationProgress = async () => {
    try {
      const status = await fetchTranslationStatus();
      setTranslationStats(status);
      setTranslating(status.is_running);
      if (!status.is_running && status.status === 'completed') {
        loadParties();
      }
    } catch (e) {
      // silent
    }
  };

  const handleStartTranslation = async (force: boolean = false) => {
    try {
      setTranslating(true);
      const res = await triggerBackgroundTranslation(force);
      alert(res.message);
      checkTranslationProgress();
    } catch (err: any) {
      alert('Translation failed to start: ' + err.message);
      setTranslating(false);
    }
  };

  useEffect(() => {
    checkTranslationProgress();
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (translating) {
      interval = setInterval(() => {
        checkTranslationProgress();
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [translating]);

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const handleToggleRoute = (rt: string) => {
    setSelectedRoutes(prev =>
      prev.includes(rt) ? prev.filter(r => r !== rt) : [...prev, rt]
    );
    setPage(1);
  };

  const handleToggleCity = (ct: string) => {
    setSelectedCities(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    );
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setSearch('');
    setSelectedLetter('ALL');
    setLocationFilter('all');
    setSelectedRoutes([]);
    setSelectedCities([]);
    setRouteFilter('');
    setCityFilter('');
    setStateFilter('');
    setStatusFilter('all');
    setPage(1);
  };

  const loadParties = async () => {
    try {
      const routesParam = selectedRoutes.length > 0 ? selectedRoutes.join(',') : (routeFilter || undefined);
      const citiesParam = selectedCities.length > 0 ? selectedCities.join(',') : (cityFilter || undefined);

      // 1. Instant Cache Render (<15ms from IndexedDB)
      try {
        const cached = await getPartiesOffline({
          page,
          limit,
          search,
          state: stateFilter,
          city: cityFilter,
          cities: citiesParam,
          status: statusFilter,
          route: routeFilter || undefined,
          routes: routesParam,
          letter: selectedLetter !== 'ALL' ? selectedLetter : undefined,
          has_location: locationFilter
        });
        if (cached && cached.items && cached.items.length > 0) {
          setParties(cached.items);
          setTotal(cached.total);
          setPages(cached.pages);
          if (cached.states?.length) setAvailableStates(cached.states);
          if (cached.cities?.length) setAvailableCities(cached.cities);
          if (cached.location_set_count !== undefined && cached.location_not_set_count !== undefined) {
            setLocationStats({ set: cached.location_set_count, notSet: cached.location_not_set_count });
          }
          setLoading(false);
        }
      } catch (cacheErr) {
        console.warn('IndexedDB read error:', cacheErr);
      }

      // 2. Background Server Revalidation (SWR)
      let res: any = null;
      try {
        res = await fetchParties({
          page,
          limit,
          search,
          state: stateFilter,
          city: cityFilter,
          cities: citiesParam,
          status: statusFilter,
          route: routeFilter || undefined,
          routes: routesParam,
          has_location: locationFilter
        });
      } catch (apiErr) {
        console.warn('Network fetchParties failed, using cached IndexedDB data:', apiErr);
      }

      if (res && res.items && res.items.length > 0) {
        setParties(res.items);
        setTotal(res.total);
        setPages(res.pages);
        setAvailableStates(res.states || []);
        setAvailableCities(res.cities || []);
        if (res.location_set_count !== undefined && res.location_not_set_count !== undefined) {
          setLocationStats({ set: res.location_set_count, notSet: res.location_not_set_count });
        }
      }
    } catch (err) {
      console.error('Failed to load parties:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRoutes = async () => {
    try {
      const routes = await fetchPartyRoutes();
      setExistingRoutes(routes);
    } catch (err) {
      console.error('Failed to load routes:', err);
    }
  };

  useEffect(() => {
    ensureInitialPartiesLoaded().then(() => {
      loadParties();
    });
    loadRoutes();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadParties();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, stateFilter, cityFilter, selectedCities, statusFilter, routeFilter, selectedRoutes, locationFilter, selectedLetter, page, limit]);

  const handleBulkAssignRoute = async () => {
    if (selectedIds.length === 0) return;
    const rName = bulkRouteName.trim().toUpperCase();
    if (!rName) {
      alert('Please enter or select a route name');
      return;
    }
    try {
      setIsAssigningRoute(true);
      await bulkAssignPartyRoute(selectedIds, rName);
      setBulkRouteModalOpen(false);
      setBulkRouteName('');
      setSelectedIds([]);
      await loadParties();
      await loadRoutes();
    } catch (err: any) {
      alert('Failed to assign route: ' + err.message);
    } finally {
      setIsAssigningRoute(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === parties.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(parties.map((p) => p.id!).filter(Boolean));
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSaveParty = async (partyData: Party) => {
    if (editingParty && editingParty.id) {
      await updateParty(editingParty.id, partyData);
    } else {
      await createParty(partyData);
    }
    loadParties();
  };

  const handleDelete = async () => {
    if (!deleteConfirmParty || !deleteConfirmParty.id) return;
    try {
      await deleteParty(deleteConfirmParty.id);
      setDeleteConfirmParty(null);
      loadParties();
    } catch (err: any) {
      alert('Failed to delete party: ' + err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      setIsDeleting(true);
      await bulkDeleteParties(selectedIds);
      setSelectedIds([]);
      setBulkDeleteModalOpen(false);
      loadParties();
    } catch (err: any) {
      alert('Failed to delete selected parties: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setIsDeleting(true);
      await deleteAllParties();
      setSelectedIds([]);
      setDeleteAllModalOpen(false);
      loadParties();
    } catch (err: any) {
      alert('Failed to delete all parties: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkUnsetLocation = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to unset/clear GPS location for ${selectedIds.length} selected parties?`)) {
      return;
    }
    try {
      await bulkUnsetPartyLocations(selectedIds);
      setSelectedIds([]);
      await loadParties();
    } catch (err: any) {
      alert('Failed to unset locations: ' + err.message);
    }
  };

  const handleUnsetSinglePartyLocation = async (party: Party) => {
    if (!party.id) return;
    if (!window.confirm(`Are you sure you want to unset location for '${party.party_name}'?`)) {
      return;
    }
    try {
      await unsetPartyLocation(party.id);
      await loadParties();
    } catch (err: any) {
      alert('Failed to unset location: ' + err.message);
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      await exportSelectedParties(selectedIds);
    } catch (err: any) {
      alert('Failed to export selected parties: ' + err.message);
    }
  };

  const [isBulkPrintingAddresses, setIsBulkPrintingAddresses] = useState<boolean>(false);

  const handleBulkPrintAddresses = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkPrintingAddresses(true);
    try {
      let createdJobIds: number[] = [];
      try {
        const bulkRes = await createBulkPrintJobs({
          party_ids: selectedIds,
          total_cases: 0,
          parcel_type: 'Address'
        });
        if (bulkRes && bulkRes.job_ids) {
          createdJobIds = bulkRes.job_ids;
        }
      } catch (saveErr) {
        console.warn('Notice: Save bulk address print jobs:', saveErr);
      }

      await printEnvelopePDF({
        job_ids: createdJobIds.length > 0 ? createdJobIds : undefined,
        party_ids: createdJobIds.length === 0 ? selectedIds : undefined,
        total_cases: 0,
        auto_print: true
      });
    } catch (err: any) {
      console.error('Failed to print addresses in bulk:', err);
      alert('Failed to print addresses: ' + (err.message || 'Unknown error'));
    } finally {
      setIsBulkPrintingAddresses(false);
    }
  };

  const handleLetterClick = (letter: string) => {
    setSelectedLetter(letter);
    if (letter === 'ALL') {
      setSearch('');
    } else {
      setSearch(letter);
    }
    setPage(1);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Action & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Parties Management</span>
            <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
              ({total.toLocaleString()})
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Search, filter, and edit parties to generate courier envelopes instantly.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Pop Button Cards View (Quick Tap & Mobile Friendly)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Pop Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Classic Spreadsheet Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('nearby')}
            className="btn-secondary text-blue-700 bg-blue-50/80 border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors font-bold"
            title="View Nearest Parties by GPS Proximity"
          >
            <Compass className="w-4 h-4 text-blue-600" />
            <span>Nearest Parties</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('map')}
            className="btn-secondary text-emerald-700 bg-emerald-50/80 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors font-bold"
            title="Open Interactive Map with All Pinned Parties"
          >
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>Parties Map</span>
          </button>

          <button
            type="button"
            onClick={() => setRouteManagerOpen(true)}
            className="btn-secondary text-indigo-700 bg-indigo-50/80 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 transition-colors font-bold"
            title="3-Route System (Max 3 routes/party), Weekdays & Direct Google Sheets Sync"
          >
            <MapPin className="w-4 h-4 text-indigo-600" />
            <span>3-Route & Sheets</span>
          </button>

          <a
            href={getExportPartiesUrl()}
            download
            className="btn-secondary"
            title="Download Parties Excel Sheet"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export XLSX</span>
          </a>

          <button
            onClick={handleEmailPartiesList}
            disabled={emailSending}
            className="btn-secondary text-blue-700 bg-blue-50/80 border-blue-200 hover:bg-blue-100 font-bold"
            title="1-Click Email Master Parties Directory to Management via Gmail"
          >
            <Mail className={`w-4 h-4 ${emailSending ? 'motion-safe:animate-pulse text-blue-600' : 'text-blue-600'}`} />
            <span>{emailSending ? 'Emailing…' : 'Email to Gmail'}</span>
          </button>

          <button
            onClick={handleSyncAllToOrderBook}
            disabled={syncingOrderBook}
            className="btn-secondary text-emerald-800 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 font-bold"
            title="1-Click Synchronize all parties into Shreeji Healthcare Order Book"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncingOrderBook ? 'motion-safe:animate-spin' : ''}`} />
            <span>{syncingOrderBook ? 'Syncing to Order Book…' : 'Sync to Order Book'}</span>
          </button>

          <button
            onClick={() => onNavigate('import')}
            className="btn-secondary"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Excel</span>
          </button>

          {translating ? (
            <button
              disabled
              className="btn-secondary text-blue-700 cursor-wait"
            >
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Translating ({translationStats?.processed || 0}/{translationStats?.total || total})...</span>
            </button>
          ) : (
            <button
              onClick={() => handleStartTranslation(false)}
              className="btn-secondary text-slate-700"
              title="Translate untranslated parties into Gujarati"
            >
              <Languages className="w-4 h-4 text-blue-600" />
              <span>Translate</span>
            </button>
          )}

          <button
            onClick={() => {
              setEditingParty(null);
              setPartyModalOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add Party</span>
          </button>

          {total > 0 && (
            <button
              onClick={() => {
                setDeleteAllConfirmText('');
                setDeleteAllModalOpen(true);
              }}
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
              title="Advanced: Delete All Parties from database"
              aria-label="Delete All Parties"
            >
              <AlertOctagon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* loop: Stitch Location & Multi-Filter Control Console */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
        {/* Top Sub-Row: Location Filter Segmented Control */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Location Status:</span>
            </span>
          </div>

          <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/90 shadow-inner flex-wrap gap-1">
            <button
              type="button"
              onClick={() => { setLocationFilter('all'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center gap-2 cursor-pointer ${
                locationFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80 ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>All Parties</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                locationFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {total.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setLocationFilter('set'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center gap-2 cursor-pointer ${
                locationFilter === 'set'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${locationFilter === 'set' ? 'bg-white motion-safe:animate-pulse' : 'bg-emerald-500'}`}></span>
              <MapPin className="w-3.5 h-3.5" />
              <span>Location Set</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                locationFilter === 'set' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {locationStats.set.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setLocationFilter('not_set'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center gap-2 cursor-pointer ${
                locationFilter === 'not_set'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-500'
                  : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${locationFilter === 'not_set' ? 'bg-white' : 'bg-amber-500'}`}></span>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Not Set</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                locationFilter === 'not_set' ? 'bg-amber-800 text-amber-100' : 'bg-amber-100 text-amber-800'
              }`}>
                {locationStats.notSet.toLocaleString()}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* Search with Voice (Spans 2 columns on desktop) */}
          <div className="sm:col-span-2">
            <VoiceSearchInput
              placeholder="Search party name, code, mobile..."
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
            />
          </div>

          {/* Multi-Select Routes Dropdown */}
          <div className="relative" ref={routeDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setRouteDropdownOpen(prev => !prev);
                setCityDropdownOpen(false);
              }}
              className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between font-bold cursor-pointer transition-colors ${
                selectedRoutes.length > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Route className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">
                  {selectedRoutes.length === 0
                    ? 'All Routes'
                    : `${selectedRoutes.length} Route${selectedRoutes.length > 1 ? 's' : ''}`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {routeDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-md border border-slate-200 z-50 p-2 space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-800">Select Routes</span>
                  {selectedRoutes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedRoutes([]); setPage(1); }}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Filter routes..."
                  value={routeSearchQ}
                  onChange={(e) => setRouteSearchQ(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                <div className="max-h-52 overflow-y-auto space-y-1">
                  {/* Standard Weekdays */}
                  <div className="text-[11px] font-semibold text-slate-500 px-1 pt-1">Weekdays</div>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                    .filter(w => w.toLowerCase().includes(routeSearchQ.toLowerCase()))
                    .map((w) => {
                      const isSelected = selectedRoutes.includes(w);
                      return (
                        <label
                          key={w}
                          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-indigo-50/60 cursor-pointer text-xs font-bold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRoute(w)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={isSelected ? 'text-indigo-900 font-extrabold' : ''}>{w}</span>
                        </label>
                      );
                    })}

                  {/* Custom Routes */}
                  {existingRoutes.filter(r => !['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].includes(r.toUpperCase())).length > 0 && (
                    <>
                      <div className="text-[11px] font-semibold text-slate-500 px-1 pt-1.5">Custom Routes</div>
                      {existingRoutes
                        .filter(r => !['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].includes(r.toUpperCase()))
                        .filter(r => r.toLowerCase().includes(routeSearchQ.toLowerCase()))
                        .map((r) => {
                          const isSelected = selectedRoutes.includes(r);
                          return (
                            <label
                              key={r}
                              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-indigo-50/60 cursor-pointer text-xs font-bold text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleRoute(r)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className={isSelected ? 'text-indigo-900 font-extrabold' : ''}>{r}</span>
                            </label>
                          );
                        })}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Multi-Select Cities Dropdown */}
          <div className="relative" ref={cityDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setCityDropdownOpen(prev => !prev);
                setRouteDropdownOpen(false);
              }}
              className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between font-bold cursor-pointer transition-colors ${
                selectedCities.length > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-950 ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {selectedCities.length === 0
                    ? `All Cities (${availableCities.length})`
                    : `${selectedCities.length} Cit${selectedCities.length > 1 ? 'ies' : 'y'}`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {cityDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-md border border-slate-200 z-50 p-2 space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-800">Select Cities</span>
                  {selectedCities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedCities([]); setPage(1); }}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Filter cities..."
                  value={citySearchQ}
                  onChange={(e) => setCitySearchQ(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                <div className="max-h-52 overflow-y-auto space-y-1">
                  {availableCities
                    .filter(c => c.toLowerCase().includes(citySearchQ.toLowerCase()))
                    .map((ct) => {
                      const isSelected = selectedCities.includes(ct);
                      return (
                        <label
                          key={ct}
                          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-blue-50/60 cursor-pointer text-xs font-bold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCity(ct)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={isSelected ? 'text-blue-900 font-extrabold' : ''}>{ct}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* State Filter */}
          <div>
            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 bg-white"
            >
              <option value="">All States ({availableStates.length})</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 bg-white"
            >
              <option value="all">All Status</option>
              <option value="new_10_days">New Parties (Last 10 Days)</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips Console (Visible when any filter is on) */}
        {(locationFilter !== 'all' || selectedRoutes.length > 0 || selectedCities.length > 0 || statusFilter !== 'all' || stateFilter || search || selectedLetter !== 'ALL') && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-bold text-slate-500">Active Filters:</span>

            {locationFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                <span>GPS: {locationFilter === 'set' ? 'Location Set' : 'Not Set'}</span>
                <button
                  type="button"
                  onClick={() => setLocationFilter('all')}
                  className="hover:text-blue-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedRoutes.map(r => (
              <span key={r} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                <span>Route: {r}</span>
                <button
                  type="button"
                  onClick={() => handleToggleRoute(r)}
                  className="hover:text-indigo-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedCities.map(c => (
              <span key={c} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span>City: {c}</span>
                <button
                  type="button"
                  onClick={() => handleToggleCity(c)}
                  className="hover:text-emerald-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                <span>Status: {statusFilter}</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="hover:text-purple-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-slate-200 text-slate-800 border border-slate-300">
                <span>Search: "{search}"</span>
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="hover:text-slate-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedLetter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-slate-200 text-slate-800 border border-slate-300">
                <span>Letter: {selectedLetter}</span>
                <button
                  type="button"
                  onClick={() => handleLetterClick('ALL')}
                  className="hover:text-slate-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-[11px] font-extrabold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer ml-1"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* MARG ERP A-Z Quick Jump Alphabet Bar */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1.5 overflow-x-auto text-xs font-bold">
        <span className="text-xs text-slate-500 font-bold px-2 shrink-0">
          A-Z Jump:
        </span>
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-0.5">
          {['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map((letter) => {
            const isActive = selectedLetter === letter;
            return (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className={`min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'
                }`}
                aria-label={`Filter by letter ${letter}`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk Action Bar (Visible when parties are selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span className="text-xs font-black text-blue-950">
              {selectedIds.length} of {total} {selectedIds.length === 1 ? 'Party' : 'Parties'} Selected
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const selected = parties.filter((p) => selectedIds.includes(p.id!));
                if (selected.length > 0) {
                  setShareRouteParties(selected);
                  setShareRouteModalOpen(true);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-sm transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
              title="Create daily route and share link via WhatsApp/SMS to driver"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Create & Share Route ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => {
                const selected = parties.filter((p) => selectedIds.includes(p.id!));
                if (selected.length > 0) {
                  onNavigate('routes', { selectedParties: selected });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              title="View real road directions in Route Optimizer for selected parties"
            >
              <Route className="w-3.5 h-3.5" />
              <span>Route Optimizer ({selectedIds.length})</span>
            </button>

            <button
              onClick={handleBulkUnsetLocation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              title="Clear GPS coordinates for all selected parties"
            >
              <MapPinOff className="w-3.5 h-3.5" />
              <span>Unset Location ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => {
                setBulkRouteName('');
                setBulkRouteModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Assign Route ({selectedIds.length})</span>
            </button>

            <button
              onClick={handleExportSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Selected ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => {
                const selected = parties.filter((p) => selectedIds.includes(p.id!));
                if (selected.length > 0) {
                  onNavigate('print', { selectedParty: selected[0] });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Envelope ({selectedIds.length})</span>
            </button>

            <button
              onClick={handleBulkPrintAddresses}
              disabled={isBulkPrintingAddresses}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-sm transition-colors disabled:opacity-50"
              title="Print address envelopes in bulk (0 cases) without saving to history or locking parties"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isBulkPrintingAddresses ? 'Printing Addresses...' : `Print Addresses Bulk (${selectedIds.length})`}</span>
            </button>

            <button
              onClick={() => setBulkDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white font-bold text-xs transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Parties Data Display */}
      {viewMode === 'cards' ? (
        <div className="space-y-3">
          {/* Quick Select Bar for Cards */}
          <div className="flex items-center justify-between px-2 text-xs text-slate-500 font-semibold">
            <button
              onClick={handleSelectAll}
              className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-blue-600 transition-colors"
            >
              {selectedIds.length > 0 && selectedIds.length === parties.length ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Select All on this page ({parties.length})</span>
            </button>
            <span>Showing {parties.length} of {total} parties</span>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
              <div className="inline-flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full motion-safe:animate-spin"></div>
                <span className="font-bold text-sm">Loading parties from database…</span>
              </div>
            </div>
          ) : parties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {parties.map((p) => {
                const isSelected = selectedIds.includes(p.id!);
                return (
                  <div
                    key={p.id}
                    className={`group bg-white rounded-2xl border transition-colors duration-200 shadow-sm hover:shadow-md hover:border-blue-400 flex flex-col justify-between overflow-hidden relative ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                        : isNewParty(p)
                        ? 'border-emerald-400 ring-2 ring-emerald-400/25 bg-emerald-50/30'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Top Row: Select, Title, Gujarati, Badges */}
                    <div className="p-4 pb-3 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(p.id!)}
                            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                            aria-label={`Select ${p.party_name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug truncate capitalize">
                                {p.party_name.toLowerCase()}
                              </h3>
                              {isNewParty(p) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>New Party • નવી પાર્ટી</span>
                                </span>
                              )}
                              {!p.is_active && (
                                <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-black">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {p.party_name_gu && (
                              <p className="text-xs font-bold text-indigo-700 mt-0.5 truncate">
                                {p.party_name_gu}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Edit & Delete Mini-buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingParty(p);
                              setPartyModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Party"
                            aria-label={`Edit ${p.party_name}`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmParty(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Party"
                            aria-label={`Delete ${p.party_name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Code & 3-Route Badges */}
                      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                        {p.party_code ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-black bg-blue-50 text-blue-800 border border-blue-200">
                            #{p.party_code}
                          </span>
                        ) : null}

                        {p.route_1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200" title={`Primary Route 1: ${p.route_1}`}>
                            <span className="text-[8px] bg-indigo-200 text-indigo-900 px-1 rounded font-black">R1</span>
                            <span>{p.route_1}</span>
                            {p.route_1_gu && <span className="text-indigo-500 font-normal">({p.route_1_gu})</span>}
                          </span>
                        ) : null}

                        {p.route_2 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200" title={`Secondary Route 2: ${p.route_2}`}>
                            <span className="text-[8px] bg-purple-200 text-purple-900 px-1 rounded font-black">R2</span>
                            <span>{p.route_2}</span>
                            {p.route_2_gu && <span className="text-purple-500 font-normal">({p.route_2_gu})</span>}
                          </span>
                        ) : null}

                        {p.route_3 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200" title={`Third Route 3: ${p.route_3}`}>
                            <span className="text-[8px] bg-teal-200 text-teal-900 px-1 rounded font-black">R3</span>
                            <span>{p.route_3}</span>
                            {p.route_3_gu && <span className="text-teal-500 font-normal">({p.route_3_gu})</span>}
                          </span>
                        ) : null}

                        {!p.route_1 && !p.route_2 && !p.route_3 && (
                          p.route ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <MapPin className="w-2.5 h-2.5 text-slate-500" />
                              <span>{p.route}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No Route</span>
                          )
                        )}

                        {p.city && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                            {p.city.toLowerCase()}
                          </span>
                        )}
                      </div>

                      {/* Address Snippet */}
                      <div className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                        {p.address_gu || p.address}
                      </div>

                      {/* Location & Navigation Bar on Card */}
                      <div className="mt-2 flex items-center justify-between gap-1 p-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px]">
                        {p.latitude && p.longitude ? (
                          <>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 motion-safe:animate-pulse shrink-0"></span>
                              <span className="font-bold text-emerald-700 truncate">Pinned ({p.geofence_radius_meters || 75}m)</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                              <button
                                type="button"
                                onClick={() => onNavigate('routes', { selectedParty: p })}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[10px] shadow-sm transition-colors"
                                title="View Real Road Route in Route Optimizer"
                              >
                                <Route className="w-2.5 h-2.5" />
                                <span>Route</span>
                              </button>
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] shadow-sm transition-colors"
                                title="Go Directly in Google Maps"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>Go</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => setMapPickerParty(p)}
                                className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[10px] transition-colors"
                                title="Adjust Pin on Map"
                              >
                                Pin
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnsetSinglePartyLocation(p)}
                                className="px-1.5 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-[10px] transition-colors"
                                title="Unset / Clear GPS Location"
                              >
                                <MapPinOff className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                              <span className="font-medium text-slate-500 truncate">No GPS Pin</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMapPickerParty(p)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] shadow-sm transition-colors"
                              title="Set Exact Party Location on Map"
                            >
                              <MapPin className="w-2.5 h-2.5" />
                              <span>Set Pin on Map</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Pop-Action Bar Footer */}
                    <div className="bg-slate-50/80 px-3 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      {/* Phone & WhatsApp Quick Pop buttons */}
                      <div className="flex items-center gap-1.5">
                        {p.mobile_no ? (
                          <>
                            <a
                              href={`tel:${p.mobile_no}`}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-200 hover:border-emerald-300 shadow-sm active:scale-95 transition-colors"
                              title={`Call ${p.mobile_no}`}
                              aria-label={`Call ${p.mobile_no}`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={`https://wa.me/91${p.mobile_no.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                                `Hello ${p.party_name}, this is from dispatch.`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white hover:bg-green-50 text-green-600 border border-slate-200 hover:border-green-300 shadow-sm active:scale-95 transition-colors"
                              title={`WhatsApp ${p.mobile_no}`}
                              aria-label={`WhatsApp ${p.mobile_no}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic pl-1">No mobile</span>
                        )}
                      </div>

                      {/* Big Pop Print Envelope Button */}
                      <button
                        onClick={() => onNavigate('print', { selectedParty: p, deliveryRoute: p.route_1 || p.route })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs shadow-sm transition-colors"
                        title="Print envelope for this party"
                        aria-label={`Print envelope for ${p.party_name}`}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Envelope</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
              No parties found matching current search/filter.
            </div>
          )}
        </div>
      ) : (
        /* Main Parties Data Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">
                    <button onClick={handleSelectAll} className="p-1">
                      {selectedIds.length > 0 && selectedIds.length === parties.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3 w-12">#</th>
                  <th className="px-4 py-3">Party Name</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-4 py-3">Assigned Routes (1 / 2 / 3)</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Mobile No.</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full motion-safe:animate-spin"></div>
                        <span>Loading parties from database…</span>
                      </div>
                    </td>
                  </tr>
                ) : parties.length > 0 ? (
                  parties.map((p, idx) => {
                    const isSelected = selectedIds.includes(p.id!);
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(p.id!)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-400">
                          {limit === -1 ? idx + 1 : (page - 1) * limit + idx + 1}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="capitalize">{p.party_name.toLowerCase()}</span>
                            {isNewParty(p) && (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                                <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                                <span>New Party</span>
                              </span>
                            )}
                            {!p.is_active && (
                              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-normal text-slate-500 truncate max-w-xs mt-0.5">
                            {p.address}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-800">
                          {p.party_code ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 border border-slate-200">
                              #{p.party_code}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {p.route_1 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title={`Primary Route 1: ${p.route_1}`}>
                                <span className="text-[9px] bg-indigo-200 text-indigo-900 px-1 rounded font-black">R1</span>
                                <span>{p.route_1}</span>
                                {p.route_1_gu && <span className="text-indigo-500 font-normal">({p.route_1_gu})</span>}
                              </span>
                            ) : null}
                            {p.route_2 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200" title={`Secondary Route 2: ${p.route_2}`}>
                                <span className="text-[9px] bg-purple-200 text-purple-900 px-1 rounded font-black">R2</span>
                                <span>{p.route_2}</span>
                                {p.route_2_gu && <span className="text-purple-500 font-normal">({p.route_2_gu})</span>}
                              </span>
                            ) : null}
                            {p.route_3 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200" title={`Third Route 3: ${p.route_3}`}>
                                <span className="text-[9px] bg-teal-200 text-teal-900 px-1 rounded font-black">R3</span>
                                <span>{p.route_3}</span>
                                {p.route_3_gu && <span className="text-teal-500 font-normal">({p.route_3_gu})</span>}
                              </span>
                            ) : null}
                            {!p.route_1 && !p.route_2 && !p.route_3 && (
                              p.route ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {p.route}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px] italic">-</span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 capitalize">
                          {p.city ? p.city.toLowerCase() : '-'}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600 capitalize">
                          {p.state ? p.state.toLowerCase() : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {p.mobile_no || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Map Location Actions */}
                            {p.latitude && p.longitude ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onNavigate('routes', { selectedParty: p })}
                                  className="inline-flex items-center justify-center h-8 px-2 rounded-lg bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white font-bold text-xs transition-colors cursor-pointer"
                                  title="View Real Road Route in Route Optimizer"
                                >
                                  <Route className="w-3.5 h-3.5 mr-1" />
                                  <span>Route</span>
                                </button>
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center h-8 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white font-bold text-xs transition-colors"
                                  title="Go Directly in Google Maps"
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  <span>Map</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setMapPickerParty(p)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                  title="Adjust Pin on Map"
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUnsetSinglePartyLocation(p)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Unset / Clear GPS Location"
                                >
                                  <MapPinOff className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMapPickerParty(p)}
                                className="inline-flex items-center justify-center h-8 px-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-700 font-bold text-xs border border-slate-200 transition-colors"
                                title="Pin Location on Map"
                              >
                                <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                <span>Pin</span>
                              </button>
                            )}

                            {/* Print Envelope Directly */}
                            <button
                              onClick={() => onNavigate('print', { selectedParty: p, deliveryRoute: p.route_1 || p.route })}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-xs transition-colors"
                              title="Generate Envelope for this party"
                              aria-label={`Print envelope for ${p.party_name}`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => {
                                setEditingParty(p);
                                setPartyModalOpen(true);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                              title="Edit Party"
                              aria-label={`Edit ${p.party_name}`}
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => setDeleteConfirmParty(p)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Party"
                              aria-label={`Delete ${p.party_name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No parties found matching current search/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination & Records Selector Footer (Shared) */}
      <div className="px-5 py-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span>Showing records per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setPage(1);
            }}
            className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={-1}>All</option>
          </select>
          <span className="text-slate-400">|</span>
          <span>Total: <strong>{total}</strong> records</span>
        </div>

        {/* Page Navigation */}
        {limit !== -1 && pages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800">
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
              disabled={page === pages}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Party Modal */}
      <PartyModal
        isOpen={partyModalOpen}
        onClose={() => {
          setPartyModalOpen(false);
          setEditingParty(null);
        }}
        onSave={handleSaveParty}
        initialParty={editingParty}
      />

      {/* 3-Route System & Google Sheets Manager Modal */}
      <RouteManagerModal
        isOpen={routeManagerOpen}
        onClose={() => setRouteManagerOpen(false)}
        parties={parties}
        onPartiesUpdated={() => {
          loadParties();
          loadRoutes();
        }}
        onRoutesUpdated={() => {
          loadParties();
          loadRoutes();
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 text-center mb-2">
              Delete Party Confirmation
            </h3>
            <p className="text-slate-600 text-center mb-6">
              Are you sure you want to delete <strong className="text-slate-900">{deleteConfirmParty.party_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmParty(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-sm"
              >
                Delete Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 text-center mb-2">
              Delete {selectedIds.length} Selected Parties?
            </h3>
            <p className="text-slate-600 text-center mb-6">
              Are you sure you want to delete these <strong className="text-slate-900">{selectedIds.length} selected parties</strong> from your database? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setBulkDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-sm disabled:opacity-50 whitespace-nowrap"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin"></div>
                    <span>Deleting…</span>
                  </>
                ) : (
                  <span>Yes, Delete Selected</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Parties Confirmation Modal */}
      {deleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-rose-200 max-w-md w-full p-6 text-xs">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">
              Delete All Parties?
            </h3>
            <p className="text-slate-600 text-center mb-4 leading-relaxed font-normal">
              This will permanently erase all <strong className="text-slate-900 font-bold">{total.toLocaleString()} parties</strong> from the database. This action cannot be undone.
            </p>

            <div className="mb-4">
              <label className="block text-slate-700 font-semibold mb-1 text-xs">
                To confirm, type <span className="font-bold text-rose-600">DELETE</span> below:
              </label>
              <input
                type="text"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteAllModalOpen(false);
                  setDeleteAllConfirmText('');
                }}
                disabled={isDeleting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeleting || deleteAllConfirmText.trim() !== 'DELETE'}
                className="btn-danger whitespace-nowrap"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-rose-700 border-t-transparent rounded-full motion-safe:animate-spin"></div>
                    <span>Deleting…</span>
                  </>
                ) : (
                  <span>Delete All Parties</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Route Assignment Modal */}
      {bulkRouteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-md w-full p-6 text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Assign Delivery Route
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Applying to {selectedIds.length} selected parties
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBulkRouteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 mb-6">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">
                  Route Name (Type or Select)
                </label>
                <input
                  type="text"
                  value={bulkRouteName}
                  onChange={(e) => setBulkRouteName(e.target.value)}
                  placeholder="e.g. ROUTE 1, RING ROAD, MARKET, MODASA HWY"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                  autoFocus
                />
              </div>

              {existingRoutes.length > 0 && (
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    Existing routes in system:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    {existingRoutes.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBulkRouteName(r)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                          bulkRouteName.toUpperCase() === r.toUpperCase()
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-1.5 text-[11px] text-slate-600 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>All <strong>{selectedIds.length}</strong> selected parties will have their delivery route updated immediately and pre-filled whenever printing envelopes.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkRouteModalOpen(false)}
                disabled={isAssigningRoute}
                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkAssignRoute}
                disabled={isAssigningRoute || !bulkRouteName.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {isAssigningRoute ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin"></div>
                    <span>Saving Route…</span>
                  </>
                ) : (
                  <span>Assign Route to {selectedIds.length} Parties</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party Map Pinpoint Picker Modal */}
      {mapPickerParty && (
        <PartyMapPickerModal
          isOpen={true}
          party={mapPickerParty}
          onClose={() => setMapPickerParty(null)}
          onSaved={(updated) => {
            setParties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            if (editingParty?.id === updated.id) {
              setEditingParty(updated);
            }
          }}
        />
      )}

      {/* Create & Share Daily Route Modal */}
      <ShareDailyRouteModal
        isOpen={shareRouteModalOpen}
        onClose={() => setShareRouteModalOpen(false)}
        selectedParties={shareRouteParties}
        onOpenDriverApp={(token) => onNavigate('driver', { trip_token: token })}
      />
    </div>
  );
};
