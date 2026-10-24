import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Truck, 
  MapPin, 
  Gauge, 
  AlertTriangle, 
  Fuel, 
  Wrench, 
  RotateCcw, 
  Play, 
  Pause, 
  Plus, 
  CheckCircle2, 
  Clock, 
  User, 
  Search, 
  Calendar, 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  Layers, 
  Eye, 
  Check, 
  X,
  Battery,
  Navigation,
  Compass,
  DollarSign,
  IndianRupee,
  Activity,
  History,
  Phone
} from 'lucide-react';
import { 
  FleetVehicle, 
  FleetTrip, 
  FleetAlertItem, 
  FuelLogRecord, 
  MaintenanceLogRecord, 
  FleetSummaryKPI,
  TripReplayData,
  ReplayPoint
} from '../types';
import { 
  fetchFleetVehicles, 
  createFleetVehicle, 
  updateFleetVehicle, 
  deleteFleetVehicle, 
  assignFleetVehicleDriver,
  fetchActiveFleetTrips, 
  fetchFleetTrips, 
  fetchTripReplay, 
  fetchFleetAlerts, 
  resolveFleetAlert, 
  fetchFuelRecords, 
  addFuelRecord, 
  fetchMaintenanceRecords, 
  addMaintenanceRecord, 
  fetchFleetSummaryKPI,
  fetchUsers
} from '../api/client';

interface FleetDashboardProps {
  onNavigate?: (tab: string, state?: any) => void;
}

