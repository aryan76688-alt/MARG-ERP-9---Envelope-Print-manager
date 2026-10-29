import React, { useState, useEffect, useMemo } from "react";
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  Upload, 
  Trash2, 
  Download, 
  ArrowLeft, 
  RefreshCw, 
  HardDrive, 
  Check, 
  AlertCircle,
  Home,
  ChevronRight,
  Users as UsersIcon,
  Search,
  PieChart,
  X
} from "lucide-react";
import { API_BASE } from "../api/client";

interface StorageItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  size_formatted?: string;
  modified: string;
}

interface UserStorageSummary {
  user_id: number;
  username: string;
  full_name: string;
  role: string;
  avatar_url?: string;
  path: string;
  file_count: number;
  dir_count: number;
  size_bytes: number;
  size_formatted: string;
  latest_modified?: string;
  is_current_user: boolean;
}

interface HostDiskInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  total_formatted: string;
  free_formatted: string;
  used_formatted: string;
  percent_used: number;
}

interface StorageManagerProps {
  onNavigate: (tab: string) => void;
}

export const StorageManager: React.FC<StorageManagerProps> = ({ onNavigate }) => {
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const isSuperAdmin = currentUser.role === "super_admin";

  const [viewMode, setViewMode] = useState<"users" | "files">(() => isSuperAdmin ? "users" : "files");
  const [usersSummary, setUsersSummary] = useState<UserStorageSummary[]>([]);
  const [hostDisk, setHostDisk] = useState<HostDiskInfo | null>(null);
  const [totalAppSizeFormatted, setTotalAppSizeFormatted] = useState<string>("0 B");
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [userSearch, setUserSearch] = useState<string>("");

  const [selectedUser, setSelectedUser] = useState<UserStorageSummary | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(() => isSuperAdmin ? "" : `users/${currentUser.username || ""}`);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const [newFolderOpen, setNewFolderOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchUsersSummary = async () => {
    try {
      setLoadingUsers(true);
      setError("");
      const res = await fetch(`${API_BASE}/storage/users-summary`, {
        headers: getAuthHeader()
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load user storage statistics");
      }

      const data = await res.json();
      setUsersSummary(data.users || []);
      setHostDisk(data.host_disk || null);
      setTotalAppSizeFormatted(data.total_app_size_formatted || "0 B");
    } catch (err: any) {
      setError(err.message || "Error fetching user storage summary");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadDirectory = async (path: string = "") => {
    try {
      setLoadingFiles(true);
      setError("");
      const res = await fetch(`${API_BASE}/storage/list?path=${encodeURIComponent(path)}`, {
        headers: getAuthHeader()
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to list directory contents");
      }

      const data = await res.json();
      setItems(data.items || []);
      setCurrentPath(data.current_path || "");
    } catch (err: any) {
      setError(err.message || "Error loading directory");
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchUsersSummary();
    if (!isSuperAdmin) {
      loadDirectory(`users/${currentUser.username || ""}`);
    }
  }, [isSuperAdmin, currentUser.username]);

  const handleOpenUserStorage = (u: UserStorageSummary) => {
    setSelectedUser(u);
    setCurrentPath(u.path);
    setViewMode("files");
    loadDirectory(u.path);
  };

  const handleBackToUsersList = () => {
    setSelectedUser(null);
    setViewMode("users");
    fetchUsersSummary();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/mkdir`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({
          path: currentPath,
          folder_name: newFolderName.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create folder");
      }

      setNewFolderName("");
      setNewFolderOpen(false);
      setStatusMsg("Folder created successfully (ફોલ્ડર સફળતાપૂર્વક બનાવ્યું)");
      setTimeout(() => setStatusMsg(""), 3000);
      loadDirectory(currentPath);
      fetchUsersSummary();
    } catch (err: any) {
      alert(err.message || "Folder creation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", currentPath);

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/upload`, {
        method: "POST",
        headers: getAuthHeader(),
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }

      setStatusMsg(`File "${file.name}" uploaded successfully`);
      setTimeout(() => setStatusMsg(""), 3000);
      loadDirectory(currentPath);
      fetchUsersSummary();
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setActionLoading(false);
      e.target.value = "";
    }
  };

  const handleDeleteItem = async (itemPath: string, isDir: boolean) => {
    const confirmed = window.confirm(`Are you sure you want to delete this ${isDir ? "folder and all its contents" : "file"}?`);
    if (!confirmed) return;

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE}/storage/item?path=${encodeURIComponent(itemPath)}`, {
        method: "DELETE",
        headers: getAuthHeader()
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete");
      }

      setStatusMsg("Item deleted successfully");
      setTimeout(() => setStatusMsg(""), 3000);
      loadDirectory(currentPath);
      fetchUsersSummary();
    } catch (err: any) {
      alert(err.message || "Delete failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = (itemPath: string) => {
    const url = `${API_BASE}/storage/download?path=${encodeURIComponent(itemPath)}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return usersSummary;
    const q = userSearch.toLowerCase();
    return usersSummary.filter(u => 
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  }, [usersSummary, userSearch]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/10 text-purple-600 border border-purple-500/30">Super Admin</span>;
      case "admin":
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/10 text-blue-600 border border-blue-500/30">Admin</span>;
      case "driver":
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">Driver</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-500/10 text-slate-600 border border-slate-500/30">{role}</span>;
    }
  };

  const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

  return (
    <div className="p-3.5 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* 1. TOP HEADER */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 font-display">
                {isSuperAdmin ? "Phone & Mobile Storage (મોબાઇલ સ્ટોરેજ)" : "My Mobile Storage (મારું મોબાઇલ સ્ટોરેજ)"}
              </h1>
              {isSuperAdmin && (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-300">
                  User-Wise Mode
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {isSuperAdmin 
                ? "Manage folders, documents, and storage user-wise across all staff and drivers"
                : `Sandboxed user storage for @${currentUser.username || "user"}`}
            </p>
          </div>
        </div>

        {/* Action Controls & View Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {isSuperAdmin && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setViewMode("users");
                  setSelectedUser(null);
                  fetchUsersSummary();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "users"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UsersIcon className="w-3.5 h-3.5" />
                <span>User-Wise Storage ({usersSummary.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode("files");
                  loadDirectory(currentPath);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "files" && !selectedUser
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>All Host Files</span>
              </button>
            </div>
          )}

          <button
            onClick={() => {
              if (viewMode === "users") fetchUsersSummary();
              else loadDirectory(currentPath);
            }}
            disabled={loadingUsers || loadingFiles}
            className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer shadow-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${(loadingUsers || loadingFiles) ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. OVERALL STORAGE QUOTA STATS CARD */}
      {hostDisk && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Phone Storage Quota & User Usage</h4>
                <p className="text-[11px] text-slate-400">
                  {hostDisk.free_formatted} Free of {hostDisk.total_formatted} Total
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-extrabold text-cyan-400">
                {totalAppSizeFormatted}
              </span>
              <span className="text-[10px] text-slate-400 block">Used by App Users</span>
            </div>
          </div>

          <div className="w-full bg-slate-700/80 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(2, hostDisk.percent_used))}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-mono">
            <span>{hostDisk.percent_used}% Host Disk Occupied</span>
            <span>{usersSummary.length} Active System Users</span>
          </div>
        </div>
      )}

      {/* 3. VIEW MODE A: USER-WISE STORAGE LIST */}
      {viewMode === "users" && isSuperAdmin && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search user by name, username, or role..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>

          {loadingUsers ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Calculating user storage breakdowns...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
              No users found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-black text-sm shrink-0">
                          {u.full_name?.charAt(0).toUpperCase() || u.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-sm text-slate-900 truncate">
                            {u.full_name}
                          </h3>
                          <p className="text-[11px] text-slate-500 truncate">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                      {getRoleBadge(u.role)}
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2.5 my-3 text-center">
                      <div>
                        <span className="block text-xs font-black text-slate-800">{u.file_count}</span>
                        <span className="text-[10px] text-slate-500">Files</span>
                      </div>
                      <div>
                        <span className="block text-xs font-black text-slate-800">{u.dir_count}</span>
                        <span className="text-[10px] text-slate-500">Folders</span>
                      </div>
                      <div>
                        <span className="block text-xs font-black text-blue-600">{u.size_formatted}</span>
                        <span className="text-[10px] text-slate-500">Storage</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between mb-3">
                      <span>Folder: <span className="font-mono text-slate-600">{u.path}</span></span>
                      {u.latest_modified && (
                        <span>Mod: {new Date(u.latest_modified).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenUserStorage(u)}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Open User Storage (સ્ટોરેજ ખોલો)</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. VIEW MODE B: FILE EXPLORER */}
      {(viewMode === "files" || selectedUser || !isSuperAdmin) && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {selectedUser && (
            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={handleBackToUsersList}
                  className="p-1 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                  title="Back to all users"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <span className="text-xs font-extrabold text-blue-900 truncate block">
                    User: {selectedUser.full_name} (@{selectedUser.username})
                  </span>
                  <span className="text-[10px] text-blue-600">
                    Storage: {selectedUser.size_formatted} • {selectedUser.file_count} files
                  </span>
                </div>
              </div>

              <button
                onClick={handleBackToUsersList}
                className="text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                All Users List
              </button>
            </div>
          )}

          <div className="p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
            <div className="flex items-center gap-1 text-xs text-slate-500 overflow-x-auto py-1">
              <button
                onClick={() => {
                  if (selectedUser) setCurrentPath(selectedUser.path);
                  else if (!isSuperAdmin) setCurrentPath(`users/${currentUser.username}`);
                  else setCurrentPath("");
                  loadDirectory(selectedUser ? selectedUser.path : (!isSuperAdmin ? `users/${currentUser.username}` : ""));
                }}
                className="hover:text-blue-600 flex items-center gap-1 font-bold text-slate-700 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>{selectedUser ? `@${selectedUser.username}` : (!isSuperAdmin ? `@${currentUser.username}` : "root")}</span>
              </button>

              {breadcrumbs.map((segment, idx) => {
                const sub = breadcrumbs.slice(0, idx + 1).join("/");
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={sub}>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <button
                      onClick={() => {
                        setCurrentPath(sub);
                        loadDirectory(sub);
                      }}
                      className={`cursor-pointer whitespace-nowrap ${
                        isLast ? "font-bold text-slate-900" : "hover:text-blue-600 text-slate-600"
                      }`}
                    >
                      {segment}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewFolderOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Folder</span>
              </button>

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs shadow-xs transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>Upload File</span>
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {newFolderOpen && (
            <div className="p-3 bg-blue-50/70 border-b border-blue-200">
              <form onSubmit={handleCreateFolder} className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name (e.g. Invoices, Receipts)..."
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={actionLoading || !newFolderName.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(false)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {loadingFiles ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading files and folders...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
                <Folder className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-500 font-semibold">This folder is currently empty.</p>
              <p className="text-[11px] text-slate-400">Use "Upload File" or "New Folder" to add documents.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div
                  key={it.path}
                  className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div
                    onClick={() => {
                      if (it.is_dir) {
                        setCurrentPath(it.path);
                        loadDirectory(it.path);
                      }
                    }}
                    className={`flex items-center gap-3 min-w-0 flex-1 ${it.is_dir ? "cursor-pointer" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      it.is_dir ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"
                    }`}>
                      {it.is_dir ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold truncate ${it.is_dir ? "text-blue-900 hover:underline" : "text-slate-800"}`}>
                        {it.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{it.is_dir ? "Folder" : it.size_formatted}</span>
                        <span>•</span>
                        <span>{new Date(it.modified).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!it.is_dir && (
                      <button
                        onClick={() => handleDownload(it.path)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteItem(it.path, it.is_dir)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
