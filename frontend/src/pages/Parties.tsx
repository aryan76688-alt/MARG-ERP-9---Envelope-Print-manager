import React, { useState, useEffect } from 'react';
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
  MessageCircle
} from 'lucide-react';
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
  fetchTranslationStatus
} from '../api/client';
import { getPartiesOffline, ensureInitialPartiesLoaded } from '../offline/db';
import { PartyModal } from '../components/PartyModal';

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals & Operations
  const [partyModalOpen, setPartyModalOpen] = useState<boolean>(initialAddModal);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
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

  // Background Google Translation state
  const [translating, setTranslating] = useState<boolean>(false);
  const [translationStats, setTranslationStats] = useState<{ is_running: boolean; total: number; processed: number; status: string } | null>(null);

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

  const loadParties = async () => {
    try {
      setLoading(true);
      let res: any = null;
      try {
        res = await fetchParties({
          page,
          limit,
          search,
          state: stateFilter,
          city: cityFilter,
          status: statusFilter,
        });
      } catch (apiErr) {
        console.warn('Online fetchParties failed, falling back to local database:', apiErr);
      }

      if (res && res.items && res.items.length > 0) {
        setParties(res.items);
        setTotal(res.total);
        setPages(res.pages);
        setAvailableStates(res.states || []);
        setAvailableCities(res.cities || []);
      } else {
        const offlineData = await getPartiesOffline({
          page,
          limit,
          search,
          state: stateFilter,
          city: cityFilter,
          status: statusFilter,
          letter: selectedLetter !== 'ALL' ? selectedLetter : undefined
        });
        setParties(offlineData.items);
        setTotal(offlineData.total);
        setPages(offlineData.pages);
        setAvailableStates(offlineData.states);
        setAvailableCities(offlineData.cities);
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
  }, [search, stateFilter, cityFilter, statusFilter, page, limit]);

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

  const handleExportSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      await exportSelectedParties(selectedIds);
    } catch (err: any) {
      alert('Failed to export selected parties: ' + err.message);
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Classic Spreadsheet Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

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

      {/* Filter Controls Row (Standardized Grid) */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Search (Spans 2 columns on desktop) */}
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search party name, code, mobile..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
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

        {/* City Filter */}
        <div>
          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 bg-white"
          >
            <option value="">All Cities ({availableCities.length})</option>
            {availableCities.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
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
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* MARG ERP A-Z Quick Jump Alphabet Bar */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1.5 overflow-x-auto text-xs font-bold">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider px-2 shrink-0">
          A-Z Jump:
        </span>
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-0.5">
          {['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map((letter) => {
            const isActive = selectedLetter === letter;
            return (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className={`min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
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
              className="inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors"
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
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="font-bold text-sm">Loading parties from database...</span>
              </div>
            </div>
          ) : parties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {parties.map((p) => {
                const isSelected = selectedIds.includes(p.id!);
                return (
                  <div
                    key={p.id}
                    className={`group bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md hover:border-blue-400 flex flex-col justify-between overflow-hidden relative ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
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

                      {/* Code & Route Badges */}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {p.party_code && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            #{p.party_code}
                          </span>
                        )}
                        {p.route ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <MapPin className="w-3 h-3" />
                            <span className="capitalize">{p.route.toLowerCase()}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No Route</span>
                        )}
                        {p.city && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                            {p.city.toLowerCase()}
                          </span>
                        )}
                      </div>

                      {/* Address Snippet */}
                      <div className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                        {p.address_gu || p.address}
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
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-200 hover:border-emerald-300 shadow-sm active:scale-95 transition-all"
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
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white hover:bg-green-50 text-green-600 border border-slate-200 hover:border-green-300 shadow-sm active:scale-95 transition-all"
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
                        onClick={() => onNavigate('print', { selectedParty: p, deliveryRoute: p.route })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-extrabold text-xs shadow-sm hover:shadow transition-all"
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
              <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider text-[10px]">
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
                  <th className="px-3 py-3">Route</th>
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
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading parties from database...</span>
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
                        <td className="px-3 py-3 font-mono font-medium text-slate-700">
                          {p.party_code || '—'}
                        </td>
                        <td className="px-3 py-3">
                          {p.route ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">
                              {p.route.toLowerCase()}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 capitalize">
                          {p.city ? p.city.toLowerCase() : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600 capitalize">
                          {p.state ? p.state.toLowerCase() : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {p.mobile_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Print Envelope Directly */}
                            <button
                              onClick={() => onNavigate('print', { selectedParty: p, deliveryRoute: p.route })}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
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
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md shadow-red-600/30"
              >
                Delete Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 text-xs">
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
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md shadow-red-600/30 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Deleting...</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-rose-200 max-w-md w-full p-6 text-xs">
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
                To confirm, type <span className="font-mono font-bold text-rose-600">DELETE</span> below:
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
                className="btn-danger"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-rose-700 border-t-transparent rounded-full animate-spin"></div>
                    <span>Deleting...</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs">
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
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs uppercase"
                  autoFocus
                />
              </div>

              {existingRoutes.length > 0 && (
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Existing Routes in System:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    {existingRoutes.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBulkRouteName(r)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
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

              <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                💡 All <strong>{selectedIds.length}</strong> selected parties will have their delivery route updated immediately and pre-filled whenever printing envelopes.
              </p>
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
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-md shadow-indigo-600/30 disabled:opacity-50 transition-all"
              >
                {isAssigningRoute ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving Route...</span>
                  </>
                ) : (
                  <span>Assign Route to {selectedIds.length} Parties</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
