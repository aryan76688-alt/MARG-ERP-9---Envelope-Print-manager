import React, { useState } from 'react';
import { Navigation, ShieldCheck, MapPin, CheckCircle2, X } from 'lucide-react';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onDeny: () => void;
  appName?: string;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  isOpen,
  onAllow,
  onDeny,
  appName = 'Shreeji Healthcare',
}) => {
  const [isRequesting, setIsRequesting] = useState(false);

  if (!isOpen) return null;

  const handleAllowClick = () => {
    setIsRequesting(true);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser or device.');
      setIsRequesting(false);
      onDeny();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setIsRequesting(false);
        try {
          localStorage.setItem('shreeji_location_permission_granted', 'true');
        } catch {}
        onAllow();
      },
      (err) => {
        setIsRequesting(false);
        console.warn('Location permission error:', err);
        if (err.code === 1) {
          alert('Location permission was denied. Please allow location in your browser or phone settings.');
        }
        onDeny();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onDeny}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="relative w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Navigation className="w-6 h-6 text-emerald-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            </span>
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider font-bold uppercase text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800/60">
              GPS & Fleet Safety
            </span>
            <h3 className="text-base font-bold text-white mt-1">
              Enable Location Access
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          {appName} uses precise live GPS to display chemist delivery locations, verify stop visits, and provide route-wise map guidance.
        </p>

        {/* Feature Highlights */}
        <div className="space-y-2 mb-5 bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
          <div className="flex items-start gap-2.5 text-xs text-slate-200">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Real-time chemist route & cases delivery tracking</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>Automatic arrival geofence detection at medical stores</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="font-semibold">
              Strictly restricted: User location is viewable ONLY by Super Admin and Admin.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onDeny}
            disabled={isRequesting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 transition-colors border border-slate-700 disabled:opacity-50"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={handleAllowClick}
            disabled={isRequesting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isRequesting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                <span>Allow Location</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
