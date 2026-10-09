import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { 
  X, 
  MapPin, 
  Search, 
  Navigation, 
  Crosshair, 
  Save, 
  ExternalLink, 
  Check, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { Party } from '../types';
import { updatePartyGeofence } from '../api/client';
import { updatePartyInOfflineCache } from '../offline/db';

interface PartyMapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party | null;
  onSaved?: (updatedParty: Party) => void;
}

// Custom crisp SVG pin icon for Leaflet
const createPinIcon = (label: string = '') => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; width: 36px; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: grab;">
        <div style="
          width: 32px; 
          height: 32px; 
          background: #ef4444; 
          border: 3px solid #ffffff; 
          border-radius: 50% 50% 50% 0; 
          transform: rotate(-45deg); 
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            transform: rotate(45deg); 
            width: 10px; 
            height: 10px; 
            background: #ffffff; 
            border-radius: 50%;
          "></div>
        </div>
        <div style="
          width: 12px; 
          height: 4px; 
          background: rgba(0,0,0,0.25); 
          border-radius: 50%; 
          margin-top: 1px;
          filter: blur(1px);
        "></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
  });
};

export const PartyMapPickerModal: React.FC<PartyMapPickerModalProps> = ({
  isOpen,
  onClose,
  party,
  onSaved,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Default coordinate (Ahmedabad / Gujarat region)
  const defaultLat = 23.0225;
  const defaultLng = 72.5714;

  const [lat, setLat] = useState<number>(defaultLat);
  const [lng, setLng] = useState<number>(defaultLng);
  const [radius, setRadius] = useState<number>(75);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Initialize or reset state when modal opens with a party
  useEffect(() => {
    if (!isOpen || !party) return;

    const initialLat = party.latitude ? Number(party.latitude) : defaultLat;
    const initialLng = party.longitude ? Number(party.longitude) : defaultLng;
    const initialRadius = party.geofence_radius_meters ? Number(party.geofence_radius_meters) : 75;

    setLat(initialLat);
    setLng(initialLng);
    setRadius(initialRadius);
    setSearchQuery(party.city || party.address || '');
    setSearchResults([]);
    setFeedback(null);
  }, [isOpen, party]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Destroy existing map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const currentLat = party?.latitude ? Number(party.latitude) : defaultLat;
    const currentLng = party?.longitude ? Number(party.longitude) : defaultLng;
    const currentRadius = party?.geofence_radius_meters ? Number(party.geofence_radius_meters) : 75;

    const map = L.map(mapContainerRef.current, {
      center: [currentLat, currentLng],
      zoom: party?.latitude ? 17 : 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Draggable Marker
    const marker = L.marker([currentLat, currentLng], {
      draggable: true,
      icon: createPinIcon(party?.party_code || ''),
    }).addTo(map);

    // Circular Geofence boundary
    const circle = L.circle([currentLat, currentLng], {
      radius: currentRadius,
      color: '#3b82f6',
      fillColor: '#60a5fa',
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(map);

    // Update coordinates when marker is dragged
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      setLat(Number(position.lat.toFixed(6)));
      setLng(Number(position.lng.toFixed(6)));
      circle.setLatLng(position);
    });

    // Move marker and circle when user clicks anywhere on map
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      marker.setLatLng([clickLat, clickLng]);
      circle.setLatLng([clickLat, clickLng]);
      setLat(Number(clickLat.toFixed(6)));
      setLng(Number(clickLng.toFixed(6)));
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // Force map resize after modal opens
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Sync circle radius when changed
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  // Helper to move pin to specific coordinates
  const movePinTo = (newLat: number, newLng: number, zoomLevel: number = 17) => {
    setLat(Number(newLat.toFixed(6)));
    setLng(Number(newLng.toFixed(6)));

    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([newLat, newLng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([newLat, newLng], zoomLevel, { duration: 1 });
    }
  };

  // Search Address or Locality via OpenStreetMap Nominatim
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);

    try {
      const query = `${searchQuery.trim()}, Gujarat, India`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=5&countrycodes=in`;
      const res = await fetch(url);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data);
        const topResult = data[0];
        movePinTo(parseFloat(topResult.lat), parseFloat(topResult.lon), 16);
      } else {
        // Fallback without "Gujarat, India" suffix
        const rawRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery.trim()
          )}&limit=5&countrycodes=in`
        );
        const rawData = await rawRes.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
          setSearchResults(rawData);
          movePinTo(parseFloat(rawData[0].lat), parseFloat(rawData[0].lon), 16);
        } else {
          setFeedback({
            type: 'error',
            message: 'કોઈ લોકેશન મળ્યું નથી. કૃપા કરીને વિસ્તાર અથવા શહેરનું નામ તપાસો.',
          });
        }
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'એડ્રેસ શોધવામાં ભૂલ થઈ. કૃપા કરીને ફરી પ્રયાસ કરો.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Acquire live device GPS
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFeedback({ type: 'error', message: 'આ ઉપકરણમાં GPS ઉપલબ્ધ નથી' });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        movePinTo(pos.coords.latitude, pos.coords.longitude, 18);
        setFeedback({
          type: 'success',
          message: 'તમારું વર્તમાન GPS લોકેશન પિન કરવામાં આવ્યું!',
        });
      },
      (err) => {
        setIsLocating(false);
        setFeedback({
          type: 'error',
          message: `GPS મેળવી શકાયું નથી (${err.message || 'Permission Denied'})`,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Save Pinpoint to Database
  const handleSaveLocation = async () => {
    if (!party?.id) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await updatePartyGeofence(party.id, {
        latitude: lat,
        longitude: lng,
        radius_meters: radius,
      });

      const updatedParty: Party = {
        ...party,
        latitude: lat,
        longitude: lng,
        geofence_radius_meters: radius,
        geofence_set_at: res.geofence_set_at || new Date().toISOString(),
      };

      await updatePartyInOfflineCache(updatedParty);

      if (onSaved) {
        onSaved(updatedParty);
      }

      setFeedback({
        type: 'success',
        message: 'દુકાનનું ચોક્કસ લોકેશન સફળતાપૂર્વક સેવ થઈ ગયું!',
      });

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'લોકેશન સેવ કરવામાં ભૂલ આવી',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !party) return null;

  const isAlreadyPinned = party.latitude && party.longitude;
  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="flex flex-col w-full max-w-2xl max-h-[94vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-white truncate">
                  {party.party_name_gu || party.party_name}
                </h3>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {party.party_code || 'MARG'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                મેપ પર ચોક્કસ દુકાન પિન કરો • {party.city || 'ગુજરાત'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Address Search Bar */}
        <div className="p-3 bg-slate-900/90 border-b border-slate-800/80 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchAddress()}
                placeholder="એડ્રેસ અથવા વિસ્તાર શોધો (જેમ કે: દહેગામ, નરોડા...)"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
            <button
              onClick={handleSearchAddress}
              disabled={isSearching}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-all flex-shrink-0"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>શોધો</span>
            </button>
          </div>

          {/* Search suggestions if any */}
          {searchResults.length > 1 && (
            <div className="max-h-24 overflow-y-auto space-y-1 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    movePinTo(parseFloat(item.lat), parseFloat(item.lon), 17);
                    setSearchResults([]);
                  }}
                  className="w-full text-left text-[11px] text-slate-300 hover:text-white hover:bg-slate-800/80 px-2 py-1 rounded truncate block transition-colors"
                >
                  📍 {item.display_name}
                </button>
              ))}
            </div>
          )}

          {/* Quick Action Pills */}
          <div className="flex items-center justify-between gap-1.5 pt-1 overflow-x-auto text-[11px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1 active:scale-95 transition-all"
              >
                {isLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                <span>મારું GPS વાપરો</span>
              </button>

              <button
                type="button"
                onClick={() => movePinTo(lat, lng, 17)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium flex items-center gap-1 active:scale-95 transition-all"
              >
                <Navigation className="w-3 h-3 text-blue-400" />
                <span>પિન સેન્ટર કરો</span>
              </button>
            </div>

            <a
              href={googleMapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 font-bold flex items-center gap-1 active:scale-95 transition-all flex-shrink-0"
              title="Open Google Maps Driving Directions"
            >
              <ExternalLink className="w-3 h-3 text-indigo-400" />
              <span>ગૂગલ મેપ (સીધા જાઓ)</span>
            </a>
          </div>
        </div>

        {/* Interactive Leaflet Map View */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[360px] w-full bg-slate-950">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

          {/* Helper overlay instruction banner */}
          <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-slate-200 text-[11px] font-medium px-3 py-1.5 rounded-xl shadow-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                <span>નકશા પર કોઈપણ જગ્યાએ ક્લિક કરો અથવા લાલ પિનને દુકાન પર ડ્રેગ કરો.</span>
              </span>
              <span className="text-blue-400 font-bold flex-shrink-0">
                {radius}m સર્કલ
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-3 py-2 text-xs font-bold flex items-center gap-2 border-t ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                : 'bg-rose-950/80 text-rose-300 border-rose-800/80'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Bottom Configuration & Save Row */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 space-y-3">
          {/* Coordinates & Radius Settings */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            {/* Live Lat/Lng readout */}
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span>Lat: <strong>{lat.toFixed(5)}</strong></span>
              <span>•</span>
              <span>Lng: <strong>{lng.toFixed(5)}</strong></span>
              {isAlreadyPinned && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-sans font-bold border border-emerald-500/30">
                  પહેલેથી સેટ
                </span>
              )}
            </div>

            {/* Radius selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">રેડિયસ:</span>
              {[35, 50, 75, 100, 150].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                    radius === r
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {r}m
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all active:scale-95"
            >
              રદ કરો (Cancel)
            </button>

            <button
              type="button"
              onClick={handleSaveLocation}
              disabled={isSaving}
              className="flex-1 max-w-xs px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-xs font-black text-white shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>સેવ થાય છે...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>લોકેશન સેવ કરો (Save Location)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
