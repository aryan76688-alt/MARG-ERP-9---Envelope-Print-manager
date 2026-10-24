import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  CheckCircle, 
  Clock, 
  Phone, 
  MessageSquare, 
  MapPin, 
  Camera, 
  RotateCcw, 
  Check, 
  Search, 
  Calendar, 
  RefreshCw,
  AlertCircle,
  Navigation,
  ShieldCheck,
  Compass,
  User,
  Gauge,
  CheckSquare,
  IndianRupee,
  Play,
  Square,
  Key
} from 'lucide-react';
import { DriverStop, PODSubmission, FleetVehicle, FleetTrip } from '../types';
import { 
  fetchDriverJobs, 
  recordPOD, 
  fetchDriverList, 
  updatePartyGeofence,
  fetchFleetVehicles,
  fetchActiveFleetTrips,
  startFleetTrip,
  endFleetTrip
} from '../api/client';
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

  // Current logged in user profile for delivery attribution
  const currentUser = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const currentUserName: string = currentUser?.full_name || currentUser?.username || 'Driver';

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

  // Fleet & Active Trip State
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [activeTrip, setActiveTrip] = useState<FleetTrip | null>(null);
  const [startTripModalOpen, setStartTripModalOpen] = useState<boolean>(false);
  const [endTripModalOpen, setEndTripModalOpen] = useState<boolean>(false);
  const [startOdoInput, setStartOdoInput] = useState<string>('');
  const [endOdoInput, setEndOdoInput] = useState<string>('');
  const [tripRouteInput, setTripRouteInput] = useState<string>('Daily Medicine Route');
  const [cashCollectedInput, setCashCollectedInput] = useState<string>('');
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [tripSubmitting, setTripSubmitting] = useState<boolean>(false);

  // Direct Mobile Camera Input Ref
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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
      const spd = pos.coords.speed && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 3.6) : 0;
      setCurrentSpeedKmh(spd);
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

  // Open modal and prep camera / pin toggle
  const openPODModal = (stop: DriverStop, autoCamera: boolean = false) => {
    setSelectedStop(stop);
    setPodNotes('');
    setPodPhotoBase64(null);
    setPodSuccessMsg(null);
    // If party has no GPS coordinates yet, default auto-pin to true
    setPinShopGeofence(!stop.latitude || !stop.longitude);

    if (autoCamera && stop.delivery_status !== 'Delivered') {
      setTimeout(() => {
        cameraInputRef.current?.click();
      }, 150);
    }
  };

  // Load available drivers and fleet vehicles
  const loadFleetData = async () => {
    try {
      const vRes = await fetchFleetVehicles();
      setVehicles(vRes.vehicles || []);
      if (vRes.vehicles && vRes.vehicles.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vRes.vehicles[0].id);
      }

      const tRes = await fetchActiveFleetTrips();
      const myTrip = (tRes.trips || []).find((t: any) => 
        t.driver_name === currentUserName || t.driver_id === currentUser?.id
      );
      if (myTrip) {
        setActiveTrip(myTrip);
        if (myTrip.vehicle_id) setSelectedVehicleId(myTrip.vehicle_id);
        // Sync with Android Bridge if running in APK
        if ((window as any).AndroidBridge?.setActiveTrip && myTrip.vehicle_id) {
          (window as any).AndroidBridge.setActiveTrip(myTrip.id, myTrip.vehicle_id);
        }
      } else {
        setActiveTrip(null);
      }
    } catch (err) {
      console.warn('Failed to load fleet data:', err);
    }
  };

  useEffect(() => {
    fetchDriverList()
      .then(res => setDriversList(res.drivers || []))
      .catch(() => {});
    loadFleetData();
  }, []);

  // Start Trip Handler
  const handleStartTrip = async () => {
    if (!selectedVehicleId) {
      alert('Please select a vehicle first.');
      return;
    }
    const veh = vehicles.find(v => v.id === selectedVehicleId);
    const startOdo = parseFloat(startOdoInput) || (veh?.odometer_km || 0);
    const partyIds = stops.map(s => s.party_id).filter((id): id is number => typeof id === 'number');

    setTripSubmitting(true);
    try {
      const res = await startFleetTrip({
        vehicle_id: selectedVehicleId,
        route_name: tripRouteInput.trim() || 'Daily Route',
        start_odometer_km: startOdo,
        party_ids: partyIds,
        start_latitude: driverLocation?.lat,
        start_longitude: driverLocation?.lng,
        notes: `Started by ${currentUserName}`
      });

      if ((window as any).AndroidBridge?.setActiveTrip) {
        (window as any).AndroidBridge.setActiveTrip(res.trip_id, selectedVehicleId);
      }

      setStartTripModalOpen(false);
      await loadFleetData();
    } catch (err: any) {
      alert(err.message || 'Failed to start trip');
    } finally {
      setTripSubmitting(false);
    }
  };

  // End Trip Handler
  const handleEndTrip = async () => {
    if (!activeTrip) return;
    const endOdo = parseFloat(endOdoInput);
    if (!endOdo || endOdo < activeTrip.start_odometer_km) {
      alert(`Final odometer must be at least ${activeTrip.start_odometer_km} km.`);
      return;
    }

    setTripSubmitting(true);
    try {
      await endFleetTrip(activeTrip.id, {
        end_odometer_km: endOdo,
        end_latitude: driverLocation?.lat,
        end_longitude: driverLocation?.lng,
        notes: `Trip completed by ${currentUserName}`
      });

      if ((window as any).AndroidBridge?.clearActiveTrip) {
        (window as any).AndroidBridge.clearActiveTrip();
      }

      setEndTripModalOpen(false);
      setActiveTrip(null);
      setEndOdoInput('');
      await loadFleetData();
    } catch (err: any) {
      alert(err.message || 'Failed to complete trip');
    } finally {
      setTripSubmitting(false);
    }
  };

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

  // Handle Photo input (Compress to high quality web jpeg)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image to max width 900px
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
    // Reset file input value so re-taking the photo works smoothly
    e.target.value = '';
  };

  // Submit Proof of Delivery (with delivered_by user attribution)
  const handleRecordPOD = async () => {
    if (!selectedStop) return;
    setSubmittingPOD(true);

    const podPayload: PODSubmission = {
      job_id: selectedStop.id,
      delivered_by: currentUserName,
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
          delivered_by: currentUserName,
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
        delivered_by: currentUserName,
        delivered_at: new Date().toISOString(),
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

        {/* Fleet Vehicle & Active Trip Dispatch Banner */}
        <div className="mt-5 p-4 rounded-xl border bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider">Fleet Vehicle Dispatch</span>
                  {activeTrip ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      Trip Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                      No Active Trip
                    </span>
                  )}
                </div>
                <div className="text-sm font-extrabold text-white mt-0.5 flex items-center gap-2">
                  <span>{activeTrip ? `${activeTrip.trip_number} • ${activeTrip.vehicle_number || 'Van'}` : 'Select Vehicle to Begin Dispatch'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Live GPS Speed Badge */}
              <div className="bg-slate-950/70 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono">
                <Gauge className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300">Speed:</span>
                <span className="font-bold text-emerald-400 text-sm">{currentSpeedKmh} km/h</span>
              </div>

              {activeTrip ? (
                <button
                  type="button"
                  onClick={() => {
                    setEndOdoInput(String(activeTrip.start_odometer_km || 0));
                    setEndTripModalOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> End Trip (સમાપ્ત)
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={selectedVehicleId || ''}
                    onChange={e => setSelectedVehicleId(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_number} ({v.model})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const v = vehicles.find(veh => veh.id === selectedVehicleId);
                      setStartOdoInput(String(v?.odometer_km || 0));
                      setStartTripModalOpen(true);
                    }}
                    disabled={!selectedVehicleId}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Start Trip (શરૂ કરો)
                  </button>
                </div>
              )}
            </div>
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

                      {/* Driver & Delivery User Attribution Info */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold shadow-2xs">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Delivered by: <strong className="text-emerald-950 font-black">{stop.delivered_by || stop.driver_name || 'Driver'}</strong></span>
                            {stop.delivered_at && (
                              <span className="text-[10px] text-emerald-700 font-mono">
                                ({new Date(stop.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            )}
                          </span>
                        ) : stop.driver_name ? (
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Driver:</span> {stop.driver_name}
                          </span>
                        ) : null}

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
                          onClick={() => openPODModal(stop, true)}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Take Photo & Deliver</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => openPODModal(stop, false)}
                          className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-extrabold flex items-center gap-1 border border-emerald-300 transition-all cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-700" />
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
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
                          {(selectedStop.delivered_by || selectedStop.driver_name || 'D').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                            Delivered By (ડિલિવરી કરનાર વપરાશકર્તા)
                          </div>
                          <div className="font-black text-sm text-emerald-950">
                            {selectedStop.delivered_by || selectedStop.driver_name || 'Driver'}
                          </div>
                        </div>
                      </div>
                      {selectedStop.delivered_at && (
                        <div className="text-right text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                          {new Date(selectedStop.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                    {selectedStop.delivered_at && (
                      <div><span className="font-semibold text-slate-900">Delivered At:</span> {new Date(selectedStop.delivered_at).toLocaleString()}</div>
                    )}
                    {selectedStop.pod_notes && (
                      <div><span className="font-semibold text-slate-900">Received By / Notes:</span> {selectedStop.pod_notes}</div>
                    )}
                    <div><span className="font-semibold text-slate-900">Total Cases:</span> {selectedStop.total_cases}</div>
                    {selectedStop.driver_name && (
                      <div><span className="font-semibold text-slate-900">Assigned Driver:</span> {selectedStop.driver_name}</div>
                    )}
                  </div>

                  {/* Customer Signature Display (Historical Only) */}
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
                        Parcel Delivery Photo (કાઉન્ટર ફોટો)
                      </label>
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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

                  {/* Delivery User Attribution */}
                  <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200 text-xs flex items-center justify-between">
                    <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" /> Delivering as (વપરાશકર્તા):
                    </span>
                    <span className="font-black text-blue-950 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 shadow-2xs">
                      {currentUserName}
                    </span>
                  </div>

                  {/* Direct Camera Proof of Delivery (Replacing signature) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-blue-600" />
                        Parcel Proof Photo (કાઉન્ટર ફોટો)
                      </label>
                      <span className="text-[11px] font-extrabold text-blue-600">📸 Direct Camera</span>
                    </div>

                    {podPhotoBase64 ? (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-md">
                        <img 
                          src={podPhotoBase64} 
                          alt="Delivery Proof" 
                          className="w-full h-52 object-cover" 
                        />
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow-md flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Retake Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => setPodPhotoBase64(null)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-md cursor-pointer active:scale-95 transition-all"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-300">
                            <Check className="w-4 h-4 text-emerald-400" /> Counter Photo Captured
                          </span>
                          {driverLocation && (
                            <span className="text-[10px] font-mono text-slate-200 bg-black/50 px-2 py-0.5 rounded">
                              GPS: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full py-8 px-4 border-2 border-dashed border-blue-400 hover:border-blue-600 bg-blue-50/60 hover:bg-blue-100/70 rounded-2xl flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all active:scale-98 shadow-xs"
                      >
                        <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                          <Camera className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                          <div className="text-base font-extrabold text-slate-900">📸 Open Camera & Take Photo</div>
                          <div className="text-xs font-bold text-blue-700 mt-0.5">કેમેરા ખોલો અને પાર્સલનો ફોટો પાડો</div>
                          <div className="text-[11px] text-slate-500 mt-1">Directly opens camera to photograph parcel at pharmacy counter</div>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Cash Collected Field */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                      Cash Collected (₹ / રોકડ રકમ) (Optional)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 2400"
                      value={cashCollectedInput}
                      onChange={e => setCashCollectedInput(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-900"
                    />
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

      {/* Start Trip Modal */}
      {startTripModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                <Play className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Start Fleet Trip (નવી ડિલિવરી ટ્રીપ)</h3>
                <p className="text-xs text-slate-500">Record departure odometer & activate live GPS service</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Selected Vehicle
                </label>
                <div className="p-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-900 flex items-center justify-between">
                  <span>{vehicles.find(v => v.id === selectedVehicleId)?.vehicle_number}</span>
                  <span className="text-xs text-slate-500 font-normal">{vehicles.find(v => v.id === selectedVehicleId)?.model}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Starting Odometer (કિલોમીટર રીડિંગ)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={startOdoInput}
                  onChange={e => setStartOdoInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                  placeholder="e.g. 14250.0"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Route Name / Description
                </label>
                <input
                  type="text"
                  value={tripRouteInput}
                  onChange={e => setTripRouteInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
                  placeholder="e.g. Dahegam Daily Beat"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-xl text-xs text-blue-900 leading-relaxed border border-blue-200">
                🚀 Starting the trip activates high-frequency GPS telemetry (5s intervals) and background lock-screen notifications.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStartTripModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartTrip}
                disabled={tripSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {tripSubmitting ? 'Starting...' : 'Confirm & Start Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Trip Modal */}
      {endTripModalOpen && activeTrip && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md">
                <Square className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Complete Fleet Trip (ટ્રીપ પૂર્ણ કરો)</h3>
                <p className="text-xs text-slate-500">{activeTrip.trip_number} • {activeTrip.vehicle_number}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-slate-500 font-semibold">Start Odometer:</div>
                  <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">{activeTrip.start_odometer_km} km</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="text-slate-500 font-semibold">Stops Remaining:</div>
                  <div className="font-mono font-bold text-amber-700 text-sm mt-0.5">{totalPending} pending</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Final Odometer (અંતિમ કિલોમીટર રીડિંગ)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={endOdoInput}
                  onChange={e => setEndOdoInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono font-bold"
                  placeholder={`Min ${activeTrip.start_odometer_km}`}
                />
              </div>

              {parseFloat(endOdoInput) >= activeTrip.start_odometer_km && (
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between font-medium">
                  <span>Total Distance Traveled:</span>
                  <span className="font-mono font-bold text-sm">
                    {(parseFloat(endOdoInput) - activeTrip.start_odometer_km).toFixed(1)} km
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEndTripModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndTrip}
                disabled={tripSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {tripSubmitting ? 'Ending...' : 'Confirm & End Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden direct mobile camera input (Always mounted for instant camera launch) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        className="hidden"
      />
    </div>
  );
};
export default DriverMode;
