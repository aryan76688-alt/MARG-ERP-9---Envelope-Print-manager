import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import {
  Route,
  Navigation,
  MapPin,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Camera,
  Search,
  Filter,
  Truck,
  Phone,
  MessageCircle,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  Printer,
  Compass,
  Sparkles,
  ArrowRight,
  Footprints,
  Bike,
  Layers,
  Globe,
  Maximize,
  Minimize
} from 'lucide-react';
import { Party, PODSubmission } from '../types';
import { fetchParties, recordPOD, updatePartyGeofence } from '../api/client';
import { getAllOfflineParties, queueOfflinePOD } from '../offline/db';
import { useNetworkSync } from '../offline/syncManager';
import { calculateDistanceKm, formatDistanceString } from './NearestParties';
import { VoiceSearchInput } from '../components/VoiceSearchInput';
import {
  computeRoadRoute,
  RoadRouteResult,
  TravelMode,
  TurnStep
} from '../services/googleRoutesService';

interface RouteOptimizerProps {
  onNavigate?: (tab: string, state?: any) => void;
  onOpenPrintModal?: (party: Party) => void;
  initialParty?: Party | null;
  initialParties?: Party[] | null;
}

export interface OptimizedStop {
  stopNumber: number;
  party: Party;
  distanceFromPreviousKm: number;
  cumulativeDistanceKm: number;
  estimatedMinutes: number;
  deliveryStatus: 'Pending' | 'Delivered' | 'Closed' | 'Rescheduled';
  deliveredAt?: string;
  podPhoto?: string;
  podNotes?: string;
}

