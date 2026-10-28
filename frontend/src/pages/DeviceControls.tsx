import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  Camera,
  Mic,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  User,
  Crown,
  Activity,
  ArrowLeft,
} from 'lucide-react';
import { API_BASE } from '../api/client';

interface DeviceItem {
  userId: number;
  fullName: string;
  username: string;
  role: string;
  email: string;
  mobile: string;
  userStatus: string;
  deviceName: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  storageAccess: boolean;
  storageQuotaMb: number;
  storageUsedMb: number;
  cameraAccess: boolean;
  cameraMode: string;
  micAccess: boolean;
  micMode: string;
  remoteLocked: boolean;
  trackingEnabled: boolean;
  lastSyncedAt: string;
}

interface DeviceControlsProps {
  onNavigate?: (tab: string) => void;
}

export const DeviceControls: React.FC<DeviceControlsProps> = ({ onNavigate }) => {
  const currentUser = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const isSuperAdmin = currentUser.role === 'super_admin';

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchDevices = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/device-controls`, {
        headers: getAuthHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Access restricted');
      }
      setDevices(data.devices || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch device controls');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchDevices();
    }
  }, [isSuperAdmin]);

  const handleUpdateDevice = async (d: DeviceItem) => {
    setSavingId(d.userId);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/device-controls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          user_id: d.userId,
          storage_access: d.storageAccess,
          storage_quota_mb: d.storageQuotaMb,
          camera_access: d.cameraAccess,
          camera_mode: d.cameraMode,
          mic_access: d.micAccess,
          mic_mode: d.micMode,
          remote_locked: d.remoteLocked,
          tracking_enabled: d.trackingEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update device permissions');
      }
      setSuccessMsg(`Permissions updated for ${d.fullName}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleFieldChange = (userId: number, field: keyof DeviceItem, value: any) => {
    setDevices((prev) =>
      prev.map((item) => (item.userId === userId ? { ...item, [field]: value } : item))
    );
  };

  // 1. FORBIDDEN FOR OWNER AND NON-SUPER ADMIN
  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-lg border border-rose-200">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            HTTP 403 Forbidden Access
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Super Admin Aryan Darji Access Only
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            Device hardware, storage quota, camera, and microphone controls are strictly restricted to{' '}
            <strong className="text-slate-900">Super Admin Aryan Darji (Aryan180607)</strong>.
          </p>
          <p className="text-xs text-rose-600 font-bold bg-rose-50 p-3 rounded-xl border border-rose-200">
            Owner (Tushar9263) and Employee accounts are forbidden from modifying field device hardware privileges.
          </p>
        </div>

        <div className="pt-4">
          <button
            onClick={() => onNavigate && onNavigate('dashboard')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs shadow-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. AUTHORIZED SUPER ADMIN INTERFACE
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-400" />
              Super Admin Exclusive Access
            </span>
            <span className="text-xs text-slate-400">Logged as: Aryan Darji (Aryan180607)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
            <Smartphone className="w-6 h-6 text-indigo-400" />
            <span>User Device & Hardware Controls</span>
          </h1>
          <p className="text-xs text-indigo-200/80 font-medium max-w-2xl">
            Centralized hardware management: enforce local storage quota, allow/block camera access, configure microphone / emergency SOS mode, and lock lost field devices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDevices}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/20 text-xs font-bold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'motion-safe:animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs motion-safe:animate-in motion-safe:fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 shadow-xs motion-safe:animate-in motion-safe:fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Total Devices</span>
            <p className="text-lg font-black text-slate-800">{devices.length}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Storage Active</span>
            <p className="text-lg font-black text-slate-800">
              {devices.filter((d) => d.storageAccess).length} Active
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Camera Enabled</span>
            <p className="text-lg font-black text-slate-800">
              {devices.filter((d) => d.cameraAccess).length} Devices
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Mic / SOS Audio</span>
            <p className="text-lg font-black text-slate-800">
              {devices.filter((d) => d.micAccess).length} Devices
            </p>
          </div>
        </div>
      </div>

      {/* Devices List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Registered Field Users & Hardware Privileges</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-medium">Changes apply immediately on next device heartbeat</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {devices.map((device) => {
            const isSaving = savingId === device.userId;

            return (
              <div
                key={device.userId}
                className={`p-5 rounded-3xl border transition-colors ${
                  device.remoteLocked
                    ? 'bg-rose-50/50 border-rose-300 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'
                }`}
              >
                {/* User & Device Info Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                      {device.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-slate-900 text-sm">{device.fullName}</h3>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {device.role}
                        </span>
                        {device.remoteLocked && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-600 text-white flex items-center gap-1 motion-safe:animate-pulse">
                            <Lock className="w-3 h-3" /> Locked
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        @{device.username} / Mobile: {device.mobile} / {device.deviceModel} ({device.osVersion})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleUpdateDevice(device)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>{isSaving ? 'Updating...' : 'Save Privileges'}</span>
                    </button>
                  </div>
                </div>

                {/* Hardware Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
                  {/* 1. Storage Control */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-purple-600" />
                        <span>Local Storage Control</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={device.storageAccess}
                        onChange={(e) => handleFieldChange(device.userId, 'storageAccess', e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Controls offline SQLite/IndexedDB order caching and PDF receipts storage.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Quota Limit</label>
                      <select
                        disabled={!device.storageAccess}
                        value={device.storageQuotaMb}
                        onChange={(e) => handleFieldChange(device.userId, 'storageQuotaMb', parseInt(e.target.value, 10))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs disabled:opacity-50"
                      >
                        <option value={512}>512 MB (Standard)</option>
                        <option value={1024}>1024 MB / 1 GB (Recommended)</option>
                        <option value={2048}>2048 MB / 2 GB (High)</option>
                        <option value={5120}>5120 MB / 5 GB (Enterprise)</option>
                      </select>
                    </div>
                  </div>

                  {/* 2. Camera Control */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Camera Access</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={device.cameraAccess}
                        onChange={(e) => handleFieldChange(device.userId, 'cameraAccess', e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Drug license photography, store signboard verification, and cheque scanning.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Camera Mode</label>
                      <select
                        disabled={!device.cameraAccess}
                        value={device.cameraMode}
                        onChange={(e) => handleFieldChange(device.userId, 'cameraMode', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs disabled:opacity-50"
                      >
                        <option value="rear_and_front">Rear & Front (Full Access)</option>
                        <option value="cctv_live_stream">Live CCTV Stream Only (Zero Recording)</option>
                        <option value="rear_only">Rear Camera Only (Docs / Cheque)</option>
                        <option value="blocked">Camera Blocked</option>
                      </select>
                    </div>
                  </div>

                  {/* 3. Mic / Voice Control */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                        <Mic className="w-4 h-4 text-amber-600" />
                        <span>Microphone / SOS Audio</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={device.micAccess}
                        onChange={(e) => handleFieldChange(device.userId, 'micAccess', e.target.checked)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Live CCTV audio streaming and Super Admin emergency calling (zero local recording).
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Microphone Mode</label>
                      <select
                        disabled={!device.micAccess}
                        value={device.micMode}
                        onChange={(e) => handleFieldChange(device.userId, 'micMode', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs disabled:opacity-50"
                      >
                        <option value="cctv_live_audio">Live Stream Audio Only (Zero Recording)</option>
                        <option value="emergency_only">SOS Emergency Calling Only</option>
                        <option value="allowed">Always Allowed (Full Audio)</option>
                        <option value="blocked">Microphone Blocked</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Device Security & Remote Lock Strip */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={device.trackingEnabled}
                        onChange={(e) => handleFieldChange(device.userId, 'trackingEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                      />
                      <span className="font-bold text-slate-700">GPS Live Tour Tracking</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={device.remoteLocked}
                        onChange={(e) => handleFieldChange(device.userId, 'remoteLocked', e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 border-slate-300"
                      />
                      <span className="font-extrabold text-rose-700 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        Remote Lock Device
                      </span>
                    </label>
                  </div>

                  <span className="text-xs text-slate-400">
                    Last Synced: {new Date(device.lastSyncedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
