import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  Upload, 
  Trash2, 
  Download, 
  ArrowLeft, 
  RefreshCw, 
  ShieldAlert, 
  HardDrive, 
  Check, 
  AlertCircle,
  Home,
  ChevronRight
} from 'lucide-react';
import { API_BASE } from '../api/client';

interface StorageItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

interface StorageManagerProps {
  onNavigate: (tab: string) => void;
}

export const StorageManager: React.FC<StorageManagerProps> = ({ onNavigate }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [rootPath, setRootPath] = useState<string>('');

  // Modals
  const [newFolderOpen, setNewFolderOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Check role: STRICTLY super_admin only
  let isSuperAdmin = false;
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    isSuperAdmin = user.role === 'super_admin';
  } catch {}

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadDirectory = async (path: string = '') => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/storage/list?path=${encodeURIComponent(path)}`, {
        headers: getAuthHeader()
      });

      if (res.status === 403) {
        setError('403 Forbidden: Only Super Admin can access phone storage.');
        setItems([]);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to list directory contents');
      }

      const data = await res.json();
      setItems(data.items || []);
      setCurrentPath(data.current_path || '');
      if (data.root) setRootPath(data.root);
    } catch (err: any) {
      setError(err.message || 'Error loading directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadDirectory(currentPath);
    }
  }, [currentPath, isSuperAdmin]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({
          path: currentPath,
          folder_name: newFolderName.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create folder');
      }

      setNewFolderName('');
      setNewFolderOpen(false);
      setStatusMsg('Folder created successfully');
      setTimeout(() => setStatusMsg(''), 3000);
      loadDirectory(currentPath);
    } catch (err: any) {
      alert(err.message || 'Folder creation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/upload`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }

      setStatusMsg(`Uploaded ${file.name} successfully`);
      setTimeout(() => setStatusMsg(''), 3000);
      loadDirectory(currentPath);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setActionLoading(false);
      e.target.value = '';
    }
  };

  const handleDeleteItem = async (itemPath: string, isDir: boolean) => {
    const confirmed = window.confirm(`Are you sure you want to delete this ${isDir ? 'folder and all its contents' : 'file'}?`);
    if (!confirmed) return;

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/item?path=${encodeURIComponent(itemPath)}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete');
      }

      setStatusMsg('Deleted successfully');
      setTimeout(() => setStatusMsg(''), 3000);
      loadDirectory(currentPath);
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = (itemPath: string) => {
    const token = localStorage.getItem('token');
    const url = `${API_BASE}/storage/download?path=${encodeURIComponent(itemPath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
  };

  const navigateToFolder = (subpath: string) => {
    setCurrentPath(subpath);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // If not super admin, block access
  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4 pt-16">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white font-display">Super Admin Access Only</h2>
        <p className="text-sm text-slate-400">
          Phone local storage and folder creation is strictly restricted to Super Admin. Regular admin and staff users are not permitted.
        </p>
        <button
          onClick={() => onNavigate('dashboard')}
          className="px-5 py-2.5 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all text-xs"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-white font-display">Phone Local Storage</h1>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-400">Create folders and manage files on host storage</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewFolderOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Folder</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow-sm transition-all cursor-pointer">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Upload File</span>
            <input type="file" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{statusMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs font-bold text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Path Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/80 px-3 py-2 rounded-xl overflow-x-auto">
        <button
          onClick={() => setCurrentPath('')}
          className="hover:text-cyan-400 flex items-center gap-1 font-semibold text-slate-300 cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span>root</span>
        </button>
        {breadcrumbs.map((segment, idx) => {
          const sub = breadcrumbs.slice(0, idx + 1).join('/');
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={sub}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <button
                onClick={() => setCurrentPath(sub)}
                className={`font-semibold cursor-pointer truncate max-w-[120px] ${
                  isLast ? 'text-cyan-400 font-bold' : 'hover:text-slate-200'
                }`}
              >
                {segment}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* File & Folder List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Scanning storage...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span>This folder is empty. Create a new folder or upload files.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {items.map((item) => (
              <div
                key={item.path}
                className="flex items-center justify-between p-3.5 hover:bg-slate-800/50 transition-colors gap-3"
              >
                <div 
                  onClick={() => item.is_dir ? navigateToFolder(item.path) : handleDownload(item.path)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.is_dir 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                      : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  }`}>
                    {item.is_dir ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate hover:text-cyan-300">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {item.is_dir ? 'Directory' : formatBytes(item.size)} • {new Date(item.modified).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!item.is_dir && (
                    <button
                      onClick={() => handleDownload(item.path)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 border border-slate-700 transition-all cursor-pointer"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteItem(item.path, item.is_dir)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 transition-all cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form 
            onSubmit={handleCreateFolder}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-2xl max-w-sm w-full space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-black text-white">Create New Folder</h3>
              <button 
                type="button" 
                onClick={() => setNewFolderOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                Folder Name
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Invoices_2026 or Backups"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading || !newFolderName.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