export const RouteOptimizer: React.FC<RouteOptimizerProps> = ({
  onNavigate,
  onOpenPrintModal,
  initialParty,
  initialParties
}) => {
  const { isOnline, refreshPendingCount } = useNetworkSync();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRoute, setSelectedRoute] = useState<string>('MONDAY');
  const [search, setSearch] = useState<string>('');
  
  // Starting location (Defaults to Shreeji Healthcare Naroda / Driver Live GPS)
  const defaultWarehouse = { lat: 23.0760, lng: 72.6750, label: 'Shreeji Healthcare (Naroda)' };
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Selected party IDs for optimization
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<number>>(new Set());
  const [optimizedStops, setOptimizedStops] = useState<OptimizedStop[]>([]);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // Google Maps Layer & Full-Screen State
  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // e-POD Modal State (Without Signature)
  const [activePodStop, setActivePodStop] = useState<OptimizedStop | null>(null);
  const [podStatus, setPodStatus] = useState<'Delivered' | 'Closed' | 'Rescheduled'>('Delivered');
  const [podPhotoBase64, setPodPhotoBase64] = useState<string | null>(null);
  const [podNotes, setPodNotes] = useState<string>('');
  const [isSubmittingPod, setIsSubmittingPod] = useState<boolean>(false);
  const [pinShopGps, setPinShopGps] = useState<boolean>(false);
  const [podSuccessMsg, setPodSuccessMsg] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);

  // Google Maps Real Road Directions State
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING');
  const [isComputingRoute, setIsComputingRoute] = useState<boolean>(false);
  const [roadRouteResult, setRoadRouteResult] = useState<RoadRouteResult | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [showTurnByTurn, setShowTurnByTurn] = useState<boolean>(false);

  // Flag to avoid overwriting custom initial parties when routes change
  const customSelectionAppliedRef = useRef<boolean>(false);

  // Current logged in user
  const currentUser = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const driverName: string = currentUser?.full_name || currentUser?.username || 'Driver';

  // Acquire Live GPS
  const requestLocation = (flyToUser: boolean = false) => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCurrentLocation({
          lat: latitude,
          lng: longitude,
          accuracy
        });
        setGpsLoading(false);
        if (flyToUser && mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 16, { animate: true });
        }
      },
      (err) => {
        setGpsError(err.message || 'Unable to retrieve your location.');
        setGpsLoading(false);
        // Fallback to warehouse location if no location
        if (!currentLocation) {
          setCurrentLocation({ lat: defaultWarehouse.lat, lng: defaultWarehouse.lng });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  // Load parties from API with offline fallback
  const loadParties = async () => {
    setLoading(true);
    try {
      const res = await fetchParties({ limit: -1 });
      if (res && res.items && res.items.length > 0) {
        setParties(res.items);
      } else {
        const off = await getAllOfflineParties();
        setParties(off);
      }
    } catch {
      const off = await getAllOfflineParties();
      setParties(off);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  // Distinct routes list
  const availableRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    parties.forEach((p) => {
      if (p.route_1) routeSet.add(p.route_1.trim().toUpperCase());
      if (p.route) routeSet.add(p.route.trim().toUpperCase());
    });
    const standardWeekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const customRoutes = Array.from(routeSet).filter((r) => !standardWeekdays.includes(r)).sort();
    return [...standardWeekdays, ...customRoutes];
  }, [parties]);

  // Parties eligible for routing (Filtered by route and has GPS or valid address)
  const routeParties = useMemo(() => {
    return parties.filter((p) => {
      // Must have GPS coordinates to be optimized on map
      const hasGps = p.latitude != null && p.longitude != null && !isNaN(Number(p.latitude)) && !isNaN(Number(p.longitude));
      if (!hasGps) return false;

      // Filter by route
      if (selectedRoute !== 'ALL') {
        const r1 = (p.route_1 || p.route || '').trim().toUpperCase();
        const r2 = (p.route_2 || '').trim().toUpperCase();
        const r3 = (p.route_3 || '').trim().toUpperCase();
        const sel = selectedRoute.toUpperCase();
        if (!r1.includes(sel) && !r2.includes(sel) && !r3.includes(sel)) return false;
      }

      // Keyword search
      if (search.trim()) {
        const q = search.trim().toUpperCase();
        const name = (p.party_name || '').toUpperCase();
        const code = (p.party_code || '').toUpperCase();
        const city = (p.city || '').toUpperCase();
        return name.includes(q) || code.includes(q) || city.includes(q);
      }

      return true;
    });
  }, [parties, selectedRoute, search]);

  // Priority Selection for Passed Party / Parties
  useEffect(() => {
    const targets: Party[] = [];
    if (initialParties && initialParties.length > 0) {
      targets.push(...initialParties);
    } else if (initialParty) {
      targets.push(initialParty);
    }

    if (targets.length === 0) return;

    customSelectionAppliedRef.current = true;
    setSelectedRoute('ALL');

    setParties((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const missing = targets.filter((t) => t.id && !existingIds.has(t.id));
      if (missing.length > 0) {
        return [...missing, ...prev];
      }
      return prev;
    });

    const ids = new Set<number>();
    targets.forEach((p) => {
      if (p.id) ids.add(p.id);
    });
    setSelectedPartyIds(ids);
  }, [initialParty, initialParties]);

  // Auto-select all parties on route selection change, unless custom selection is active
  useEffect(() => {
    if (customSelectionAppliedRef.current) return;
    const ids = new Set<number>();
    routeParties.forEach((p) => {
      if (p.id) ids.add(p.id);
    });
    setSelectedPartyIds(ids);
  }, [selectedRoute, parties]);

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

  const handleToggleMaximize = () => {
    setIsMaximized((prev) => !prev);
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 250);
  };

  const handleFitRoute = () => {
    if (!mapInstanceRef.current) return;
    if (roadRouteResult && roadRouteResult.path.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(roadRouteResult.path), { padding: [50, 50] });
    } else if (optimizedStops.length > 0) {
      const pts = optimizedStops
        .filter((s) => s.party.latitude && s.party.longitude)
        .map((s) => [Number(s.party.latitude), Number(s.party.longitude)] as [number, number]);
      if (currentLocation) pts.push([currentLocation.lat, currentLocation.lng]);
      if (pts.length > 0) {
        mapInstanceRef.current.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
      }
    }
  };

  // Nearest Neighbor Traveling Salesperson (TSP) Algorithm
  const runRouteOptimization = () => {
    if (routeParties.length === 0) return;
    setIsOptimizing(true);

    const candidates = routeParties.filter((p) => p.id && selectedPartyIds.has(p.id));
    if (candidates.length === 0) {
      setOptimizedStops([]);
      setIsOptimizing(false);
      return;
    }

    const startLat = currentLocation?.lat || defaultWarehouse.lat;
    const startLng = currentLocation?.lng || defaultWarehouse.lng;

    let unvisited = [...candidates];
    let currentLat = startLat;
    let currentLng = startLng;
    let cumulativeKm = 0;
    const sequence: OptimizedStop[] = [];

    let stopIndex = 1;
    while (unvisited.length > 0) {
      // Find closest unvisited party to current position
      let bestIdx = 0;
      let minDistance = calculateDistanceKm(
        currentLat,
        currentLng,
        Number(unvisited[0].latitude),
        Number(unvisited[0].longitude)
      );

      for (let i = 1; i < unvisited.length; i++) {
        const d = calculateDistanceKm(
          currentLat,
          currentLng,
          Number(unvisited[i].latitude),
          Number(unvisited[i].longitude)
        );
        if (d < minDistance) {
          minDistance = d;
          bestIdx = i;
        }
      }

      const nextParty = unvisited[bestIdx];
      cumulativeKm += minDistance;
      // Estimate minutes based on 25 km/h city traffic + 3 mins stop handling
      const estMins = Math.round((minDistance / 25) * 60) + 3;

      sequence.push({
        stopNumber: stopIndex,
        party: nextParty,
        distanceFromPreviousKm: minDistance,
        cumulativeDistanceKm: cumulativeKm,
        estimatedMinutes: estMins,
        deliveryStatus: 'Pending'
      });

      currentLat = Number(nextParty.latitude);
      currentLng = Number(nextParty.longitude);
      unvisited.splice(bestIdx, 1);
      stopIndex++;
    }

    setOptimizedStops(sequence);
    setIsOptimizing(false);
  };

  // Run initial optimization when route parties change
  useEffect(() => {
    if (routeParties.length > 0 && selectedPartyIds.size > 0) {
      runRouteOptimization();
    } else {
      setOptimizedStops([]);
    }
  }, [routeParties.length, selectedPartyIds.size]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLocation?.lat || defaultWarehouse.lat, currentLocation?.lng || defaultWarehouse.lng],
        zoom: 13,
        zoomControl: true
      });

      const initialLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        attribution: '&copy; Google Maps (Hotels, Petrol Pumps & Landmarks)',
        maxZoom: 20
      }).addTo(map);

      tileLayerRef.current = initialLayer;
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    // Add Driver start marker & Live accuracy circle
    const startLat = currentLocation?.lat || defaultWarehouse.lat;
    const startLng = currentLocation?.lng || defaultWarehouse.lng;

    if (currentLocation && currentLocation.accuracy) {
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setLatLng([startLat, startLng]);
        userAccuracyCircleRef.current.setRadius(currentLocation.accuracy);
      } else {
        userAccuracyCircleRef.current = L.circle([startLat, startLng], {
          radius: currentLocation.accuracy,
          color: '#2563eb',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(map);
      }
    }

    const startIcon = L.divIcon({
      className: 'driver-origin-marker',
      html: `
        <div style="background: #2563eb; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
          🚚
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    L.marker([startLat, startLng], { icon: startIcon })
      .bindPopup(`<strong>${currentLocation ? 'Live Location' : defaultWarehouse.label}</strong><br/>Route Start Point`)
      .addTo(markersLayer);

    const latLngs: L.LatLngExpression[] = [[startLat, startLng]];

    // Add numbered markers for each stop in sequence
    optimizedStops.forEach((stop) => {
      const pLat = Number(stop.party.latitude);
      const pLng = Number(stop.party.longitude);
      latLngs.push([pLat, pLng]);

      const isDelivered = stop.deliveryStatus === 'Delivered';
      const bgColor = isDelivered ? '#10b981' : '#f59e0b';

      const icon = L.divIcon({
        className: 'stop-sequence-marker',
        html: `
          <div style="position: relative; width: 38px; height: 46px; display: flex; flex-direction: column; align-items: center;">
            <div style="background: ${bgColor}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
              ${isDelivered ? '✓' : stop.stopNumber}
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${bgColor}; margin-top: -2px;"></div>
          </div>
        `,
        iconSize: [38, 46],
        iconAnchor: [19, 44]
      });

      const marker = L.marker([pLat, pLng], { icon }).addTo(markersLayer);
      marker.bindPopup(`
        <div style="min-width: 180px; font-family: sans-serif;">
          <div style="font-weight: 900; font-size: 13px; color: #0f172a;">#${stop.stopNumber} ${stop.party.party_name}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${stop.party.city || ''} • Route: ${stop.party.route_1 || selectedRoute}</div>
          <div style="font-size: 12px; font-weight: bold; color: #059669; margin-top: 4px;">Leg: ${formatDistanceString(stop.distanceFromPreviousKm)} (~${stop.estimatedMinutes}m)</div>
        </div>
      `);
    });

    // Calculate and draw REAL road-following route using Google Routes API
    // Never connects endpoints directly with straight lines
    if (optimizedStops.length > 0) {
      setIsComputingRoute(true);
      setRoutingError(null);

      const origin = {
        lat: startLat,
        lng: startLng,
        name: currentLocation ? 'Driver Live Location' : defaultWarehouse.label
      };
      const destStop = optimizedStops[optimizedStops.length - 1];
      const destination = {
        lat: Number(destStop.party.latitude),
        lng: Number(destStop.party.longitude),
        name: destStop.party.party_name
      };

      const intermediateStops = optimizedStops.slice(0, -1).map((s) => ({
        lat: Number(s.party.latitude),
        lng: Number(s.party.longitude),
        name: s.party.party_name
      }));

      computeRoadRoute({
        origin,
        destination,
        intermediates: intermediateStops,
        travelMode
      })
        .then((result) => {
          setRoadRouteResult(result);
          setIsComputingRoute(false);

          if (!mapInstanceRef.current) return;
          if (polylineRef.current) {
            mapInstanceRef.current.removeLayer(polylineRef.current);
            polylineRef.current = null;
          }

          // Draw real road polyline following actual streets, bends, and turns
          polylineRef.current = L.polyline(result.path, {
            color: '#2563eb',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(mapInstanceRef.current);

          // Fit bounds to calculated road path
          const bounds = L.latLngBounds(result.path);
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        })
        .catch((err: any) => {
          console.error('Road routing calculation error:', err);
          setIsComputingRoute(false);
          setRoadRouteResult(null);
          setRoutingError(err.message || 'Could not calculate real road route. Never drawing straight line.');

          // Specification Requirement: Never silently substitute a straight line for a failed route!
          if (polylineRef.current && mapInstanceRef.current) {
            mapInstanceRef.current.removeLayer(polylineRef.current);
            polylineRef.current = null;
          }
          if (latLngs.length > 1 && mapInstanceRef.current) {
            mapInstanceRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
          }
        });
    } else {
      setRoadRouteResult(null);
      setRoutingError(null);
    }
  }, [optimizedStops, currentLocation, travelMode]);

  // Google Maps Multi-Stop Route Export URL
  const googleMapsUrl = useMemo(() => {
    if (optimizedStops.length === 0) return null;
    const startLat = currentLocation?.lat || defaultWarehouse.lat;
    const startLng = currentLocation?.lng || defaultWarehouse.lng;

    const origin = `${startLat},${startLng}`;
    const lastStop = optimizedStops[optimizedStops.length - 1];
    const destination = `${lastStop.party.latitude},${lastStop.party.longitude}`;

    // Google Maps allows up to 9 intermediate waypoints in standard query
    const intermediateStops = optimizedStops.slice(0, optimizedStops.length - 1).slice(0, 9);
    const waypoints = intermediateStops
      .filter((s) => s.party.latitude && s.party.longitude)
      .map((s) => `${s.party.latitude},${s.party.longitude}`)
      .join('|');

    const waypointsParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=driving`;
  }, [optimizedStops, currentLocation]);

  // Toggle single party selection
  const toggleParty = (partyId: number) => {
    const next = new Set(selectedPartyIds);
    if (next.has(partyId)) {
      next.delete(partyId);
    } else {
      next.add(partyId);
    }
    setSelectedPartyIds(next);
  };

  // Select / Deselect All
  const toggleSelectAll = () => {
    if (selectedPartyIds.size === routeParties.length) {
      setSelectedPartyIds(new Set());
    } else {
      const ids = new Set<number>();
      routeParties.forEach((p) => {
        if (p.id) ids.add(p.id);
      });
      setSelectedPartyIds(ids);
    }
  };

  // Handle Photo Capture for e-POD (Auto-compress JPEG)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          setPodPhotoBase64(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Submit e-POD (No digital signature needed)
  const handleSubmitPOD = async () => {
    if (!activePodStop) return;
    setIsSubmittingPod(true);

    const payload: PODSubmission = {
      job_id: activePodStop.party.id,
      delivered_by: driverName,
      pod_photo: podPhotoBase64 || undefined,
      pod_notes: podNotes.trim() || undefined,
      delivered_at: new Date().toISOString(),
      delivered_latitude: currentLocation?.lat ?? null,
      delivered_longitude: currentLocation?.lng ?? null,
      pin_shop_geofence: pinShopGps
    };

    try {
      if (isOnline) {
        await recordPOD(payload);
      } else {
        await queueOfflinePOD(payload);
        await refreshPendingCount();
      }

      // Auto-pin GPS coordinates to party if toggled
      if (pinShopGps && currentLocation && activePodStop.party.id) {
        await updatePartyGeofence(activePodStop.party.id, {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          radius_meters: 75
        });
      }

      // Update state
      setOptimizedStops((prev) =>
        prev.map((s) =>
          s.party.id === activePodStop.party.id
            ? {
                ...s,
                deliveryStatus: podStatus === 'Delivered' ? 'Delivered' : podStatus === 'Closed' ? 'Closed' : 'Rescheduled',
                deliveredAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                podPhoto: podPhotoBase64 || undefined,
                podNotes: podNotes || undefined
              }
            : s
        )
      );

      setPodSuccessMsg(`Marked as ${podStatus} for ${activePodStop.party.party_name}!`);
      setTimeout(() => {
        setActivePodStop(null);
        setPodSuccessMsg(null);
        setPodPhotoBase64(null);
        setPodNotes('');
      }, 1200);
    } catch (err: any) {
      alert(err.message || 'Failed to record proof of delivery');
    } finally {
      setIsSubmittingPod(false);
    }
  };

  const totalTripKm = optimizedStops.length > 0 ? optimizedStops[optimizedStops.length - 1].cumulativeDistanceKm : 0;
  const totalEstimatedMins = optimizedStops.reduce((sum, s) => sum + s.estimatedMinutes, 0);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-28 font-sans">
      {/* 1. TOP HEADER & METRICS BAR */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Route className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">Delivery Route Optimizer</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  TSP Shortest Path
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Automatically calculates the shortest driving sequence for pharmacies on your delivery route.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Total Stops</p>
              <p className="text-lg font-black text-white">{optimizedStops.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Road Distance</p>
              <p className="text-lg font-black text-emerald-400">
                {roadRouteResult ? roadRouteResult.distanceFormatted : formatDistanceString(totalTripKm)}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Road Time</p>
              <p className="text-lg font-black text-amber-300">
                {roadRouteResult ? roadRouteResult.durationFormatted : `~${Math.round(totalEstimatedMins)} m`}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Route Selector */}
            <select
              value={selectedRoute}
              onChange={(e) => {
                customSelectionAppliedRef.current = false;
                setSelectedRoute(e.target.value);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="ALL" className="text-slate-900">All Delivery Routes (બધા રૂટ)</option>
              {availableRoutes.map((r) => (
                <option key={r} value={r} className="text-slate-900">
                  {r} Delivery Route
                </option>
              ))}
            </select>

            {/* Live GPS status */}
            <button
              onClick={() => requestLocation(true)}
              disabled={gpsLoading}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh live GPS location"
            >
              <Compass className={`w-3.5 h-3.5 text-emerald-400 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>{gpsLoading ? 'Locating...' : currentLocation ? 'GPS Locked' : 'Detect GPS'}</span>
            </button>
          </div>

          {/* Google Maps Multi-Stop Export */}
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
            >
              <Navigation className="w-4 h-4" />
              <span>ગૂગલ મેપ્સમાં આખો રૂટ જુઓ (Google Maps)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* 2. SEARCH & SELECTION FILTERS */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-md">
          <VoiceSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search party or speak to filter..."
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            {selectedPartyIds.size === routeParties.length ? 'Deselect All' : `Select All (${routeParties.length})`}
          </button>

          <button
            onClick={runRouteOptimization}
            disabled={isOptimizing}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Re-Optimize (ફરી ગણો)</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT: INTERACTIVE MAP & SEQUENCED STOPS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* MAP COLUMN */}
        <div
          className={`transition-all duration-300 ${
            isMaximized
              ? 'lg:col-span-12 h-[calc(100vh-140px)] min-h-[520px]'
              : 'lg:col-span-7 h-[420px] sm:h-[560px]'
          } bg-slate-900 rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden relative`}
        >
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Navigation & Travel Mode Controls */}
          <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Travel Mode Selector */}
            <div className="flex items-center bg-slate-900/90 backdrop-blur-md rounded-xl p-1 border border-slate-700 shadow-lg pointer-events-auto">
              <button
                type="button"
                onClick={() => setTravelMode('DRIVING')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  travelMode === 'DRIVING'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Google Maps Driving Mode (Default)"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Drive</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('WALKING')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  travelMode === 'WALKING'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Google Maps Walking Mode"
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>Walk</span>
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('BICYCLING')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  travelMode === 'BICYCLING'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Google Maps Bicycling Mode"
              >
                <Bike className="w-3.5 h-3.5" />
                <span>Bike</span>
              </button>
            </div>

            {/* Right Tools Group: Layer Switcher, Locate Me, Fit Bounds, Maximize, Turns */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl p-1 border border-slate-700 shadow-lg pointer-events-auto">
              {/* Tile Mode Switcher */}
              <button
                type="button"
                onClick={() => switchTileLayer(mapMode === 'streets' ? 'satellite' : 'streets')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer"
                title={mapMode === 'streets' ? 'Switch to Google Satellite Hybrid' : 'Switch to Google Roadmap'}
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>{mapMode === 'streets' ? 'સેટેલાઇટ' : 'ગૂગલ મેપ'}</span>
              </button>

              {/* Locate Me */}
              <button
                type="button"
                onClick={() => requestLocation(true)}
                disabled={gpsLoading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition-all cursor-pointer"
                title="મારું GPS લોકેશન (Locate Me)"
              >
                <Compass className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
              </button>

              {/* Fit Route */}
              <button
                type="button"
                onClick={handleFitRoute}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
                title="આખો રૂટ ફિટ કરો (Fit Route)"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>

              {/* Fullscreen / Maximize */}
              <button
                type="button"
                onClick={handleToggleMaximize}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-all cursor-pointer"
                title={isMaximized ? 'સામાન્ય કદ' : 'મોટો નકશો'}
              >
                {isMaximized ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>

              {/* Turn-by-Turn Directions Button */}
              {roadRouteResult && roadRouteResult.steps.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTurnByTurn(!showTurnByTurn)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    showTurnByTurn
                      ? 'bg-blue-600 text-white border-blue-500 shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <Navigation className="w-3 h-3 inline mr-1 text-blue-400" />
                  <span>{showTurnByTurn ? 'Hide' : `Turns (${roadRouteResult.steps.length})`}</span>
                </button>
              )}
            </div>
          </div>

          {/* Calculating Loading Overlay */}
          {isComputingRoute && (
            <div className="absolute inset-x-4 top-16 z-[1000] p-3 rounded-xl bg-slate-900/90 text-white backdrop-blur-md border border-slate-700 shadow-xl flex items-center justify-between text-xs font-bold animate-pulse">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span>Calculating real road route with Google Routes API...</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">Real-Road Geometry</span>
            </div>
          )}

          {/* Routing Error Notice */}
          {routingError && (
            <div className="absolute inset-x-4 top-16 z-[1000] p-3 rounded-xl bg-red-950/95 text-red-200 backdrop-blur-md border border-red-700/80 shadow-xl flex items-center gap-2.5 text-xs font-bold">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1">
                <div>{routingError}</div>
                <div className="text-[10px] text-red-400 font-normal mt-0.5">
                  Straight-line substitute blocked. Please check destination coordinates or internet connection.
                </div>
              </div>
            </div>
          )}

          {/* Turn-by-Turn Navigation Overlay Panel */}
          {showTurnByTurn && roadRouteResult && (
            <div className="absolute top-16 right-3 bottom-14 w-80 max-w-[85%] z-[1000] bg-slate-900/95 backdrop-blur-md text-white rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-400" />
                  <span className="font-black text-xs">Turn-by-Turn Instructions</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTurnByTurn(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="p-2.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-[11px] font-bold">
                <span className="text-emerald-400">🛣️ {roadRouteResult.distanceFormatted}</span>
                <span className="text-amber-300">⏱️ {roadRouteResult.durationFormatted}</span>
                <span className="text-slate-400 capitalize">{roadRouteResult.travelMode.toLowerCase()}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/40 text-xs">
                {roadRouteResult.steps.map((step, idx) => (
                  <div key={idx} className="pt-2 first:pt-0">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium text-slate-200 text-[11px] leading-tight"
                          dangerouslySetInnerHTML={{ __html: step.instruction }}
                        />
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                          <span>{step.distanceFormatted}</span>
                          <span>•</span>
                          <span>{step.durationFormatted}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map Marker Legend */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-md text-[11px] font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Start
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Pending Stop
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Delivered
          </div>
        </div>

        {/* STOPS LIST COLUMN */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
          {optimizedStops.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <Truck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">No parties selected for this route.</p>
              <p className="text-xs text-slate-400 mt-1">Select a route with GPS tagged parties to optimize.</p>
            </div>
          ) : (
            optimizedStops.map((stop) => {
              const isDelivered = stop.deliveryStatus === 'Delivered';
              const p = stop.party;
              const directNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
              const phoneNumbers = (p.mobile_no || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isDelivered
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-blue-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Stop Sequence Number Badge */}
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                          isDelivered
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 text-white shadow-xs'
                        }`}
                      >
                        {isDelivered ? '✓' : stop.stopNumber}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-slate-900 text-sm truncate" title={p.party_name}>
                            {p.party_name}
                          </h4>
                          {p.party_name_gu && (
                            <span className="text-xs font-bold text-slate-500">
                              ({p.party_name_gu})
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                            {p.party_code}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mt-0.5 truncate">{p.address || p.city}</p>

                        {/* Quick Contact Numbers (Call & WhatsApp) */}
                        {phoneNumbers.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {phoneNumbers.map((phone, pIdx) => {
                              const cleanPhone = phone.replace(/[^0-9]/g, '');
                              const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                              return (
                                <div
                                  key={pIdx}
                                  className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-700 transition-colors"
                                >
                                  <span className="font-mono">{phone}</span>
                                  <a
                                    href={`tel:${cleanPhone}`}
                                    className="p-0.5 text-blue-600 hover:text-blue-800"
                                    title={`Call ${phone}`}
                                  >
                                    <Phone className="w-3 h-3" />
                                  </a>
                                  <a
                                    href={`https://wa.me/${waPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-0.5 text-emerald-600 hover:text-emerald-800"
                                    title={`WhatsApp ${phone}`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 mt-1.5 flex-wrap">
                          <span className="text-emerald-700 font-bold">
                            +{formatDistanceString(stop.distanceFromPreviousKm)}
                          </span>
                          <span>•</span>
                          <span>Cumul: {formatDistanceString(stop.cumulativeDistanceKm)}</span>
                          <span>•</span>
                          <span>~{stop.estimatedMinutes} mins</span>
                        </div>
                      </div>
                    </div>

                    {/* Checkbox toggle */}
                    <input
                      type="checkbox"
                      checked={p.id ? selectedPartyIds.has(p.id) : false}
                      onChange={() => p.id && toggleParty(p.id)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer mt-1"
                    />
                  </div>

                  {/* Actions Bar per Stop */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 1-Tap Google Maps Navigation */}
                      <a
                        href={directNavUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-shreeji-blue font-bold text-xs flex items-center gap-1 border border-blue-200 transition-colors"
                      >
                        <Navigation className="w-3 h-3 text-shreeji-blue" />
                        <span>Google Go</span>
                      </a>

                      {/* Print Envelope Modal Trigger */}
                      {onOpenPrintModal && (
                        <button
                          type="button"
                          onClick={() => onOpenPrintModal(p)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Printer className="w-3 h-3 text-slate-600" />
                          <span>Print</span>
                        </button>
                      )}
                    </div>

                    {/* e-POD Record Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setActivePodStop(stop);
                        setPodStatus('Delivered');
                        setPodPhotoBase64(null);
                        setPodNotes('');
                      }}
                      className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                        isDelivered
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isDelivered ? 'Proof Saved' : 'Mark Delivered (POD)'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. e-POD MODAL (OPTION B: WITHOUT SIGNATURE) */}
      {activePodStop && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Digital Proof of Delivery (e-POD)</h3>
                  <p className="text-[10px] text-slate-400 font-mono">No customer signature required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePodStop(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Target Chemist Info */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <p className="font-black text-slate-900 text-sm">{activePodStop.party.party_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{activePodStop.party.party_code} • {activePodStop.party.city}</p>
            </div>

            {/* Status Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Delivery Status</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'Delivered' as const, label: 'Delivered', color: 'bg-emerald-600 text-white' },
                  { id: 'Closed' as const, label: 'Shop Closed', color: 'bg-amber-600 text-white' },
                  { id: 'Rescheduled' as const, label: 'Reschedule', color: 'bg-slate-700 text-white' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setPodStatus(st.id)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center cursor-pointer ${
                      podStatus === st.id
                        ? `${st.color} shadow-xs scale-102`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Capture (Shop front / Parcel / Stamp) */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Delivery Photo (Shop / Bill / Packet)
              </label>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
              />

              {podPhotoBase64 ? (
                <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 max-h-48 group">
                  <img src={podPhotoBase64} alt="POD Proof" className="w-full h-44 object-cover" />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="absolute bottom-2 right-2 px-3 py-1 rounded-lg bg-black/70 hover:bg-black text-white text-xs font-bold flex items-center gap-1 shadow-md"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-take
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 text-slate-600 hover:text-emerald-700 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Camera className="w-7 h-7 text-emerald-600" />
                  <span className="text-xs font-bold">Tap to Take Delivery Photo</span>
                  <span className="text-[10px] text-slate-400">Opens phone camera directly</span>
                </button>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Notes (Optional)</label>
              <input
                type="text"
                value={podNotes}
                onChange={(e) => setPodNotes(e.target.value)}
                placeholder="e.g. Handed to assistant, Cash received ₹500..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Optional Pin Shop GPS Toggle */}
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-100 cursor-pointer">
              <input
                type="checkbox"
                checked={pinShopGps}
                onChange={(e) => setPinShopGps(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-xs text-blue-900 font-semibold">
                Pin current GPS coordinates to this shop
              </span>
            </label>

            {/* Submit Button */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setActivePodStop(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitPOD}
                disabled={isSubmittingPod}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                {isSubmittingPod ? 'Saving...' : 'Save e-POD Proof'}
              </button>
            </div>

            {podSuccessMsg && (
              <p className="text-xs text-emerald-600 font-bold text-center animate-fade-in">{podSuccessMsg}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
