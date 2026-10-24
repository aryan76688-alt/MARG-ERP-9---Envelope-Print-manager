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
  }, [parties, weekdayFilter, searchQuery]);

  const totalPages = Math.ceil(filteredParties.length / pageSize) || 1;
  const paginatedParties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredParties.slice(start, start + pageSize);
  }, [filteredParties, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, weekdayFilter]);

  const handleEditParty = (party: Party) => {
    setEditingParty(party);
    setPartyModalOpen(true);
  };

  const handleAddParty = () => {
    setEditingParty(null);
    setPartyModalOpen(true);
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-28 font-sans">
      {/* 1. SEARCH & SHORTCUT ACTION BAR (LIGHT THEME) */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <VoiceSearchInput
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            placeholder="Search party code, name, city..."
            inputClassName="rounded-2xl py-3 pl-10 pr-24 bg-white border-slate-300 shadow-sm"
          />
        </div>

        {/* Nearest Parties Shortcut */}
        <button
          onClick={() => onNavigate('nearby')}
          className="p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
          title="Nearest Parties by GPS"
        >
          <Compass className="w-4 h-4" />
          <span className="hidden sm:inline">Nearby</span>
        </button>

        {/* All Parties Map Shortcut */}
        <button
          onClick={() => onNavigate('map')}
          className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
          title="All Parties Map"
        >
          <MapPin className="w-4 h-4" />
          <span className="hidden sm:inline">Map</span>
        </button>

        {/* Add Party Shortcut Button */}
        <button
          onClick={handleAddParty}
          className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
          title="Add New Party"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-black">+ પાર્ટી</span>
        </button>

        {/* Route Manager Trigger */}
        <button
          onClick={() => setRouteModalOpen(true)}
          className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
          title="Route & Sheet Sync Manager"
        >
          <Map className="w-4 h-4" />
          <span className="hidden sm:inline">Routes</span>
        </button>
      </div>

      {/* 2. WEEKDAY FILTER CHIPS CAROUSEL (LIGHT THEME) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {weekdays.map((w) => (
          <button
            key={w.id}
            onClick={() => setWeekdayFilter(w.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
              weekdayFilter === w.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* 3. METRIC COUNT HEADER */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-500">
        <span className="font-semibold">
          Found <span className="text-slate-900 font-black">{filteredParties.length}</span> parties
        </span>
        {totalPages > 1 && (
          <span className="font-semibold text-slate-500">
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* 4. PARTY CARDS LIST (LIGHT THEME) */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading parties directory...</span>
        </div>
      ) : paginatedParties.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-slate-500 text-xs shadow-sm">
          No parties found matching your search.
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedParties.map((party) => {
            return (
              <div
                key={party.id}
                className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 shadow-sm space-y-3 transition-all"
              >
                {/* Header row: Code, City, Edit */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      {party.party_code || 'MARG'}
                    </span>
                    {party.city && (
                      <span className="text-xs font-bold text-slate-500 truncate">
                        • {party.city}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleEditParty(party)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 active:scale-95 transition-all border border-slate-200 cursor-pointer"
                    title="Edit Party Details"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Party Name */}
                <div>
                  <h4 className="font-black text-sm text-slate-900 leading-tight">
                    {party.party_name}
                  </h4>
                  {party.party_name_gu && (
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      {party.party_name_gu}
                    </div>
                  )}
                </div>

                {/* Address snippet */}
                {party.address && (
                  <div className="text-xs text-slate-600 flex items-start gap-1.5 line-clamp-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>{party.address_gu || party.address}</span>
                  </div>
                )}

                {/* Route tags */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {party.route_1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                      R1: {party.route_1}
                    </span>
                  )}
                  {party.route_2 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      R2: {party.route_2}
                    </span>
                  )}
                  {party.route_3 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                      R3: {party.route_3}
                    </span>
                  )}
                </div>

                {/* Dedicated Location & GPS Navigation Row (Light Theme) */}
                <div className="flex items-center justify-between gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  {party.latitude && party.longitude ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-emerald-700">GPS Verified</span>
                            <span className="text-[9px] text-slate-500">({party.geofence_radius_meters || 75}m)</span>
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 truncate">
                            {Number(party.latitude).toFixed(4)}, {Number(party.longitude).toFixed(4)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => onNavigate('routes', { selectedParty: party })}
                          className="px-2 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="View Real Road Route in Route Optimizer"
                        >
                          <Route className="w-3 h-3" />
                          <span>રૂટ</span>
                        </button>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${party.latitude},${party.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Navigate directly via Google Maps"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Google</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 active:scale-95 transition-all cursor-pointer"
                          title="Adjust Pin on Map"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnsetPartyGPS(party)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 active:scale-95 transition-all cursor-pointer"
                          title="દુકાનનું લોકેશન હટાવો / અનસેટ કરો (Unset GPS Location)"
                        >
                          <MapPinOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                        <span className="text-[10px] font-bold text-amber-700 truncate">No GPS Pin</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Pin location on interactive map"
                        >
                          <MapPin className="w-3 h-3 text-white" />
                          <span>Pin Map</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePinPartyGPS(party)}
                          disabled={pinningPartyId === party.id}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold active:scale-95 transition-all cursor-pointer"
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
                  <div className="flex flex-wrap items-center gap-1 px-1 text-[10px] text-slate-500">
                    <span className="font-bold">સંપર્ક નંબરો:</span>
                    {party.mobile_no.split(/[,;\n/]+/).map((num, nIdx) => {
                      const trimmed = num.trim();
                      if (!trimmed) return null;
                      return (
                        <a
                          key={nIdx}
                          href={`tel:${trimmed}`}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 font-mono font-bold"
                        >
                          📞 {trimmed}
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Action Buttons Row: 1-Tap Print, Route, Call, WhatsApp */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  {/* Print Button */}
                  <button
                    onClick={() => onNavigate('print', { selectedParty: party })}
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-300" />
                    <span>Print Envelope</span>
                  </button>

                  {/* Route Optimizer Button */}
                  <button
                    onClick={() => onNavigate('routes', { selectedParty: party })}
                    className="py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                    title="Directly Show Route in Optimizer"
                  >
                    <Route className="w-4 h-4" />
                    <span>રૂટ</span>
                  </button>

                  {/* Phone Call */}
                  {party.mobile_no && (
                    <a
                      href={`tel:${party.mobile_no.split(/[,;\n/]+/)[0].trim()}`}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-emerald-700 border border-slate-200 active:scale-95 transition-all cursor-pointer"
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
                      className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
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

      {/* 5. PAGINATION CONTROLS (LIGHT THEME) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 pb-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold shadow-sm cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <span className="text-xs font-bold text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold shadow-sm cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6. FLOATING ACTION BUTTON (FAB) FOR ADDING NEW PARTY */}
      <button
        onClick={handleAddParty}
        className="fixed bottom-[max(env(safe-area-inset-bottom),76px)] right-4 w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xl flex items-center justify-center ring-4 ring-emerald-200 active:scale-90 transition-all z-20 cursor-pointer"
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
