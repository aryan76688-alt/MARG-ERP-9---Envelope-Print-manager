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
  Compass, 
  Copy, 
  Check, 
  Crosshair, 
  Loader2,
  Package,
  Truck,
  ShieldCheck,
  Radio,
  Route,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronUp,
  Target,
  Sparkles,
  Footprints,
  Bike,
  MapPinOff
} from 'lucide-react';
import { Party, LiveUserLocation } from '../types';
import { fetchParties, fetchDriverJobs, fetchLiveUserLocations, updateLiveLocation, unsetPartyLocation } from '../api/client';
import { getAllOfflineParties, updatePartyInOfflineCache } from '../offline/db';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';
import { LocationPermissionModal } from '../components/LocationPermissionModal';
import { VoiceSearchInput } from '../components/VoiceSearchInput';
import {
  computeRoadRoute,
  computeBatchRoadDistances,
  calculateHaversineKm,
  RoadRouteResult,
  RoadDistanceItem,
  TravelMode
} from '../services/googleRoutesService';

interface AllPartiesMapProps {
  onNavigate?: (tab: string, state?: any) => void;
}

// Consistent Route Color Mapping
const getRouteColor = (routeStr?: string | null): string => {
  if (!routeStr) return '#059669'; // Default emerald green
  const r = routeStr.toLowerCase().trim();
  if (r.includes('1') || r.includes('one')) return '#2563eb'; // Blue
  if (r.includes('2') || r.includes('two')) return '#7c3aed'; // Purple
  if (r.includes('3') || r.includes('three')) return '#d97706'; // Amber
  if (r.includes('4') || r.includes('four')) return '#e11d48'; // Rose
  if (r.includes('5') || r.includes('five')) return '#0891b2'; // Cyan
  
  // Deterministic color generator for custom named routes
  let hash = 0;
  for (let i = 0; i < routeStr.length; i++) {
    hash = routeStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#2563eb', '#7c3aed', '#d97706', '#e11d48', '#059669', '#0891b2', '#4f46e5', '#db2777'];
  return colors[Math.abs(hash) % colors.length];
};

// Marker icon generator with Route Colors and Case Badges
const createPartyMarkerIcon = (
  code: string = '', 
  isSelected: boolean = false, 
  routeColor: string = '#059669',
  casesCount: number = 0
) => {
  const bgColor = isSelected ? '#2563eb' : routeColor;
  const hasCases = casesCount > 0;

  return L.divIcon({
    className: 'party-map-marker',
    html: `
      <div style="position: relative; width: 38px; height: 46px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: pointer;">
        ${hasCases ? `
          <div style="
            position: absolute;
            top: -12px;
            right: -8px;
            background: #d97706;
            color: #ffffff;
            font-size: 10px;
            font-weight: 900;
            padding: 1.5px 6px;
            border-radius: 12px;
            border: 2px solid #ffffff;
            box-shadow: 0 3px 8px rgba(0,0,0,0.45);
            z-index: 10;
            display: flex;
            align-items: center;
            gap: 2px;
            white-space: nowrap;
            letter-spacing: -0.2px;
          ">
            📦 ${casesCount}
          </div>
        ` : ''}
        <div style="
          width: 30px; 
          height: 30px; 
          background: ${bgColor}; 
          border: 2.5px solid #ffffff; 
          border-radius: 50% 50% 50% 0; 
          transform: rotate(-45deg); 
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
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
    iconSize: [38, 46],
    iconAnchor: [19, 44],
  });
};

// High-visibility Animated Marker for Nearest 3 Parties with KM distance badge
const createNearestPartyMarkerIcon = (
  code: string = '', 
  isSelected: boolean = false, 
  rank: 1 | 2 | 3 = 1,
  distanceStr: string = '',
  casesCount: number = 0
) => {
  const rankMeta = {
    1: { bg: '#eab308', ring: '#fef08a', text: '#713f12', medal: '🥇', label: '#1' },
    2: { bg: '#9333ea', ring: '#e9d5ff', text: '#3b0764', medal: '🥈', label: '#2' },
    3: { bg: '#059669', ring: '#a7f3d0', text: '#064e3b', medal: '🥉', label: '#3' },
  }[rank] || { bg: '#2563eb', ring: '#bfdbfe', text: '#1e3a8a', medal: '📍', label: `#${rank}` };

  const pinColor = isSelected ? '#2563eb' : rankMeta.bg;
  const hasCases = casesCount > 0;

  return L.divIcon({
    className: `nearest-party-marker nearest-rank-${rank}`,
    html: `
      <div style="position: relative; width: 44px; height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: pointer;">
        <!-- Glowing Radar Ring -->
        <div style="
          position: absolute;
          top: 14px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: ${rankMeta.bg};
          opacity: 0.45;
          animation: nearest-pulse-radar 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
          pointer-events: none;
        "></div>

        <!-- Floating Distance & Rank Badge -->
        <div style="
          position: absolute;
          top: -16px;
          background: #090d16;
          color: #ffffff;
          font-size: 10px;
          font-weight: 900;
          padding: 2px 7px;
          border-radius: 12px;
          border: 2px solid ${rankMeta.bg};
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          letter-spacing: -0.2px;
        ">
          <span>${rankMeta.medal}</span>
          <span style="color: ${rankMeta.ring}; font-family: monospace; font-weight: 800;">${distanceStr}</span>
        </div>

        ${hasCases ? `
          <div style="
            position: absolute;
            top: 6px;
            right: -10px;
            background: #d97706;
            color: #ffffff;
            font-size: 9px;
            font-weight: 900;
            padding: 1px 5px;
            border-radius: 10px;
            border: 1.5px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.45);
            z-index: 25;
            white-space: nowrap;
          ">
            📦 ${casesCount}
          </div>
        ` : ''}

        <!-- Pin Head -->
        <div style="
          margin-top: 12px;
          width: 32px; 
          height: 32px; 
          background: ${pinColor}; 
          border: 3px solid #ffffff; 
          border-radius: 50% 50% 50% 0; 
          transform: rotate(-45deg); 
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        ">
          <div style="
            transform: rotate(45deg); 
            font-size: 9px; 
            font-weight: 900; 
            color: #ffffff; 
            text-align: center;
            font-family: monospace;
            line-height: 1;
            padding: 1px;
            white-space: nowrap;
          ">${rankMeta.label}</div>
        </div>
        <div style="
          width: 12px; 
          height: 3.5px; 
          background: rgba(0,0,0,0.4); 
          border-radius: 50%; 
          margin-top: 1px;
        "></div>
      </div>
      <style>
        @keyframes nearest-pulse-radar {
          0% { transform: scale(0.6); opacity: 0.8; }
          75% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      </style>
    `,
    iconSize: [44, 56],
    iconAnchor: [22, 53],
  });
};

// Google Maps Style Live Pulsing Location Dot for Current User (Admin/Super Admin only)
const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute; 
          width: 34px; 
          height: 34px; 
          border-radius: 50%; 
          background: rgba(37, 99, 235, 0.35); 
          animation: user-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        "></div>
        <div style="
          width: 16px; 
          height: 16px; 
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
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

// Staff / Driver Fleet Marker (Visible only to Admin & Super Admin)
const createStaffLocationIcon = (fullName: string = '', role: string = 'Driver') => {
  return L.divIcon({
    className: 'staff-fleet-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="
          background: #6d28d9;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 8px;
          border: 1.5px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          white-space: nowrap;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 3px;
        ">
          <span>🛵</span>
          <span>${fullName || role}</span>
        </div>
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #8b5cf6;
          border: 2.5px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        "></div>
      </div>
    `,
    iconSize: [80, 36],
    iconAnchor: [40, 36],
  });
};

export const AllPartiesMap: React.FC<AllPartiesMapProps> = ({ onNavigate }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const staffLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const nearestLinesLayerRef = useRef<L.LayerGroup | null>(null);
  const roadPolylineRef = useRef<L.Polyline | null>(null);

  // Real Road Directions State
  const [navigatingParty, setNavigatingParty] = useState<Party | null>(null);
  const [navTravelMode, setNavTravelMode] = useState<TravelMode>('DRIVING');
  const [navRouteResult, setNavRouteResult] = useState<RoadRouteResult | null>(null);
  const [isCalculatingNav, setIsCalculatingNav] = useState<boolean>(false);
  const [navRoutingError, setNavRoutingError] = useState<string | null>(null);
  const [showNavTurns, setShowNavTurns] = useState<boolean>(false);

  // Actual Road Distances cache for geocoded parties (measured road driving km)
  const [partyRoadDistances, setPartyRoadDistances] = useState<Record<string | number, RoadDistanceItem>>({});

  // Authenticated User Role
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const userRole = (currentUser?.role || 'employee').toLowerCase();
  const isAdminOrSuperAdmin = userRole === 'super_admin' || userRole === 'admin' || userRole === 'owner';

  // State Management
  const [parties, setParties] = useState<Party[]>([]);
  const [totalPartiesCount, setTotalPartiesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [showNearestThree, setShowNearestThree] = useState<boolean>(true);
  const [nearestWidgetMinimized, setNearestWidgetMinimized] = useState<boolean>(true);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);
  const [partyDetailsExpanded, setPartyDetailsExpanded] = useState<boolean>(false);
  
  // Filters: All vs With Cases Only vs Unmapped, and Route-wise
  const [filterMode, setFilterMode] = useState<'all' | 'with_cases' | 'unmapped'>('all');
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  
  // Cases Map from Driver Dispatch Jobs: party_id -> info
  const [partyCasesMap, setPartyCasesMap] = useState<Record<number, {
    total_cases: number;
    delivery_status: string;
    case_breakdown?: any[];
    driver_name?: string;
    route?: string;
  }>>({});

  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [pickerModalParty, setPickerModalParty] = useState<Party | null>(null);
  
  // Live GPS Tracking State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [otherStaffLocations, setOtherStaffLocations] = useState<LiveUserLocation[]>([]);
  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(() => {
    try {
      return localStorage.getItem('shreeji_location_permission_granted') !== 'true';
    } catch {
      return false;
    }
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const mapRootRef = useRef<HTMLDivElement>(null);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (mapRootRef.current?.requestFullscreen) {
        mapRootRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(prev => !prev);
        });
      } else {
        setIsFullscreen(prev => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Invalidate Leaflet map size on fullscreen change
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 250);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Load active dispatch cases for today
  const loadDriverJobs = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await fetchDriverJobs({ date: todayStr });
      if (res && res.stops) {
        const cMap: Record<number, any> = {};
        res.stops.forEach((st) => {
          if (st.party_id) {
            cMap[st.party_id] = {
              total_cases: st.total_cases || 0,
              delivery_status: st.delivery_status || 'Pending',
              case_breakdown: st.case_breakdown || [],
              driver_name: st.driver_name,
              route: st.delivery_route,
            };
          }
        });
        setPartyCasesMap(cMap);
      }
    } catch (e) {
      console.warn('Notice: Could not load driver dispatch jobs:', e);
    }
  };

  // Load parties from API or offline DB
  const loadParties = async () => {
    setLoading(true);
    try {
      const [res] = await Promise.all([
        fetchParties({ limit: 2500 }),
        loadDriverJobs()
      ]);
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

  // Switch between Google Detailed Roadmap and Google Satellite Hybrid tiles
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

  // Acquire high-accuracy live GPS location for map centering & nearest 3 parties calculation
  const handleLocateMe = (flyToUser: boolean = true) => {
    if (!navigator.geolocation) {
      setGpsMessage('GPS is not available on this device');
      return;
    }

    setIsLocating(true);
    setGpsMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const newLocation = { lat: latitude, lng: longitude, accuracy };
        setUserLocation(newLocation);

        if (flyToUser && mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 17, { duration: 1 });
        }
      },
      (err) => {
        setIsLocating(false);
        setGpsMessage(`Could not acquire GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Initial load and continuous GPS tracking + heartbeat
  useEffect(() => {
    loadParties();

    let watchId: number | null = null;
    let lastSent = 0;

    const hasPermission = (() => {
      try {
        return localStorage.getItem('shreeji_location_permission_granted') === 'true';
      } catch {
        return false;
      }
    })();

    if (navigator.geolocation && hasPermission) {
      handleLocateMe(false);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          
          setUserLocation(coords);

          // Throttle backend live-location update every 15 seconds
          const now = Date.now();
          if (now - lastSent > 15000) {
            lastSent = now;
            updateLiveLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [showLocationModal]);

  // Fetch other online staff/driver locations periodically (ONLY for Admin / Super Admin)
  useEffect(() => {
    if (!isAdminOrSuperAdmin) return;

    const fetchFleet = async () => {
      const locs = await fetchLiveUserLocations();
      // Exclude self from other staff markers
      const others = locs.filter((l) => l.username !== currentUser?.username);
      setOtherStaffLocations(others);
    };

    fetchFleet();
    const interval = setInterval(fetchFleet, 12000);
    return () => clearInterval(interval);
  }, [isAdminOrSuperAdmin, currentUser?.username]);

  // Filter ONLY parties with valid map coordinates
  const setMapParties = useMemo(() => {
    return parties.filter((p) => {
      const hasLat = p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude)) && Number(p.latitude) !== 0;
      const hasLng = p.longitude !== null && p.longitude !== undefined && !isNaN(Number(p.longitude)) && Number(p.longitude) !== 0;
      return hasLat && hasLng;
    });
  }, [parties]);

  // Parties WITHOUT coordinates (need manual pin)
  const unmappedParties = useMemo(() => {
    return parties.filter((p) => {
      const hasLat = p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude)) && Number(p.latitude) !== 0;
      const hasLng = p.longitude !== null && p.longitude !== undefined && !isNaN(Number(p.longitude)) && Number(p.longitude) !== 0;
      return !hasLat || !hasLng;
    });
  }, [parties]);

  // Count parties that currently have active cases
  const partiesWithCasesCount = useMemo(() => {
    return setMapParties.filter((p) => p.id && partyCasesMap[p.id] && partyCasesMap[p.id].total_cases > 0).length;
  }, [setMapParties, partyCasesMap]);

  // Extract available distinct routes from all parties
  const availableRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    parties.forEach((p) => {
      if (p.route_1) routeSet.add(p.route_1);
      if (p.route_2) routeSet.add(p.route_2);
      if (p.route_3) routeSet.add(p.route_3);
      if (p.route) routeSet.add(p.route);
    });
    return Array.from(routeSet).sort();
  }, [parties]);

  // Filter parties by search query, route, and filter mode
  const filteredParties = useMemo(() => {
    const sourceParties = filterMode === 'unmapped' ? unmappedParties : setMapParties;
    return sourceParties.filter((p) => {
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

      const hasCases = Boolean(p.id && partyCasesMap[p.id] && partyCasesMap[p.id].total_cases > 0);
      const matchesCaseFilter = filterMode !== 'with_cases' || hasCases;

      return matchesSearch && matchesRoute && matchesCaseFilter;
    });
  }, [setMapParties, unmappedParties, search, selectedRoute, filterMode, partyCasesMap]);

  // Haversine straight-line distance computation in kilometers
  const computeDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    return calculateHaversineKm(lat1, lon1, lat2, lon2);
  };

  // Batch calculate actual driving road distances for geocoded parties using OSRM Table & Google Routes
  useEffect(() => {
    if (!userLocation || !userLocation.lat || !userLocation.lng) return;

    const validParties = parties
      .filter((p) => {
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && p.id !== undefined && p.id !== null;
      })
      .map((p) => ({
        id: p.id!,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
      }));

    if (validParties.length === 0) return;

    let isMounted = true;
    computeBatchRoadDistances(
      { lat: userLocation.lat, lng: userLocation.lng },
      validParties
    )
      .then((distanceMap) => {
        if (!isMounted) return;
        const dict: Record<string | number, RoadDistanceItem> = {};
        distanceMap.forEach((val, key) => {
          dict[key] = val;
        });
        setPartyRoadDistances((prev) => ({ ...prev, ...dict }));
      })
      .catch((err) => {
        console.warn('Batch road distance calculation error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [userLocation?.lat, userLocation?.lng, parties]);

  // Calculate live actual road driving distance between user and destination
  // loop: getDistanceFromUser prioritizes real road geometry from OSRM/Google Routes API, with 1.28x road curvature fallback, ceiling: real road API, upgrade path: real-time matrix
  const getDistanceFromUser = (partyId?: number | string | null, targetLat?: number | null, targetLng?: number | null) => {
    if (!userLocation || targetLat === undefined || targetLat === null || targetLng === undefined || targetLng === null) return null;
    const lat = Number(targetLat);
    const lng = Number(targetLng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;

    if (partyId && partyRoadDistances[partyId]) {
      return partyRoadDistances[partyId].distanceFormatted;
    }

    // High-accuracy calibrated road distance prior to async resolution
    const straightKm = calculateHaversineKm(userLocation.lat, userLocation.lng, lat, lng);
    const roadKm = straightKm * 1.28;
    return roadKm < 1 ? `${Math.round(roadKm * 1000)} m` : `${roadKm.toFixed(1)} km`;
  };

  // Top 3 nearest parties relative to current user GPS location (calculated using ACTUAL ROAD KM)
  const nearestThreeParties = useMemo(() => {
    if (!userLocation) return [];
    const validParties = parties.filter((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });

    const listWithDistance = validParties.map((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      const cachedRoad = p.id ? partyRoadDistances[p.id] : null;
      let dKm: number;
      let dStr: string;
      let durStr: string | undefined;

      if (cachedRoad) {
        dKm = cachedRoad.distanceKm;
        dStr = cachedRoad.distanceFormatted;
        durStr = cachedRoad.durationFormatted;
      } else {
        const straightKm = calculateHaversineKm(userLocation.lat, userLocation.lng, lat, lng);
        dKm = Number((straightKm * 1.28).toFixed(1));
        dStr = dKm < 1 ? `${Math.round(dKm * 1000)} m` : `${dKm.toFixed(1)} km`;
        durStr = `${Math.round((dKm / 32) * 60)} min`;
      }

      return {
        party: p,
        distanceKm: dKm,
        distanceStr: dStr,
        durationStr: durStr,
      };
    });

    listWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    return listWithDistance.slice(0, 3).map((item, idx) => ({
      ...item,
      rank: (idx + 1) as 1 | 2 | 3,
    }));
  }, [parties, userLocation, partyRoadDistances]);

  // Focus all 3 nearest parties + user location in map viewport
  const handleFocusNearestThree = () => {
    const map = mapInstanceRef.current;
    if (!map || nearestThreeParties.length === 0) return;

    const points: L.LatLngExpression[] = [];
    if (userLocation) {
      points.push([userLocation.lat, userLocation.lng]);
    }
    nearestThreeParties.forEach((n) => {
      points.push([Number(n.party.latitude), Number(n.party.longitude)]);
    });

    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 17 });
  };

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

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      const staffLayer = L.layerGroup().addTo(map);
      staffLayerRef.current = staffLayer;

      const nearestLinesLayer = L.layerGroup().addTo(map);
      nearestLinesLayerRef.current = nearestLinesLayer;

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

  // Update user location on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userAccuracyCircleRef.current) {
        map.removeLayer(userAccuracyCircleRef.current);
        userAccuracyCircleRef.current = null;
      }
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const marker = L.marker([userLocation.lat, userLocation.lng], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindTooltip('📍 Your Live GPS Location', {
        direction: 'top',
        offset: [0, -16],
      });

      userMarkerRef.current = marker;
    }

    if (userLocation.accuracy) {
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setLatLng([userLocation.lat, userLocation.lng]);
        userAccuracyCircleRef.current.setRadius(userLocation.accuracy);
      } else {
        const circle = L.circle([userLocation.lat, userLocation.lng], {
          radius: userLocation.accuracy,
          color: '#3b82f6',
          fillColor: '#93c5fa',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
        userAccuracyCircleRef.current = circle;
      }
    }
  }, [userLocation]);

  // Update other staff fleet markers (ONLY for Super Admin & Admin)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const staffLayer = staffLayerRef.current;
    if (!map || !staffLayer) return;

    staffLayer.clearLayers();

    if (!isAdminOrSuperAdmin || otherStaffLocations.length === 0) return;

    otherStaffLocations.forEach((staff) => {
      if (!staff.latitude || !staff.longitude) return;
      const marker = L.marker([staff.latitude, staff.longitude], {
        icon: createStaffLocationIcon(staff.full_name, staff.role),
        zIndexOffset: 800,
      });

      marker.bindTooltip(
        `<strong>🛵 ${staff.full_name} (${staff.role.toUpperCase()})</strong><br/>Live Update: ${new Date(staff.updated_at).toLocaleTimeString()}`,
        { direction: 'top', offset: [0, -32] }
      );

      marker.addTo(staffLayer);
    });
  }, [otherStaffLocations, isAdminOrSuperAdmin]);

  // Real Road Navigation Handler: Computes real road route using Google Routes API
  // Never connects endpoints directly with straight lines
  const handleNavigateToParty = async (party: Party, mode: TravelMode = navTravelMode) => {
    setNavigatingParty(party);
    setNavTravelMode(mode);
    setIsCalculatingNav(true);
    setNavRoutingError(null);

    const startLat = userLocation?.lat || 23.0760;
    const startLng = userLocation?.lng || 72.6750;
    const pLat = Number(party.latitude);
    const pLng = Number(party.longitude);

    if (isNaN(pLat) || isNaN(pLng) || pLat === 0 || pLng === 0) {
      setIsCalculatingNav(false);
      setNavRoutingError('Party has no valid GPS coordinates tagged.');
      return;
    }

    try {
      const result = await computeRoadRoute({
        origin: { lat: startLat, lng: startLng, name: userLocation ? 'Current Location' : 'Shreeji Healthcare' },
        destination: { lat: pLat, lng: pLng, name: party.party_name },
        travelMode: mode
      });

      setNavRouteResult(result);
      setIsCalculatingNav(false);

      if (mapInstanceRef.current) {
        if (roadPolylineRef.current) {
          mapInstanceRef.current.removeLayer(roadPolylineRef.current);
          roadPolylineRef.current = null;
        }

        // Draw real road polyline following actual street curves, bends, and turns
        roadPolylineRef.current = L.polyline(result.path, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(mapInstanceRef.current);

        mapInstanceRef.current.fitBounds(L.latLngBounds(result.path), { padding: [60, 60] });
      }
    } catch (err: any) {
      console.error('Road navigation error:', err);
      setIsCalculatingNav(false);
      setNavRouteResult(null);
      setNavRoutingError(err.message || 'Failed to compute real road route');
      if (roadPolylineRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(roadPolylineRef.current);
        roadPolylineRef.current = null;
      }
    }
  };

  const handleClearNavigation = () => {
    setNavigatingParty(null);
    setNavRouteResult(null);
    setNavRoutingError(null);
    setShowNavTurns(false);
    if (roadPolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(roadPolylineRef.current);
      roadPolylineRef.current = null;
    }
  };

  // Unset selected party's GPS pin
  const handleUnsetPartyLocation = async (party: Party) => {
    if (!party.id) return;
    if (!window.confirm(`Are you sure you want to remove the GPS location for '${party.party_name}'?`)) {
      return;
    }
    try {
      await unsetPartyLocation(party.id);
      const updated: Party = {
        ...party,
        latitude: null,
        longitude: null,
        geofence_set_at: null,
      };
      await updatePartyInOfflineCache(updated);
      setParties((prev) => prev.map((p) => (p.id === party.id ? updated : p)));
      setSelectedParty(null);
      handleClearNavigation();
    } catch (err: any) {
      alert('Error unsetting location: ' + (err.message || 'Unknown error'));
    }
  };

  // Plot and update party markers whenever filtered parties or selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    if (filterMode === 'unmapped' || filteredParties.length === 0) return;

    // LAG PREVENTION: Limit maximum visible markers to 100 to guarantee silky smooth 60fps panning
    // ALWAYS ensure nearest 3 parties are included in rendered markers!
    const maxMarkers = 100;
    const baseParties = filteredParties.slice(0, maxMarkers);
    const nearestList = showNearestThree ? nearestThreeParties.map((n) => n.party) : [];

    const partiesMap = new Map<number, Party>();
    nearestList.forEach((p) => { if (p.id) partiesMap.set(p.id, p); });
    baseParties.forEach((p) => { if (p.id && !partiesMap.has(p.id)) partiesMap.set(p.id, p); });
    const partiesToRender = Array.from(partiesMap.values());

    const latLngs: L.LatLngExpression[] = [];

    partiesToRender.forEach((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
      const isSelected = selectedParty?.id === p.id;
      
      const primaryRoute = p.route_1 || p.route || p.route_2 || '';
      const routeColor = getRouteColor(primaryRoute);
      const partyCase = p.id ? partyCasesMap[p.id] : undefined;
      const casesCount = partyCase?.total_cases || 0;

      const nearestInfo = showNearestThree ? nearestThreeParties.find((n) => n.party.id === p.id) : null;

      const icon = nearestInfo
        ? createNearestPartyMarkerIcon(
            p.party_code || '',
            isSelected,
            nearestInfo.rank,
            nearestInfo.distanceStr,
            casesCount
          )
        : createPartyMarkerIcon(p.party_code || '', isSelected, routeColor, casesCount);

      const marker = L.marker([lat, lng], {
        icon,
        title: p.party_name,
        zIndexOffset: nearestInfo ? 1200 - nearestInfo.rank * 50 : (isSelected ? 900 : 100),
      });

      // Marker click handler
      marker.on('click', () => {
        setSelectedParty(p);
        map.flyTo([lat, lng], 16, { duration: 0.5 });
      });

      // Tooltip on hover
      if (nearestInfo) {
        marker.bindTooltip(
          `<strong>${nearestInfo.rank === 1 ? '🥇' : nearestInfo.rank === 2 ? '🥈' : '🥉'} #${nearestInfo.rank} Nearest Party (${nearestInfo.distanceStr})</strong><br/><strong>${p.party_code || ''}</strong>: ${p.party_name}${
            casesCount > 0 ? ` <span style="color:#f59e0b;font-weight:bold;">(📦 ${casesCount} cases)</span>` : ''
          }${primaryRoute ? ` <br/><small style="color:#94a3b8;">🛣️ ${primaryRoute}</small>` : ''}`,
          { direction: 'top', offset: [0, -46] }
        );
      } else {
        marker.bindTooltip(
          `<strong>${p.party_code || ''}</strong>: ${p.party_name}${
            casesCount > 0 ? ` <span style="color:#f59e0b;font-weight:bold;">(📦 ${casesCount} cases)</span>` : ''
          }${primaryRoute ? ` <br/><small style="color:#94a3b8;">🛣️ ${primaryRoute}</small>` : ''}`,
          { direction: 'top', offset: [0, -32] }
        );
      }

      marker.addTo(markersLayer);
      latLngs.push([lat, lng]);
    });

    // Auto fit bounds to show plotted parties
    if (latLngs.length > 0 && !selectedParty) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [filteredParties, selectedParty?.id, partyCasesMap, filterMode, nearestThreeParties, showNearestThree]);

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
    setSelectedParty(updatedParty);
    setPickerModalParty(null);
    setFilterMode('all');
    updatePartyInOfflineCache(updatedParty);

    // Smoothly fly to newly pinned party on map
    setTimeout(() => {
      if (mapInstanceRef.current && updatedParty.latitude && updatedParty.longitude) {
        mapInstanceRef.current.flyTo([Number(updatedParty.latitude), Number(updatedParty.longitude)], 16, { duration: 0.6 });
      }
    }, 150);
  };

  return (
    <div 
      ref={mapRootRef} 
      className={`relative h-full w-full bg-slate-950 text-white font-sans overflow-hidden select-none transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-[999999] w-screen h-screen' : ''
      }`}
    >
      {/* 1. EDGE-TO-EDGE MAP CANVAS */}
      <div className="absolute inset-0 w-full h-full bg-slate-950 overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

        {/* 2. FLOATING COMPACT TOP SEARCH & CONTROLS BAR (Height ~44px) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-30 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 shadow-xl">
          {/* Search Input with Voice */}
          <div className="flex-1 min-w-0">
            <VoiceSearchInput
              value={search}
              onChange={(val) => setSearch(val)}
              placeholder="Search parties, code, city, route..."
              className="w-full"
              inputClassName="py-1.5 pl-8 pr-24 rounded-xl bg-slate-800/90 border-slate-700 text-xs text-white placeholder-slate-400 focus:border-blue-500"
            />
          </div>

          {/* Nearest List View Button */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('nearby')}
            className="px-2.5 py-1.5 rounded-xl border border-emerald-500/50 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-white text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
            title="View Nearest Parties List"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Nearest List</span>
          </button>

          {/* Route Optimizer Button */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('route-optimizer')}
            className="px-2.5 py-1.5 rounded-xl border border-indigo-500/50 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
            title="Delivery Route Optimizer"
          >
            <Route className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Route Optimizer</span>
          </button>

          {/* Filter Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setFiltersExpanded((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs shrink-0 ${
              filtersExpanded || filterMode !== 'all' || selectedRoute !== 'all'
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Routes & Filters"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {(filterMode !== 'all' || selectedRoute !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            )}
          </button>

          {/* Map Mode (Street vs Satellite) */}
          <button
            type="button"
            onClick={() => {
              const next = mapMode === 'streets' ? 'satellite' : 'streets';
              setMapMode(next);
              switchTileLayer(next);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 active:scale-95 transition-all shadow-xs shrink-0"
            title={mapMode === 'streets' ? 'Switch to Satellite Map' : 'Switch to Street Map'}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* GPS Locate Me */}
          <button
            type="button"
            onClick={() => handleLocateMe(true)}
            disabled={isLocating}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 active:scale-95 transition-all shadow-xs shrink-0"
            title="Center to My Live GPS Location"
          >
            <Compass className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
          </button>

          {/* Fit All Markers */}
          <button
            type="button"
            onClick={handleFitAllMarkers}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border border-slate-700 active:scale-95 transition-all shadow-xs shrink-0"
            title="Fit All Pinned Parties"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all shadow-xs shrink-0"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-slate-300" />}
          </button>
        </div>

        {/* 3. COLLAPSIBLE FILTER DRAWER (SLIDE DOWN FROM TOP) */}
        {filtersExpanded && (
          <div className="absolute top-14 left-2.5 right-2.5 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-2xl p-3 shadow-2xl space-y-2.5 animate-slide-down">
            {/* Header row with counts */}
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-black text-white">Route & Party Filters</span>
                {isAdminOrSuperAdmin && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    GPS Admin
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFiltersExpanded(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all ${
                  filterMode === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All ({setMapParties.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('with_cases')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all ${
                  filterMode === 'with_cases'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-amber-300'
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-400" />
                <span>With Cases ({partiesWithCasesCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unmapped')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all ${
                  filterMode === 'unmapped'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-rose-300'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>Unmapped ({unmappedParties.length})</span>
              </button>
            </div>

            {/* Route selector dropdown */}
            <div className="relative">
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
              >
                <option value="all">🛣️ All Routes</option>
                {availableRoutes.map((r) => (
                  <option key={r} value={r}>
                    🛣️ {r}
                  </option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            {/* Quick POI Shortcuts */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pt-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Nearby:</span>
              <a
                href={
                  userLocation
                    ? `https://www.google.com/maps/search/petrol+pump/@${userLocation.lat},${userLocation.lng},14z`
                    : 'https://www.google.com/maps/search/petrol+pump+near+me'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 shrink-0"
              >
                <span>⛽ Petrol Pumps</span>
              </a>
              <a
                href={
                  userLocation
                    ? `https://www.google.com/maps/search/hotels+restaurants/@${userLocation.lat},${userLocation.lng},14z`
                    : 'https://www.google.com/maps/search/hotels+and+restaurants+near+me'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1 shrink-0"
              >
                <span>🏨 Hotels</span>
              </a>
              <a
                href={
                  userLocation
                    ? `https://www.google.com/maps/search/hospital+medical/@${userLocation.lat},${userLocation.lng},14z`
                    : 'https://www.google.com/maps/search/hospital+near+me'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-bold flex items-center gap-1 shrink-0"
              >
                <span>🏥 Hospitals</span>
              </a>
            </div>

            {/* Apply button */}
            <button
              type="button"
              onClick={() => setFiltersExpanded(false)}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Apply Filters
            </button>
          </div>
        )}

        {/* NEAREST 3 PARTIES WITH KM FLOATING WIDGET */}
        {showNearestThree && (
          <div className={`absolute top-3 left-3 z-20 transition-all duration-300 max-w-[calc(100vw-24px)] ${
            nearestWidgetMinimized ? 'w-auto' : 'w-72 sm:w-80'
          }`}>
            {nearestWidgetMinimized ? (
              <button
                type="button"
                onClick={() => setNearestWidgetMinimized(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-amber-500/50 text-amber-300 shadow-2xl hover:bg-slate-800 text-xs font-black transition-all active:scale-95"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>🎯 Top 3 Nearest ({nearestThreeParties[0]?.distanceStr || 'View'})</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            ) : (
              <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-2xl p-3 shadow-2xl space-y-2 text-white">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                      🎯
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                        <span className="truncate">Top 3 Nearest Parties</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                          KM
                        </span>
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {nearestThreeParties.length > 0 && (
                      <button
                        type="button"
                        onClick={handleFocusNearestThree}
                        className="px-2 py-0.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-bold border border-blue-500/40 transition-all flex items-center gap-1"
                        title="Focus all 3 nearest parties on map"
                      >
                        <Navigation className="w-2.5 h-2.5" />
                        <span>View All</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNearestWidgetMinimized(true)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Minimize"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                {!userLocation ? (
                  <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-center space-y-2">
                    <p className="text-[11px] text-blue-200">
                      Enable GPS to view the nearest 3 parties and actual road distance.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleLocateMe(true)}
                      className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>📡 Enable Live GPS</span>
                    </button>
                  </div>
                ) : nearestThreeParties.length === 0 ? (
                  <div className="p-2 text-center text-xs text-slate-400">
                    No mapped parties found on map
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                    {nearestThreeParties.map((n) => {
                      const p = n.party;
                      const partyCase = p.id ? partyCasesMap[p.id] : undefined;
                      const casesCount = partyCase?.total_cases || 0;
                      const isSelected = selectedParty?.id === p.id;
                      const rankStyles = {
                        1: { border: 'border-amber-500/40 hover:border-amber-500', bg: 'bg-amber-500/10', medal: '🥇', tag: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
                        2: { border: 'border-purple-500/40 hover:border-purple-500', bg: 'bg-purple-500/10', medal: '🥈', tag: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
                        3: { border: 'border-emerald-500/40 hover:border-emerald-500', bg: 'bg-emerald-500/10', medal: '🥉', tag: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                      }[n.rank] || { border: 'border-blue-500/40 hover:border-blue-500', bg: 'bg-blue-500/10', medal: '📍', tag: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedParty(p);
                            mapInstanceRef.current?.flyTo([Number(p.latitude), Number(p.longitude)], 17, { duration: 0.5 });
                          }}
                          className={`p-2 rounded-xl border transition-all cursor-pointer ${rankStyles.border} ${rankStyles.bg} ${
                            isSelected ? 'ring-2 ring-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs shrink-0">{rankStyles.medal}</span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-200 shrink-0">
                                {p.party_code || 'MARG'}
                              </span>
                              <span className="text-xs font-black text-white truncate">
                                {p.party_name}
                              </span>
                            </div>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border shrink-0 font-mono ${rankStyles.tag}`}>
                              🚗 {n.distanceStr}{n.durationStr ? ` • ${n.durationStr}` : ''}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 pl-5">
                            <span className="truncate">{p.city || 'Gujarat'}{p.route_1 ? ` • 🛣️ ${p.route_1}` : ''}</span>
                            {casesCount > 0 && (
                              <span className="text-amber-400 font-bold shrink-0">
                                📦 {casesCount} cases
                              </span>
                            )}
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex items-center justify-end gap-1.5 mt-1.5 pt-1 border-t border-slate-800/60" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedParty(p);
                                handleNavigateToParty(p);
                              }}
                              className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-bold border border-blue-500/30 flex items-center gap-1 transition-all"
                              title="Google Routes API Real Road Route"
                            >
                              <Route className="w-2.5 h-2.5 text-blue-400" />
                              <span>Route</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedParty(p);
                                mapInstanceRef.current?.flyTo([Number(p.latitude), Number(p.longitude)], 17, { duration: 0.5 });
                              }}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Crosshair className="w-2.5 h-2.5 text-blue-400" />
                              <span>Focus</span>
                            </button>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1 transition-all"
                            >
                              <Navigation className="w-2.5 h-2.5" />
                              <span>Google Maps</span>
                            </a>
                            {p.mobile_no && (
                              <a
                                href={`tel:${p.mobile_no}`}
                                className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-bold border border-blue-500/30 flex items-center gap-1 transition-all"
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>Call</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Map View Mode Switcher: Street vs Google Satellite Hybrid */}
        <div className="absolute top-3 right-3 z-20 flex items-center bg-slate-950/90 backdrop-blur-md rounded-xl p-1 border border-slate-700/80 shadow-xl">
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
            <span>Street</span>
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
            <span>🛰️ Satellite</span>
          </button>
        </div>

        {/* Live GPS Locate Me Button */}
        <button
          type="button"
          onClick={() => handleLocateMe(true)}
          className={`absolute ${selectedParty ? 'bottom-40' : 'bottom-6'} right-3 z-20 w-11 h-11 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white shadow-2xl border border-slate-700/80 flex items-center justify-center active:scale-90 transition-all ${
            isLocating ? 'ring-2 ring-blue-500' : ''
          }`}
          title="Center on My Location"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : (
            <Crosshair className={`w-5 h-5 ${userLocation ? 'text-blue-400' : 'text-slate-300'}`} />
          )}
        </button>

        {/* GPS Error Message Toast */}
        {gpsMessage && (
          <div className="absolute top-14 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-sm z-30 p-2.5 rounded-xl bg-amber-950/90 border border-amber-700/80 text-amber-200 text-xs font-bold flex items-center justify-between shadow-xl">
            <span>⚠️ {gpsMessage}</span>
            <button onClick={() => setGpsMessage(null)} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Real Road Navigation Floating Panel (Google Routes API) */}
        {(navigatingParty || isCalculatingNav || navRouteResult || navRoutingError) && (
          <div className="absolute top-14 left-3 right-3 sm:left-auto sm:right-3 sm:w-96 z-30 flex flex-col gap-2 pointer-events-none">
            <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border border-blue-500/50 shadow-2xl text-white space-y-2 pointer-events-auto">
              {/* Header: Destination & Close */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                    🛣️
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                      Google Routes API • Real Road Route
                    </div>
                    <div className="text-xs font-black text-white truncate">
                      {navigatingParty?.party_name || 'Party Route'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearNavigation}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Close Route"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode Selector & Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center bg-slate-950 rounded-xl p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setNavTravelMode('DRIVING');
                      if (navigatingParty) handleNavigateToParty(navigatingParty, 'DRIVING');
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                      navTravelMode === 'DRIVING'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Truck className="w-3 h-3" />
                    <span>Drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNavTravelMode('WALKING');
                      if (navigatingParty) handleNavigateToParty(navigatingParty, 'WALKING');
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                      navTravelMode === 'WALKING'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Footprints className="w-3 h-3" />
                    <span>Walk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNavTravelMode('BICYCLING');
                      if (navigatingParty) handleNavigateToParty(navigatingParty, 'BICYCLING');
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                      navTravelMode === 'BICYCLING'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Bike className="w-3 h-3" />
                    <span>Bicycle</span>
                  </button>
                </div>

                {navRouteResult && navRouteResult.steps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNavTurns(!showNavTurns)}
                    className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 ${
                      showNavTurns
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                    }`}
                  >
                    <Navigation className="w-3 h-3 text-blue-400" />
                    <span>{showNavTurns ? 'Hide' : `Turns (${navRouteResult.steps.length})`}</span>
                  </button>
                )}
              </div>

              {/* Calculating Loading State */}
              {isCalculatingNav && (
                <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-700/50 flex items-center gap-2 text-xs font-bold text-blue-200 animate-pulse">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  <span>Calculating real road route with Google Routes API...</span>
                </div>
              )}

              {/* Routing Error Notice */}
              {navRoutingError && (
                <div className="p-2 rounded-xl bg-red-950/80 border border-red-700/80 text-red-200 text-xs font-bold space-y-1">
                  <div className="flex items-center gap-1.5 text-red-300">
                    <span>⚠️ {navRoutingError}</span>
                  </div>
                  <div className="text-[10px] text-red-400 font-normal">
                    Real road route calculation failed. No straight lines are drawn. Please verify GPS coordinates or network connectivity.
                  </div>
                </div>
              )}

              {/* Route Summary (Distance & Duration) */}
              {navRouteResult && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-center">
                  <div className="p-1.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Distance</div>
                    <div className="text-sm font-black text-blue-400 font-mono">
                      {navRouteResult.distanceFormatted}
                    </div>
                  </div>
                  <div className="p-1.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Duration</div>
                    <div className="text-sm font-black text-emerald-400 font-mono">
                      {navRouteResult.durationFormatted}
                    </div>
                  </div>
                </div>
              )}

              {/* Turn-by-Turn Steps List */}
              {showNavTurns && navRouteResult && navRouteResult.steps.length > 0 && (
                <div className="pt-2 border-t border-slate-800 max-h-48 overflow-y-auto space-y-1 pr-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Turn-by-Turn Directions:
                  </div>
                  {navRouteResult.steps.map((st, i) => (
                    <div
                      key={i}
                      className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-200 flex items-start gap-2"
                    >
                      <span className="w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100">{st.instruction}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {st.distanceMeters > 0 ? (st.distanceMeters >= 1000 ? `${(st.distanceMeters / 1000).toFixed(1)} km` : `${st.distanceMeters} m`) : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Unmapped Parties Drawer / View when in 'unmapped' mode */}
        {filterMode === 'unmapped' && (
          <div className="absolute inset-0 z-20 flex flex-col bg-slate-900/95 backdrop-blur-md p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                  📍
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Set Party Pin (Manual GPS Setup)</h3>
                  <p className="text-[11px] text-slate-400">Click "Set Pin" on any party to tag its exact location on the map.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Return to Map ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 py-2 space-y-2">
              {filteredParties.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs font-bold">
                  No matching parties found.
                </div>
              ) : (
                filteredParties.slice(0, 100).map((p) => (
                  <div key={p.id} className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-all">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">{p.party_code || 'MARG'}</span>
                        <h4 className="text-xs font-black text-white truncate">{p.party_name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {p.address ? `${p.address}, ` : ''}{p.city || 'Gujarat'}
                        {p.route_1 ? ` • 🛣️ ${p.route_1}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerModalParty(p)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black shadow-md flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Set Pin</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Empty state overlay when no parties match */}
        {filteredParties.length === 0 && !loading && filterMode !== 'unmapped' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <div className="max-w-md p-6 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-black text-base text-white">
                {filterMode === 'with_cases'
                  ? 'No parties with cases found'
                  : 'No parties mapped on this view'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {filterMode === 'with_cases'
                  ? 'There are no pending cases in the selected route filter. Click below to view all parties.'
                  : 'Click below to manually tag party pins on the map.'}
              </p>
              {filterMode === 'with_cases' ? (
                <button
                  onClick={() => setFilterMode('all')}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Show All Parties</span>
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => setFilterMode('unmapped')}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>📍 Set Party Pin ({unmappedParties.length})</span>
                  </button>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('parties')}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      <span>Parties Directory</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. SELECTED PARTY BOTTOM COMPACT ACTION SHEET */}
        {selectedParty && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:left-auto sm:right-3 sm:max-w-md z-30 animate-slide-up select-none">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-2xl p-3 shadow-2xl text-white space-y-2">
              {/* Row 1: Code, Name, Distance & Close Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                    {selectedParty.party_code || 'MARG'}
                  </span>
                  <h3 className="font-black text-xs sm:text-sm text-white truncate">
                    {selectedParty.party_name}
                  </h3>
                  {navRouteResult && navigatingParty?.id === selectedParty.id ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono shrink-0">
                      🛣️ Road: {navRouteResult.distanceFormatted} ({navRouteResult.durationFormatted})
                    </span>
                  ) : getDistanceFromUser(selectedParty.id, selectedParty.latitude, selectedParty.longitude) ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono shrink-0">
                      🚗 {getDistanceFromUser(selectedParty.id, selectedParty.latitude, selectedParty.longitude)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedParty(null);
                    setPartyDetailsExpanded(false);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
                  aria-label="Close details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Row 2: Address snippet, Route & Cases Pill */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1 min-w-0 flex-1 truncate">
                  <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                  <span className="truncate">
                    {selectedParty.address || selectedParty.city || 'Location Tagged'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {selectedParty.route_1 && (
                    <span 
                      className="text-[9px] font-bold px-1.5 py-0.2 rounded border"
                      style={{ 
                        backgroundColor: `${getRouteColor(selectedParty.route_1)}20`,
                        borderColor: `${getRouteColor(selectedParty.route_1)}40`,
                        color: '#ffffff'
                      }}
                    >
                      R1: {selectedParty.route_1}
                    </span>
                  )}
                  {selectedParty.id && partyCasesMap[selectedParty.id] && (
                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      📦 {partyCasesMap[selectedParty.id].total_cases} cases
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPartyDetailsExpanded((prev) => !prev)}
                    className="text-[10px] font-bold text-blue-400 hover:underline px-1 py-0.5"
                  >
                    {partyDetailsExpanded ? 'Less' : 'More'}
                  </button>
                </div>
              </div>

              {/* Collapsible Extra Details (Lat, Lng & Case Breakdown) */}
              {partyDetailsExpanded && (
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] space-y-1.5">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-400">
                      GPS: {Number(selectedParty.latitude).toFixed(6)}, {Number(selectedParty.longitude).toFixed(6)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${selectedParty.latitude}, ${selectedParty.longitude}`);
                        setCopiedCoords(true);
                        setTimeout(() => setCopiedCoords(false), 2000);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      {copiedCoords ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      <span>{copiedCoords ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  {selectedParty.id && partyCasesMap[selectedParty.id]?.case_breakdown && partyCasesMap[selectedParty.id].case_breakdown!.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {partyCasesMap[selectedParty.id].case_breakdown!.map((b: any, i: number) => (
                        <span key={i} className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
                          {b.qty}x {b.type} {b.volume ? `(${b.volume})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Row 3: Action Buttons (Navigation & Location Management) */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                {/* Row 3A: Navigation & Operations (4 Buttons) */}
                <div className="grid grid-cols-4 gap-1.5">
                  {/* 1. Real Road Route on Map */}
                  <button
                    type="button"
                    onClick={() => handleNavigateToParty(selectedParty)}
                    className="py-1.5 px-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center cursor-pointer shadow-sm"
                    title="Google Routes API Real Road Route on map"
                  >
                    <Route className="w-3.5 h-3.5 shrink-0" />
                    <span>Road Route</span>
                  </button>

                  {/* 2. Route Optimizer */}
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('routes', { selectedParty })}
                      className="py-1.5 px-1 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center cursor-pointer shadow-sm"
                      title="Open in Route Optimizer"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Optimize</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {/* 3. Navigate (External Google Maps App) */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedParty.latitude},${selectedParty.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1.5 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center shadow-sm"
                    title="Open in Google Maps App"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>Google</span>
                  </a>

                  {/* 4. Print Envelope */}
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate('print', {
                          selectedParty,
                          deliveryRoute: selectedParty.route_1 || selectedParty.route,
                        })
                      }
                      className="py-1.5 px-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center cursor-pointer shadow-sm"
                      title="Print Envelope"
                    >
                      <Printer className="w-3.5 h-3.5 shrink-0" />
                      <span>Print</span>
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

                {/* Row 3B: Location Settings & Contact (4 Buttons) */}
                <div className="grid grid-cols-4 gap-1.5">
                  {/* 5. Change Pin */}
                  <button
                    type="button"
                    onClick={() => setPickerModalParty(selectedParty)}
                    className="py-1.5 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center cursor-pointer"
                    title="Change GPS Pin"
                  >
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    <span>Change Pin</span>
                  </button>

                  {/* 6. Unset Location Button */}
                  <button
                    type="button"
                    onClick={() => handleUnsetPartyLocation(selectedParty)}
                    className="py-1.5 px-1 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/60 font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center cursor-pointer"
                    title="Remove party location from map (Unset GPS Pin)"
                  >
                    <MapPinOff className="w-3.5 h-3.5 shrink-0" />
                    <span>Unset Pin</span>
                  </button>

                  {/* 7. Call Phone */}
                  {selectedParty.mobile_no ? (
                    <a
                      href={`tel:${selectedParty.mobile_no}`}
                      className="py-1.5 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center"
                      title={`Call (${selectedParty.mobile_no})`}
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>Call</span>
                    </a>
                  ) : (
                    <button disabled className="py-1.5 px-1 rounded-xl bg-slate-800/50 text-slate-500 font-bold text-[11px] flex items-center justify-center gap-1">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>Call</span>
                    </button>
                  )}

                  {/* 8. WhatsApp */}
                  {selectedParty.mobile_no ? (
                    <a
                      href={`https://wa.me/91${selectedParty.mobile_no
                        .replace(/\D/g, '')
                        .slice(-10)}?text=${encodeURIComponent(
                        `Shreeji Dispatch: Hello ${selectedParty.party_name}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-1 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-bold text-[11px] flex items-center justify-center gap-1 active:scale-95 transition-all text-center"
                      title="WhatsApp Message"
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>WhatsApp</span>
                    </a>
                  ) : (
                    <button disabled className="py-1.5 px-1 rounded-xl bg-slate-800/50 text-slate-500 font-bold text-[11px] flex items-center justify-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>WhatsApp</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. PINPOINT PICKER MODAL */}
      {pickerModalParty && (
        <PartyMapPickerModal
          isOpen={true}
          onClose={() => setPickerModalParty(null)}
          party={pickerModalParty}
          onSaved={handlePartySaved}
        />
      )}

      {/* 7. LOCATION PERMISSION POPUP */}
      <LocationPermissionModal
        isOpen={showLocationModal}
        onAllow={() => {
          setShowLocationModal(false);
          if (isAdminOrSuperAdmin) {
            handleLocateMe(true);
          }
        }}
        onDeny={() => setShowLocationModal(false)}
        appName="MARG Envelope Print Manager"
      />
    </div>
  );
};
