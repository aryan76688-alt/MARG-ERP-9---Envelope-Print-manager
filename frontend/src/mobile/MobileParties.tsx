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
  Route
} from 'lucide-react';
import { Party } from '../types';
import { fetchParties, createParty, updateParty, updatePartyGeofence, unsetPartyLocation } from '../api/client';
import { getPartiesOffline, ensureInitialPartiesLoaded } from '../offline/db';
import { PartyModal } from '../components/PartyModal';
import { RouteManagerModal } from '../components/RouteManagerModal';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';
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
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  // Modals
  const [partyModalOpen, setPartyModalOpen] = useState<boolean>(initialAddModal);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState<boolean>(initialRouteModal);
  const [pinningPartyId, setPinningPartyId] = useState<number | null>(null);
  const [mapPickerParty, setMapPickerParty] = useState<Party | null>(null);

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

  // Filtered Parties
  const filteredParties = useMemo(() => {
    let result = parties;

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

    // GPS Status Filter
    if (gpsFilter === 'has_gps') {
      result = result.filter(p => p.latitude && p.longitude);
    } else if (gpsFilter === 'no_gps') {
      result = result.filter(p => !p.latitude || !p.longitude);
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
  }, [parties, weekdayFilter, gpsFilter, searchQuery]);

  const totalPages = Math.ceil(filteredParties.length / pageSize) || 1;
  const paginatedParties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredParties.slice(start, start + pageSize);
  }, [filteredParties, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, weekdayFilter, gpsFilter]);

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

      {/* 2. WEEKDAY & GPS FILTER CHIPS CAROUSEL (STITCH TACTICAL) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {weekdays.map((w) => (
          <button
            key={w.id}
            onClick={() => setWeekdayFilter(w.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer active:scale-95 ${
              weekdayFilter === w.id
                ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 font-black'
                : 'bg-[#111827] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
          >
            {w.label}
          </button>
        ))}

        {/* GPS Toggle Filter */}
        <button
          onClick={() => setGpsFilter(f => f === 'all' ? 'has_gps' : (f === 'has_gps' ? 'no_gps' : 'all'))}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1 active:scale-95 ${
            gpsFilter === 'has_gps'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
              : gpsFilter === 'no_gps'
              ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30'
              : 'bg-[#111827] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
          }`}
        >
          <span>{gpsFilter === 'has_gps' ? '📍 GPS Set' : gpsFilter === 'no_gps' ? '⚠️ Missing GPS' : 'All Locations'}</span>
        </button>
      </div>

      {/* 3. METRIC COUNT HEADER */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-400">
        <span className="font-semibold">
          Found <span className="text-white font-black">{filteredParties.length}</span> parties
        </span>
        {totalPages > 1 && (
          <span className="font-semibold text-slate-400 font-mono">
            Page {page} of {totalPages}
          </span>
        )}
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
        <div className="space-y-3">
          {paginatedParties.map((party) => {
            return (
              <div
                key={party.id}
                className="bg-[#111827] border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 shadow-md space-y-3 transition-all"
              >
                {/* Header row: Code, City, Edit */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
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
                          className="px-2 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="View Real Road Route in Route Optimizer"
                        >
                          <Route className="w-3 h-3" />
                          <span>રૂટ</span>
                        </button>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${party.latitude},${party.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Navigate directly via Google Maps"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Google</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-all cursor-pointer"
                          title="Adjust Pin on Map"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnsetPartyGPS(party)}
                          className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 active:scale-95 transition-all cursor-pointer"
                          title="દુકાનનું લોકેશન હટાવો / અનસેટ કરો (Unset GPS Location)"
                        >
                          <MapPinOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                        <span className="text-[10px] font-bold text-amber-400 truncate">No GPS Pin</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Pin location on interactive map"
                        >
                          <MapPin className="w-3 h-3 text-white" />
                          <span>Pin Map</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePinPartyGPS(party)}
                          disabled={pinningPartyId === party.id}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-bold active:scale-95 transition-all cursor-pointer"
                          title="Save device current GPS location"
                        >
                          {pinningPartyId === party.id ? '...' : 'GPS'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Multiple Phone Numbers Bar (if multiple numbers exist) */}
                {party.mobile_no && party.mobile_no.includes(',') && (
                  <div className="flex flex-wrap items-center gap-1 px-1 text-[10px] text-slate-400">
                    <span className="font-bold text-slate-300">સંપર્ક નંબરો:</span>
                    {party.mobile_no.split(/[,;\n/]+/).map((num, nIdx) => {
                      const trimmed = num.trim();
                      if (!trimmed) return null;
                      return (
                        <a
                          key={nIdx}
                          href={`tel:${trimmed}`}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-900/60 text-slate-300 hover:text-blue-300 border border-slate-700 font-mono font-bold"
                        >
                          📞 {trimmed}
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
                    className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-300" />
                    <span>Print Envelope</span>
                  </button>

                  {/* Route Optimizer Button */}
                  <button
                    onClick={() => onNavigate('routes', { selectedParty: party })}
                    className="py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-1 shadow-md shadow-teal-600/30 active:scale-95 transition-all cursor-pointer"
                    title="Directly Show Route in Optimizer"
                  >
                    <Route className="w-4 h-4" />
                    <span>રૂટ</span>
                  </button>

                  {/* Phone Call */}
                  {party.mobile_no && (
                    <a
                      href={`tel:${party.mobile_no.split(/[,;\n/]+/)[0].trim()}`}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 active:scale-95 transition-all cursor-pointer shadow-sm"
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
                      className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer"
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
    </div>
  );
};