export const FleetDashboard: React.FC<FleetDashboardProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'map' | 'trips' | 'vehicles' | 'alerts' | 'fuel_maintenance'>('map');
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<FleetSummaryKPI | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [activeTrips, setActiveTrips] = useState<FleetTrip[]>([]);
  const [tripsHistory, setTripsHistory] = useState<FleetTrip[]>([]);
  const [alerts, setAlerts] = useState<FleetAlertItem[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelLogRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceLogRecord[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Selected vehicle for map inspection
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Modals state
  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState<boolean>(false);
  const [fuelModalOpen, setFuelModalOpen] = useState<boolean>(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState<boolean>(false);
  const [replayModalOpen, setReplayModalOpen] = useState<boolean>(false);
  const [replayData, setReplayData] = useState<TripReplayData | null>(null);

  // Form states
  const [newVehicleNum, setNewVehicleNum] = useState<string>('');
  const [newVehicleModel, setNewVehicleModel] = useState<string>('Tata Ace');
  const [newVehicleType, setNewVehicleType] = useState<string>('van');
  const [newVehicleFuel, setNewVehicleFuel] = useState<string>('Diesel');
  const [newVehicleCapacity, setNewVehicleCapacity] = useState<number>(35);
  const [newVehicleOdo, setNewVehicleOdo] = useState<number>(10000);
  const [newVehicleDriverId, setNewVehicleDriverId] = useState<number | undefined>(undefined);

  // Fuel form state
  const [fuelVehId, setFuelVehId] = useState<number>(1);
  const [fuelLiters, setFuelLiters] = useState<string>('');
  const [fuelCost, setFuelCost] = useState<string>('');
  const [fuelOdo, setFuelOdo] = useState<string>('');
  const [fuelStation, setFuelStation] = useState<string>('Indian Oil Dahegam');

  // Maintenance form state
  const [maintVehId, setMaintVehId] = useState<number>(1);
  const [maintType, setMaintType] = useState<string>('Engine Oil & Filter Service');
  const [maintCost, setMaintCost] = useState<string>('2500');
  const [maintOdo, setMaintOdo] = useState<string>('');
  const [maintCenter, setMaintCenter] = useState<string>('Authorized Service Center');

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const mapRootRef = useRef<HTMLDivElement | null>(null);

  // Replay Map Refs
  const replayMapContainerRef = useRef<HTMLDivElement | null>(null);
  const replayMapInstanceRef = useRef<L.Map | null>(null);
  const replayMarkerRef = useRef<L.Marker | null>(null);
  const replayPolylineRef = useRef<L.Polyline | null>(null);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1); // 1x, 2x, 5x

  // Load all initial data
  const loadAllData = async () => {
    try {
      const [sumRes, vehRes, actTripsRes, histTripsRes, alRes, fuelRes, maintRes, uRes] = await Promise.all([
        fetchFleetSummaryKPI().catch(() => null),
        fetchFleetVehicles().catch(() => ({ vehicles: [] })),
        fetchActiveFleetTrips().catch(() => ({ trips: [] })),
        fetchFleetTrips({ limit: 30 }).catch(() => ({ trips: [] })),
        fetchFleetAlerts(false).catch(() => ({ alerts: [] })),
        fetchFuelRecords().catch(() => ({ records: [] })),
        fetchMaintenanceRecords().catch(() => ({ records: [] })),
        fetchUsers().catch(() => [])
      ]);

      if (sumRes) setSummary(sumRes);
      setVehicles(vehRes.vehicles || []);
      setActiveTrips(actTripsRes.trips || []);
      setTripsHistory(histTripsRes.trips || []);
      setAlerts(alRes.alerts || []);
      setFuelRecords(fuelRes.records || []);
      setMaintenanceRecords(maintRes.records || []);
      setUsersList(uRes || []);

      if (vehRes.vehicles && vehRes.vehicles.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vehRes.vehicles[0].id);
      }
    } catch (err) {
      console.warn('Fleet data load notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // Auto-refresh telemetry every 10 seconds
    const interval = setInterval(loadAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Main Fleet Leaflet Map
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [23.1678, 72.8124], // Dahegam / Ahmedabad default
        zoom: 12,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tile = mapMode === 'satellite'
        ? L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            subdomains: '0123',
            maxZoom: 21,
            attribution: '&copy; Google'
          })
        : L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            subdomains: '0123',
            maxZoom: 21,
            attribution: '&copy; Google'
          });

      tile.addTo(map);
      tileLayerRef.current = tile;

      const layerGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    renderVehicleMarkers();
  }, [activeTab, vehicles, selectedVehicleId]);

  // Switch Tile Layer between Streets and Satellite
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const tile = mapMode === 'satellite'
      ? L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: '0123',
          maxZoom: 21,
          attribution: '&copy; Google'
        })
      : L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: '0123',
          maxZoom: 21,
          attribution: '&copy; Google'
        });

    tile.addTo(mapInstanceRef.current);
    tileLayerRef.current = tile;
  }, [mapMode]);

  // Render Live Vehicle Markers on Leaflet Map
  const renderVehicleMarkers = () => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    const bounds: [number, number][] = [];

    vehicles.forEach(v => {
      if (v.last_latitude && v.last_longitude) {
        bounds.push([v.last_latitude, v.last_longitude]);

        // Color coding for dynamic live status
        let statusBg = 'bg-blue-600';
        let statusRing = 'ring-blue-400';
        let statusLabel = 'Stopped';
        let isPulsing = false;

        if (v.live_status === 'moving') {
          statusBg = 'bg-emerald-600';
          statusRing = 'ring-emerald-400';
          statusLabel = `${v.last_speed_kmh} km/h`;
          isPulsing = true;
        } else if (v.live_status === 'idle') {
          statusBg = 'bg-amber-500';
          statusRing = 'ring-amber-300';
          statusLabel = 'Idle';
        } else if (v.live_status === 'offline') {
          statusBg = 'bg-slate-600';
          statusRing = 'ring-slate-400';
          statusLabel = 'Offline';
        } else if (v.live_status === 'maintenance') {
          statusBg = 'bg-rose-600';
          statusRing = 'ring-rose-400';
          statusLabel = 'Service';
        }

        const isSelected = selectedVehicleId === v.id;

        const customIcon = L.divIcon({
          className: 'fleet-vehicle-marker',
          html: `
            <div class="relative flex flex-col items-center group cursor-pointer ${isSelected ? 'scale-115 z-50' : ''}">
              ${isPulsing ? '<span class="absolute -inset-1 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>' : ''}
              <div class="w-10 h-10 rounded-2xl ${statusBg} text-white flex items-center justify-center shadow-lg ring-2 ${statusRing} transition-transform">
                <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M18 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-1.5 1.5m1.5-9 1.96 2.5H17V9.5h2.5M6 18.5A1.5 1.5 0 0 1 4.5 17 1.5 1.5 0 0 1 6 15.5 1.5 1.5 0 0 1 7.5 17 1.5 1.5 0 0 1 6 18.5M20 8h-3V4H3c-1.11 0-2 .89-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/>
                </svg>
              </div>
              <div class="mt-1 px-2 py-0.5 rounded-md bg-slate-950/90 text-[10px] font-black text-white font-mono shadow-md border border-slate-700 whitespace-nowrap">
                ${v.vehicle_number} • ${statusLabel}
              </div>
            </div>
          `,
          iconSize: [44, 56],
          iconAnchor: [22, 50],
        });

        const marker = L.marker([v.last_latitude, v.last_longitude], { icon: customIcon });
        marker.on('click', () => {
          setSelectedVehicleId(v.id);
          mapInstanceRef.current?.setView([v.last_latitude!, v.last_longitude!], 15, { animate: true });
        });

        markersLayerRef.current?.addLayer(marker);
      }
    });

    if (bounds.length > 0 && !selectedVehicleId) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!mapRootRef.current) return;
    if (!document.fullscreenElement) {
      mapRootRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Handle Create Vehicle
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicleNum.trim()) return;

    try {
      await createFleetVehicle({
        vehicle_number: newVehicleNum.trim().toUpperCase(),
        model: newVehicleModel.trim(),
        vehicle_type: newVehicleType,
        fuel_type: newVehicleFuel,
        fuel_capacity_liters: newVehicleCapacity,
        odometer_km: newVehicleOdo,
        driver_id: newVehicleDriverId
      });
      setAddVehicleModalOpen(false);
      setNewVehicleNum('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to add vehicle');
    }
  };

  // Handle Driver Assignment
  const handleAssignDriver = async (vehId: number, driverIdStr: string) => {
    const driverId = driverIdStr ? Number(driverIdStr) : null;
    try {
      await assignFleetVehicleDriver(vehId, driverId);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to update driver assignment');
    }
  };

  // Handle Fuel Submit
  const handleAddFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    const liters = parseFloat(fuelLiters);
    const cost = parseFloat(fuelCost);
    const odo = parseFloat(fuelOdo);
    if (!liters || !cost || !odo) {
      alert('Please fill all fuel details.');
      return;
    }

    try {
      await addFuelRecord({
        vehicle_id: fuelVehId,
        fuel_liters: liters,
        cost_total: cost,
        odometer_km: odo,
        fuel_station: fuelStation
      });
      setFuelModalOpen(false);
      setFuelLiters('');
      setFuelCost('');
      setFuelOdo('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to record fuel');
    }
  };

  // Handle Maintenance Submit
  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(maintCost) || 0;
    const odo = parseFloat(maintOdo) || 0;
    if (!maintType.trim()) return;

    try {
      await addMaintenanceRecord({
        vehicle_id: maintVehId,
        service_type: maintType,
        cost,
        odometer_km: odo,
        service_center: maintCenter
      });
      setMaintenanceModalOpen(false);
      setMaintType('');
      setMaintOdo('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to log maintenance');
    }
  };

  // Launch Trip Replay
  const handleOpenReplay = async (tripId: number) => {
    try {
      setLoading(true);
      const res = await fetchTripReplay(tripId);
      setReplayData(res);
      setReplayIndex(0);
      setReplayPlaying(false);
      setReplayModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to load trip telemetry replay');
    } finally {
      setLoading(false);
    }
  };

  // Initialize Trip Replay Leaflet Map
  useEffect(() => {
    if (!replayModalOpen || !replayData || !replayMapContainerRef.current) return;

    if (replayMapInstanceRef.current) {
      replayMapInstanceRef.current.remove();
      replayMapInstanceRef.current = null;
    }

    const map = L.map(replayMapContainerRef.current, {
      center: replayData.points.length > 0 ? [replayData.points[0].lat, replayData.points[0].lng] : [23.1678, 72.8124],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: '0123',
      maxZoom: 21,
      attribution: '&copy; Google'
    }).addTo(map);

    // Draw full polyline breadcrumb trail
    if (replayData.points.length > 1) {
      const latlngs: [number, number][] = replayData.points.map(p => [p.lat, p.lng]);
      const poly = L.polyline(latlngs, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        smoothFactor: 1.0
      }).addTo(map);
      replayPolylineRef.current = poly;
      map.fitBounds(poly.getBounds(), { padding: [30, 30] });
    }

    // Draw delivery stops
    replayData.stops.forEach(st => {
      if (st.lat && st.lng) {
        const stopIcon = L.divIcon({
          className: 'replay-stop-marker',
          html: `
            <div class="w-6 h-6 rounded-full bg-slate-900 border-2 border-white text-white flex items-center justify-center font-black text-[10px] shadow-md">
              ${st.sequence}
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        L.marker([st.lat, st.lng], { icon: stopIcon })
          .bindPopup(`<b>${st.sequence}. ${st.party_name}</b><br>Status: ${st.status}`)
          .addTo(map);
      }
    });

    // Vehicle active pointer marker
    if (replayData.points.length > 0) {
      const initial = replayData.points[0];
      const vehicleIcon = L.divIcon({
        className: 'replay-vehicle-marker',
        html: `
          <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xl ring-2 ring-emerald-300">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1 1.5 1.5m1.5-9 1.96 2.5H17V9.5h2.5M6 18.5A1.5 1.5 0 0 1 4.5 17 1.5 1.5 0 0 1 6 15.5 1.5 1.5 0 0 1 7.5 17 1.5 1.5 0 0 1 6 18.5M20 8h-3V4H3c-1.11 0-2 .89-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/>
            </svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const vMarker = L.marker([initial.lat, initial.lng], { icon: vehicleIcon }).addTo(map);
      replayMarkerRef.current = vMarker;
    }

    replayMapInstanceRef.current = map;
  }, [replayModalOpen, replayData]);

  // Replay Animation Loop
  useEffect(() => {
    if (!replayPlaying || !replayData || replayData.points.length === 0) return;

    const intervalTime = Math.max(100, Math.round(500 / replaySpeed));
    const timer = setInterval(() => {
      setReplayIndex(prev => {
        if (prev + 1 >= replayData.points.length) {
          setReplayPlaying(false);
          return prev;
        }
        const nextIdx = prev + 1;
        const pt = replayData.points[nextIdx];
        if (replayMarkerRef.current && pt) {
          replayMarkerRef.current.setLatLng([pt.lat, pt.lng]);
          replayMapInstanceRef.current?.panTo([pt.lat, pt.lng], { animate: true, duration: 0.2 });
        }
        return nextIdx;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [replayPlaying, replaySpeed, replayData]);

  // Filtered vehicles
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = 
      v.vehicle_number.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.model.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      (v.driver_name || '').toLowerCase().includes(vehicleSearch.toLowerCase());
    const matchesStatus = statusFilter === 'all' || v.live_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const currentReplayPoint = replayData?.points[replayIndex];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Live Fleet Tracking
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Antigravity 2.0
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                Real-time road GPS telemetry, live speed gauges, trip replay, and vehicle dispatch management
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAddVehicleModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Vehicle
            </button>
            <button
              onClick={() => {
                if (vehicles.length > 0) {
                  setFuelVehId(vehicles[0].id);
                  setFuelOdo(String(vehicles[0].odometer_km));
                }
                setFuelModalOpen(true);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Fuel className="w-4 h-4 text-amber-600" /> Log Fuel
            </button>
            <button
              onClick={() => {
                if (vehicles.length > 0) {
                  setMaintVehId(vehicles[0].id);
                  setMaintOdo(String(vehicles[0].odometer_km));
                }
                setMaintenanceModalOpen(true);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Wrench className="w-4 h-4 text-indigo-600" /> Log Service
            </button>
            <button
              onClick={loadAllData}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Refresh Data"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Executive KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fleet Vehicles</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-center justify-center gap-1.5">
              <span>{summary?.total_vehicles || vehicles.length}</span>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.2 rounded">
                {vehicles.filter(v => v.live_status === 'moving').length} Moving
              </span>
            </div>
          </div>
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 text-center">
            <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center justify-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Active Trips
            </div>
            <div className="text-2xl font-black text-blue-950 mt-1">
              {summary?.active_trips || activeTrips.length}
            </div>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 text-center">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Today's Distance
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              {summary?.today_distance_km || 0} km
            </div>
          </div>
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-center">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Safety Alerts
            </div>
            <div className="text-2xl font-black text-amber-950 mt-1 flex items-center justify-center gap-1.5">
              <span>{summary?.unresolved_alerts ?? alerts.filter(a => !a.resolved).length}</span>
              {alerts.some(a => !a.resolved && a.alert_type === 'overspeed') && (
                <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-500 text-white animate-pulse">
                  OVERSPEED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'map'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Compass className="w-4 h-4" /> Live Map & Telemetry
          </button>
          <button
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'trips'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" /> Trips & Stops ({activeTrips.length} Active)
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'vehicles'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Truck className="w-4 h-4" /> Vehicles Catalog ({vehicles.length})
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Safety Alerts ({alerts.filter(a => !a.resolved).length})
          </button>
          <button
            onClick={() => setActiveTab('fuel_maintenance')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'fuel_maintenance'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Fuel className="w-4 h-4" /> Fuel & Maintenance
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE MAP & TELEMETRY */}
      {activeTab === 'map' && (
        <div ref={mapRootRef} className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 p-4">
          {/* Map Area */}
          <div className="lg:col-span-3 flex flex-col h-[650px] relative rounded-xl overflow-hidden border border-slate-700/80">
            {/* Map Controls Floating Bar */}
            <div className="absolute top-3 left-3 z-[400] flex items-center gap-2 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 shadow-xl text-xs">
              <button
                type="button"
                onClick={() => setMapMode(m => m === 'streets' ? 'satellite' : 'streets')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5 transition-all"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                {mapMode === 'streets' ? 'Satellite View' : 'Google Streets'}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Selected Vehicle Floating HUD */}
            {selectedVehicle && (
              <div className="absolute bottom-4 left-4 z-[400] bg-slate-950/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl text-white max-w-sm w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold">{selectedVehicle.vehicle_number}</div>
                      <div className="text-xs text-slate-400">{selectedVehicle.model}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    selectedVehicle.live_status === 'moving'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {selectedVehicle.live_status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800 text-center">
                  <div className="bg-slate-900/80 p-2 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Speed</div>
                    <div className="text-base font-extrabold text-emerald-400 mt-0.5">{selectedVehicle.last_speed_kmh} km/h</div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Battery</div>
                    <div className="text-base font-extrabold text-blue-400 mt-0.5">{selectedVehicle.last_battery_pct ?? '--'}%</div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Odometer</div>
                    <div className="text-base font-extrabold text-white mt-0.5">{selectedVehicle.odometer_km} km</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>Driver: <strong className="text-slate-200">{selectedVehicle.driver_name || 'Unassigned'}</strong></span>
                  {activeTrips.some(t => t.vehicle_id === selectedVehicle.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        const tr = activeTrips.find(t => t.vehicle_id === selectedVehicle.id);
                        if (tr) handleOpenReplay(tr.id);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                    >
                      Replay Active Route
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={mapContainerRef} className="w-full h-full bg-slate-950" />
          </div>

          {/* Vehicle Sidebar List */}
          <div className="flex flex-col h-[650px] bg-slate-950/60 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Vehicles List ({vehicles.length})</span>
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                5s Live
              </span>
            </div>

            {/* Filter controls */}
            <div className="space-y-2 mt-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search vehicle or driver..."
                  value={vehicleSearch}
                  onChange={e => setVehicleSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
                {['all', 'moving', 'idle', 'offline'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-1 rounded-md uppercase font-bold transition-colors cursor-pointer ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Items Scroll List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 pr-1">
              {filteredVehicles.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">No vehicles matching filter</div>
              ) : (
                filteredVehicles.map(v => {
                  const isSelected = selectedVehicleId === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        setSelectedVehicleId(v.id);
                        if (v.last_latitude && v.last_longitude) {
                          mapInstanceRef.current?.setView([v.last_latitude, v.last_longitude], 15, { animate: true });
                        }
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-400/50'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-white">{v.vehicle_number}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          v.live_status === 'moving'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : v.live_status === 'idle'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {v.live_status === 'moving' ? `${v.last_speed_kmh} km/h` : v.live_status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                        <span>{v.model}</span>
                        <span>{v.odometer_km} km</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span>Driver: <strong className="text-slate-300">{v.driver_name || 'Unassigned'}</strong></span>
                        {v.last_battery_pct !== null && (
                          <span className="flex items-center gap-1 font-mono text-[10px] text-blue-400">
                            <Battery className="w-3 h-3" /> {v.last_battery_pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRIPS & STOPS PROGRESS */}
      {activeTab === 'trips' && (
        <div className="space-y-6">
          {/* Active Trips Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-600 fill-current" /> Active Dispatch Trips
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Currently on-road vehicles and real-time delivery progression</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                {activeTrips.length} Active On Road
              </span>
            </div>

            {activeTrips.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No active delivery trips right now. Drivers can start trips from the Driver Mode page.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {activeTrips.map(tr => {
                  const pct = tr.total_stops > 0 ? Math.round(((tr.completed_stops || 0) / tr.total_stops) * 100) : 0;
                  return (
                    <div key={tr.id} className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-black text-blue-600">{tr.trip_number}</span>
                          <h4 className="font-extrabold text-base text-slate-900 mt-0.5">{tr.route_name}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenReplay(tr.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Replay Telemetry
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <div className="text-slate-500 font-semibold text-[10px] uppercase">Vehicle</div>
                          <div className="font-bold text-slate-900 mt-0.5">{tr.vehicle_number || 'Van'}</div>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <div className="text-slate-500 font-semibold text-[10px] uppercase">Driver</div>
                          <div className="font-bold text-slate-900 mt-0.5">{tr.driver_name || 'Driver'}</div>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <div className="text-slate-500 font-semibold text-[10px] uppercase">Traveled</div>
                          <div className="font-bold text-emerald-700 mt-0.5">{tr.total_distance_km} km</div>
                        </div>
                      </div>

                      {/* Stops Progress Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                          <span>Delivery Stops Progress</span>
                          <span className="font-mono font-bold text-blue-700">{tr.completed_stops} / {tr.total_stops} Completed ({pct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Trips Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <History className="w-5 h-5 text-slate-700" /> Completed Delivery Trips History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-3 px-3">Trip #</th>
                    <th className="py-3 px-3">Vehicle</th>
                    <th className="py-3 px-3">Driver</th>
                    <th className="py-3 px-3">Route</th>
                    <th className="py-3 px-3">Distance</th>
                    <th className="py-3 px-3">Stops</th>
                    <th className="py-3 px-3">Cash Collected</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {tripsHistory.map(tr => (
                    <tr key={tr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-blue-600">{tr.trip_number}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">{tr.vehicle_number}</td>
                      <td className="py-3 px-3">{tr.driver_name}</td>
                      <td className="py-3 px-3">{tr.route_name}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">{tr.total_distance_km} km</td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-emerald-700">{tr.delivered_stops} delivered</span>
                        {tr.failed_stops ? <span className="text-rose-600 ml-1">({tr.failed_stops} failed)</span> : ''}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">₹{tr.total_cash_collected || 0}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenReplay(tr.id)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Replay Route
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VEHICLES CATALOG */}
      {activeTab === 'vehicles' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Fleet Vehicles Inventory</h3>
              <p className="text-xs text-slate-500">Manage vehicle models, fuel capacities, and driver assignments</p>
            </div>
            <button
              onClick={() => setAddVehicleModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" /> Add Vehicle
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
            {vehicles.map(v => (
              <div key={v.id} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/60 hover:bg-white hover:shadow-md transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-base">{v.vehicle_number}</h4>
                      <p className="text-xs text-slate-500">{v.model}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    v.live_status === 'moving'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {v.live_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Fuel / Tank</span>
                    <strong className="text-slate-900">{v.fuel_type} • {v.fuel_capacity_liters}L</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Odometer</span>
                    <strong className="text-slate-900">{v.odometer_km} km</strong>
                  </div>
                </div>

                {/* Driver Assignment Dropdown */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Assigned Driver
                  </label>
                  <select
                    value={v.driver_id || ''}
                    onChange={e => handleAssignDriver(v.id, e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- No Driver Assigned --</option>
                    {usersList.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SAFETY ALERTS & OVERSPEED */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Real-Time Fleet Safety Alerts
              </h3>
              <p className="text-xs text-slate-500">Continuous speed enforcement, low battery monitors, and geofence alerts</p>
            </div>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {alerts.filter(a => !a.resolved).length} Unresolved
            </span>
          </div>

          <div className="space-y-3 mt-6">
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No safety alerts reported. All fleet vehicles driving safely.
              </div>
            ) : (
              alerts.map(al => (
                <div
                  key={al.id}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    al.resolved
                      ? 'bg-slate-50/60 border-slate-200 text-slate-500'
                      : al.alert_type === 'overspeed'
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                      : 'bg-amber-50/70 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      al.resolved
                        ? 'bg-slate-200 text-slate-600'
                        : al.alert_type === 'overspeed'
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{al.message}</span>
                        {al.resolved && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            Resolved
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                        <span>Vehicle: <strong>{al.vehicle_number || 'Van'}</strong></span>
                        <span>Driver: <strong>{al.driver_name || 'Driver'}</strong></span>
                        {al.speed_kmh && <span>Speed: <strong className="text-rose-600 font-mono font-bold">{al.speed_kmh} km/h</strong></span>}
                        {al.created_at && <span>Time: {new Date(al.created_at).toLocaleTimeString()}</span>}
                      </div>
                    </div>
                  </div>

                  {!al.resolved && (
                    <button
                      type="button"
                      onClick={async () => {
                        await resolveFleetAlert(al.id);
                        await loadAllData();
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all self-end sm:self-center cursor-pointer"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: FUEL & MAINTENANCE */}
      {activeTab === 'fuel_maintenance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fuel Logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Fuel className="w-5 h-5 text-amber-600" /> Fuel Refueling History
              </h3>
              <button
                type="button"
                onClick={() => setFuelModalOpen(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                + Log Fuel
              </button>
            </div>

            <div className="space-y-3">
              {fuelRecords.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No fuel records logged yet</div>
              ) : (
                fuelRecords.map(f => (
                  <div key={f.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{f.vehicle_number} • {f.fuel_liters} Liters</div>
                      <div className="text-slate-500 mt-0.5">{f.fuel_station || 'Station'} • Odo: {f.odometer_km} km</div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-sm text-emerald-700">₹{f.cost_total}</div>
                      <div className="text-[10px] text-slate-400">{f.logged_at ? new Date(f.logged_at).toLocaleDateString() : ''}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Maintenance Logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" /> Vehicle Servicing Logs
              </h3>
              <button
                type="button"
                onClick={() => setMaintenanceModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                + Log Service
              </button>
            </div>

            <div className="space-y-3">
              {maintenanceRecords.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No maintenance records logged yet</div>
              ) : (
                maintenanceRecords.map(m => (
                  <div key={m.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{m.vehicle_number} • {m.service_type}</div>
                      <div className="text-slate-500 mt-0.5">{m.service_center || 'Service Center'} • Odo: {m.odometer_km} km</div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-sm text-slate-900">₹{m.cost}</div>
                      <div className="text-[10px] text-slate-400">{m.service_date ? new Date(m.service_date).toLocaleDateString() : ''}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TRIP TELEMETRY REPLAY */}
      {replayModalOpen && replayData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            {/* Header */}
            <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-400 fill-current" />
                  Trip Telemetry Replay: {replayData.trip_number}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {replayData.vehicle_number} • Driver: {replayData.driver_name} • {replayData.total_points} GPS Breadcrumb Points
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplayPlaying(false);
                  setReplayModalOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative bg-slate-950">
              <div ref={replayMapContainerRef} className="w-full h-full" />

              {/* Speed & Coordinate HUD Overlay */}
              {currentReplayPoint && (
                <div className="absolute top-4 right-4 z-[400] bg-slate-950/90 backdrop-blur-md p-3 rounded-2xl border border-slate-700 shadow-2xl flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[9px] uppercase font-mono text-slate-400">Telemetry Speed</div>
                    <div className="text-2xl font-black text-emerald-400 mt-0.5">{currentReplayPoint.speed_kmh} <span className="text-xs font-normal">km/h</span></div>
                  </div>
                  <div className="h-8 w-px bg-slate-800" />
                  <div className="text-xs font-mono space-y-0.5">
                    <div className="text-slate-300">Lat: {currentReplayPoint.lat.toFixed(5)}</div>
                    <div className="text-slate-300">Lng: {currentReplayPoint.lng.toFixed(5)}</div>
                    <div className="text-[10px] text-blue-400">{currentReplayPoint.timestamp ? new Date(currentReplayPoint.timestamp).toLocaleTimeString() : ''}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Playback Slider & Controls */}
            <div className="p-4 px-6 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-slate-400">Point {replayIndex + 1} / {replayData.points.length}</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, replayData.points.length - 1)}
                  value={replayIndex}
                  onChange={e => {
                    const idx = Number(e.target.value);
                    setReplayIndex(idx);
                    const pt = replayData.points[idx];
                    if (replayMarkerRef.current && pt) {
                      replayMarkerRef.current.setLatLng([pt.lat, pt.lng]);
                      replayMapInstanceRef.current?.panTo([pt.lat, pt.lng]);
                    }
                  }}
                  className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReplayPlaying(p => !p)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    {replayPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    {replayPlaying ? 'Pause Replay' : 'Play Timeline'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplayIndex(0);
                      const pt = replayData.points[0];
                      if (replayMarkerRef.current && pt) {
                        replayMarkerRef.current.setLatLng([pt.lat, pt.lng]);
                        replayMapInstanceRef.current?.panTo([pt.lat, pt.lng]);
                      }
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Reset
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-mono">Speed:</span>
                  {[1, 2, 5].map(spd => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setReplaySpeed(spd)}
                      className={`px-2.5 py-1 rounded-lg font-bold font-mono cursor-pointer ${
                        replaySpeed === spd ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD VEHICLE */}
      {addVehicleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Register New Vehicle</h3>
              <button onClick={() => setAddVehicleModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleCreateVehicle} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Vehicle License Number</label>
                <input
                  type="text"
                  placeholder="e.g. GJ-01-AB-1234"
                  value={newVehicleNum}
                  onChange={e => setNewVehicleNum(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl uppercase font-mono font-bold"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Model Name</label>
                  <input
                    type="text"
                    value={newVehicleModel}
                    onChange={e => setNewVehicleModel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Vehicle Type</label>
                  <select
                    value={newVehicleType}
                    onChange={e => setNewVehicleType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="van">Delivery Van</option>
                    <option value="truck">Truck / Pickup</option>
                    <option value="bike">Motorcycle</option>
                    <option value="auto">Auto 3-Wheeler</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fuel Type</label>
                  <select
                    value={newVehicleFuel}
                    onChange={e => setNewVehicleFuel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="Diesel">Diesel</option>
                    <option value="Petrol">Petrol</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Starting Odometer (km)</label>
                  <input
                    type="number"
                    value={newVehicleOdo}
                    onChange={e => setNewVehicleOdo(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddVehicleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: LOG FUEL */}
      {fuelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Fuel className="w-5 h-5 text-amber-600" /> Log Fuel Refill
              </h3>
              <button onClick={() => setFuelModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddFuel} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Vehicle</label>
                <select
                  value={fuelVehId}
                  onChange={e => setFuelVehId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-semibold"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.vehicle_number} ({v.model})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fuel Liters</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 25.5"
                    value={fuelLiters}
                    onChange={e => setFuelLiters(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Total Cost (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 2400"
                    value={fuelCost}
                    onChange={e => setFuelCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold text-emerald-700"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Current Odometer (km)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 14350"
                  value={fuelOdo}
                  onChange={e => setFuelOdo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fuel Station</label>
                <input
                  type="text"
                  value={fuelStation}
                  onChange={e => setFuelStation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFuelModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                >
                  Save Fuel Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: LOG MAINTENANCE */}
      {maintenanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" /> Log Vehicle Maintenance
              </h3>
              <button onClick={() => setMaintenanceModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddMaintenance} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Vehicle</label>
                <select
                  value={maintVehId}
                  onChange={e => setMaintVehId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-semibold"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.vehicle_number} ({v.model})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Service Type</label>
                <input
                  type="text"
                  placeholder="e.g. Periodic 10,000km Engine Oil & Filter Change"
                  value={maintType}
                  onChange={e => setMaintType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-medium"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Cost (₹)</label>
                  <input
                    type="number"
                    value={maintCost}
                    onChange={e => setMaintCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Odometer (km)</label>
                  <input
                    type="number"
                    value={maintOdo}
                    onChange={e => setMaintOdo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMaintenanceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  Save Service Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default FleetDashboard;
