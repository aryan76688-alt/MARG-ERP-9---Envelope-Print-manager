import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X,
  Compass,
  Truck,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  IndianRupee,
  Battery,
  Navigation,
  Layers,
  Maximize2,
  Minimize2,
  Eye,
  AlertCircle,
  Package,
  FileText,
  User,
  ArrowRight,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { fetchFleetRadarLive } from '../api/client';

interface LiveDriverRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTripId?: number | null;
  initialTripToken?: string | null;
}

export const LiveDriverRadarModal: React.FC<LiveDriverRadarModalProps> = ({
  isOpen,
  onClose,
  initialTripId = null,
  initialTripToken = null
}) => {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [mapMode, setMapMode] = useState<'streets' | 'satellite'>('streets');
  const [activeStopPopup, setActiveStopPopup] = useState<any | null>(null);
  const [fullScreen, setFullScreen] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);

  // Load radar data from backend
  const loadRadarData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchFleetRadarLive();
      const list = res.runs || [];
      setRuns(list);
      setLastRefreshed(new Date());

      if (list.length > 0) {
        if (selectedTripId === null) {
          if (initialTripId) {
            const matched = list.find(r => r.trip_id === initialTripId);
            setSelectedTripId(matched ? matched.trip_id : list[0].trip_id);
          } else if (initialTripToken) {
            const matched = list.find(r => r.share_token === initialTripToken);
            setSelectedTripId(matched ? matched.trip_id : list[0].trip_id);
          } else {
            setSelectedTripId(list[0].trip_id);
          }
        }
      }
    } catch (err) {
      console.warn('[LiveDriverRadar] Failed to load radar:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRadarData();
    }
  }, [isOpen]);

  // Auto-refresh timer every 6 seconds
  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      loadRadarData(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, selectedTripId]);

  // Currently active selected run
  const activeRun = runs.find(r => r.trip_id === selectedTripId) || runs[0] || null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter: [number, number] = [23.0225, 72.5714]; // Ahmedabad
      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 13,
        zoomControl: true,
        attributionControl: false
      });

      const tile = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        subdomains: '0123',
        maxZoom: 20
      });
      tile.addTo(map);
      tileLayerRef.current = tile;

      const stopsGroup = L.layerGroup().addTo(map);
      stopsLayerRef.current = stopsGroup;

      const polyline = L.polyline([], {
        color: '#06b6d4',
        weight: 4,
        opacity: 0.85,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(map);
      trailPolylineRef.current = polyline;

      mapInstanceRef.current = map;
    }

    return () => {
      // Keep instance alive during modal session
    };
  }, [isOpen]);

  // Switch Tile Layer (Streets vs Satellite)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }
    const tile = mapMode === 'satellite'
      ? L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: '0123',
          maxZoom: 21
        })
      : L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: '0123',
          maxZoom: 20
        });
    tile.addTo(mapInstanceRef.current);
    tileLayerRef.current = tile;
  }, [mapMode]);

  // Render Driver Marker, Breadcrumb Trail, and Sequential Stop Pins
  useEffect(() => {
    if (!mapInstanceRef.current || !activeRun) return;

    const map = mapInstanceRef.current;
    const bounds: [number, number][] = [];

    // 1. Render Stops
    if (stopsLayerRef.current) {
      stopsLayerRef.current.clearLayers();

      (activeRun.stops || []).forEach((stop: any, idx: number) => {
        if (!stop.lat || !stop.lng) return;
        bounds.push([stop.lat, stop.lng]);

        const isDelivered = stop.status === 'delivered';
        const isArrived = stop.status === 'arrived';

        const markerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="
              width: 30px; 
              height: 30px; 
              border-radius: 9999px; 
              background: ${isDelivered ? '#10b981' : isArrived ? '#f59e0b' : '#3b82f6'}; 
              color: white; 
              border: 2.5px solid #ffffff; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              font-weight: 900; 
              font-size: 11px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            ">
              ${isDelivered ? '✓' : stop.sequence || (idx + 1)}
            </div>
            <div style="
              background: rgba(15, 23, 42, 0.88); 
              color: #f8fafc; 
              font-size: 9px; 
              font-weight: 800; 
              padding: 1px 5px; 
              border-radius: 4px; 
              margin-top: 2px;
              white-space: nowrap;
              border: 1px solid rgba(255,255,255,0.15);
              max-width: 110px;
              overflow: hidden;
              text-overflow: ellipsis;
            ">
              ${stop.party_name}
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-stop-marker',
          html: markerHtml,
          iconSize: [30, 48],
          iconAnchor: [15, 24]
        });

        const marker = L.marker([stop.lat, stop.lng], { icon });
        marker.on('click', () => {
          setActiveStopPopup(stop);
        });
        marker.addTo(stopsLayerRef.current!);
      });
    }

    // 2. Render Breadcrumb Trail
    if (trailPolylineRef.current) {
      const trailPoints: [number, number][] = (activeRun.trail || [])
        .filter((p: any) => p.lat && p.lng)
        .map((p: any) => [p.lat, p.lng]);
      trailPolylineRef.current.setLatLngs(trailPoints);
    }

    // 3. Render Moving Driver Radar Marker
    const pos = activeRun.position;
    if (pos && pos.latitude && pos.longitude) {
      bounds.push([pos.latitude, pos.longitude]);

      const isLive = pos.is_live;
      const speed = pos.speed_kmh || 0;
      const heading = pos.heading || 0;

      const driverHtml = `
        <div style="position: relative; width: 44px; height: 44px; cursor: pointer;">
          ${isLive ? `
            <div style="
              position: absolute; 
              inset: -6px; 
              background: #10b981; 
              opacity: 0.35; 
              border-radius: 9999px; 
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
          ` : ''}
          <div style="
            position: absolute; 
            inset: 0; 
            background: linear-gradient(135deg, #2563eb, #1d4ed8); 
            border: 3px solid #ffffff; 
            border-radius: 9999px; 
            box-shadow: 0 6px 16px rgba(0,0,0,0.45); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            color: white;
            transform: rotate(${heading}deg);
            transition: transform 0.5s ease-out;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.77l.11.34V17z"/>
            </svg>
          </div>
          <div style="
            position: absolute; 
            bottom: -16px; 
            left: 50%; 
            transform: translateX(-50%); 
            background: ${isLive ? '#059669' : '#475569'}; 
            color: #ffffff; 
            font-size: 9px; 
            font-weight: 900; 
            padding: 1px 6px; 
            border-radius: 9999px; 
            white-space: nowrap; 
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">
            ${isLive ? `${speed} km/h` : 'Offline'}
          </div>
        </div>
      `;

      const driverIcon = L.divIcon({
        className: 'driver-live-radar-icon',
        html: driverHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      if (!driverMarkerRef.current) {
        const marker = L.marker([pos.latitude, pos.longitude], { icon: driverIcon, zIndexOffset: 1000 });
        marker.addTo(map);
        driverMarkerRef.current = marker;
      } else {
        driverMarkerRef.current.setLatLng([pos.latitude, pos.longitude]);
        driverMarkerRef.current.setIcon(driverIcon);
      }
    } else if (driverMarkerRef.current) {
      map.removeLayer(driverMarkerRef.current);
      driverMarkerRef.current = null;
    }

    // Fit map bounds to show driver and stops
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [activeRun]);

  // Recenter on driver
  const handleRecenterDriver = () => {
    if (!mapInstanceRef.current || !activeRun?.position?.latitude) return;
    mapInstanceRef.current.setView(
      [activeRun.position.latitude, activeRun.position.longitude],
      16,
      { animate: true }
    );
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md ${fullScreen ? 'p-0' : 'p-2 sm:p-4'}`}>
      <div className={`bg-slate-900 border border-slate-800 flex flex-col overflow-hidden shadow-2xl transition-all ${
        fullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[92vh] rounded-3xl'
      }`}>
        {/* Top Header Bar */}
        <div className="bg-slate-950/90 border-b border-slate-800 p-4 sm:px-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <Compass className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-wide">
                  Live Fleet Radar • લાઈવ ડ્રાઈવર રડાર
                </h3>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live GPS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time moving dot telemetry, route execution & cash collection tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
              title="Toggle 6-second live GPS polling"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
              <span>{autoRefresh ? 'Live Radar ON' : 'Paused'}</span>
            </button>

            {/* Satellite / Streets Toggle */}
            <button
              type="button"
              onClick={() => setMapMode(mapMode === 'streets' ? 'satellite' : 'streets')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{mapMode === 'streets' ? 'Satellite' : 'Road Map'}</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setFullScreen(!fullScreen)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer hidden sm:flex"
              title="Toggle Fullscreen"
            >
              {fullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 hover:border-rose-500 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active Runs Selector Pills (if multiple active trips) */}
        {runs.length > 1 && (
          <div className="bg-slate-950/60 px-4 py-2 border-b border-slate-800 flex items-center gap-2 overflow-x-auto custom-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 flex-shrink-0">
              <Truck className="w-3.5 h-3.5 text-slate-400" /> Active Runs:
            </span>
            {runs.map(r => (
              <button
                key={r.trip_id}
                type="button"
                onClick={() => setSelectedTripId(r.trip_id)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  selectedTripId === r.trip_id
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-cyan-400'
                    : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-750'
                }`}
              >
                <span>{r.route_name}</span>
                <span className="opacity-75 text-[10px]">({r.driver_name})</span>
                {r.position?.is_live && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Main Body: Map & Sidebar Split */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Map Container */}
          <div className="flex-1 h-full min-h-[350px] relative">
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Floating Quick Driver Control Overlay */}
            {activeRun && (
              <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2.5 shadow-2xl flex items-center gap-2 max-w-sm">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-md">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0 pr-1">
                  <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                    <span>{activeRun.driver_name}</span>
                    {activeRun.vehicle_number && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                        {activeRun.vehicle_number}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-300 flex items-center gap-1.5">
                    {activeRun.position?.is_live ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Moving {activeRun.position.speed_kmh} km/h
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Last ping: {activeRun.position?.seconds_ago !== null ? `${activeRun.position?.seconds_ago}s ago` : 'Waiting GPS'}
                      </span>
                    )}
                    {activeRun.position?.battery !== null && activeRun.position?.battery !== undefined && (
                      <span className="text-slate-400 flex items-center gap-0.5">
                        <Battery className="w-3 h-3 text-amber-400" />
                        {activeRun.position.battery}%
                      </span>
                    )}
                  </div>
                </div>
                {activeRun.position?.latitude && (
                  <button
                    type="button"
                    onClick={handleRecenterDriver}
                    className="p-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
                    title="Center map on driver's current position"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Selected Stop Mini Details Popup (Overlay on Map) */}
            {activeStopPopup && (
              <div className="absolute bottom-4 left-4 right-4 sm:left-4 sm:right-auto sm:max-w-md z-[400] bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-2xl p-4 shadow-2xl animate-slide-up">
                <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 block">
                      Stop #{activeStopPopup.sequence} • {activeStopPopup.status === 'delivered' ? '✅ Delivered' : '⏳ Pending'}
                    </span>
                    <h4 className="text-sm font-black text-white">
                      {activeStopPopup.party_name}
                    </h4>
                    {activeStopPopup.party_name_gu && (
                      <p className="text-xs text-cyan-200 font-bold">
                        {activeStopPopup.party_name_gu}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStopPopup(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="py-2.5 text-xs text-slate-300 space-y-1">
                  <p className="line-clamp-2">📍 {activeStopPopup.address}</p>
                  
                  {activeStopPopup.status === 'delivered' && (
                    <div className="mt-2 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 space-y-1">
                      <div className="flex items-center justify-between font-black text-xs">
                        <span>Mode: {activeStopPopup.payment_mode?.toUpperCase()}</span>
                        {activeStopPopup.cash_collected > 0 && (
                          <span className="text-emerald-400">💵 Cash: ₹{activeStopPopup.cash_collected.toLocaleString()}</span>
                        )}
                        {activeStopPopup.cheque_amount > 0 && (
                          <span className="text-amber-300">📝 Cheque: ₹{activeStopPopup.cheque_amount.toLocaleString()}</span>
                        )}
                      </div>
                      {activeStopPopup.cheque_no && (
                        <div className="text-[11px] text-slate-300">
                          Cheque: <span className="font-mono font-bold text-white">{activeStopPopup.cheque_no}</span>
                        </div>
                      )}
                      {activeStopPopup.return_boxes > 0 && (
                        <div className="text-[11px] text-blue-300 font-bold">
                          📦 Picked Up: {activeStopPopup.return_boxes} Return Box(es)
                        </div>
                      )}
                      {activeStopPopup.receiver_name && (
                        <div className="text-[11px] text-slate-400">
                          Receiver: <span className="text-white font-bold">{activeStopPopup.receiver_name}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {activeStopPopup.lat && activeStopPopup.lng && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${activeStopPopup.lat},${activeStopPopup.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all text-center"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Google Pin</span>
                    </a>
                  )}
                  {activeStopPopup.mobile_no && (
                    <a
                      href={`tel:${activeStopPopup.mobile_no}`}
                      className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Execution Progress & Settlement Telemetry */}
          {activeRun && (
            <div className="w-full lg:w-80 xl:w-96 bg-slate-950/80 border-t lg:border-t-0 lg:border-l border-slate-800 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {/* Route Overview Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-850">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400">
                        {activeRun.trip_number}
                      </span>
                      <h4 className="text-sm font-black text-white leading-tight">
                        {activeRun.route_name}
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-blue-950 text-blue-300 border border-blue-800 text-xs font-black">
                      {activeRun.stats.progress_pct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>Delivery Progress</span>
                      <span>{activeRun.stats.delivered_stops} / {activeRun.stats.total_stops} Stops</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: `${activeRun.stats.progress_pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Option A: Settlement & Collection Counters */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Live Collections • આજની વસૂલાત</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Cash Collected</div>
                      <div className="text-base font-black text-emerald-400">
                        ₹{(activeRun.stats.cash_collected || 0).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Cheques Collected</div>
                      <div className="text-base font-black text-amber-400">
                        ₹{(activeRun.stats.cheque_collected || 0).toLocaleString('en-IN')}
                      </div>
                    </div>

                    {activeRun.stats.upi_collected > 0 && (
                      <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-0.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">UPI Collected</div>
                        <div className="text-base font-black text-cyan-400">
                          ₹{activeRun.stats.upi_collected.toLocaleString('en-IN')}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-0.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Return Boxes</div>
                      <div className="text-base font-black text-blue-400 flex items-center gap-1">
                        <Package className="w-4 h-4 text-blue-400" />
                        <span>{activeRun.stats.return_boxes || 0} Boxes</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stops Sequence Checklist */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Stops Checklist ({activeRun.stops?.length || 0})
                  </span>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {(activeRun.stops || []).map((s: any) => {
                      const isDone = s.status === 'delivered';
                      return (
                        <div
                          key={s.id}
                          onClick={() => setActiveStopPopup(s)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all cursor-pointer ${
                            isDone
                              ? 'bg-emerald-950/20 border-emerald-900/60 text-slate-300 hover:bg-emerald-950/40'
                              : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${
                              isDone ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {isDone ? '✓' : s.sequence}
                            </span>
                            <span className="font-bold truncate text-white">
                              {s.party_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                            {isDone ? (
                              <span className="text-emerald-400 font-black">Done</span>
                            ) : (
                              <span className="text-slate-500 font-bold">Pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadRadarData()}
                  disabled={loading}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Radar</span>
                </button>

                {activeRun.share_token && (
                  <a
                    href={`/?trip_token=${activeRun.share_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Driver View</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
