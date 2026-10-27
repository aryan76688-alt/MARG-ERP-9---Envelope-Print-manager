import React, { useState, useEffect } from 'react';
import {
  Share2,
  X,
  MapPin,
  Truck,
  User,
  CheckCircle2,
  Copy,
  ExternalLink,
  Navigation,
  ArrowUpDown,
  Phone,
  Sparkles,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Party } from '../types';
import { createAndShareDailyRoute, fetchFleetVehicles, fetchUsers } from '../api/client';

interface ShareDailyRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParties: Party[];
  onRouteCreated?: (tripData: any) => void;
  onOpenDriverApp?: (tripToken: string) => void;
}

export const ShareDailyRouteModal: React.FC<ShareDailyRouteModalProps> = ({
  isOpen,
  onClose,
  selectedParties,
  onRouteCreated,
  onOpenDriverApp
}) => {
  const [orderedParties, setOrderedParties] = useState<Party[]>([]);
  const [routeName, setRouteName] = useState<string>('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Success state with generated token and links
  const [createdTrip, setCreatedTrip] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setOrderedParties([...selectedParties]);
      const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const uniqueCities = Array.from(new Set(selectedParties.map(p => p.city).filter(Boolean)));
      const citySummary = uniqueCities.slice(0, 2).join(' - ');
      setRouteName(citySummary ? `${citySummary} Run (${dateStr})` : `Daily Route (${dateStr})`);
      setCreatedTrip(null);
      setCopiedLink(false);
      setError(null);

      // Load vehicles & drivers
      fetchFleetVehicles()
        .then(res => setVehicles(res.vehicles || []))
        .catch(() => {});
      fetchUsers()
        .then((res: any) => {
          const raw = Array.isArray(res) ? res : (res?.users || []);
          const list = raw.filter((u: any) => u.role === 'driver' || u.role === 'staff' || u.role === 'admin');
          setDrivers(list);
        })
        .catch(() => {});
    }
  }, [isOpen, selectedParties]);

  if (!isOpen) return null;

  // Move stop up / down
  const moveStop = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= orderedParties.length) return;
    const updated = [...orderedParties];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setOrderedParties(updated);
  };

  // Simple Nearest-Neighbor reordering based on coordinates
  const handleAutoOptimize = () => {
    if (orderedParties.length <= 2) return;
    const withGps = orderedParties.filter(p => p.latitude && p.longitude);
    const withoutGps = orderedParties.filter(p => !p.latitude || !p.longitude);

    if (withGps.length <= 1) return;

    const remaining = [...withGps];
    const optimized: Party[] = [remaining.shift()!];

    while (remaining.length > 0) {
      const last = optimized[optimized.length - 1];
      let bestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const curr = remaining[i];
        const dist = Math.hypot(
          (curr.latitude || 0) - (last.latitude || 0),
          (curr.longitude || 0) - (last.longitude || 0)
        );
        if (dist < minDistance) {
          minDistance = dist;
          bestIdx = i;
        }
      }

      optimized.push(remaining.splice(bestIdx, 1)[0]);
    }

    setOrderedParties([...optimized, ...withoutGps]);
  };

  // Handle Create and Generate Share Token
  const handleCreateRoute = async () => {
    if (orderedParties.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const partyIds = orderedParties.map(p => p.id!).filter(Boolean);
      const res = await createAndShareDailyRoute({
        party_ids: partyIds,
        route_name: routeName.trim() || 'Daily Delivery Route',
        vehicle_id: selectedVehicleId || undefined,
        driver_id: selectedDriverId || undefined,
        notes: notes.trim() || undefined
      });

      setCreatedTrip(res);
      if (onRouteCreated) onRouteCreated(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate shared daily route.');
    } finally {
      setLoading(false);
    }
  };

  // Build Public Share URL
  const getFullShareUrl = (): string => {
    if (!createdTrip?.share_token) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/driver?trip_token=${createdTrip.share_token}`;
  };

  // Build Multi-Stop Google Maps Navigation URL
  const getGoogleMapsDirUrl = (): string => {
    const validGps = orderedParties.filter(p => p.latitude && p.longitude);
    if (validGps.length === 0) return 'https://www.google.com/maps';
    const origin = `${validGps[0].latitude},${validGps[0].longitude}`;
    const destination = `${validGps[validGps.length - 1].latitude},${validGps[validGps.length - 1].longitude}`;
    const waypoints = validGps
      .slice(1, validGps.length - 1)
      .map(p => `${p.latitude},${p.longitude}`)
      .join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`;
  };

  // Formatted WhatsApp Message
  const getWhatsAppMessage = (): string => {
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const shareUrl = getFullShareUrl();
    const gmapsUrl = getGoogleMapsDirUrl();

    const stopLines = orderedParties.map((p, idx) => {
      const city = p.city ? ` (${p.city})` : '';
      const phone = p.mobile_no ? ` 📞 ${p.mobile_no}` : '';
      return `${idx + 1}. *${p.party_name}*${city}${phone}`;
    }).join('\n');

    return `🚚 *SHREEJI HEALTHCARE — DAILY DELIVERY ROUTE*
📅 *Date:* ${dateStr}
📍 *Route:* ${routeName || 'Daily Delivery'} (${orderedParties.length} Stops)

*DELIVERY STOPS SEQUENCE:*
${stopLines}

---------------------------------------
🗺️ *1-TAP LIVE DRIVER MAP (1s Live GPS):*
👉 ${shareUrl}
_(Opens full interactive road map, 1s GPS tracking, and delivery confirmation without login)_

🧭 *DIRECT GOOGLE MAPS NAVIGATION:*
👉 ${gmapsUrl}`;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(getWhatsAppMessage());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyLink = () => {
    const url = getFullShareUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Daily Route: ${routeName}`,
          text: getWhatsAppMessage(),
          url: getFullShareUrl()
        });
      } catch (_) {}
    } else {
      handleShareWhatsApp();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-600/30 text-white">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <span>Create & Share Daily Route</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {orderedParties.length} Stops
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Generate 1-tap WhatsApp driver link with 1s road GPS tracking & live navigation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!createdTrip ? (
            <>
              {/* Route Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Route Name / Run Title
                  </label>
                  <input
                    type="text"
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                    placeholder="e.g. Nadiad Medical Daily Run"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Assign Fleet Vehicle (Optional)</span>
                  </label>
                  <select
                    value={selectedVehicleId || ''}
                    onChange={e => setSelectedVehicleId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">No Vehicle Assigned (Open Link)</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_number} ({v.model || 'Van'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Assign Driver (Optional)</span>
                  </label>
                  <select
                    value={selectedDriverId || ''}
                    onChange={e => setSelectedDriverId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">Any Driver (Open Access)</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.full_name || d.username} ({d.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stops List Header & Auto-Optimize Action */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>Stops Sequence ({orderedParties.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoOptimize}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-extrabold border border-indigo-200 transition-colors cursor-pointer"
                    title="Sort stops efficiently by road coordinates"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Auto-Optimize Sequence</span>
                  </button>
                </div>

                {/* Ordered List of Parties */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {orderedParties.map((party, index) => {
                    const hasGps = party.latitude && party.longitude;
                    return (
                      <div
                        key={party.id || index}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div className="truncate">
                            <div className="font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                              <span>{party.party_name}</span>
                              {party.party_code && (
                                <span className="text-[10px] text-slate-400 font-mono">[{party.party_code}]</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                              {party.city && <span className="font-semibold text-slate-700">{party.city}</span>}
                              {hasGps ? (
                                <span className="text-emerald-700 font-mono text-[10px] bg-emerald-100/70 px-1.5 py-0.2 rounded">
                                  📍 GPS Set
                                </span>
                              ) : (
                                <span className="text-amber-700 font-mono text-[10px] bg-amber-100/70 px-1.5 py-0.2 rounded">
                                  ⚠️ No GPS
                                </span>
                              )}
                              {party.mobile_no && (
                                <span className="text-slate-400 font-mono">📞 {party.mobile_no}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Move Up/Down Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveStop(index, 'up')}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-20 cursor-pointer"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={index === orderedParties.length - 1}
                            onClick={() => moveStop(index, 'down')}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-20 cursor-pointer"
                            title="Move Down"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Success & Sharing Dashboard */
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-950">Daily Route Created Successfully!</h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Trip #{createdTrip.trip_number} with {createdTrip.total_stops} sequenced stops is ready for dispatch.
                  </p>
                </div>
              </div>

              {/* Shareable Link Display */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  Public Driver Share URL (Zero-Login Direct Navigation)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getFullShareUrl()}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedLink ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* 1-Tap Share Actions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share on WhatsApp (વોટ્સએપ શેર)</span>
                </button>

                {typeof navigator !== 'undefined' && (navigator as any).share ? (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Native Share (મોબાઈલ શેર)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Full Route Link</span>
                  </button>
                )}

                <a
                  href={getGoogleMapsDirUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-center"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Open Multi-Stop Google Maps</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenDriverApp) {
                      onOpenDriverApp(createdTrip.share_token);
                    } else if (typeof window !== 'undefined') {
                      window.location.href = getFullShareUrl();
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Truck className="w-4 h-4 text-emerald-400" />
                  <span>Open Driver App Directly</span>
                </button>
              </div>

              {/* Security & Tracking Guarantee */}
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Driver link activates 1-second continuous GPS tracking, speed recording, and lock-screen background updates.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-4 sm:px-6 py-3 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            {createdTrip ? 'Done (પૂર્ણ)' : 'Cancel'}
          </button>

          {!createdTrip && (
            <button
              type="button"
              disabled={loading || orderedParties.length === 0}
              onClick={handleCreateRoute}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-md shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{loading ? 'Creating Route...' : 'Create & Share Route'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
