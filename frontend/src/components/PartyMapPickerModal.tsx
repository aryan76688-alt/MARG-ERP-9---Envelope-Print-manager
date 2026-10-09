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
  Loader2,
  Layers,
  Clipboard,
  Copy
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

// Google Maps Style Live Pulsing Location Dot
const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute; 
          width: 30px; 
          height: 30px; 
          border-radius: 50%; 
          background: rgba(37, 99, 235, 0.35); 
          animation: user-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></div>
        <div style="
          width: 15px; 
          height: 15px; 
          border-radius: 50%; 
          background: #2563eb; 
          border: 3px solid #ffffff; 
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); 
          position: relative; 
          z-index: 2;
        "></div>
      </div>
      <style>
        @keyframes user-ping {
          0% { transform: scale(0.6); opacity: 0.9; }
          75% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      </style>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
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
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Default coordinate (Ahmedabad / Gujarat region)
  const defaultLat = 23.0225;
  const defaultLng = 72.5714;

  const [lat, setLat] = useState<number>(defaultLat);
  const [lng, setLng] = useState<number>(defaultLng);
  const [latInput, setLatInput] = useState<string>(String(defaultLat));
  const [lngInput, setLngInput] = useState<string>(String(defaultLng));
  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [radius, setRadius] = useState<number>(75);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Coordinate parser from text, comma/space separation, or Google Maps URLs
  const extractCoordinates = (text: string): { lat: number; lng: number } | null => {
    if (!text) return null;
    const trimmed = text.trim();

    // Pattern 1: URL with query q=lat,lng or @lat,lng e.g. https://maps.google.com/?q=23.0225,72.5714
    const urlMatch = trimmed.match(/[@?&]q?=?([-+]?\d{1,2}\.\d+)[,\s]+([-+]?\d{1,3}\.\d+)/);
    if (urlMatch) {
      const parsedLat = parseFloat(urlMatch[1]);
      const parsedLng = parseFloat(urlMatch[2]);
      if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180) {
        return { lat: parsedLat, lng: parsedLng };
      }
    }

    // Pattern 2: Standard comma or space separated "23.0225, 72.5714" or "23.0225 72.5714"
    const coordsMatch = trimmed.match(/([-+]?\d{1,2}\.\d+)[,\s]+([-+]?\d{1,3}\.\d+)/);
    if (coordsMatch) {
      const parsedLat = parseFloat(coordsMatch[1]);
      const parsedLng = parseFloat(coordsMatch[2]);
      if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180) {
        return { lat: parsedLat, lng: parsedLng };
      }
    }

    return null;
  };

  // Initialize or reset state when modal opens with a party
  useEffect(() => {
    if (!isOpen || !party) return;

    const initialLat = party.latitude ? Number(party.latitude) : defaultLat;
    const initialLng = party.longitude ? Number(party.longitude) : defaultLng;
    const initialRadius = party.geofence_radius_meters ? Number(party.geofence_radius_meters) : 75;

    setLat(initialLat);
    setLng(initialLng);
    setLatInput(initialLat.toFixed(6));
    setLngInput(initialLng.toFixed(6));
    setRadius(initialRadius);
    setSearchQuery(party.city || party.address || '');
    setSearchResults([]);
    setFeedback(null);
  }, [isOpen, party]);

  // Switch between Google Detailed Roadmap (Hotels, Petrol Pumps, POIs) and Google Satellite Hybrid tiles
  const switchTileLayer = (mode: 'streets' | 'satellite') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const layer = mode === 'satellite'
      ? L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '&copy; Google Satellite & POIs',
          maxZoom: 20,
        })
      : L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '&copy; Google Maps (Hotels, Petrol Pumps & Landmarks)',
          maxZoom: 20,
        });
    layer.addTo(map);
    tileLayerRef.current = layer;
    setMapMode(mode);
  };

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

    const initialLayer = mapMode === 'satellite'
      ? L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '&copy; Google Satellite & POIs',
          maxZoom: 20,
        })
      : L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '&copy; Google Maps (Hotels, Petrol Pumps & Landmarks)',
          maxZoom: 20,
        });
    initialLayer.addTo(map);
    tileLayerRef.current = initialLayer;

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
      const newLat = Number(position.lat.toFixed(6));
      const newLng = Number(position.lng.toFixed(6));
      setLat(newLat);
      setLng(newLng);
      setLatInput(newLat.toFixed(6));
      setLngInput(newLng.toFixed(6));
      circle.setLatLng(position);
    });

    // Move marker and circle when user clicks anywhere on map
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      const newLat = Number(clickLat.toFixed(6));
      const newLng = Number(clickLng.toFixed(6));
      marker.setLatLng([newLat, newLng]);
      circle.setLatLng([newLat, newLng]);
      setLat(newLat);
      setLng(newLng);
      setLatInput(newLat.toFixed(6));
      setLngInput(newLng.toFixed(6));
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

  // Fetch user location when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [isOpen]);

  // Update user's live pulsing blue dot on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const marker = L.marker([userLocation.lat, userLocation.lng], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindTooltip('📍 તમારું વર્તમાન લોકેશન (Your Location)', {
        direction: 'top',
        offset: [0, -15],
      });

      userMarkerRef.current = marker;
    }
  }, [userLocation]);

  // Sync circle radius when changed
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  // Helper to move pin to specific coordinates
  const movePinTo = (newLat: number, newLng: number, zoomLevel: number = 17) => {
    const fixedLat = Number(newLat.toFixed(6));
    const fixedLng = Number(newLng.toFixed(6));
    setLat(fixedLat);
    setLng(fixedLng);
    setLatInput(fixedLat.toFixed(6));
    setLngInput(fixedLng.toFixed(6));

    if (markerRef.current) {
      markerRef.current.setLatLng([fixedLat, fixedLng]);
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([fixedLat, fixedLng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([fixedLat, fixedLng], zoomLevel, { duration: 1 });
    }
  };

  // Handle manual typing in Latitude input
  const handleLatInputChange = (val: string) => {
    setLatInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) {
      setLat(parsed);
      if (markerRef.current) markerRef.current.setLatLng([parsed, lng]);
      if (circleRef.current) circleRef.current.setLatLng([parsed, lng]);
      if (mapInstanceRef.current) mapInstanceRef.current.panTo([parsed, lng]);
    }
  };

  // Handle manual typing in Longitude input
  const handleLngInputChange = (val: string) => {
    setLngInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= -180 && parsed <= 180) {
      setLng(parsed);
      if (markerRef.current) markerRef.current.setLatLng([lat, parsed]);
      if (circleRef.current) circleRef.current.setLatLng([lat, parsed]);
      if (mapInstanceRef.current) mapInstanceRef.current.panTo([lat, parsed]);
    }
  };

  // Helper to apply pasted coordinate string
  const handleApplyPastedCoordinates = (pastedText: string) => {
    const coords = extractCoordinates(pastedText);
    if (coords) {
      movePinTo(coords.lat, coords.lng, 17);
      setFeedback({
        type: 'success',
        message: `ચોક્કસ લેટ/લોન્ગ (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}) લાગુ થયા!`,
      });
      return true;
    }
    return false;
  };

  // Paste from clipboard or prompt
  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && handleApplyPastedCoordinates(text)) {
          return;
        }
      }
    } catch {
      // Ignore clipboard permission failure, proceed to prompt
    }

    const userInput = window.prompt(
      'અક્ષાંશ અને રેખાંશ પેસ્ટ કરો (દા.ત. 23.0338, 72.5850 અથવા ગૂગલ મેપ લિંક):'
    );
    if (userInput) {
      const ok = handleApplyPastedCoordinates(userInput);
      if (!ok) {
        setFeedback({
          type: 'error',
          message: 'અમાન્ય કોઓર્ડિનેટ્સ. સાચું ફોર્મેટ: "23.0225, 72.5714" અથવા Google Maps લિંક',
        });
      }
    }
  };

  // Search Address or Locality via OpenStreetMap Nominatim, or detect raw coordinates
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;

    // Check if user entered coordinates directly into the search bar
    const directCoords = extractCoordinates(searchQuery);
    if (directCoords) {
      movePinTo(directCoords.lat, directCoords.lng, 17);
      setFeedback({
        type: 'success',
        message: `કોઓર્ડિનેટ્સથી લોકેશન મળ્યું: (${directCoords.lat.toFixed(5)}, ${directCoords.lng.toFixed(5)})`,
      });
      return;
    }

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
                <span>નકશા પર ક્લિક કરો અથવા લાલ પિનને ડ્રેગ કરીને ચોક્કસ દુકાન પર મૂકો.</span>
              </span>
              <span className="text-blue-400 font-bold flex-shrink-0">
                {radius}m સર્કલ
              </span>
            </div>
          </div>

          {/* Map View Mode Switcher: Street vs Google Satellite Hybrid */}
          <div className="absolute top-11 right-2 z-20 flex items-center bg-slate-950/90 backdrop-blur-md rounded-xl p-1 border border-slate-700/80 shadow-xl">
            <button
              type="button"
              onClick={() => switchTileLayer('streets')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                mapMode === 'streets'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>સામાન્ય (Street)</span>
            </button>
            <button
              type="button"
              onClick={() => switchTileLayer('satellite')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                mapMode === 'satellite'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🛰️ સેટેલાઇટ (Satellite)</span>
            </button>
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
          <div className="flex flex-col gap-2.5 text-xs bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800/80">
            {/* Latitude, Longitude & Paste Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Latitude Input */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 focus-within:border-blue-500 transition-colors">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Lat:</span>
                  <input
                    type="text"
                    value={latInput}
                    onChange={(e) => handleLatInputChange(e.target.value)}
                    placeholder="23.0225"
                    className="w-24 bg-transparent text-xs font-mono font-bold text-blue-300 focus:outline-none"
                    title="Latitude (અક્ષાંશ)"
                  />
                </div>

                {/* Longitude Input */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 focus-within:border-blue-500 transition-colors">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Lng:</span>
                  <input
                    type="text"
                    value={lngInput}
                    onChange={(e) => handleLngInputChange(e.target.value)}
                    placeholder="72.5714"
                    className="w-24 bg-transparent text-xs font-mono font-bold text-blue-300 focus:outline-none"
                    title="Longitude (રેખાંશ)"
                  />
                </div>

                {/* Paste Coordinates Button */}
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                  title="વોટ્સએપ અથવા ગૂગલ મેપ પરથી કોપી કરેલા Lat, Lng પેસ્ટ કરો"
                >
                  <Clipboard className="w-3.5 h-3.5 text-purple-400" />
                  <span>📋 પેસ્ટ Lat,Lng</span>
                </button>

                {/* Copy Coordinates Button */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                    setFeedback({
                      type: 'success',
                      message: `કોઓર્ડિનેટ્સ કોપી થયા: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                    });
                  }}
                  className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1 active:scale-95 transition-all"
                  title="કોઓર્ડિનેટ્સ કોપી કરો"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>કોપી</span>
                </button>
              </div>

              {isAlreadyPinned && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30 shrink-0">
                  ✓ પહેલેથી સેટ
                </span>
              )}
            </div>

            {/* Geofence Radius Selector */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-[11px] text-slate-400 font-medium">સુરક્ષા રેડિયસ (Geofence):</span>
              <div className="flex items-center gap-1.5">
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
