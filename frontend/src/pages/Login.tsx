import React, { useState, useEffect, useCallback } from 'react';
import { 
  Eye, 
  EyeOff, 
  Shield, 
  Truck, 
  User, 
  Crown, 
  Server, 
  Check, 
  AlertCircle,
  Lock,
  Printer,
  ArrowRight
} from 'lucide-react';
import { API_BASE, DEFAULT_REMOTE_API, getApiBase } from '../api/client';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('Aryan@2007');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('owner');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    return localStorage.getItem('api_server_url') || DEFAULT_REMOTE_API;
  });
  const [saveServerMsg, setSaveServerMsg] = useState('');



  const roles = [
    {
      id: 'owner',
      title: 'Owner',
      titleGu: 'માલિક',
      icon: Crown,
      username: 'owner',
      password: 'Aryan@2007',
      role: 'super_admin',
      fullName: 'Owner',
    },
    {
      id: 'driver',
      title: 'Driver',
      titleGu: 'ડ્રાઈવર',
      icon: Truck,
      username: 'driver',
      password: 'driver123',
      role: 'driver',
      fullName: 'Driver',
    },
    {
      id: 'admin',
      title: 'Admin',
      titleGu: 'એડમિન',
      icon: Shield,
      username: 'Aryan007',
      password: 'Aryan@2007',
      role: 'admin',
      fullName: 'Aryan',
    },
    {
      id: 'employee',
      title: 'Employee',
      titleGu: 'સ્ટાફ',
      icon: User,
      username: 'employee',
      password: 'employee123',
      role: 'employee',
      fullName: 'Staff',
    },
  ];

  const handleSelectRole = (r: typeof roles[0]) => {
    setSelectedRoleId(r.id);
    setUsername(r.username);
    setPassword(r.password);
    setFormError('');
  };

  const executeLogin = async (usr: string, pwd: string) => {
    setLoading(true);
    setFormError('');

    try {
      const loginUrl = `${API_BASE}/auth/login`;
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: usr.trim(),
          password: pwd,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.access_token);

        // Fetch authenticated user profile
        try {
          const userRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            localStorage.setItem('user', JSON.stringify(userData));
          } else {
            const matchedRole = roles.find(r => r.username.toLowerCase() === usr.toLowerCase());
            localStorage.setItem('user', JSON.stringify({
              username: usr,
              role: matchedRole ? matchedRole.role : 'employee',
              full_name: matchedRole ? matchedRole.fullName : usr
            }));
          }
        } catch {
          const matchedRole = roles.find(r => r.username.toLowerCase() === usr.toLowerCase());
          localStorage.setItem('user', JSON.stringify({
            username: usr,
            role: matchedRole ? matchedRole.role : 'employee',
            full_name: matchedRole ? matchedRole.fullName : usr
          }));
        }

        onLogin();
        return;
      }

      if (res.status === 401) {
        throw new Error('Invalid username or password. Please verify credentials.');
      }

      throw new Error(`Server returned error (${res.status}).`);
    } catch (err: any) {
      console.warn('Network or server login error:', err);

      // OFFLINE FALLBACK: If network fails or server is unreachable, allow standard offline accounts
      const matchedRole = roles.find(
        r => r.username.toLowerCase() === usr.trim().toLowerCase() && r.password === pwd
      );

      if (matchedRole) {
        const offlineToken = `offline_token_${matchedRole.id}_${Date.now()}`;
        const offlineUser = {
          id: matchedRole.id === 'owner' ? 1 : matchedRole.id === 'driver' ? 2 : 3,
          username: matchedRole.username,
          full_name: matchedRole.fullName,
          role: matchedRole.role,
          permissions: ['create_job', 'save_job'],
          is_offline_session: true,
        };

        localStorage.setItem('token', offlineToken);
        localStorage.setItem('user', JSON.stringify(offlineUser));
        onLogin();
        return;
      }

      setFormError(err.message || 'Unable to connect to server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(username, password);
  };

  const handleSaveServerUrl = () => {
    const cleaned = customServerUrl.trim().replace(/\/+$/, '');
    if (!cleaned) {
      localStorage.removeItem('api_server_url');
      setCustomServerUrl(DEFAULT_REMOTE_API);
      setSaveServerMsg('Reset to default Railway cloud server.');
    } else {
      localStorage.setItem('api_server_url', cleaned);
      setSaveServerMsg('Server URL saved! Reloading configuration...');
    }
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-3 sm:p-6 font-sans">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100/20 overflow-hidden flex flex-col">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-6 py-5 sm:px-8 sm:py-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <Printer className="w-44 h-44 text-white" />
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg">
                <Printer className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  MARG Envelope Manager
                </h1>
                <p className="text-blue-100 text-xs sm:text-sm font-medium">
                  Dispatch & Printing System • ડિસ્પેચ મેનેજર
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Server Connection Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 sm:px-8 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5 truncate max-w-[280px]">
            <Server className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span className="truncate font-mono text-xs">{getApiBase()}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer py-1 px-2 rounded"
          >
            {showServerConfig ? 'Close' : 'Change Server'}
          </button>
        </div>

        {/* Expandable Server Configurator */}
        {showServerConfig && (
          <div className="bg-slate-100/90 border-b border-slate-200 px-5 sm:px-8 py-3 text-xs space-y-2">
            <label className="font-semibold text-slate-700 block">
              Backend Server URL (Cloud or Local IP):
            </label>
            <input
              type="text"
              value={customServerUrl}
              onChange={(e) => setCustomServerUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080 or https://..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
            />
            {/* Quick 1-Tap Server Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-medium text-slate-500">Quick presets:</span>
              <button
                type="button"
                onClick={() => {
                  const url = 'http://192.168.1.10:8080';
                  setCustomServerUrl(url);
                  localStorage.setItem('api_server_url', url);
                  setSaveServerMsg('Connected to Office Wi-Fi PC! Reloading...');
                  setTimeout(() => window.location.reload(), 600);
                }}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium cursor-pointer transition-colors"
              >
                🏢 Office PC (192.168.1.10:8080)
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = 'http://localhost:8080';
                  setCustomServerUrl(url);
                  localStorage.setItem('api_server_url', url);
                  setSaveServerMsg('Connected to Localhost! Reloading...');
                  setTimeout(() => window.location.reload(), 600);
                }}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium cursor-pointer transition-colors"
              >
                💻 Localhost:8080
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-xs cursor-pointer shadow-sm transition-colors"
              >
                Save & Reconnect
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('api_server_url');
                  setCustomServerUrl(DEFAULT_REMOTE_API);
                  handleSaveServerUrl();
                }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                Reset Default
              </button>
            </div>
            {saveServerMsg && (
              <p className="text-blue-600 font-medium text-xs">{saveServerMsg}</p>
            )}
          </div>
        )}

        {/* Content Container */}
        <div className="p-5 sm:p-8 space-y-5 flex-1">

          {/* Issue 7 & 11 fix: Balanced Quick Role Selection without visual clutter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Quick Role Select • હોદ્દો પસંદ કરો</span>
              </label>
              {/* Issue 8 fix: Harmonized badge styling */}
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                1-Tap Auto Fill
              </span>
            </div>

            {/* Issue 11 fix: Simplified cards removing redundant badges & unifying color styles */}
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => {
                const Icon = r.icon;
                const isSelected = selectedRoleId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={`relative p-2.5 rounded-xl border text-left transition-all duration-150 flex items-center gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 text-xs leading-tight">
                          {r.title}
                        </span>
                        {isSelected && (
                          <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-normal leading-tight mt-0.5">
                        {r.titleGu}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Error Message */}
          {formError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Login Failed: </span>
                <span>{formError}</span>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username / યુઝરનેમ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSelectedRoleId('');
                  }}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50/70 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-900 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password / પાસવર્ડ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setSelectedRoleId('');
                  }}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-12 py-2.5 text-xs sm:text-sm bg-slate-50/70 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-900 transition-colors"
                  required
                />
                {/* Show/Hide Password Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group cursor-pointer text-xs sm:text-sm"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In • લોગિન કરો</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer Info (Issue 5 fix: bumped 11px to 12px text-xs) */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Zero-Internet Ready • Offline Sync</span>
          <span>v2.4.0 APK</span>
        </div>
      </div>
    </div>
  );
};
