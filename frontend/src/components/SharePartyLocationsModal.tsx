import React, { useState } from 'react';
import {
  X,
  Share2,
  MapPin,
  Copy,
  Check,
  ExternalLink,
  Navigation,
  Phone,
  MessageCircle,
  Building2,
  MapPinOff,
  CheckCircle2
} from 'lucide-react';
import { Party } from '../types';

interface SharePartyLocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
}

export const SharePartyLocationsModal: React.FC<SharePartyLocationsModalProps> = ({
  isOpen,
  onClose,
  parties
}) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSingleId, setCopiedSingleId] = useState<number | null>(null);
  const [includeGujarati, setIncludeGujarati] = useState(true);
  const [includeAddress, setIncludeAddress] = useState(true);
  const [includePhone, setIncludePhone] = useState(true);

  if (!isOpen || parties.length === 0) return null;

  const partiesWithGps = parties.filter(p => p.latitude && p.longitude);
  const partiesWithoutGps = parties.filter(p => !p.latitude || !p.longitude);

  // Get direct Google Maps link for a party (exact GPS pin, or search by name & city as fallback)
  const getPartyMapsUrl = (p: Party): string => {
    if (p.latitude && p.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
    }
    const searchTerms = [p.party_name, p.address, p.city].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTerms)}`;
  };

  // Get multi-stop directions URL for parties with GPS
  const getMultiStopDirectionsUrl = (): string => {
    if (partiesWithGps.length === 0) return 'https://www.google.com/maps';
    if (partiesWithGps.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${partiesWithGps[0].latitude},${partiesWithGps[0].longitude}&travelmode=driving`;
    }
    const origin = `${partiesWithGps[0].latitude},${partiesWithGps[0].longitude}`;
    const destination = `${partiesWithGps[partiesWithGps.length - 1].latitude},${partiesWithGps[partiesWithGps.length - 1].longitude}`;
    const waypoints = partiesWithGps
      .slice(1, partiesWithGps.length - 1)
      .map(p => `${p.latitude},${p.longitude}`)
      .join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`;
  };

  // Build formatted text message for sharing
  const buildShareMessage = (): string => {
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    if (parties.length === 1) {
      const p = parties[0];
      const mapsUrl = getPartyMapsUrl(p);
      const lines = [
        `📍 *SHREEJI HEALTHCARE — PARTY LOCATION*`,
        `🏥 *${p.party_name}*`,
      ];
      if (includeGujarati && p.party_name_gu) {
        lines.push(`📝 *ગુજરાતી નામ:* ${p.party_name_gu}`);
      }
      if (p.party_code) {
        lines.push(`🏢 *Code:* ${p.party_code}`);
      }
      if (p.city) {
        lines.push(`📍 *City/Area:* ${p.city}`);
      }
      if (includeAddress && p.address) {
        const fullAddr = [p.address, p.address_line_2, p.address_line_3].filter(Boolean).join(', ');
        lines.push(`📌 *Address:* ${fullAddr}`);
      }
      if (includePhone && p.mobile_no) {
        lines.push(`📞 *Phone:* ${p.mobile_no}`);
      }
      lines.push(``);
      lines.push(`🗺️ *GOOGLE MAPS PIN:*`);
      lines.push(`👉 ${mapsUrl}`);
      return lines.join('\n');
    }

    // Multiple parties formatted list
    const items = parties.map((p, idx) => {
      const mapsUrl = getPartyMapsUrl(p);
      const cityStr = p.city ? ` (${p.city})` : '';
      const guStr = (includeGujarati && p.party_name_gu) ? `\n   📝 ${p.party_name_gu}` : '';
      const phoneStr = (includePhone && p.mobile_no) ? `\n   📞 ${p.mobile_no}` : '';
      const addrStr = (includeAddress && p.address) ? `\n   📌 ${p.address}` : '';
      const gpsStatus = (p.latitude && p.longitude) ? '📍 Map:' : '🔍 Map Search:';
      return `${idx + 1}. *${p.party_name}*${cityStr}${guStr}${phoneStr}${addrStr}\n   ${gpsStatus} ${mapsUrl}`;
    });

    const lines = [
      `📍 *SHREEJI HEALTHCARE — PARTY LOCATIONS (${parties.length})*`,
      `📅 *Date:* ${dateStr}`,
      ``,
      items.join('\n\n')
    ];

    if (partiesWithGps.length > 1) {
      lines.push(``);
      lines.push(`🧭 *COMBINED MULTI-STOP NAVIGATION ROUTE:*`);
      lines.push(`👉 ${getMultiStopDirectionsUrl()}`);
    }

    return lines.join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(buildShareMessage());
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `https://api.whatsapp.com/send?text=${text}`;
    } else {
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  };

  const handleCopyAll = () => {
    const text = buildShareMessage();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }
  };

  const handleCopySingle = (p: Party) => {
    const url = getPartyMapsUrl(p);
    const text = `${p.party_name} (${p.city || ''})\n${url}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedSingleId(p.id || 0);
      setTimeout(() => setCopiedSingleId(null), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Shreeji Healthcare - ${parties.length} Party Locations`,
          text: buildShareMessage(),
        });
      } catch {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div 
        className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Share Party Locations</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  {parties.length} {parties.length === 1 ? 'Party' : 'Parties'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                1-tap WhatsApp sharing with Google Maps GPS links & addresses
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* GPS Status Summary Pill */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-bold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>{partiesWithGps.length} with GPS Pin</span>
            </span>
            {partiesWithoutGps.length > 0 && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-300 font-bold flex items-center gap-1.5">
                <MapPinOff className="w-3.5 h-3.5 text-amber-400" />
                <span>{partiesWithoutGps.length} without GPS (Name search will be used)</span>
              </span>
            )}
          </div>

          {/* Toggle Options */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-800/40 border border-slate-800 rounded-2xl text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={includeGujarati}
                onChange={(e) => setIncludeGujarati(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900"
              />
              <span>Gujarati Name</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={includeAddress}
                onChange={(e) => setIncludeAddress(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900"
              />
              <span>Address</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={includePhone}
                onChange={(e) => setIncludePhone(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900"
              />
              <span>Phone</span>
            </label>
          </div>

          {/* Parties List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Selected Chemists / Medical Stores
            </span>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {parties.map((p, idx) => {
                const hasGps = Boolean(p.latitude && p.longitude);
                const mapsUrl = getPartyMapsUrl(p);
                return (
                  <div
                    key={p.id || idx}
                    className="p-3 bg-slate-800/60 border border-slate-750 hover:border-slate-700 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-slate-700/80 text-slate-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-white truncate max-w-[200px] sm:max-w-[280px]">
                            {p.party_name}
                          </span>
                          {p.party_name_gu && (
                            <span className="text-[11px] text-slate-400 font-gujarati truncate">
                              ({p.party_name_gu})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-400">
                          {p.city && <span>📍 {p.city}</span>}
                          {p.mobile_no && <span>📞 {p.mobile_no}</span>}
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${hasGps ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
                            {hasGps ? 'GPS Pin' : 'Address Search'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white flex items-center justify-center border border-emerald-500/30 transition-colors"
                        title="Open in Google Maps"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopySingle(p)}
                        className="w-7 h-7 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-650 transition-colors cursor-pointer"
                        title="Copy single location link"
                      >
                        {copiedSingleId === p.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Formatted Message Preview */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              WhatsApp / Text Preview
            </span>
            <pre className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar select-all">
              {buildShareMessage()}
            </pre>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/50 space-y-2.5">
          {/* Main 1-Tap WhatsApp Share */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Share on WhatsApp ({parties.length} {parties.length === 1 ? 'Location' : 'Locations'})</span>
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="py-2.5 px-3 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-750 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              {copiedAll ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-black">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy List</span>
                </>
              )}
            </button>

            {partiesWithGps.length > 0 ? (
              <a
                href={getMultiStopDirectionsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 border border-teal-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all text-center"
              >
                <Navigation className="w-3.5 h-3.5 text-teal-400" />
                <span>Google Route</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-xl bg-slate-900 text-slate-600 border border-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Navigation className="w-3.5 h-3.5 text-slate-600" />
                <span>No GPS Pins</span>
              </button>
            )}

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-2.5 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer col-span-2 sm:col-span-1"
              >
                <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Device Share</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs transition-all cursor-pointer col-span-2 sm:col-span-1"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
