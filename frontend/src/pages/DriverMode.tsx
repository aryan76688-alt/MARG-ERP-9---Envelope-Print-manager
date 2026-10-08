import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  CheckCircle, 
  Clock, 
  Phone, 
  MessageSquare, 
  MapPin, 
  Camera, 
  PenTool, 
  RotateCcw, 
  Check, 
  Search, 
  Calendar, 
  RefreshCw,
  AlertCircle,
  Navigation,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { DriverStop, PODSubmission } from '../types';
import { fetchDriverJobs, recordPOD, fetchDriverList, updatePartyGeofence } from '../api/client';
import { queueOfflinePOD } from '../offline/db';
import { useNetworkSync } from '../offline/syncManager';
import { generateWhatsAppDispatchUrl } from '../utils/whatsapp';

export const DriverMode: React.FC = () => {
  const { isOnline, refreshPendingCount, triggerSync } = useNetworkSync();
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [driver, setDriver] = useState<string>('All');
  const [route, setRoute] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Delivered'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [stops, setStops] = useState<DriverStop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [driversList, setDriversList] = useState<string[]>([]);

  // Live GPS tracking state
  const [driverLocation, setDriverLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pinShopGeofence, setPinShopGeofence] = useState<boolean>(false);
  const [pinningPartyId, setPinningPartyId] = useState<number | null>(null);

  // POD Modal state
  const [selectedStop, setSelectedStop] = useState<DriverStop | null>(null);
  const [podNotes, setPodNotes] = useState<string>('');
  const [podPhotoBase64, setPodPhotoBase64] = useState<string | null>(null);
  const [submittingPOD, setSubmittingPOD] = useState<boolean>(false);
  const [podSuccessMsg, setPodSuccessMsg] = useState<string | null>(null);

  // Canvas Signature Pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasSignature, setHasSignature] = useState<boolean>(false);

  // Watch Driver GPS Location
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError('GPS not supported');
      setGpsLoading(false);
      return;
    }

    const updatePos = (pos: GeolocationPosition) => {
      setDriverLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy)
      });
      setGpsLoading(false);
      setGpsError(null);
    };

    const handleErr = (err: GeolocationPositionError) => {
      console.warn('GPS notice:', err.message);
      setGpsLoading(false);
      if (!driverLocation) {
        setGpsError(err.message || 'GPS location unavailable');
      }
    };

    navigator.geolocation.getCurrentPosition(updatePos, handleErr, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000
    });

    const watchId = navigator.geolocation.watchPosition(updatePos, handleErr, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Calculate distance in meters using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  // 1-Tap Pin Current GPS to Chemist
  const handleQuickPinLocation = async (stop: DriverStop, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!stop.party_id) return;
    if (!driverLocation) {
      alert('Please wait for GPS coordinates to be acquired before pinning.');
      return;
    }

    setPinningPartyId(stop.party_id);
    try {
      await updatePartyGeofence(stop.party_id, {
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        radius_meters: stop.geofence_radius_meters || 75
      });
      setStops(prev => prev.map(s => s.party_id === stop.party_id ? {
        ...s,
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        geofence_radius_meters: stop.geofence_radius_meters || 75
      } : s));
    } catch (err: any) {
      alert(err.message || 'Failed to pin pharmacy GPS location');
    } finally {
      setPinningPartyId(null);
    }
  };

  // Open modal and prep pin toggle
  const openPODModal = (stop: DriverStop) => {
    setSelectedStop(stop);
    // If party has no GPS coordinates yet, default auto-pin to true
    setPinShopGeofence(!stop.latitude || !stop.longitude);
  };

  // Load available drivers
  useEffect(() => {
    fetchDriverList()
      .then(res => setDriversList(res.drivers || []))
      .catch(() => {});
  }, []);

  // Fetch stops
  const loadStops = async () => {
    setLoading(true);
    try {
      const res = await fetchDriverJobs({
        date,
        driver: driver !== 'All' ? driver : undefined,
        route: route !== 'All' ? route : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined
      });
      setStops(res.stops || []);
    } catch (err) {
      console.warn('Failed to fetch driver jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStops();
  }, [date, driver, route, statusFilter]);

  // Signature Canvas Helpers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0284c7';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Handle Photo input
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image to max width 800px
        const maxDim = 800;
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
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setPodPhotoBase64(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Submit Proof of Delivery
  const handleRecordPOD = async () => {
    if (!selectedStop) return;
    setSubmittingPOD(true);

    let signatureData: string | undefined = undefined;
    if (canvasRef.current && hasSignature) {
      signatureData = canvasRef.current.toDataURL('image/png');
    }

    const podPayload: PODSubmission = {
      job_id: selectedStop.id,
      pod_signature: signatureData,
      pod_photo: podPhotoBase64 || undefined,
      pod_notes: podNotes.trim() || undefined,
      delivered_at: new Date().toISOString(),
      delivered_latitude: driverLocation?.lat ?? null,
      delivered_longitude: driverLocation?.lng ?? null,
      accuracy_meters: driverLocation?.accuracy ?? null,
      pin_shop_geofence: pinShopGeofence
    };

    let geofenceVerified: boolean | null = null;
    let distMeters: number | null = null;

    if (driverLocation && (selectedStop.latitude || pinShopGeofence) && (selectedStop.longitude || pinShopGeofence)) {
      const targetLat = pinShopGeofence ? driverLocation.lat : selectedStop.latitude!;
      const targetLng = pinShopGeofence ? driverLocation.lng : selectedStop.longitude!;
      distMeters = calculateDistance(driverLocation.lat, driverLocation.lng, targetLat, targetLng);
      geofenceVerified = distMeters <= (selectedStop.geofence_radius_meters || 75);
    }

    try {
      if (isOnline) {
        const res = await recordPOD({
          job_id: selectedStop.id,
          pod_signature: signatureData,
          pod_photo: podPhotoBase64 || undefined,
          pod_notes: podNotes.trim() || undefined,
          delivered_latitude: driverLocation?.lat ?? null,
          delivered_longitude: driverLocation?.lng ?? null,
          accuracy_meters: driverLocation?.accuracy ?? null,
          pin_shop_geofence: pinShopGeofence
        });
        if (res && res.geofence_verified !== undefined) {
          geofenceVerified = res.geofence_verified;
          distMeters = res.distance_from_geofence_meters;
        }
      } else {
        // Save to offline outbox
        await queueOfflinePOD(podPayload);
        await refreshPendingCount();
      }

      // Optimistically update the UI
      setStops(prev => prev.map(s => s.id === selectedStop.id ? {
        ...s,
        delivery_status: 'Delivered',
        delivered_at: new Date().toISOString(),
        pod_signature: signatureData,
        pod_photo: podPhotoBase64 || undefined,
        pod_notes: podNotes.trim() || undefined,
        delivered_latitude: driverLocation?.lat ?? null,
        delivered_longitude: driverLocation?.lng ?? null,
        latitude: pinShopGeofence && driverLocation?.lat ? driverLocation.lat : s.latitude,
        longitude: pinShopGeofence && driverLocation?.lng ? driverLocation.lng : s.longitude,
        geofence_verified: geofenceVerified,
        distance_from_geofence_meters: distMeters
      } : s));

      const pinNotice = pinShopGeofence ? ' (📍 GPS Pinned to Shop)' : '';
      setPodSuccessMsg(`Delivery recorded for ${selectedStop.party_name}!${pinNotice}`);
      setTimeout(() => {
        setSelectedStop(null);
        setPodSuccessMsg(null);
        setPodNotes('');
        setPodPhotoBase64(null);
        setHasSignature(false);
      }, 1300);

    } catch (err: any) {
      // Fallback to offline queue if server returned error
      await queueOfflinePOD(podPayload);
      await refreshPendingCount();
      setStops(prev => prev.map(s => s.id === selectedStop.id ? {
        ...s,
        delivery_status: 'Delivered',
        delivered_at: new Date().toISOString(),
        delivered_latitude: driverLocation?.lat ?? null,
        delivered_longitude: driverLocation?.lng ?? null,
        latitude: pinShopGeofence && driverLocation?.lat ? driverLocation.lat : s.latitude,
        longitude: pinShopGeofence && driverLocation?.lng ? driverLocation.lng : s.longitude,
        geofence_verified: geofenceVerified,
        distance_from_geofence_meters: distMeters
      } : s));
      setSelectedStop(null);
    } finally {
      setSubmittingPOD(false);
    }
  };

  // Filter stops by search query
  const filteredStops = stops.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toUpperCase();
    return (
      (s.party_name || '').toUpperCase().includes(q) ||
      (s.party_name_gu || '').toUpperCase().includes(q) ||
      (s.city || '').toUpperCase().includes(q) ||
      (s.address || '').toUpperCase().includes(q) ||
      (s.driver_name || '').toUpperCase().includes(q)
    );
  });

  const totalDelivered = stops.filter(s => s.delivery_status === 'Delivered').length;
  const totalPending = stops.length - totalDelivered;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Driver Mode
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Proof of Delivery
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                Live delivery route stops, real-time customer signatures, and proof of delivery
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { triggerSync(); loadStops(); }}
              className="px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Refresh Stops & Sync"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mt-6">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 md:p-4 text-center">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Stops</div>
            <div className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{stops.length}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 md:p-4 text-center">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Pending
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-amber-900 mt-1">{totalPending}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 md:p-4 text-center">
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center justify-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Delivered
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-emerald-900 mt-1">{totalDelivered}</div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-4 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Driver</label>
            <select
              value={driver}
              onChange={e => setDriver(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All Drivers</option>
              {driversList.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Only</option>
              <option value="Delivered">Delivered Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Search Stops</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search party or city..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stop Cards List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Loading route stops...</p>
          </div>
        ) : filteredStops.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-semibold text-lg">No delivery stops found</p>
            <p className="text-slate-500 text-sm mt-1">Check selected date, driver filter, or print jobs created today.</p>
          </div>
        ) : (
          filteredStops.map((stop, idx) => {
            const isDelivered = stop.delivery_status === 'Delivered';
            const waUrl = generateWhatsAppDispatchUrl({
              partyName: stop.party_name,
              partyNameGu: stop.party_name_gu || undefined,
              phone: stop.mobile,
              jobNumber: stop.job_number,
              totalCases: stop.total_cases,
              caseBreakdown: stop.case_breakdown,
              driverName: stop.driver_name,
              deliveryRoute: stop.delivery_route,
              city: stop.city
            });

            const hasCoordinates = Boolean(stop.latitude && stop.longitude);
            const mapsUrl = hasCoordinates 
              ? `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.address || ''} ${stop.city || ''}`)}`;

            return (
              <div 
                key={stop.id}
                className={`bg-white rounded-xl p-5 border transition-all shadow-sm ${
                  isDelivered 
                    ? 'border-emerald-200 bg-emerald-50/20' 
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                      isDelivered 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {isDelivered ? <Check className="w-5 h-5 text-emerald-700" /> : idx + 1}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">
                          {stop.party_name}
                        </h3>
                        {stop.party_name_gu && (
                          <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {stop.party_name_gu}
                          </span>
                        )}
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                          isDelivered 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isDelivered ? 'Delivered' : 'Pending'}
                        </span>
                      </div>

                      {/* Geofence and Live Distance status pill */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 pb-0.5">
                        {hasCoordinates && driverLocation ? (() => {
                          const dist = calculateDistance(driverLocation.lat, driverLocation.lng, stop.latitude!, stop.longitude!);
                          const radius = stop.geofence_radius_meters || 75;
                          if (dist <= 35) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                📍 {dist}m • At Store Counter
                              </span>
                            );
                          } else if (dist <= radius) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                📍 {dist}m • In Safety Zone (≤{radius}m)
                              </span>
                            );
                          } else {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                <Navigation className="w-3 h-3 text-slate-500" />
                                📍 {dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist}m`} away
                              </span>
                            );
                          }
                        })() : null}

                        {hasCoordinates ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            <span>Geofence: {stop.geofence_radius_meters || 75}m</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleQuickPinLocation(stop, e)}
                            disabled={pinningPartyId === stop.party_id}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 active:scale-95 transition-all"
                            title="Tap to pin driver's current GPS to this pharmacy"
                          >
                            <MapPin className="w-3 h-3 text-amber-600" />
                            <span>{pinningPartyId === stop.party_id ? 'Pinning...' : '📍 GPS Unpinned • 1-Tap Pin'}</span>
                          </button>
                        )}

                        {isDelivered && stop.geofence_verified !== null && stop.geofence_verified !== undefined && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            stop.geofence_verified 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}>
                            {stop.geofence_verified ? '✅ Counter Verified' : '⚠️ Flagged Off-site'}
                            {stop.distance_from_geofence_meters !== null ? ` (${Math.round(stop.distance_from_geofence_meters)}m)` : ''}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-600 flex items-start gap-1.5 pt-0.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          {stop.address}
                          {stop.address_line_2 ? `, ${stop.address_line_2}` : ''}
                          {stop.address_line_3 ? `, ${stop.address_line_3}` : ''}
                          {stop.city ? ` - ${stop.city}` : ''}
                        </span>
                      </p>

                      {/* Driver & Route Info */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
                        {stop.driver_name && (
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Driver:</span> {stop.driver_name}
                          </span>
                        )}
                        {stop.delivery_route && (
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Route:</span> {stop.delivery_route}
                          </span>
                        )}
                        <span>
                          <span className="font-semibold text-slate-700">Job:</span> {stop.job_number}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Case Count and Action Buttons */}
                  <div className="flex flex-col sm:flex-row md:flex-col items-end gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-center">
                        <div className="text-xs text-slate-500 uppercase font-semibold">Total Cases</div>
                        <div className="text-base font-bold text-slate-900">{stop.total_cases}</div>
                      </div>
                    </div>

                    {/* Quick Communication Actions */}
                    <div className="flex items-center gap-2">
                      {stop.mobile && (
                        <a
                          href={`tel:${stop.mobile}`}
                          className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-xs"
                          title="Call Party"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors shadow-xs"
                          title="WhatsApp Dispatch Alert"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </a>
                      )}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors shadow-xs"
                        title={hasCoordinates ? "Turn-by-turn Directions" : "Search in Maps"}
                      >
                        <Navigation className="w-4 h-4" />
                      </a>

                      {!isDelivered ? (
                        <button
                          onClick={() => openPODModal(stop)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                        >
                          <PenTool className="w-4 h-4" />
                          Mark Delivered
                        </button>
                      ) : (
                        <button
                          onClick={() => openPODModal(stop)}
                          className="px-3 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1 border border-emerald-200"
                        >
                          <CheckCircle className="w-4 h-4" />
                          View POD
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Case breakdown tags if present */}
                {stop.case_breakdown && stop.case_breakdown.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">Breakdown:</span>
                    {stop.case_breakdown.map((b, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {b.title || b.type}: {b.qty}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Proof of Delivery (POD) Modal */}
      {selectedStop && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  Proof of Delivery (POD)
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {selectedStop.party_name} ({selectedStop.job_number})
                </p>
              </div>
              <button
                onClick={() => setSelectedStop(null)}
                className="text-slate-400 hover:text-white text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {podSuccessMsg ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                  <p className="font-semibold text-sm">{podSuccessMsg}</p>
                </div>
              ) : selectedStop.delivery_status === 'Delivered' ? (
                /* View Recorded POD */
                <div className="space-y-4">
                  {/* Geofence Verification Status Card */}
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    selectedStop.geofence_verified
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : selectedStop.geofence_verified === false
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    {selectedStop.geofence_verified ? (
                      <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    ) : selectedStop.geofence_verified === false ? (
                      <AlertCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <MapPin className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {selectedStop.geofence_verified
                          ? '📍 Counter Verified Delivery'
                          : selectedStop.geofence_verified === false
                          ? '⚠️ Off-site Delivery Logged'
                          : '📍 Delivery Recorded'}
                      </h4>
                      <p className="text-xs mt-1">
                        {selectedStop.distance_from_geofence_meters !== null && selectedStop.distance_from_geofence_meters !== undefined
                          ? `Delivered ${Math.round(selectedStop.distance_from_geofence_meters)}m from chemist counter (Safety limit: ${selectedStop.geofence_radius_meters || 75}m).`
                          : 'Delivery location recorded.'}
                      </p>
                      {selectedStop.delivered_latitude && selectedStop.delivered_longitude && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${selectedStop.delivered_latitude},${selectedStop.delivered_longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-blue-700 hover:underline"
                        >
                          <Navigation className="w-3.5 h-3.5" /> View Recorded GPS Coordinates ({selectedStop.delivered_latitude.toFixed(5)}, {selectedStop.delivered_longitude.toFixed(5)})
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Recorded Timestamp & Receiver Details */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                    {selectedStop.delivered_at && (
                      <div><span className="font-semibold text-slate-900">Delivered At:</span> {new Date(selectedStop.delivered_at).toLocaleString()}</div>
                    )}
                    {selectedStop.pod_notes && (
                      <div><span className="font-semibold text-slate-900">Received By / Notes:</span> {selectedStop.pod_notes}</div>
                    )}
                    <div><span className="font-semibold text-slate-900">Total Cases:</span> {selectedStop.total_cases}</div>
                    {selectedStop.driver_name && (
                      <div><span className="font-semibold text-slate-900">Driver:</span> {selectedStop.driver_name}</div>
                    )}
                  </div>

                  {/* Customer Signature Display */}
                  {selectedStop.pod_signature && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                        Customer Signature
                      </label>
                      <div className="border border-slate-200 rounded-xl bg-white p-2">
                        <img 
                          src={selectedStop.pod_signature} 
                          alt="Customer Signature" 
                          className="h-28 mx-auto object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Delivery Photo Display */}
                  {selectedStop.pod_photo && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                        Parcel Delivery Photo
                      </label>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <img 
                          src={selectedStop.pod_photo} 
                          alt="Parcel Delivery Photo" 
                          className="w-full h-48 object-cover" 
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Live Geofence Assessment Banner */}
                  {selectedStop.latitude && selectedStop.longitude && driverLocation ? (() => {
                    const dist = calculateDistance(driverLocation.lat, driverLocation.lng, selectedStop.latitude, selectedStop.longitude);
                    const radius = selectedStop.geofence_radius_meters || 75;
                    const isInside = dist <= radius;
                    return (
                      <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        isInside 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}>
                        {isInside ? (
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-sm">
                            {isInside ? '📍 Verified Counter Location' : '⚠️ Outside Chemist Safety Zone'}
                          </div>
                          <div className="mt-0.5 leading-relaxed">
                            Driver is <span className="font-extrabold">{dist}m</span> away from chemist counter. 
                            {isInside ? ` Inside the ${radius}m geofence safety boundary.` : ` Exceeds ${radius}m geofence boundary. Delivery coordinates will be flagged for review.`}
                          </div>
                        </div>
                      </div>
                    );
                  })() : !selectedStop.latitude || !selectedStop.longitude ? (
                    <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/70 text-blue-900 text-xs flex items-start gap-2.5">
                      <Compass className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm">📍 First Delivery Auto-Pinning</div>
                        <div className="mt-0.5 leading-relaxed">
                          This pharmacy does not have a GPS boundary yet. Submitting delivery will automatically calibrate and pin this chemist's counter location!
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Chemist Auto-Pin Toggle */}
                  {driverLocation && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pinShopGeofence}
                        onChange={e => setPinShopGeofence(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800 block">
                          {(!selectedStop.latitude || !selectedStop.longitude) 
                            ? '📍 Auto-Pin Chemist GPS Location' 
                            : '🔄 Re-calibrate Chemist GPS Pin to Current Location'}
                        </span>
                        <span className="text-slate-500">
                          Save GPS ({driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}) as the official boundary
                        </span>
                      </div>
                    </label>
                  )}

                  {/* Delivery Stop Details Recap */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div><span className="font-semibold text-slate-800">Address:</span> {selectedStop.address}, {selectedStop.city}</div>
                    <div><span className="font-semibold text-slate-800">Total Cases:</span> {selectedStop.total_cases}</div>
                    {selectedStop.driver_name && (
                      <div><span className="font-semibold text-slate-800">Driver:</span> {selectedStop.driver_name}</div>
                    )}
                  </div>

                  {/* 1. Signature Pad */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <PenTool className="w-4 h-4 text-blue-600" />
                        Receiver's Signature
                      </label>
                      {hasSignature && (
                        <button
                          type="button"
                          onClick={clearSignature}
                          className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 font-semibold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Clear
                        </button>
                      )}
                    </div>

                    <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 overflow-hidden relative">
                      <canvas
                        ref={canvasRef}
                        width={460}
                        height={180}
                        className="w-full h-44 cursor-crosshair touch-none"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                      />
                      {!hasSignature && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs font-medium">
                          Sign here with finger or stylus
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Photo Upload / Camera Capture */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-blue-600" />
                      Delivery Photo (Optional)
                    </label>

                    {podPhotoBase64 ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200">
                        <img 
                          src={podPhotoBase64} 
                          alt="Delivery Proof" 
                          className="w-full h-44 object-cover" 
                        />
                        <button
                          type="button"
                          onClick={() => setPodPhotoBase64(null)}
                          className="absolute top-2 right-2 bg-rose-600 text-white text-xs px-2.5 py-1 rounded-md font-semibold shadow-md"
                        >
                          Remove Photo
                        </button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/20 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors">
                        <Camera className="w-6 h-6 text-slate-400 mb-1" />
                        <span className="text-xs font-semibold text-slate-700">Take Photo or Upload Image</span>
                        <span className="text-[11px] text-slate-400">Capture parcel at party location</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoCapture}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* 3. Receiver Name / Notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                      Received By / Remarks (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Bhai (Manager)"
                      value={podNotes}
                      onChange={e => setPodNotes(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Actions */}
            {!podSuccessMsg && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedStop(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-colors"
                >
                  {selectedStop.delivery_status === 'Delivered' ? 'Close' : 'Cancel'}
                </button>
                {selectedStop.delivery_status !== 'Delivered' && (
                  <button
                    type="button"
                    onClick={handleRecordPOD}
                    disabled={submittingPOD}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submittingPOD ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> Save Proof of Delivery
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default DriverMode;
