import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  MapPin,
  Navigation,
  Printer,
  Phone,
  MessageCircle,
  Search,
  RefreshCw,
  ExternalLink,
  LocateFixed,
  AlertCircle,
  Building2,
  CheckCircle2,
  Map as MapIcon,
  Filter,
  Route
} from 'lucide-react';
import { Party } from '../types';
import { fetchParties } from '../api/client';
import { getAllOfflineParties } from '../offline/db';
import { VoiceSearchInput } from '../components/VoiceSearchInput';

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceString(km: number): string {
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }
  return `${km.toFixed(1)} km`;
}

// loop: calculateRoadDistanceKm applies 1.28x road network factor for actual road driving km, ceiling: direct road API, upgrade path: batch OSRM table
export function calculateRoadDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return Number((calculateDistanceKm(lat1, lon1, lat2, lon2) * 1.28).toFixed(1));
}

interface NearestPartiesProps {
  onNavigate: (tab: string, state?: any) => void;
  onPrintParty?: (party: Party) => void;
}

interface PartyWithDistance extends Party {
  distanceKm?: number;
  distanceStr?: string;
}

export const NearestParties: React.FC<NearestPartiesProps> = ({ onNavigate, onPrintParty }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [radiusFilter, setRadiusFilter] = useState<number | 'all'>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');

  // Load parties from API with offline fallback
  const loadParties = async () => {
    setLoading(true);
    try {
      const res = await fetchParties({ limit: -1 });
      if (res && res.items && res.items.length > 0) {
        setParties(res.items);
      } else {
        const offline = await getAllOfflineParties();
        setParties(offline);
      }
    } catch {
      const offline = await getAllOfflineParties();
      setParties(offline);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  // Request GPS Location
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser or device.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setLocationError('Location permission denied. Please allow location access in your browser or app settings.');
        } else if (err.code === 2) {
          setLocationError('GPS location unavailable. Ensure device location is turned on.');
        } else {
          setLocationError('Location request timed out. Please retry.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  // Unique routes for filter dropdown
  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    parties.forEach((p) => {
      const r = p.route_1 || p.route;
      if (r && r.trim()) set.add(r.trim());
    });
    return Array.from(set).sort();
  }, [parties]);

  // Parties with valid GPS
  const partiesWithGpsCount = useMemo(() => {
    return parties.filter((p) => p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude)) && Number(p.latitude) !== 0).length;
  }, [parties]);

  // Compute distances & sort
  const sortedParties = useMemo(() => {
    return parties
      .map((p): PartyWithDistance => {
        const hasLat = p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude)) && Number(p.latitude) !== 0;
        const hasLng = p.longitude !== null && p.longitude !== undefined && !isNaN(Number(p.longitude)) && Number(p.longitude) !== 0;

        if (userLocation && hasLat && hasLng) {
          const d = calculateRoadDistanceKm(userLocation.lat, userLocation.lng, Number(p.latitude), Number(p.longitude));
          return {
            ...p,
            distanceKm: d,
            distanceStr: formatDistanceString(d),
          };
        }
        return p;
      })
      .filter((p) => {
        // Radius filter
        if (radiusFilter !== 'all') {
          if (p.distanceKm === undefined || p.distanceKm > radiusFilter) {
            return false;
          }
        }

        // Route filter
        if (routeFilter !== 'all') {
          const r = (p.route_1 || p.route || '').trim().toLowerCase();
          if (r !== routeFilter.toLowerCase()) return false;
        }

        // Search text
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchCode = (p.party_code || '').toLowerCase().includes(q);
          const matchName = (p.party_name || '').toLowerCase().includes(q);
          const matchNameGu = (p.party_name_gu || '').toLowerCase().includes(q);
          const matchCity = (p.city || '').toLowerCase().includes(q);
          const matchRoute = (p.route_1 || p.route || '').toLowerCase().includes(q);
          const matchMobile = (p.mobile_no || '').includes(q);
          return matchCode || matchName || matchNameGu || matchCity || matchRoute || matchMobile;
        }

        return true;
      })
      .sort((a, b) => {
        // GPS tagged first, sorted by distance
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== undefined) return -1;
        if (b.distanceKm !== undefined) return 1;
        return (a.party_name || '').localeCompare(b.party_name || '');
      });
  }, [parties, userLocation, radiusFilter, routeFilter, search]);

  const handlePrint = (party: Party) => {
    if (onPrintParty) {
      onPrintParty(party);
    } else {
      onNavigate('print', { selectedParty: party });
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16 motion-safe:animate-fade-in font-sans">
      {/* 1. HEADER CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Nearest Parties</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  સૌથી નજીકની પાર્ટી
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time GPS proximity radar sorted by distance from your current location.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={requestLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'motion-safe:animate-spin text-blue-600' : ''}`} />
            <span>{isLocating ? 'Locating…' : 'Refresh GPS'}</span>
          </button>

          <button
            onClick={() => onNavigate('map')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <MapIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Parties Map</span>
          </button>

          <button
            onClick={() => onNavigate('route-optimizer')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <Route className="w-3.5 h-3.5 text-indigo-600" />
            <span>Route Optimizer</span>
          </button>
        </div>
      </div>

      {/* 2. LOCATION STATUS BANNER */}
      {locationError && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{locationError}</span>
          </div>
          <button
            onClick={requestLocation}
            className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700 flex-shrink-0 cursor-pointer"
          >
            Retry GPS
          </button>
        </div>
      )}

      {userLocation && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Your GPS Active: <strong>{userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}</strong>
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 font-bold">
              {partiesWithGpsCount} of {parties.length} parties tagged with GPS
            </span>
          </div>
        </div>
      )}

      {/* 3. FILTERS & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm space-y-3">
        {/* Search with Voice */}
        <VoiceSearchInput
          value={search}
          onChange={(val) => setSearch(val)}
          placeholder="Search chemist party name, code, city, route, or phone..."
          inputClassName="rounded-xl py-2.5 pl-10 pr-24 bg-slate-50/60 border-slate-200 text-xs"
        />

        {/* Radius & Route Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
          {/* Radius Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Radius:
            </span>
            {[
              { label: 'All Distance', val: 'all' as const },
              { label: '< 2 km', val: 2 },
              { label: '< 5 km', val: 5 },
              { label: '< 10 km', val: 10 },
              { label: '< 25 km', val: 25 },
              { label: '< 50 km', val: 50 },
            ].map((p) => {
              const active = radiusFilter === p.val;
              return (
                <button
                  key={p.label}
                  onClick={() => setRadiusFilter(p.val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Route Selector */}
          {availableRoutes.length > 0 && (
            <div className="flex items-center gap-1.5 min-w-[160px]">
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Delivery Routes ({availableRoutes.length})</option>
                {availableRoutes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 4. PARTIES CARDS LIST */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 motion-safe:animate-spin text-emerald-600" />
          <span className="text-xs font-medium">Calculating proximity to parties…</span>
        </div>
      ) : sortedParties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-extrabold text-slate-800 text-sm">No nearby parties match your filter</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try choosing a larger radius filter or clear your search keyword.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setRadiusFilter('all');
              setRouteFilter('all');
            }}
            className="mt-4 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sortedParties.map((party, index) => {
            const hasGps = party.distanceKm !== undefined;
            const rank = index + 1;
            const isTopThree = rank <= 3 && hasGps;

            return (
              <div
                key={party.id || party.party_code || index}
                className={`bg-white rounded-2xl border transition-colors p-4 shadow-xs flex flex-col justify-between ${
                  isTopThree
                    ? 'border-emerald-300 ring-2 ring-emerald-500/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Bar: Code, Distance Pill & Rank */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {party.party_code || 'MARG'}
                      </span>
                      {isTopThree && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                          {rank === 1 ? '🥇 #1 Nearest' : rank === 2 ? '🥈 #2 Nearest' : '🥉 #3 Nearest'}
                        </span>
                      )}
                      {(party.route_1 || party.route) && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-[140px]">
                          {party.route_1 || party.route}
                        </span>
                      )}
                    </div>

                    {/* Distance Pill */}
                    {hasGps ? (
                      <div className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white flex items-center gap-1 shadow-xs shrink-0">
                        <Navigation className="w-3 h-3 text-emerald-200" />
                        <span>{party.distanceStr}</span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-400 shrink-0">
                        No GPS Tag
                      </span>
                    )}
                  </div>

                  {/* Party Name */}
                  <h3 className="font-extrabold text-sm text-slate-900 leading-snug">
                    {party.party_name}
                  </h3>
                  {party.party_name_gu && party.party_name_gu !== party.party_name && (
                    <p className="text-xs font-semibold text-blue-800 mt-0.5">
                      {party.party_name_gu}
                    </p>
                  )}

                  {/* Address Snippet */}
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">
                        {[party.address, party.address_line_2, party.city].filter(Boolean).join(', ')}
                      </span>
                    </div>

                    {party.mobile_no && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">{party.mobile_no}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Single-Row Action Buttons */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {hasGps && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${party.latitude},${party.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-shreeji-blue text-xs font-bold border border-blue-200 transition-colors"
                        title="Navigate in Google Maps"
                      >
                        <Navigation className="w-3.5 h-3.5 text-blue-600" />
                        <span>Directions</span>
                      </a>
                    )}

                    <button
                      onClick={() => onNavigate('map', { selectedParty: party })}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                      title="View on Map"
                    >
                      <MapPin className="w-3.5 h-3.5 text-slate-600" />
                      <span>Map</span>
                    </button>

                    {party.mobile_no && (
                      <a
                        href={`tel:${party.mobile_no}`}
                        className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
                        title="Call Party"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-600" />
                      </a>
                    )}

                    {party.mobile_no && (
                      <a
                        href={`https://wa.me/91${party.mobile_no.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                          `Hello ${party.party_name}, Shreeji Healthcare regarding your order.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                        title="WhatsApp Party"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      </a>
                    )}
                  </div>

                  {/* Print Button */}
                  <button
                    onClick={() => handlePrint(party)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
