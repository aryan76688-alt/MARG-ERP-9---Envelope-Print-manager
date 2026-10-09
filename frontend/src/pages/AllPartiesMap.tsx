import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { 
  MapPin, 
  Search, 
  Navigation, 
  Printer, 
  Phone, 
  MessageCircle, 
  ExternalLink, 
  Filter, 
  Edit3, 
  X, 
  Layers, 
  RefreshCw,
  Users,
  Compass
} from 'lucide-react';
import { Party } from '../types';
import { fetchParties } from '../api/client';
import { getAllOfflineParties, updatePartyInOfflineCache } from '../offline/db';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';

interface AllPartiesMapProps {
  onNavigate?: (tab: string, state?: any) => void;
}

// Marker icon generator for plotted parties
const createPartyMarkerIcon = (code: string = '', isSelected: boolean = false) => {
  const bgColor = isSelected ? '#2563eb' : '#059669'; // Blue when selected, Emerald green otherwise
  const ringColor = isSelected ? '#93c5fd' : '#a7f3d0';

  return L.divIcon({
    className: 'party-map-marker',
    html: `
      <div style="position: relative; width: 34px; height: 42px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: pointer;">
        <div style="
          width: 30px; 
          height: 30px; 
          background: ${bgColor}; 
          border: 2.5px solid #ffffff; 
          border-radius: 50% 50% 50% 0; 
          transform: rotate(-45deg); 
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        ">
          <div style="
            transform: rotate(45deg); 
            font-size: 8px; 
            font-weight: 900; 
            color: #ffffff; 
            text-align: center;
            font-family: monospace;
            line-height: 1;
            padding: 1px;
            max-width: 22px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${code.replace('MARG', '').slice(-3) || '●'}</div>
        </div>
        <div style="
          width: 10px; 
          height: 3px; 
          background: rgba(0,0,0,0.3); 
          border-radius: 50%; 
          margin-top: 1px;
        "></div>
      </div>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
};

export const AllPartiesMap: React.FC<AllPartiesMapProps> = ({ onNavigate }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [totalPartiesCount, setTotalPartiesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [pickerModalParty, setPickerModalParty] = useState<Party | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Load parties from API or offline DB
  const loadParties = async () => {
    setLoading(true);
    try {
      // Fetch parties (large limit to get all pinned parties)
      const res = await fetchParties({ limit: 2500 });
      if (res && res.items) {
        setParties(res.items);
        setTotalPartiesCount(res.total || res.items.length);
      } else {
        const offline = await getAllOfflineParties();
        setParties(offline);
        setTotalPartiesCount(offline.length);
      }
    } catch {
      const offline = await getAllOfflineParties();
      setParties(offline);
      setTotalPartiesCount(offline.length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParties();

    // Acquire user location for distance reference
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  // Filter ONLY parties with valid map coordinates ("SHOW ONLY SET MAP PARTIES")
  const setMapParties = useMemo(() => {
    return parties.filter((p) => {
      const hasLat = p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude));
      const hasLng = p.longitude !== null && p.longitude !== undefined && !isNaN(Number(p.longitude));
      return hasLat && hasLng;
    });
  }, [parties]);

  // Extract available distinct routes from set parties
  const availableRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    setMapParties.forEach((p) => {
      if (p.route_1) routeSet.add(p.route_1);
      if (p.route_2) routeSet.add(p.route_2);
      if (p.route_3) routeSet.add(p.route_3);
      if (p.route) routeSet.add(p.route);
    });
    return Array.from(routeSet).sort();
  }, [setMapParties]);

  // Filter set parties by search query and route
  const filteredParties = useMemo(() => {
    return setMapParties.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (p.party_name && p.party_name.toLowerCase().includes(q)) ||
        (p.party_name_gu && p.party_name_gu.includes(q)) ||
        (p.party_code && p.party_code.toLowerCase().includes(q)) ||
        (p.city && p.city.toLowerCase().includes(q)) ||
        (p.city_gu && p.city_gu.includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q));

      const matchesRoute =
        selectedRoute === 'all' ||
        p.route_1 === selectedRoute ||
        p.route_2 === selectedRoute ||
        p.route_3 === selectedRoute ||
        p.route === selectedRoute;

      return matchesSearch && matchesRoute;
    });
  }, [setMapParties, search, selectedRoute]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = 23.0225;
      const initialLng = 72.5714;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;
    }

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Plot and update markers whenever filtered parties or selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    if (filteredParties.length === 0) return;

    const latLngs: L.LatLngExpression[] = [];

    filteredParties.forEach((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      const isSelected = selectedParty?.id === p.id;

      const marker = L.marker([lat, lng], {
        icon: createPartyMarkerIcon(p.party_code || '', isSelected),
        title: p.party_name_gu || p.party_name,
      });

      // Marker click handler
      marker.on('click', () => {
        setSelectedParty(p);
        map.flyTo([lat, lng], 16, { duration: 0.8 });
      });

      // Tooltip on hover
      marker.bindTooltip(
        `<strong>${p.party_code || ''}</strong>: ${p.party_name_gu || p.party_name}`,
        { direction: 'top', offset: [0, -32] }
      );

      marker.addTo(markersLayer);
      latLngs.push([lat, lng]);
    });

    // Auto fit bounds to show all plotted parties
    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [filteredParties, selectedParty?.id]);

  // Center map on user location if available
  const handleCenterOnUser = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(coords);
      mapInstanceRef.current?.flyTo([coords.lat, coords.lng], 15, { duration: 1 });
    });
  };

  // Re-fit all party markers
  const handleFitAllMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map || filteredParties.length === 0) return;
    const latLngs = filteredParties.map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]);
    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 16 });
  };

  // Handle party location updated from modal
  const handlePartySaved = (updatedParty: Party) => {
    setParties((prev) =>
      prev.map((p) => (p.id === updatedParty.id ? updatedParty : p))
    );
    if (selectedParty?.id === updatedParty.id) {
      setSelectedParty(updatedParty);
    }
    updatePartyInOfflineCache(updatedParty);
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white font-sans overflow-hidden select-none">
      {/* 1. TOP HEADER & FILTER BAR */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 shadow-md flex-shrink-0 space-y-2.5 z-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Title & Live Pinned Counter */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-sm text-white">પાર્ટી મેપ (All Parties Map)</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  📍 {filteredParties.length} સેટ કરેલી પાર્ટીઓ
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                કુલ {totalPartiesCount} માંથી {setMapParties.length} પાર્ટીઓ મેપ પર પિન થયેલ છે
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleCenterOnUser}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="મારું વર્તમાન લોકેશન બતાવો"
            >
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">મારું GPS</span>
            </button>
            <button
              onClick={handleFitAllMarkers}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="બધી પિન કરેલી પાર્ટીઓ બતાવો"
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">બધા જુઓ</span>
            </button>
            <button
              onClick={loadParties}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all"
              title="રીફ્રેશ કરો"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search & Route Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="સેટ કરેલી પાર્ટી શોધો (નામ, MARG કોડ, શહેર...)"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Route Filter Dropdown */}
          {availableRoutes.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">બધા રૂટ (All Routes)</option>
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

      {/* 2. MAP VIEW CONTAINER */}
      <div className="relative flex-1 w-full bg-slate-950 overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

        {/* Empty state overlay when no parties have locations set */}
        {setMapParties.length === 0 && !loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <div className="max-w-md p-6 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-black text-base text-white">હજુ કોઈ પાર્ટી મેપ પર સેટ નથી</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                પાર્ટી લિસ્ટમાં જઈને કોઈપણ પાર્ટી કાર્ડ પર <strong>"📍 મેપ પર પિન કરો"</strong> બટન દબાવો અને દુકાનનું ચોક્કસ લોકેશન સેટ કરો.
              </p>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('parties')}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4" />
                  <span>પાર્ટી લિસ્ટ ખોલો (Open Parties)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. SELECTED PARTY BOTTOM CARD */}
        {selectedParty && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-md z-30 animate-slide-up select-none">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-3xl p-4 shadow-2xl text-white space-y-3">
              {/* Header: Code, City, Close */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {selectedParty.party_code || 'MARG'}
                  </span>
                  {selectedParty.city && (
                    <span className="text-xs font-bold text-slate-400 truncate">
                      • {selectedParty.city_gu || selectedParty.city}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {selectedParty.geofence_radius_meters || 75}m
                  </span>
                </div>
                <button
                  onClick={() => setSelectedParty(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Party Name */}
              <div>
                <h3 className="font-black text-sm text-white leading-tight">
                  {selectedParty.party_name_gu || selectedParty.party_name}
                </h3>
                {selectedParty.party_name_gu && (
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">
                    {selectedParty.party_name}
                  </p>
                )}
              </div>

              {/* Address */}
              {selectedParty.address && (
                <div className="text-xs text-slate-300 flex items-start gap-1.5 line-clamp-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span>{selectedParty.address_gu || selectedParty.address}</span>
                </div>
              )}

              {/* Route tags */}
              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                {selectedParty.route_1 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
                    R1: {selectedParty.route_1_gu || selectedParty.route_1}
                  </span>
                )}
                {selectedParty.route_2 && (
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                    R2: {selectedParty.route_2_gu || selectedParty.route_2}
                  </span>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                {/* 1. GO DIRECTLY (GOOGLE MAPS) */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedParty.latitude},${selectedParty.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  title="ગૂગલ મેપ નેવિગેશન શરૂ કરો"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>🚗 સીધા જાઓ (Go Directly in Google Maps)</span>
                </a>

                {/* 2. PRINT ENVELOPE */}
                {onNavigate && (
                  <button
                    onClick={() =>
                      onNavigate('print', {
                        selectedParty,
                        deliveryRoute: selectedParty.route_1 || selectedParty.route,
                      })
                    }
                    className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>કવર પ્રિન્ટ</span>
                  </button>
                )}

                {/* 3. EDIT PIN */}
                <button
                  onClick={() => setPickerModalParty(selectedParty)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>પિન બદલો</span>
                </button>

                {/* 4. CALL & WHATSAPP ROW */}
                {selectedParty.mobile_no && (
                  <div className="col-span-2 flex items-center gap-2 pt-1">
                    <a
                      href={`tel:${selectedParty.mobile_no}`}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{selectedParty.mobile_no}</span>
                    </a>
                    <a
                      href={`https://wa.me/91${selectedParty.mobile_no
                        .replace(/\D/g, '')
                        .slice(-10)}?text=${encodeURIComponent(
                        `શ્રીજી ડિસ્પેચ: નમસ્તે ${selectedParty.party_name_gu || selectedParty.party_name}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 text-xs font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. PINPOINT PICKER MODAL */}
      {pickerModalParty && (
        <PartyMapPickerModal
          isOpen={true}
          onClose={() => setPickerModalParty(null)}
          party={pickerModalParty}
          onSaved={handlePartySaved}
        />
      )}
    </div>
  );
};
