import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Printer, 
  Phone, 
  MessageCircle, 
  MapPin, 
  Edit, 
  X, 
  Map, 
  Filter, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit3,
  Navigation,
  Crosshair,
  Compass,
  MapPinOff,
  Route,
  Building2,
  Check,
  CheckSquare,
  Square,
  Share2
} from 'lucide-react';
import { Party } from '../types';
import { fetchParties, createParty, updateParty, updatePartyGeofence, unsetPartyLocation } from '../api/client';
import { getPartiesOffline, ensureInitialPartiesLoaded } from '../offline/db';
import { PartyModal } from '../components/PartyModal';
import { RouteManagerModal } from '../components/RouteManagerModal';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';
import { ShareDailyRouteModal } from '../components/ShareDailyRouteModal';
import { VoiceSearchInput } from '../components/VoiceSearchInput';

interface MobilePartiesProps {
  onNavigate: (tab: string, state?: any) => void;
  initialAddModal?: boolean;
  initialRouteModal?: boolean;
}

export const MobileParties: React.FC<MobilePartiesProps> = ({
  onNavigate,
  initialAddModal = false,
  initialRouteModal = false
}) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [weekdayFilter, setWeekdayFilter] = useState<string>('all');
  const [gpsFilter, setGpsFilter] = useState<'all' | 'has_gps' | 'no_gps'>('all');
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);
  const [drawerRouteSearch, setDrawerRouteSearch] = useState<string>('');
  const [drawerCitySearch, setDrawerCitySearch] = useState<string>('');
  const [drawerTab, setDrawerTab] = useState<'routes' | 'cities'>('routes');
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // Modals
  const [partyModalOpen, setPartyModalOpen] = useState<boolean>(initialAddModal);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState<boolean>(initialRouteModal);
  const [pinningPartyId, setPinningPartyId] = useState<number | null>(null);
  const [mapPickerParty, setMapPickerParty] = useState<Party | null>(null);

  // Multi-Party Selection & Daily Route Share
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [shareRouteModalOpen, setShareRouteModalOpen] = useState<boolean>(false);
  const [shareRouteParties, setShareRouteParties] = useState<Party[]>([]);

  const handleToggleSelectParty = (id: number) => {
    setSelectedPartyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedPartyIds.size === filteredParties.length) {
      setSelectedPartyIds(new Set());
    } else {
      const allIds = new Set(filteredParties.map(p => p.id!).filter(Boolean));
      setSelectedPartyIds(allIds);
    }
  };

  const handleOpenShareRoute = (partiesToShare?: Party[]) => {
    const list = partiesToShare || filteredParties.filter(p => selectedPartyIds.has(p.id!));
    if (list.length === 0) return;
    setShareRouteParties(list);
    setShareRouteModalOpen(true);
  };

  // 1-Tap Pin Party GPS from device
  const handlePinPartyGPS = (party: Party) => {
    if (!party.id) return;
    if (!navigator.geolocation) {
      alert("GPS location service is not supported on this device.");
      return;
    }
    setPinningPartyId(party.id);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await updatePartyGeofence(party.id!, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            radius_meters: party.geofence_radius_meters || 75
          });
          setParties(prev => prev.map(p => p.id === party.id ? {
            ...p,
            latitude: res.latitude,
            longitude: res.longitude,
            geofence_radius_meters: res.geofence_radius_meters,
            geofence_set_at: res.geofence_set_at
          } : p));
        } catch (err: any) {
          alert(err.message || "Failed to update GPS coordinates");
        } finally {
          setPinningPartyId(null);
        }
      },
      (err) => {
        alert("GPS Error: " + err.message);
        setPinningPartyId(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Unset Party GPS pin
  const handleUnsetPartyGPS = async (party: Party) => {
    if (!party.id) return;
    if (!window.confirm(`શું તમે '${party.party_name}' નું લોકેશન હટાવવા (Unset કરવા) માંગો છો?`)) {
      return;
    }
    try {
      await unsetPartyLocation(party.id);
      setParties((prev) =>
        prev.map((p) =>
          p.id === party.id
            ? {
                ...p,
                latitude: null,
                longitude: null,
                geofence_set_at: null,
              }
            : p
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to unset GPS location');
    }
  };

  const weekdays = [
    { id: 'all', label: 'All Days' },
    { id: 'MONDAY', label: 'Monday' },
    { id: 'TUESDAY', label: 'Tuesday' },
    { id: 'WEDNESDAY', label: 'Wednesday' },
    { id: 'THURSDAY', label: 'Thursday' },
    { id: 'FRIDAY', label: 'Friday' },
    { id: 'SATURDAY', label: 'Saturday' },
    { id: 'SUNDAY', label: 'Sunday' }
  ];

  // Load parties from API or fallback offline cache
  const loadParties = async () => {
    setLoading(true);
    try {
      const res = await fetchParties({ page: 1, limit: -1 });
      if (res && res.items && res.items.length > 0) {
        setParties(res.items);
      } else {
        const off = await getPartiesOffline({ page: 1, limit: -1 });
        setParties(off.items || []);
      }
    } catch {
      try {
        const off = await getPartiesOffline({ page: 1, limit: -1 });
        setParties(off.items || []);
      } catch {
        setParties([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ensureInitialPartiesLoaded().then(() => loadParties());
  }, []);

  // loop: Compute live location stats for GPS Segmented Buttons
  const locationStats = useMemo(() => {
    let set = 0;
    let notSet = 0;
    for (const p of parties) {
      if (p.latitude && p.longitude) set++;
      else notSet++;
    }
    return { set, notSet };
  }, [parties]);

  // loop: Dynamic list of routes and cities from parties list
  const availableRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    for (const p of parties) {
      if (p.route) routeSet.add(p.route.trim());
      if (p.route_1) routeSet.add(p.route_1.trim());
      if (p.route_2) routeSet.add(p.route_2.trim());
      if (p.route_3) routeSet.add(p.route_3.trim());
    }
    return Array.from(routeSet).filter(Boolean).sort();
  }, [parties]);

  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    for (const p of parties) {
      if (p.city) citySet.add(p.city.trim());
    }
    return Array.from(citySet).filter(Boolean).sort();
  }, [parties]);

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
    setGpsFilter('all');
    setWeekdayFilter('all');
    setSelectedRoutes([]);
    setSelectedCities([]);
    setSearchQuery('');
    setPage(1);
  };

  const activeFilterCount = (gpsFilter !== 'all' ? 1 : 0) + (weekdayFilter !== 'all' ? 1 : 0) + selectedRoutes.length + selectedCities.length;

  // Filtered Parties
  const filteredParties = useMemo(() => {
    let result = parties;

    // GPS Status Filter
    if (gpsFilter === 'has_gps') {
      result = result.filter(p => p.latitude && p.longitude);
    } else if (gpsFilter === 'no_gps') {
      result = result.filter(p => !p.latitude || !p.longitude);
    }

    // Weekday Route Filter
    if (weekdayFilter !== 'all') {
      const target = weekdayFilter.toUpperCase();
      result = result.filter(p => {
        const r1 = (p.route_1 || p.route || '').toUpperCase();
        const r2 = (p.route_2 || '').toUpperCase();
        const r3 = (p.route_3 || '').toUpperCase();
        return r1.includes(target) || r2.includes(target) || r3.includes(target);
      });
    }

    // Multi-Route Filter
    if (selectedRoutes.length > 0) {
      const targets = selectedRoutes.map(r => r.toUpperCase());
      result = result.filter(p => {
        const rAll = [
          p.route, p.route_1, p.route_2, p.route_3,
          p.route_1_gu, p.route_2_gu, p.route_3_gu
        ].map(r => (r || '').trim().toUpperCase());
        return targets.some(target => rAll.some(r => r.includes(target)));
      });
    }

    // Multi-City Filter
    if (selectedCities.length > 0) {
      const targets = selectedCities.map(c => c.toUpperCase());
      result = result.filter(p => {
        const c1 = (p.city || '').trim().toUpperCase();
        const c2 = (p.city_gu || '').trim().toUpperCase();
        return targets.some(target => c1.includes(target) || c2.includes(target));
      });
    }

    // Search Query Filter (Code, Name, Gujarati, City)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p => 
        (p.party_name && p.party_name.toLowerCase().includes(q)) ||
        (p.party_name_gu && p.party_name_gu.toLowerCase().includes(q)) ||
        (p.party_code && p.party_code.toLowerCase().includes(q)) ||
        (p.city && p.city.toLowerCase().includes(q)) ||
        (p.city_gu && p.city_gu.toLowerCase().includes(q)) ||
        (p.mobile_no && p.mobile_no.includes(q))
      );
    }

    return result;
  }, [parties, weekdayFilter, gpsFilter, selectedRoutes, selectedCities, searchQuery]);

  const totalPages = Math.ceil(filteredParties.length / pageSize) || 1;
  const paginatedParties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredParties.slice(start, start + pageSize);
  }, [filteredParties, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, weekdayFilter, gpsFilter, selectedRoutes, selectedCities]);

  const handleEditParty = (party: Party) => {
    setEditingParty(party);
    setPartyModalOpen(true);
  };

  const handleAddParty = () => {
    setEditingParty(null);
    setPartyModalOpen(true);
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-32 font-sans text-slate-100">
      {/* 1. SEARCH & QUICK TELEMETRY SHORTCUTS BAR (STITCH TACTICAL) */}
      <div className="space-y-2.5">
        <div className="w-full">
          <VoiceSearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            placeholder="Search chemist name, code, area, Gujarati..."
            inputClassName="rounded-2xl py-3 pl-10 pr-24 bg-[#111827] border-slate-800 text-white placeholder-slate-500 shadow-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* 4 Shortcut Action Pills */}
        <div className="grid grid-cols-4 gap-2">
          {/* Nearest Radar */}
          <button
            onClick={() => onNavigate('nearby')}
            className="py-2.5 px-2 rounded-xl bg-blue-950/80 hover:bg-blue-900/90 text-blue-300 border border-blue-800/60 font-bold text-xs shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            title="Nearest Parties by GPS Radar"
          >
            <Compass className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-bold">Nearby</span>
          </button>

          {/* All Parties Map */}
          <button
            onClick={() => onNavigate('map')}
            className="py-2.5 px-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/60 font-bold text-xs shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            title="All Parties Map & Radar"
          >
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-bold">Map</span>
          </button>

          {/* Route Optimizer */}
          <button
            onClick={() => onNavigate('route-optimizer')}
            className="py-2.5 px-2 rounded-xl bg-teal-950/80 hover:bg-teal-900/90 text-teal-300 border border-teal-800/60 font-bold text-xs shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            title="TSP Route Optimizer"
          >
            <Route className="w-4 h-4 text-teal-400" />
            <span className="text-[10px] font-bold">Routes</span>
          </button>

          {/* Add Party */}
          <button
            onClick={handleAddParty}
            className="py-2.5 px-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-800/60 font-bold text-xs shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            title="Add New Party"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-bold">+ New</span>
          </button>
        </div>
      </div>

      {/* 2. STITCH LOCATION STATUS SEGMENTED CONTROL */}
      <div className="bg-[#111827] p-2 rounded-2xl border border-slate-800 shadow-md space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span>GPS Location Status</span>
          </span>
          <span className="text-[10px] font-bold text-slate-500">
            {locationStats.set} Pinned / {parties.length} Total
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0F17] rounded-xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => setGpsFilter('all')}
            className={`py-2 px-1.5 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
              gpsFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span>All Parties</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              gpsFilter === 'all' ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
            }`}>
              {parties.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setGpsFilter('has_gps')}
            className={`py-2 px-1.5 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
              gpsFilter === 'has_gps'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${gpsFilter === 'has_gps' ? 'bg-white animate-pulse' : 'bg-emerald-400'}`}></span>
              <span>📍 GPS Set</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              gpsFilter === 'has_gps' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
            }`}>
              {locationStats.set}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setGpsFilter('no_gps')}
            className={`py-2 px-1.5 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
              gpsFilter === 'no_gps'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 ring-1 ring-amber-400'
                : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${gpsFilter === 'no_gps' ? 'bg-white' : 'bg-amber-400'}`}></span>
              <span>⚠️ Not Set</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              gpsFilter === 'no_gps' ? 'bg-amber-800 text-amber-100' : 'bg-amber-950/80 text-amber-300 border border-amber-800/40'
            }`}>
              {locationStats.notSet}
            </span>
          </button>
        </div>
      </div>

      {/* 2b. MULTI-FILTER DRAWER TRIGGER & WEEKDAY CHIPS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {/* Multi-Filter Drawer Button */}
        <button
          type="button"
          onClick={() => setFilterDrawerOpen(true)}
          className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0 ${
            (selectedRoutes.length > 0 || selectedCities.length > 0)
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-black'
              : 'bg-[#111827] text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
          }`}
        >
          <Filter className="w-3.5 h-3.5 text-indigo-400" />
          <span>Filters</span>
          {(selectedRoutes.length > 0 || selectedCities.length > 0) && (
            <span className="w-5 h-5 rounded-full bg-white text-indigo-900 text-[10px] font-black flex items-center justify-center">
              {selectedRoutes.length + selectedCities.length}
            </span>
          )}
        </button>

        {/* Weekday Quick Filter Chips */}
        {weekdays.map((w) => (
          <button
            key={w.id}
            onClick={() => setWeekdayFilter(w.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer active:scale-95 shrink-0 ${
              weekdayFilter === w.id
                ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 font-black'
                : 'bg-[#111827] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* 2c. ACTIVE FILTERS TAGS (TAP TO DISMISS) */}
      {(gpsFilter !== 'all' || weekdayFilter !== 'all' || selectedRoutes.length > 0 || selectedCities.length > 0 || searchQuery) && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Active:</span>

          {gpsFilter !== 'all' && (
            <button
              onClick={() => setGpsFilter('all')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800/60 shrink-0 cursor-pointer active:scale-95"
            >
              <span>{gpsFilter === 'has_gps' ? '📍 GPS Set' : '⚠️ Missing GPS'}</span>
              <X className="w-3 h-3 text-blue-400" />
            </button>
          )}

          {weekdayFilter !== 'all' && (
            <button
              onClick={() => setWeekdayFilter('all')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shrink-0 cursor-pointer active:scale-95"
            >
              <span>{weekdayFilter}</span>
              <X className="w-3 h-3 text-purple-400" />
            </button>
          )}

          {selectedRoutes.map((r) => (
            <button
              key={r}
              onClick={() => handleToggleRoute(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 shrink-0 cursor-pointer active:scale-95"
            >
              <span>Route: {r}</span>
              <X className="w-3 h-3 text-indigo-400" />
            </button>
          ))}

          {selectedCities.map((c) => (
            <button
              key={c}
              onClick={() => handleToggleCity(c)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shrink-0 cursor-pointer active:scale-95"
            >
              <span>City: {c}</span>
              <X className="w-3 h-3 text-emerald-400" />
            </button>
          ))}

          <button
            onClick={handleClearAllFilters}
            className="text-[11px] font-extrabold text-rose-400 hover:text-rose-300 shrink-0 ml-1 cursor-pointer underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* 3. METRIC COUNT HEADER & SELECTION TOGGLE */}
      <div className="flex flex-wrap items-center justify-between text-xs px-1 text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            Found <span className="text-white font-black">{filteredParties.length}</span> parties
          </span>
          {totalPages > 1 && (
            <span className="font-semibold text-slate-400 font-mono">
              • Pg {page}/{totalPages}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedPartyIds(new Set());
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all border cursor-pointer active:scale-95 flex items-center gap-1 ${
              selectMode
                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {selectMode ? <X className="w-3 h-3" /> : <CheckSquare className="w-3 h-3 text-emerald-400" />}
            <span>{selectMode ? 'Done' : 'Select Mode'}</span>
          </button>

          {selectMode && (
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-indigo-950/80 text-indigo-300 border border-indigo-800 transition-all cursor-pointer active:scale-95"
            >
              {selectedPartyIds.size === filteredParties.length ? 'Deselect All' : `Select All (${filteredParties.length})`}
            </button>
          )}

          {!selectMode && filteredParties.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenShareRoute(filteredParties.slice(0, 50))}
              className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900 transition-all cursor-pointer active:scale-95 flex items-center gap-1"
              title="Quickly create route for currently filtered parties"
            >
              <Share2 className="w-3 h-3 text-emerald-400" />
              <span>Share Daily Route</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. PARTY CARDS LIST (STITCH TACTICAL CARDS) */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
          <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading chemist directory...</span>
        </div>
      ) : paginatedParties.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#111827] border border-slate-800 text-center text-slate-400 text-xs shadow-md">
          No parties found matching your search.
        </div>
      ) : (
        <div className="space-y-3 pb-24">
          {paginatedParties.map((party) => {
            const isSelected = party.id ? selectedPartyIds.has(party.id) : false;
            return (
              <div
                key={party.id}
                onClick={() => {
                  if (selectMode && party.id) handleToggleSelectParty(party.id);
                }}
                className={`border rounded-2xl p-4 shadow-md space-y-3 transition-all ${
                  isSelected
                    ? 'bg-[#151f33] border-blue-500 shadow-blue-900/30 ring-1 ring-blue-500'
                    : 'bg-[#111827] border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Header row: Checkbox, Code, City, Edit */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectMode && party.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectParty(party.id!);
                        }}
                        className="p-1 text-blue-400 hover:text-white"
                      >
                        {isSelected ? <CheckSquare className="w-5 h-5 fill-blue-600 text-white" /> : <Square className="w-5 h-5 text-slate-500" />}
                      </button>
                    )}
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-400 border border-blue-800/60">
                      {party.party_code || 'MARG'}
                    </span>
                    {party.city && (
                      <span className="text-xs font-bold text-slate-400 truncate">
                        • {party.city}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleEditParty(party)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white active:scale-95 transition-all border border-slate-700 cursor-pointer"
                    title="Edit Party Details"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Party Name (Bilingual English + Gujarati) */}
                <div>
                  <h4 className="font-black text-sm text-white leading-tight">
                    {party.party_name}
                  </h4>
                  {party.party_name_gu && (
                    <div className="text-xs text-slate-400 font-medium mt-0.5 leading-relaxed">
                      {party.party_name_gu}
                    </div>
                  )}
                </div>

                {/* Address snippet */}
                {party.address && (
                  <div className="text-xs text-slate-300 flex items-start gap-1.5 line-clamp-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <span>{party.address_gu || party.address}</span>
                  </div>
                )}

                {/* Route tags */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {party.route_1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/60">
                      R1: {party.route_1}
                    </span>
                  )}
                  {party.route_2 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                      R2: {party.route_2}
                    </span>
                  )}
                  {party.route_3 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-950/60 text-purple-300 border border-purple-800/60">
                      R3: {party.route_3}
                    </span>
                  )}
                </div>

                {/* Dedicated Location & GPS Navigation Row (Stitch Dark) */}
                <div className="flex items-center justify-between gap-1.5 p-2.5 rounded-xl bg-[#161C28] border border-slate-800">
                  {party.latitude && party.longitude ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-emerald-400">GPS Verified</span>
                            <span className="text-[9px] text-slate-400">({party.geofence_radius_meters || 75}m)</span>
                          </div>
                          <div className="text-[9px] font-mono text-slate-400 truncate">
                            {Number(party.latitude).toFixed(4)}, {Number(party.longitude).toFixed(4)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => onNavigate('routes', { selectedParty: party })}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="View Real Road Route in Route Optimizer"
                        >
                          <Route className="w-3.5 h-3.5" />
                          <span>રૂટ</span>
                        </button>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${party.latitude},${party.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Navigate directly via Google Maps"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Google</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-all cursor-pointer"
                          title="Adjust Pin on Map"
                        >
                          <Edit3 className="w-4 h-4 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnsetPartyGPS(party)}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 active:scale-95 transition-all cursor-pointer"
                          title="દુકાનનું લોકેશન હટાવો / અનસેટ કરો (Unset GPS Location)"
                        >
                          <MapPinOff className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                        <span className="text-[11px] font-bold text-amber-400 truncate">No GPS Pin</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                          title="Pin location on interactive map"
                        >
                          <MapPin className="w-3.5 h-3.5 text-white" />
                          <span>Pin Map</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePinPartyGPS(party)}
                          disabled={pinningPartyId === party.id}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold active:scale-95 transition-all cursor-pointer"
                          title="Save device current GPS location"
                        >
                          {pinningPartyId === party.id ? '...' : 'GPS Pin'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Multiple Phone Numbers Bar (if multiple numbers exist) */}
                {party.mobile_no && party.mobile_no.includes(',') && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-400">
                    <span className="font-bold text-slate-300">સંપર્ક નંબરો:</span>
                    {party.mobile_no.split(/[,;\n/]+/).map((num, nIdx) => {
                      const trimmed = num.trim();
                      if (!trimmed) return null;
                      return (
                        <a
                          key={nIdx}
                          href={`tel:${trimmed}`}
                          className="min-h-[36px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-blue-900/60 text-slate-300 hover:text-blue-300 border border-slate-700 font-mono font-bold flex items-center gap-1"
                        >
                          <span>📞</span>
                          <span>{trimmed}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Action Buttons Row: 1-Tap Print, Route, Call, WhatsApp */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  {/* Print Button */}
                  <button
                    onClick={() => onNavigate('print', { selectedParty: party })}
                    className="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-300" />
                    <span>Print Envelope</span>
                  </button>

                  {/* Route Optimizer Button */}
                  <button
                    onClick={() => onNavigate('routes', { selectedParty: party })}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/30 active:scale-95 transition-all cursor-pointer"
                    title="Directly Show Route in Optimizer"
                  >
                    <Route className="w-4 h-4" />
                    <span>રૂટ</span>
                  </button>

                  {/* Phone Call */}
                  {party.mobile_no && (
                    <a
                      href={`tel:${party.mobile_no.split(/[,;\n/]+/)[0].trim()}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 active:scale-95 transition-all cursor-pointer shadow-sm"
                      title="Call Party"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}

                  {/* WhatsApp */}
                  {party.mobile_no && (
                    <a
                      href={`https://wa.me/91${party.mobile_no.split(/[,;\n/]+/)[0].replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
                      title="Chat on WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. PAGINATION CONTROLS (STITCH TACTICAL) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 pb-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-[#111827] border border-slate-800 text-slate-200 hover:bg-slate-800 disabled:opacity-40 text-xs font-bold shadow-md cursor-pointer active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <span className="text-xs font-bold text-slate-400 font-mono">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-[#111827] border border-slate-800 text-slate-200 hover:bg-slate-800 disabled:opacity-40 text-xs font-bold shadow-md cursor-pointer active:scale-95"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6. FLOATING ACTION BUTTON (FAB) FOR ADDING NEW PARTY */}
      <button
        onClick={handleAddParty}
        className="fixed bottom-[max(env(safe-area-inset-bottom),80px)] right-4 w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 shadow-2xl flex items-center justify-center ring-4 ring-emerald-500/20 active:scale-90 transition-all z-20 cursor-pointer"
        title="Add New Party"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Party Add/Edit Modal */}
      {partyModalOpen && (
        <PartyModal
          isOpen={partyModalOpen}
          initialParty={editingParty}
          onClose={() => setPartyModalOpen(false)}
          onSave={async (partyToSave: Party) => {
            if (partyToSave.id) {
              await updateParty(partyToSave.id, partyToSave);
            } else {
              await createParty(partyToSave);
            }
            setPartyModalOpen(false);
            loadParties();
          }}
        />
      )}

      {/* Route Manager Modal */}
      {routeModalOpen && (
        <RouteManagerModal
          isOpen={routeModalOpen}
          onClose={() => {
            setRouteModalOpen(false);
            loadParties();
          }}
        />
      )}

      {/* Party Map Pinpoint Picker Modal */}
      {mapPickerParty && (
        <PartyMapPickerModal
          isOpen={true}
          party={mapPickerParty}
          onClose={() => setMapPickerParty(null)}
          onSaved={(updated) => {
            setParties(prev => prev.map(p => p.id === updated.id ? updated : p));
            if (editingParty?.id === updated.id) {
              setEditingParty(updated);
            }
          }}
        />
      )}

      {/* loop: Stitch Mobile Multi-Filter Bottom Sheet Modal */}
      {filterDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg mx-auto bg-[#111827] border-t border-slate-700/80 rounded-t-3xl p-5 shadow-2xl max-h-[85vh] flex flex-col space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-black text-white">Filter Directory</h3>
                {activeFilterCount > 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300 px-2 py-1 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterDrawerOpen(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#0B0F17] rounded-xl border border-slate-800 text-xs font-black">
              <button
                type="button"
                onClick={() => setDrawerTab('routes')}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  drawerTab === 'routes'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Route className="w-3.5 h-3.5" />
                <span>Routes ({selectedRoutes.length > 0 ? `${selectedRoutes.length}/` : ''}{availableRoutes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('cities')}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  drawerTab === 'cities'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Cities ({selectedCities.length > 0 ? `${selectedCities.length}/` : ''}{availableCities.length})</span>
              </button>
            </div>

            {/* Tab Content: Routes */}
            {drawerTab === 'routes' && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-2.5 min-h-[300px]">
                <input
                  type="text"
                  placeholder="Search routes or weekdays..."
                  value={drawerRouteSearch}
                  onChange={(e) => setDrawerRouteSearch(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
                />

                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {/* Standard Weekdays */}
                  <div className="text-[10px] font-black uppercase text-indigo-400 px-1 pt-1 tracking-wider">
                    Weekday Schedules
                  </div>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                    .filter(w => w.toLowerCase().includes(drawerRouteSearch.toLowerCase()))
                    .map((w) => {
                      const isSelected = selectedRoutes.includes(w);
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => handleToggleRoute(w)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer min-h-[44px] active:scale-98 ${
                            isSelected
                              ? 'bg-indigo-950/70 border-indigo-500/80 text-white shadow-sm'
                              : 'bg-[#161C28] border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Route className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                            <span>{w}</span>
                          </span>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-800'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}

                  {/* Custom Routes */}
                  {availableRoutes.filter(r => !['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].includes(r.toUpperCase())).length > 0 && (
                    <>
                      <div className="text-[10px] font-black uppercase text-indigo-400 px-1 pt-2 tracking-wider">
                        Custom Routes
                      </div>
                      {availableRoutes
                        .filter(r => !['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].includes(r.toUpperCase()))
                        .filter(r => r.toLowerCase().includes(drawerRouteSearch.toLowerCase()))
                        .map((r) => {
                          const isSelected = selectedRoutes.includes(r);
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleToggleRoute(r)}
                              className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer min-h-[44px] active:scale-98 ${
                                isSelected
                                  ? 'bg-indigo-950/70 border-indigo-500/80 text-white shadow-sm'
                                  : 'bg-[#161C28] border-slate-800 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <span className="truncate pr-2">{r}</span>
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-800'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5" />}
                              </div>
                            </button>
                          );
                        })}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab Content: Cities */}
            {drawerTab === 'cities' && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-2.5 min-h-[300px]">
                <input
                  type="text"
                  placeholder="Search city name..."
                  value={drawerCitySearch}
                  onChange={(e) => setDrawerCitySearch(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F17] border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
                />

                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {availableCities
                    .filter(c => c.toLowerCase().includes(drawerCitySearch.toLowerCase()))
                    .map((c) => {
                      const isSelected = selectedCities.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleToggleCity(c)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer min-h-[44px] active:scale-98 ${
                            isSelected
                              ? 'bg-blue-950/70 border-blue-500/80 text-white shadow-sm'
                              : 'bg-[#161C28] border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate pr-2">
                            <Building2 className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                            <span className="truncate">{c}</span>
                          </span>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                            isSelected ? 'bg-blue-600 border-blue-400 text-white' : 'border-slate-700 bg-slate-800'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Bottom Sticky Action Bar */}
            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setFilterDrawerOpen(false)}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>Apply Filters ({filteredParties.length} Parties Matching)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Selection Bar (Mobile) */}
      {selectedPartyIds.size > 0 && (
        <div className="fixed bottom-16 left-3 right-3 z-40 max-w-lg mx-auto bg-slate-900/95 border border-emerald-500/50 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-slide-up">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <div className="leading-tight">
              <span className="text-xs font-black text-white">{selectedPartyIds.size} Selected</span>
              <button
                type="button"
                onClick={() => setSelectedPartyIds(new Set())}
                className="block text-[10px] text-slate-400 hover:text-rose-400 font-bold"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const selected = filteredParties.filter(p => selectedPartyIds.has(p.id!));
                onNavigate('routes', { selectedParties: selected });
              }}
              className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-teal-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <Route className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenShareRoute()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-emerald-200" />
              <span>Create & Share</span>
            </button>
          </div>
        </div>
      )}

      {/* Share Daily Route Modal */}
      <ShareDailyRouteModal
        isOpen={shareRouteModalOpen}
        onClose={() => setShareRouteModalOpen(false)}
        selectedParties={shareRouteParties}
        onOpenDriverApp={(token) => onNavigate('driver', { trip_token: token })}
      />
    </div>
  );
};