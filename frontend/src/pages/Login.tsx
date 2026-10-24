import React, { useState, useEffect, useCallback } from 'react';
import { 
  Eye, 
  EyeOff, 
  Shield, 
  Truck, 
  User, 
  Crown, 
  Server, 
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    return localStorage.getItem('api_server_url') || DEFAULT_REMOTE_API;
  });
  const [saveServerMsg, setSaveServerMsg] = useState('');



  // Fixed accounts for offline authentication resilience
  const fixedOfflineUsers = [
    {
      username: 'Aryan180607',
      password: 'Aryan@2007',
      role: 'super_admin',
      fullName: 'Aryan Darji',
      permissions: ['create_job', 'save_job', 'manage_users', 'view_reports', 'admin', 'device_controls'],
    },
    {
      username: 'Tushar@9263',
      password: 'Shreeji@9263',
      role: 'owner',
      fullName: 'Tushar Patel',
      permissions: ['create_job', 'save_job', 'manage_users', 'view_reports', 'admin'],
    },
    {
      username: 'driver',
      password: 'driver123',
      role: 'driver',
      fullName: 'Driver',
      permissions: ['create_job'],
    },
  ];

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
            const matched = fixedOfflineUsers.find(
              r => r.username.toLowerCase() === usr.toLowerCase()
            );
            localStorage.setItem('user', JSON.stringify({
              username: usr,
              role: matched ? matched.role : 'super_admin',
              full_name: matched ? matched.fullName : usr,
              permissions: matched ? matched.permissions : ['create_job', 'save_job']
            }));
          }
        } catch {
          const matched = fixedOfflineUsers.find(
            r => r.username.toLowerCase() === usr.toLowerCase()
          );
          localStorage.setItem('user', JSON.stringify({
            username: usr,
            role: matched ? matched.role : 'super_admin',
            full_name: matched ? matched.fullName : usr,
            permissions: matched ? matched.permissions : ['create_job', 'save_job']
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

      // OFFLINE FALLBACK: If network fails or server is unreachable, allow fixed offline accounts
      const matched = fixedOfflineUsers.find(
        r => r.username.toLowerCase() === usr.trim().toLowerCase() && r.password === pwd
      );

      if (matched) {
        const offlineToken = `offline_token_${matched.username}_${Date.now()}`;
        const offlineUser = {
          id: matched.username === 'Aryan180607' ? 1 : (matched.username === 'Tushar@9263' ? 2 : 3),
          username: matched.username,
          full_name: matched.fullName,
          role: matched.role,
          permissions: matched.permissions,
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
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-3 sm:p-6 font-sans text-slate-100">
      <div className="w-full max-w-lg bg-[#111827] rounded-3xl shadow-2xl border border-slate-800/90 overflow-hidden flex flex-col">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-6 py-5 sm:px-8 sm:py-6 relative overflow-hidden border-b border-slate-800">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <Printer className="w-44 h-44 text-white" />
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg">
                <Printer className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 font-display">
                  MARG Envelope Manager
                </h1>
                <p className="text-blue-200 text-xs sm:text-sm font-medium">
                  Executive Dispatch System • ડિસ્પેચ મેનેજર
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Server Connection Bar */}
        <div className="bg-[#161C28] border-b border-slate-800 px-5 sm:px-8 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 truncate max-w-[280px]">
            <Server className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="truncate font-mono text-xs text-slate-300">{getApiBase()}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer py-1 px-2 rounded"
          >
            {showServerConfig ? 'Close' : 'Change Server'}
          </button>
        </div>

        {/* Expandable Server Configurator */}
        {showServerConfig && (
          <div className="bg-[#0D131F] border-b border-slate-800 px-5 sm:px-8 py-3 text-xs space-y-2">
            <label className="font-semibold text-slate-300 block">
              Backend Server URL (Cloud or Local IP):
            </label>
            <input
              type="text"
              value={customServerUrl}
              onChange={(e) => setCustomServerUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080 or https://..."
              className="w-full px-3 py-2 bg-[#161C28] border border-slate-700 rounded-xl font-mono text-xs text-white focus:ring-1 focus:ring-blue-500"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs cursor-pointer shadow-sm transition-colors"
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
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-slate-700"
              >
                Reset Default
              </button>
            </div>
            {saveServerMsg && (
              <p className="text-blue-400 font-medium text-xs">{saveServerMsg}</p>
            )}
          </div>
        )}

        {/* Content Container */}
        <div className="p-5 sm:p-8 space-y-5 flex-1 bg-[#111827]">

          {/* Form Error Message */}
          {formError && (
            <div role="alert" className="bg-rose-950/60 border border-rose-800/80 text-rose-300 p-3 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Login Failed: </span>
                <span>{formError}</span>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Username / યુઝરનેમ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-[#0D131F] border border-slate-800 rounded-xl focus:bg-[#161C28] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium text-white transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password / પાસવર્ડ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-12 py-2.5 text-xs sm:text-sm bg-[#0D131F] border border-slate-800 rounded-xl focus:bg-[#161C28] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium text-white transition-colors"
                  required
                />
                {/* Show/Hide Password Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white focus:outline-none transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-blue-400" />
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
                className="w-full py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group cursor-pointer text-xs sm:text-sm"
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

        {/* Footer Info */}
        <div className="bg-[#0D131F] px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Zero-Internet Ready • Offline Sync</span>
          <span>v2.4.0 APK</span>
        </div>
      </div>
    </div>
  );
};
