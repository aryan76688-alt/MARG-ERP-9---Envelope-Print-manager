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
  Navigation
} from 'lucide-react';
import { Party } from '../types';
import { fetchParties, createParty, updateParty, updatePartyGeofence } from '../api/client';
import { getPartiesOffline, ensureInitialPartiesLoaded, updatePartyInOfflineCache } from '../offline/db';
import { PartyModal } from '../components/PartyModal';
import { RouteManagerModal } from '../components/RouteManagerModal';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';

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
      alert("આ ડિવાઇસ પર GPS સપોર્ટ નથી (GPS not supported)");
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
          alert(err.message || "GPS પિન કરવામાં ભૂલ આવી");
        } finally {
          setPinningPartyId(null);
        }
      },
      (err) => {
        alert("GPS પરમિશન/લોકેશન ભૂલ: " + err.message);
        setPinningPartyId(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const weekdays = [
    { id: 'all', label: 'બધા (All)' },
    { id: 'MONDAY', label: 'સોમવાર (Mon)' },
    { id: 'TUESDAY', label: 'મંગળવાર (Tue)' },
    { id: 'WEDNESDAY', label: 'બુધવાર (Wed)' },
    { id: 'THURSDAY', label: 'ગુરુવાર (Thu)' },
    { id: 'FRIDAY', label: 'શુક્રવાર (Fri)' },
    { id: 'SATURDAY', label: 'શનિવાર (Sat)' },
    { id: 'SUNDAY', label: 'રવિવાર (Sun)' }
  ];

  // Load parties from API or fallback offline cache
  const loadParties = async () => {
    setLoading(true);
    try {
      // Fetch all parties for full instant mobile client-side filtering
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
    <div className="p-4 space-y-3.5 max-w-lg mx-auto pb-28">
      {/* 1. SEARCH & ROUTE MANAGER ACTION BAR */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="કોડ, નામ, શહેર શોધો..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl py-3 pl-10 pr-9 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-blue-500 shadow-md"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* All Parties Map Shortcut */}
        <button
          onClick={() => onNavigate('map')}
          className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0"
          title="All Parties Map (પાર્ટી મેપ)"
        >
          <MapPin className="w-4 h-4" />
          <span className="hidden sm:inline">મેપ</span>
        </button>

        {/* Route Manager Trigger */}
        <button
          onClick={() => setRouteModalOpen(true)}
          className="p-3 rounded-2xl bg-indigo-600 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0"
          title="Google Sheets & Route Manager"
        >
          <Map className="w-4 h-4" />
          <span className="hidden sm:inline">રૂટ</span>
        </button>
      </div>

      {/* 2. WEEKDAY FILTER CHIPS CAROUSEL */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {weekdays.map((w) => (
          <button
            key={w.id}
            onClick={() => setWeekdayFilter(w.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              weekdayFilter === w.id
                ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-1 ring-blue-400'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* 3. COUNT HEADER */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-400">
        <span className="font-bold">
          કુલ: <span className="text-white font-black">{filteredParties.length}</span> પાર્ટીઓ
        </span>
        {totalPages > 1 && (
          <span>
            પેજ {page} / {totalPages}
          </span>
        )}
      </div>

      {/* 4. PARTY CARDS LIST */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs">
          પાર્ટીઓ લોડ થઈ રહી છે...
        </div>
      ) : paginatedParties.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs">
          કોઈ પાર્ટી મળી નથી.
        </div>
      ) : (
        <div className="space-y-2.5">
          {paginatedParties.map((party) => {
            return (
              <div
                key={party.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 shadow-md space-y-2.5"
              >
                {/* Header row: Code, City, Edit */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {party.party_code || 'MARG'}
                    </span>
                    {party.city && (
                      <span className="text-xs font-bold text-slate-400 truncate">
                        • {party.city_gu ? `${party.city_gu} (${party.city})` : party.city}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleEditParty(party)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white active:scale-95"
                    title="Edit Party"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Party Name in Gujarati and English */}
                <div>
                  <h4 className="font-black text-sm text-white leading-tight">
                    {party.party_name_gu ? `${party.party_name_gu}` : party.party_name}
                  </h4>
                  {party.party_name_gu && (
                    <div className="text-xs text-slate-400 font-medium mt-0.5">
                      {party.party_name}
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
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      1: {party.route_1_gu || party.route_1}
                    </span>
                  )}
                  {party.route_2 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      2: {party.route_2_gu || party.route_2}
                    </span>
                  )}
                  {party.route_3 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      3: {party.route_3_gu || party.route_3}
                    </span>
                  )}
                </div>

                {/* Dedicated Location & Go Directly Row */}
                <div className="flex items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
                  {party.latitude && party.longitude ? (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-emerald-300">મેપ પિન સેટ</span>
                            <span className="text-[9px] text-slate-400">({party.geofence_radius_meters || 75}m)</span>
                          </div>
                          <div className="text-[9px] font-mono text-slate-400 truncate">
                            {Number(party.latitude).toFixed(5)}, {Number(party.longitude).toFixed(5)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${party.latitude},${party.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all"
                          title="Google Maps Go Directly"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>🚗 સીધા જાઓ (Go Directly)</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all"
                          title="મેપ પર પિન બદલો (Change Pin)"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400/80 flex-shrink-0"></span>
                        <span className="text-[10px] font-bold text-amber-400/90 truncate">મેપ લોકેશન બાકી</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setMapPickerParty(party)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all"
                          title="મેપ પર ક્લિક કરીને દુકાનનું લોકેશન પિન કરો"
                        >
                          <MapPin className="w-3 h-3 text-white" />
                          <span>📍 મેપ પર પિન કરો</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePinPartyGPS(party)}
                          disabled={pinningPartyId === party.id}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold active:scale-95 transition-all"
                          title="મારું વર્તમાન GPS સેવ કરો"
                        >
                          {pinningPartyId === party.id ? '...' : 'GPS'}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Action Buttons Row: 1-Tap Print, Call, WhatsApp */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  {/* Print Button */}
                  <button
                    onClick={() => onNavigate('print', { selectedParty: party })}
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <Printer className="w-4 h-4 text-amber-300" />
                    <span>કવર પ્રિન્ટ (Print)</span>
                  </button>

                  {/* Phone Call */}
                  {party.mobile_no && (
                    <a
                      href={`tel:${party.mobile_no}`}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 active:scale-95 transition-all"
                      title="Call party"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}

                  {/* WhatsApp */}
                  {party.mobile_no && (
                    <a
                      href={`https://wa.me/91${party.mobile_no.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl bg-emerald-600 text-white shadow-md active:scale-95 transition-all"
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

      {/* 5. PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 pb-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 text-xs font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>પાછળ</span>
          </button>
          <span className="text-xs font-bold text-slate-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 text-xs font-bold"
          >
            <span>આગળ</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6. FLOATING ACTION BUTTON (FAB) FOR ADDING NEW PARTY */}
      <button
        onClick={handleAddParty}
        className="fixed bottom-[max(env(safe-area-inset-bottom),72px)] right-4 w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-2xl flex items-center justify-center ring-4 ring-emerald-500/30 active:scale-90 transition-all z-20"
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
