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
  Eye,
  EyeOff,
  Maximize,
  Minimize
} from 'lucide-react';
import { Party, LiveUserLocation } from '../types';
import { fetchParties, fetchDriverJobs, fetchLiveUserLocations, updateLiveLocation } from '../api/client';
import { getAllOfflineParties, updatePartyInOfflineCache } from '../offline/db';
import { PartyMapPickerModal } from '../components/PartyMapPickerModal';
import { LocationPermissionModal } from '../components/LocationPermissionModal';

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

  // Authenticated User Role
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const userRole = (currentUser?.role || 'employee').toLowerCase();
  const isAdminOrSuperAdmin = userRole === 'super_admin' || userRole === 'admin';

  // State Management
  const [parties, setParties] = useState<Party[]>([]);
  const [totalPartiesCount, setTotalPartiesCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  
  // Filters: All vs With Cases Only, and Route-wise
  const [filterMode, setFilterMode] = useState<'all' | 'with_cases'>('all');
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

  // Acquire high-accuracy live GPS location (only for admin / super_admin)
  const handleLocateMe = (flyToUser: boolean = true) => {
    if (!isAdminOrSuperAdmin) return;
    if (!navigator.geolocation) {
      setGpsMessage('આ ઉપકરણમાં GPS ઉપલબ્ધ નથી');
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
        setGpsMessage(`GPS મેળવી શકાયું નથી: ${err.message}`);
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
      if (isAdminOrSuperAdmin) {
        handleLocateMe(false);
      }

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          
          if (isAdminOrSuperAdmin) {
            setUserLocation(coords);
          }

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
  }, [isAdminOrSuperAdmin, showLocationModal]);

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
      const hasLat = p.latitude !== null && p.latitude !== undefined && !isNaN(Number(p.latitude));
      const hasLng = p.longitude !== null && p.longitude !== undefined && !isNaN(Number(p.longitude));
      return hasLat && hasLng;
    });
  }, [parties]);

  // Count parties that currently have active cases
  const partiesWithCasesCount = useMemo(() => {
    return setMapParties.filter((p) => p.id && partyCasesMap[p.id] && partyCasesMap[p.id].total_cases > 0).length;
  }, [setMapParties, partyCasesMap]);

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

  // Filter set parties by search query, route, and case toggle
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

      const hasCases = Boolean(p.id && partyCasesMap[p.id] && partyCasesMap[p.id].total_cases > 0);
      const matchesCaseFilter = filterMode === 'all' || (filterMode === 'with_cases' && hasCases);

      return matchesSearch && matchesRoute && matchesCaseFilter;
    });
  }, [setMapParties, search, selectedRoute, filterMode, partyCasesMap]);

  // Calculate live distance between user and destination (Only computed for admin)
  const getDistanceFromUser = (targetLat?: number | null, targetLng?: number | null) => {
    if (!isAdminOrSuperAdmin || !userLocation || !targetLat || !targetLng) return null;
    const R = 6371; // km
    const dLat = (Number(targetLat) - userLocation.lat) * (Math.PI / 180);
    const dLon = (Number(targetLng) - userLocation.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(userLocation.lat * (Math.PI / 180)) *
        Math.cos(Number(targetLat) * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    if (dist < 1) {
      return `${Math.round(dist * 1000)} મીટર`;
    }
    return `${dist.toFixed(1)} કિમી`;
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

  // Update user location on map (STRICT PRIVACY: ONLY for Super Admin and Admin)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isAdminOrSuperAdmin || !userLocation) {
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

      marker.bindTooltip('📍 તમારું વર્તમાન લાઈવ લોકેશન (Your Live GPS)', {
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
  }, [userLocation, isAdminOrSuperAdmin]);

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
        `<strong>🛵 ${staff.full_name} (${staff.role.toUpperCase()})</strong><br/>લાઈવ અપડેટ: ${new Date(staff.updated_at).toLocaleTimeString()}`,
        { direction: 'top', offset: [0, -32] }
      );

      marker.addTo(staffLayer);
    });
  }, [otherStaffLocations, isAdminOrSuperAdmin]);

  // Plot and update party markers whenever filtered parties or selection changes
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
      
      const primaryRoute = p.route_1 || p.route || p.route_2 || '';
      const routeColor = getRouteColor(primaryRoute);
      const partyCase = p.id ? partyCasesMap[p.id] : undefined;
      const casesCount = partyCase?.total_cases || 0;

      const marker = L.marker([lat, lng], {
        icon: createPartyMarkerIcon(p.party_code || '', isSelected, routeColor, casesCount),
        title: p.party_name_gu || p.party_name,
      });

      // Marker click handler
      marker.on('click', () => {
        setSelectedParty(p);
        map.flyTo([lat, lng], 16, { duration: 0.8 });
      });

      // Tooltip on hover
      marker.bindTooltip(
        `<strong>${p.party_code || ''}</strong>: ${p.party_name_gu || p.party_name}${
          casesCount > 0 ? ` <span style="color:#f59e0b;font-weight:bold;">(📦 ${casesCount} કેસ)</span>` : ''
        }${primaryRoute ? ` <br/><small style="color:#94a3b8;">🛣️ ${primaryRoute}</small>` : ''}`,
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
  }, [filteredParties, selectedParty?.id, partyCasesMap]);

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
    <div 
      ref={mapRootRef} 
      className={`flex flex-col h-full w-full bg-slate-950 text-white font-sans overflow-hidden select-none transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-[999999] w-screen h-screen' : ''
      }`}
    >
      {/* 1. TOP HEADER & FILTER BAR */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 shadow-md flex-shrink-0 space-y-2.5 z-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Title & Live Counter Badges */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-blue-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-sm text-white">પાર્ટી મેપ (All Parties Map)</h2>
                {isAdminOrSuperAdmin ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-purple-400" />
                    <span>એડમિન લાઈવ GPS સક્રિય</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    ડિસ્પેચ મોડ
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                કુલ {setMapParties.length} સેટ પાર્ટીઓ • {partiesWithCasesCount} પાર્ટીઓના કેસ ઉપલબ્ધ
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Fullscreen Button */}
            <button
              onClick={handleToggleFullscreen}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm ${
                isFullscreen 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
              title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Map'}
            >
              {isFullscreen ? (
                <>
                  <Minimize className="w-3.5 h-3.5 text-white" />
                  <span className="hidden sm:inline">સામાન્ય જુઓ</span>
                </>
              ) : (
                <>
                  <Maximize className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">પૂર્ણ સ્ક્રીન (Full Screen)</span>
                </>
              )}
            </button>

            {isAdminOrSuperAdmin && (
              <button
                onClick={() => handleLocateMe(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm"
                title="મારું વર્તમાન GPS લોકેશન બતાવો"
              >
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">મારું GPS</span>
              </button>
            )}
            <button
              onClick={handleFitAllMarkers}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm"
              title="બધી પિન કરેલી પાર્ટીઓ બતાવો"
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">બધા જુઓ</span>
            </button>
            <button
              onClick={loadParties}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all shadow-sm"
              title="રીફ્રેશ કરો"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 2. FILTER PILLS: SHOW ALL vs SHOW WITH CASES ONLY */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                filterMode === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>બધી પાર્ટીઓ ({setMapParties.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('with_cases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                filterMode === 'with_cases'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>કેસ વાળી પાર્ટીઓ ({partiesWithCasesCount})</span>
            </button>
          </div>

          {/* Quick Route Filter Dropdown */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-48">
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
              >
                <option value="all">🛣️ બધા રૂટ (All Routes)</option>
                {availableRoutes.map((r) => (
                  <option key={r} value={r}>
                    🛣️ {r}
                  </option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 3. SEARCH BAR */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="પાર્ટી શોધો (નામ, MARG કોડ, શહેર, રૂટ...)"
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

        {/* Quick POI Shortcuts: Petrol Pumps, Hotels & Food, Hospitals */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pt-0.5 pb-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">નજીકના સ્થળો:</span>
          <a
            href={
              userLocation
                ? `https://www.google.com/maps/search/petrol+pump/@${userLocation.lat},${userLocation.lng},14z`
                : 'https://www.google.com/maps/search/petrol+pump+near+me'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-xs"
          >
            <span>⛽ પેટ્રોલ પંપ</span>
          </a>
          <a
            href={
              userLocation
                ? `https://www.google.com/maps/search/hotels+restaurants/@${userLocation.lat},${userLocation.lng},14z`
                : 'https://www.google.com/maps/search/hotels+and+restaurants+near+me'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-xs"
          >
            <span>🏨 હોટેલ્સ & જમવાનું</span>
          </a>
          <a
            href={
              userLocation
                ? `https://www.google.com/maps/search/hospital+medical/@${userLocation.lat},${userLocation.lng},14z`
                : 'https://www.google.com/maps/search/hospital+near+me'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-xs"
          >
            <span>🏥 હોસ્પિટલ</span>
          </a>
        </div>
      </div>

      {/* 4. MAP VIEW CONTAINER */}
      <div className="relative flex-1 w-full bg-slate-950 overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

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

        {/* Live GPS Locate Me Button (Visible only to Admin & Super Admin) */}
        {isAdminOrSuperAdmin && (
          <button
            type="button"
            onClick={() => handleLocateMe(true)}
            className={`absolute ${selectedParty ? 'bottom-80 sm:bottom-72' : 'bottom-6'} right-3 z-20 w-11 h-11 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white shadow-2xl border border-slate-700/80 flex items-center justify-center active:scale-90 transition-all ${
              isLocating ? 'ring-2 ring-blue-500' : ''
            }`}
            title="મારું લાઈવ લોકેશન બતાવો (Center on My Location)"
          >
            {isLocating ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : (
              <Crosshair className={`w-5 h-5 ${userLocation ? 'text-blue-400' : 'text-slate-300'}`} />
            )}
          </button>
        )}

        {/* GPS Error Message Toast */}
        {gpsMessage && (
          <div className="absolute top-14 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-sm z-30 p-2.5 rounded-xl bg-amber-950/90 border border-amber-700/80 text-amber-200 text-xs font-bold flex items-center justify-between shadow-xl">
            <span>⚠️ {gpsMessage}</span>
            <button onClick={() => setGpsMessage(null)} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Empty state overlay when no parties match */}
        {filteredParties.length === 0 && !loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <div className="max-w-md p-6 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-black text-base text-white">
                {filterMode === 'with_cases'
                  ? 'કોઈ પાર્ટીના કેસ મળ્યા નથી'
                  : 'કોઈ પાર્ટી મેપ પર સેટ નથી'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {filterMode === 'with_cases'
                  ? 'હાલમાં પસંદ કરેલા રૂટમાં કોઈ પેન્ડિંગ કેસ નથી. બધી પાર્ટીઓ જોવા માટે "બધી પાર્ટીઓ" બટન દબાવો.'
                  : 'પાર્ટી લિસ્ટમાં જઈને પાર્ટી કાર્ડ પર "📍 મેપ પર પિન કરો" બટન દબાવો.'}
              </p>
              {filterMode === 'with_cases' ? (
                <button
                  onClick={() => setFilterMode('all')}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4" />
                  <span>બધી પાર્ટીઓ બતાવો (Show All Parties)</span>
                </button>
              ) : (
                onNavigate && (
                  <button
                    onClick={() => onNavigate('parties')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all inline-flex items-center gap-1.5"
                  >
                    <Users className="w-4 h-4" />
                    <span>પાર્ટી લિસ્ટ ખોલો (Open Parties)</span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* 5. SELECTED PARTY BOTTOM CARD */}
        {selectedParty && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-md z-30 animate-slide-up select-none">
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/90 rounded-3xl p-4 shadow-2xl text-white space-y-3">
              {/* Header: Code, City, Distance, Close */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {selectedParty.party_code || 'MARG'}
                  </span>
                  {selectedParty.city && (
                    <span className="text-xs font-bold text-slate-400 truncate">
                      • {selectedParty.city_gu || selectedParty.city}
                    </span>
                  )}
                  {isAdminOrSuperAdmin && getDistanceFromUser(selectedParty.latitude, selectedParty.longitude) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      🚗 {getDistanceFromUser(selectedParty.latitude, selectedParty.longitude)} દૂર
                    </span>
                  )}
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

              {/* Delivery Cases Details Banner (If party has cases) */}
              {selectedParty.id && partyCasesMap[selectedParty.id] && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center justify-between font-black">
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <Package className="w-4 h-4 text-amber-400" />
                      <span>કુલ કેસ (Total Cases): {partyCasesMap[selectedParty.id].total_cases}</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      partyCasesMap[selectedParty.id].delivery_status === 'Delivered'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    }`}>
                      {partyCasesMap[selectedParty.id].delivery_status === 'Delivered' ? '✅ ડિલિવર' : '⏳ પેન્ડિંગ'}
                    </span>
                  </div>

                  {partyCasesMap[selectedParty.id].driver_name && (
                    <div className="text-[11px] text-slate-300 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>ડ્રાઇવર: {partyCasesMap[selectedParty.id].driver_name}</span>
                    </div>
                  )}

                  {partyCasesMap[selectedParty.id].case_breakdown && partyCasesMap[selectedParty.id].case_breakdown!.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {partyCasesMap[selectedParty.id].case_breakdown!.map((b: any, i: number) => (
                        <span key={i} className="text-[10px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 text-slate-200">
                          {b.qty}x {b.type} {b.volume ? `(${b.volume})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Exact Latitude & Longitude with Copy Button */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-slate-400 font-sans font-bold text-[10px]">Lat, Lng:</span>
                  <span>{Number(selectedParty.latitude).toFixed(6)}, {Number(selectedParty.longitude).toFixed(6)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${selectedParty.latitude}, ${selectedParty.longitude}`);
                    setCopiedCoords(true);
                    setTimeout(() => setCopiedCoords(false), 2000);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-sans font-bold flex items-center gap-1 transition-all active:scale-95"
                  title="કોઓર્ડિનેટ્સ કોપી કરો"
                >
                  {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  <span>{copiedCoords ? 'કોપી થયું!' : 'કોપી'}</span>
                </button>
              </div>

              {/* Address */}
              {selectedParty.address && (
                <div className="text-xs text-slate-300 flex items-start gap-1.5 line-clamp-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <span>{selectedParty.address_gu || selectedParty.address}</span>
                </div>
              )}

              {/* Route tags with matching color */}
              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                {selectedParty.route_1 && (
                  <span 
                    className="px-2 py-0.5 rounded border"
                    style={{ 
                      backgroundColor: `${getRouteColor(selectedParty.route_1)}20`,
                      borderColor: `${getRouteColor(selectedParty.route_1)}40`,
                      color: '#ffffff'
                    }}
                  >
                    🛣️ R1: {selectedParty.route_1_gu || selectedParty.route_1}
                  </span>
                )}
                {selectedParty.route_2 && (
                  <span 
                    className="px-2 py-0.5 rounded border"
                    style={{ 
                      backgroundColor: `${getRouteColor(selectedParty.route_2)}20`,
                      borderColor: `${getRouteColor(selectedParty.route_2)}40`,
                      color: '#ffffff'
                    }}
                  >
                    🛣️ R2: {selectedParty.route_2_gu || selectedParty.route_2}
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
                  title="લાઈવ ટ્રાફિક અને સૌથી ઝડપી રૂટ સાથે ગૂગલ મેપ નેવિગેશન શરૂ કરો"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>🚗 સીધા જાઓ (લાઈવ ટ્રાફિક નેવિગેશન)</span>
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
