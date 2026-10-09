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
import { API_BASE, DEFAULT_REMOTE_API } from '../api/client';

const GOOGLE_CLIENT_ID_DEFAULT = '58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('Aryan@2007');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('owner');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(GOOGLE_CLIENT_ID_DEFAULT);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    return localStorage.getItem('api_server_url') || DEFAULT_REMOTE_API;
  });
  const [saveServerMsg, setSaveServerMsg] = useState('');

  // Fetch configured Google Client ID from backend
  useEffect(() => {
    fetch(`${API_BASE}/auth/google/client-id`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.client_id) {
          setGoogleClientId(data.client_id);
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogleResponse = useCallback(async (response: any) => {
    if (!response?.credential) {
      setError('No credential received from Google.');
      return;
    }
    setGoogleLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Google sign-in authentication failed on server');
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        // Fetch profile
        try {
          const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            localStorage.setItem('user', JSON.stringify(meData));
          }
        } catch {}
      }

      onLogin();
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setError(err.message || 'Google Sign-In failed. Please try again or use direct role login.');
    } finally {
      setGoogleLoading(false);
    }
  }, [onLogin]);

  // Initialize Google Identity Services
  useEffect(() => {
    const initGsi = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        try {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          const btnEl = document.getElementById('google-signin-btn-container');
          if (btnEl) {
            btnEl.innerHTML = '';
            google.accounts.id.renderButton(btnEl, {
              theme: 'outline',
              size: 'large',
              type: 'standard',
              text: 'continue_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: 320,
            });
          }
        } catch (err) {
          console.warn('Google Identity Services init error:', err);
        }
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGsi();
    } else {
      const timer = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(timer);
          initGsi();
        }
      }, 400);
      return () => clearInterval(timer);
    }
  }, [googleClientId, handleGoogleResponse]);

  const triggerGooglePrompt = () => {
    const google = (window as any).google;
    if (google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      setError('Google Sign-In services loading or offline. Check network connection or use Role Login below.');
    }
  };

  const roles = [
    {
      id: 'owner',
      title: 'Owner',
      titleGu: 'માલિક',
      badge: 'Super Admin',
      icon: Crown,
      username: 'owner',
      password: 'Aryan@2007',
      role: 'super_admin',
      fullName: 'Owner',
      borderActive: 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/40 shadow-sm',
      iconBg: 'bg-amber-500 text-white shadow-amber-500/30',
      badgeStyle: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      id: 'driver',
      title: 'Driver',
      titleGu: 'ડ્રાઈવર',
      badge: 'Driver Mode & POD',
      icon: Truck,
      username: 'driver',
      password: 'driver123',
      role: 'driver',
      fullName: 'Driver',
      borderActive: 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-400/40 shadow-sm',
      iconBg: 'bg-emerald-600 text-white shadow-emerald-500/30',
      badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'admin',
      title: 'Admin',
      titleGu: 'એડમિન',
      badge: 'Manager',
      icon: Shield,
      username: 'Aryan007',
      password: 'Aryan@2007',
      role: 'admin',
      fullName: 'Aryan',
      borderActive: 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-400/40 shadow-sm',
      iconBg: 'bg-blue-600 text-white shadow-blue-500/30',
      badgeStyle: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      id: 'employee',
      title: 'Employee',
      titleGu: 'સ્ટાફ',
      badge: 'Operator',
      icon: User,
      username: 'employee',
      password: 'employee123',
      role: 'employee',
      fullName: 'Staff',
      borderActive: 'border-purple-500 bg-purple-50/70 ring-2 ring-purple-400/40 shadow-sm',
      iconBg: 'bg-purple-600 text-white shadow-purple-500/30',
      badgeStyle: 'bg-purple-100 text-purple-800 border-purple-200',
    },
  ];

  const handleSelectRole = (r: typeof roles[0]) => {
    setSelectedRoleId(r.id);
    setUsername(r.username);
    setPassword(r.password);
    setError('');
  };

  const executeLogin = async (usr: string, pwd: string) => {
    setLoading(true);
    setError('');

    try {
      // 1. Attempt API login via configured API_BASE
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

      setError(err.message || 'Unable to connect to server. Please check your connection.');
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
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-6 py-6 sm:px-8 sm:py-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <Printer className="w-44 h-44 text-white" />
          </div>

          <div className="relative z-10 flex items-center gap-3.5 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg">
              <Printer className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                MARG Envelope Manager
              </h1>
              <p className="text-blue-100 text-xs sm:text-sm font-medium">
                Dispatch & Printing System • ડિસ્પેચ મેનેજર
              </p>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="p-5 sm:p-8 space-y-5 flex-1">
          {/* Google Sign-In Card */}
          <div className="bg-slate-50/90 p-3.5 sm:p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>Google Sign-In • ગૂગલ લોગિન</span>
              </label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-full">
                ⚡ 1-Tap Fast Login
              </span>
            </div>

            {/* Official Google GSI Render Mount */}
            <div id="google-signin-btn-container" className="flex justify-center w-full min-h-[42px]" />

            {/* Fallback Custom Interactive Button */}
            <button
              type="button"
              onClick={triggerGooglePrompt}
              disabled={googleLoading}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-xl shadow-sm font-bold text-slate-800 flex items-center justify-center gap-2.5 transition-all hover:shadow cursor-pointer text-xs sm:text-sm"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>{googleLoading ? 'Connecting with Google...' : 'Continue with Google • ગૂગલથી સાઇન ઇન કરો'}</span>
            </button>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 px-0.5">
              <span className="truncate max-w-[280px]">Client ID: {googleClientId.slice(0, 16)}...apps.googleusercontent.com</span>
              <span className="text-blue-600 font-semibold">Active</span>
            </div>
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[10px] font-black uppercase tracking-wider">
              અથવા હોદ્દો / પાસવર્ડથી લોગિન કરો
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Quick Role Selection (Direct Role Select) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>Direct Role Select • હોદ્દો પસંદ કરો</span>
              </label>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                1-Tap Auto Fill
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {roles.map((r) => {
                const Icon = r.icon;
                const isSelected = selectedRoleId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={`relative p-3 rounded-xl border text-left transition-all duration-150 flex items-start gap-2.5 group cursor-pointer ${
                      isSelected
                        ? r.borderActive
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
                        r.iconBg
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900 text-sm leading-tight">
                          {r.title}
                        </span>
                        {isSelected && (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                        {r.titleGu}
                      </div>
                      <span
                        className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none ${r.badgeStyle}`}
                      >
                        {r.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Login Failed: </span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
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
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50/70 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-800 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
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
                  className="w-full pl-10 pr-12 py-2.5 text-sm bg-slate-50/70 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-800 transition-all"
                  required
                />
                {/* Show/Hide Password Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
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
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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

          {/* Server Connection Information & Configuration Toggle */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5 truncate max-w-[260px]">
                <Server className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {API_BASE}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] hover:underline cursor-pointer"
              >
                {showServerConfig ? 'Close' : 'Change Server'}
              </button>
            </div>

            {/* Expandable Server Configurator */}
            {showServerConfig && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <label className="font-bold text-slate-700 block">
                  Backend Server URL (Cloud or Local IP):
                </label>
                <input
                  type="text"
                  value={customServerUrl}
                  onChange={(e) => setCustomServerUrl(e.target.value)}
                  placeholder="https://marg-envelope-manager-production.up.railway.app"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveServerUrl}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 text-xs cursor-pointer"
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
                    className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded-lg text-xs cursor-pointer"
                  >
                    Reset Default
                  </button>
                </div>
                {saveServerMsg && (
                  <p className="text-emerald-600 font-semibold text-[11px]">{saveServerMsg}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Zero-Internet Ready • Offline Sync</span>
          <span>v2.4.0 APK</span>
        </div>
      </div>
    </div>
  );
};

