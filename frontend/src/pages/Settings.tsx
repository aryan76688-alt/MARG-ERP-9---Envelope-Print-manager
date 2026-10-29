import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings as SettingsIcon, 
  Building, 
  Sliders, 
  Printer, 
  Layout, 
  FileText, 
  Database, 
  Save, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Brain,
  Cpu,
  Cloud,
  Clock,
  Lock,
  ShieldCheck,
  RefreshCw,
  Mail,
  Smartphone,
  Plus,
  Trash2,
  Droplets,
  FileSpreadsheet,
  HelpCircle,
  Server,
  Terminal,
  Activity,
  GitBranch
} from 'lucide-react';
import { WebhookHelpModal } from '../components/WebhookHelpModal';
import { SenderSettings, AppSettings, DualBrainStatus } from '../types';
import { 
  fetchSettings, 
  saveSettings, 
  getBackupExportUrl, 
  getBackupSqliteUrl,
  restoreSqliteBackup,
  importDatabaseFile,
  getExportPartiesUrl, 
  getExportHistoryUrl, 
  testGeminiAI,
  testOpenAIApi,
  fetchBrainStatus,
  fetchBackupSettings,
  updateBackupSettings,
  triggerManualBackup,
  fetchGDriveSettings,
  updateGDriveSettings,
  testGDriveConnection,
  triggerGDriveBackup,
  listGDriveBackups,
  restoreGDriveBackup,
  sendGmailDispatchSummary,
  sendGmailPartiesList,
  GDriveBackupItem,
  fetchServerStatus,
  toggleAutoUpdate,
  triggerServerUpdate,
  triggerServerRestart,
  ServerStatusResponse,
  API_BASE
} from '../api/client';


export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('company');
  const [sender, setSender] = useState<SenderSettings>({
    business_name: 'SHREEJI HEALTHCARE',
    address: 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305',
    city: 'DEHGAM',
    state: 'GUJARAT',
    mobile: '+91 99245 44283',
    landline: '02716-245123',
    email: 'SHREEJISEVEN@GMAIL.COM',
    gst_no: '24AAACS1234F1Z5',
  });

  const [app, setApp] = useState<AppSettings>({
    default_envelope_size: 'A4',
    default_orientation: 'Landscape',
    default_copies: 1,
    default_printer: 'Microsoft Print to PDF',
    margin_top_mm: 15.0,
    margin_left_mm: 3.0,
    margin_right_mm: 3.0,
    margin_bottom_mm: 10.0,
    scale_percent: 100,
    envelopes_per_page: 2,
    show_header: true,
    show_footer: false,
    show_barcode: true,
    show_case_number: true,
    show_weight: true,
    show_mobile: true,
    show_party_code: true,
    show_date: false,
    show_gst: false,
    show_pan: false,
    default_language: 'en',
    envelope_template_format: 'attachment_pdf',
    gemini_api_key: '',
    openai_api_key: '',
    google_sheets_api_key: 'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg',
    google_sheet_id: '',
    google_oauth_client_id: '58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com',
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [aiTesting, setAiTesting] = useState<boolean>(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);
  const [aiTestSuccess, setAiTestSuccess] = useState<boolean | null>(null);
  const [openAiTesting, setOpenAiTesting] = useState<boolean>(false);
  const [openAiTestResult, setOpenAiTestResult] = useState<string | null>(null);
  const [openAiTestSuccess, setOpenAiTestSuccess] = useState<boolean | null>(null);
  const [brainStatus, setBrainStatus] = useState<DualBrainStatus | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const sqliteFileInputRef = useRef<HTMLInputElement>(null);
  const [downloadingSqlite, setDownloadingSqlite] = useState<boolean>(false);
  const [restoringSqlite, setRestoringSqlite] = useState<boolean>(false);

  const [currentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });
  const canEditBackup = currentUser.role === 'super_admin' || currentUser.role === 'admin' || currentUser.role === 'owner';

  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupTime, setAutoBackupTime] = useState<string>('20:00');
  const [rcloneRemoteName, setRcloneRemoteName] = useState<string>('gdrive');
  const [rcloneBackupPath, setRcloneBackupPath] = useState<string>('MARG_Backups');
  const [googleAccount, setGoogleAccount] = useState<string>('shreejiseven@gmail.com');
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [lastBackupStatus, setLastBackupStatus] = useState<string | null>(null);
  const [backupSaving, setBackupSaving] = useState<boolean>(false);
  const [backupRunning, setBackupRunning] = useState<boolean>(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  // Google Drive & Gmail Webhook State (Option 1)
  const [gdriveWebhookUrl, setGdriveWebhookUrl] = useState<string>('');
  const [gdriveApiKey, setGdriveApiKey] = useState<string>('SHREEJI_SECRET_KEY_2026');
  const [gdriveBackupFolder, setGdriveBackupFolder] = useState<string>('Shreeji_Healthcare_Backups');
  const [gdriveNotifyEmail, setGdriveNotifyEmail] = useState<string>('shreejiseven@gmail.com');
  const [gdriveTesting, setGdriveTesting] = useState<boolean>(false);
  const [gdriveTestResult, setGdriveTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [gdriveBackupsList, setGdriveBackupsList] = useState<GDriveBackupItem[]>([]);
  const [gdriveLoadingBackups, setGdriveLoadingBackups] = useState<boolean>(false);
  const [gdriveRestoringId, setGdriveRestoringId] = useState<string | null>(null);
  const [gdriveBackupRunning, setGdriveBackupRunning] = useState<boolean>(false);
  const [gdriveSaving, setGdriveSaving] = useState<boolean>(false);
  const [gdriveStatusMessage, setGdriveStatusMessage] = useState<string | null>(null);
  const [gmailSending, setGmailSending] = useState<boolean>(false);
  const [gmailStatusMessage, setGmailStatusMessage] = useState<string | null>(null);
  const [webhookHelpOpen, setWebhookHelpOpen] = useState<boolean>(false);

  // Server Status & Live Auto-Update Control State
  const [serverStatus, setServerStatus] = useState<ServerStatusResponse | null>(null);
  const [loadingServerStatus, setLoadingServerStatus] = useState<boolean>(false);
  const [updatingServer, setUpdatingServer] = useState<boolean>(false);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);
  const [serverActionMsg, setServerActionMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);

  const loadServerStatus = async () => {
    setLoadingServerStatus(true);
    setServerActionMsg(null);
    try {
      const status = await fetchServerStatus();
      setServerStatus(status);
    } catch (err: any) {
      console.warn('Failed to fetch server status:', err);
    } finally {
      setLoadingServerStatus(false);
    }
  };

  const handleToggleAutoUpdate = async (enabled: boolean) => {
    try {
      const res = await toggleAutoUpdate(enabled);
      setServerStatus(prev => prev ? { ...prev, auto_update_enabled: res.auto_update_enabled } : null);
      setServerActionMsg({ text: res.message, type: 'success' });
    } catch (err: any) {
      setServerActionMsg({ text: err.message || 'Failed to update setting', type: 'error' });
    }
  };

  const handleTriggerServerUpdate = async () => {
    if (!confirm('🚀 Update Server Now?\n\nThis will pull the latest code and features from GitHub and restart background services. Continue?')) {
      return;
    }
    setUpdatingServer(true);
    setServerActionMsg({ text: 'Starting update from GitHub... Server will restart in a few seconds.', type: 'info' });
    try {
      const res = await triggerServerUpdate();
      setServerActionMsg({ text: res.message, type: 'success' });
      let count = res.estimated_restart_seconds || 10;
      setReconnectCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        setReconnectCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          setReconnectCountdown(null);
          setUpdatingServer(false);
          loadServerStatus();
        }
      }, 1000);
    } catch (err: any) {
      setServerActionMsg({ text: err.message || 'Failed to trigger update', type: 'error' });
      setUpdatingServer(false);
    }
  };

  const handleTriggerServerRestart = async () => {
    if (!confirm('🔄 Restart Server Services?\n\nThis will gracefully restart the background web services. Continue?')) {
      return;
    }
    setRestartingServer(true);
    setServerActionMsg({ text: 'Restarting server services...', type: 'info' });
    try {
      const res = await triggerServerRestart();
      setServerActionMsg({ text: res.message, type: 'success' });
      setTimeout(() => {
        setRestartingServer(false);
        loadServerStatus();
      }, 6000);
    } catch (err: any) {
      setServerActionMsg({ text: err.message || 'Failed to restart server', type: 'error' });
      setRestartingServer(false);
    }
  };

  const isApk = typeof window !== 'undefined' && (
    window.location.search.includes('mode=apk') ||
    Boolean((window as any).isAndroidApp) ||
    Boolean((window as any).AndroidBridge) ||
    navigator.userAgent.toLowerCase().includes('shreejienvelope') ||
    (navigator.userAgent.toLowerCase().includes('android') && Boolean((window as any).chrome?.webview))
  );

  // IV Fluids & Volumes Configuration
  const [ivFluids, setIvFluids] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('iv_fluid_types');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['NS', 'RL', 'DNS', 'METRO'];
  });

  const [ivVolumes, setIvVolumes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('iv_fluid_volumes');
      if (saved) {
        const parsed = JSON.parse(saved).filter((v: string) => v !== '200ML');
        if (!parsed.includes('PCS')) parsed.push('PCS');
        return parsed;
      }
    } catch {}
    return ['100ML', '250ML', '500ML', '1LTR', 'PCS'];
  });

  const [newFluidName, setNewFluidName] = useState<string>('');
  const [newVolumeName, setNewVolumeName] = useState<string>('');

  const loadBackupSettings = () => {
    fetchBackupSettings()
      .then((b) => {
        setAutoBackupEnabled(b.auto_backup_enabled ?? true);
        setAutoBackupTime(b.auto_backup_time || '20:00');
        setRcloneRemoteName(b.rclone_remote_name || 'gdrive');
        setRcloneBackupPath(b.rclone_backup_path || 'MARG_Backups');
        if (b.google_account) setGoogleAccount(b.google_account);
        setLastBackupTime(b.last_backup_time || null);
        setLastBackupStatus(b.last_backup_status || null);
      })
      .catch((err) => console.warn('Could not load backup settings:', err));

    fetchGDriveSettings()
      .then((g) => {
        if (g.gdrive_webhook_url) setGdriveWebhookUrl(g.gdrive_webhook_url);
        if (g.gdrive_api_key) setGdriveApiKey(g.gdrive_api_key);
        if (g.gdrive_backup_folder) setGdriveBackupFolder(g.gdrive_backup_folder);
        if (g.gdrive_notify_email) setGdriveNotifyEmail(g.gdrive_notify_email);
      })
      .catch((err) => console.warn('Could not load GDrive settings:', err));
  };

  useEffect(() => {
    fetchSettings()
      .then((res) => {
        if (res.sender) setSender(res.sender);
        if (res.app) {
          setApp(res.app);
          if (res.app.iv_fluids_json) {
            try {
              const list = JSON.parse(res.app.iv_fluids_json);
              if (Array.isArray(list) && list.length > 0) {
                setIvFluids(list);
                localStorage.setItem('iv_fluid_types', JSON.stringify(list));
              }
            } catch {}
          }
          if (res.app.iv_volumes_json) {
            try {
              const list = JSON.parse(res.app.iv_volumes_json).filter((v: string) => v !== '200ML');
              if (Array.isArray(list) && list.length > 0) {
                setIvVolumes(list);
                localStorage.setItem('iv_fluid_volumes', JSON.stringify(list));
              }
            } catch {}
          }
        }
      })
      .catch(console.error);

    fetchBrainStatus()
      .then(st => setBrainStatus(st))
      .catch(console.warn);

    loadBackupSettings();
  }, []);

  const handleAddFluid = () => {
    const clean = newFluidName.trim().toUpperCase();
    if (!clean) return;
    if (ivFluids.includes(clean)) {
      alert(`IV Fluid "${clean}" already exists!`);
      return;
    }
    const updated = [...ivFluids, clean];
    setIvFluids(updated);
    setNewFluidName('');
    localStorage.setItem('iv_fluid_types', JSON.stringify(updated));
  };

  const handleRemoveFluid = (fluid: string) => {
    if (ivFluids.length <= 1) {
      alert('You must have at least one IV fluid configured.');
      return;
    }
    const updated = ivFluids.filter((f) => f !== fluid);
    setIvFluids(updated);
    localStorage.setItem('iv_fluid_types', JSON.stringify(updated));
  };

  const handleAddVolume = () => {
    let clean = newVolumeName.trim().toUpperCase();
    if (!clean) return;
    if (clean === '200ML') {
      alert('200ML has been permanently removed.');
      return;
    }
    if (!clean.endsWith('ML') && !clean.endsWith('LTR') && !clean.includes('PCS') && !clean.includes('PSC') && !clean.includes('PIECES')) {
      if (/^\d+$/.test(clean)) clean = `${clean}ML`;
    }
    if (ivVolumes.includes(clean)) {
      alert(`Volume "${clean}" already exists!`);
      return;
    }
    const updated = [...ivVolumes, clean];
    setIvVolumes(updated);
    setNewVolumeName('');
    localStorage.setItem('iv_fluid_volumes', JSON.stringify(updated));
  };

  const handleRemoveVolume = (vol: string) => {
    if (ivVolumes.length <= 1) {
      alert('You must have at least one volume size configured.');
      return;
    }
    const updated = ivVolumes.filter((v) => v !== vol);
    setIvVolumes(updated);
    localStorage.setItem('iv_fluid_volumes', JSON.stringify(updated));
  };

  const handleSaveBackupSchedule = async () => {
    if (!canEditBackup) {
      alert('Permission Denied: Only Super Admin and Admin can change backup schedule.');
      return;
    }
    setBackupSaving(true);
    setBackupMessage(null);
    try {
      await updateBackupSettings({
        auto_backup_enabled: autoBackupEnabled,
        auto_backup_time: autoBackupTime,
        rclone_remote_name: rcloneRemoteName,
        rclone_backup_path: rcloneBackupPath,
      });
      setBackupMessage('Auto backup schedule updated successfully!');
      setTimeout(() => setBackupMessage(null), 4000);
    } catch (err: any) {
      alert('Failed to update backup settings: ' + err.message);
    } finally {
      setBackupSaving(false);
    }
  };

  const handleTriggerManualBackup = async () => {
    if (!canEditBackup) {
      alert('Permission Denied: Only Super Admin and Admin can trigger backups.');
      return;
    }
    setBackupRunning(true);
    setBackupMessage(null);
    try {
      const res = await triggerManualBackup();
      loadBackupSettings();
      setBackupMessage(res.message || 'Backup completed!');
      setTimeout(() => setBackupMessage(null), 6000);
    } catch (err: any) {
      alert('Backup failed: ' + err.message);
    } finally {
      setBackupRunning(false);
    }
  };

  const handleSaveGDriveSettings = async () => {
    if (!canEditBackup) {
      alert('Permission Denied: Super Admin, Admin, and Owner only.');
      return;
    }
    setGdriveSaving(true);
    setGdriveStatusMessage(null);
    try {
      await updateGDriveSettings({
        gdrive_webhook_url: gdriveWebhookUrl,
        gdrive_api_key: gdriveApiKey,
        gdrive_backup_folder: gdriveBackupFolder,
        gdrive_notify_email: gdriveNotifyEmail,
      });
      setGdriveStatusMessage('Google Drive & Gmail Webhook settings saved!');
      setTimeout(() => setGdriveStatusMessage(null), 4000);
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setGdriveSaving(false);
    }
  };

  const handleTestGDriveConnection = async () => {
    setGdriveTesting(true);
    setGdriveTestResult(null);
    try {
      const res = await testGDriveConnection();
      if (res.success) {
        setGdriveTestResult({ success: true, message: res.message || 'Connected to Google Apps Script Webhook successfully!' });
      } else {
        setGdriveTestResult({ success: false, message: res.error || 'Connection failed' });
      }
    } catch (err: any) {
      setGdriveTestResult({ success: false, message: err.message || 'Network error' });
    } finally {
      setGdriveTesting(false);
    }
  };

  const handleTriggerGDriveBackup = async () => {
    if (!canEditBackup) {
      alert('Permission Denied: Super Admin, Admin, and Owner only.');
      return;
    }
    setGdriveBackupRunning(true);
    setGdriveStatusMessage(null);
    try {
      const res = await triggerGDriveBackup();
      if (res.success) {
        setGdriveStatusMessage(`Backup successful! ${res.filename} (${res.size_kb} KB) uploaded to Google Drive.`);
        handleLoadGDriveBackups();
      } else {
        alert('Backup failed: ' + JSON.stringify(res));
      }
    } catch (err: any) {
      alert('Backup failed: ' + err.message);
    } finally {
      setGdriveBackupRunning(false);
    }
  };

  const handleLoadGDriveBackups = async () => {
    setGdriveLoadingBackups(true);
    try {
      const res = await listGDriveBackups();
      if (res.success && res.backups) {
        setGdriveBackupsList(res.backups);
      } else {
        alert('Could not retrieve backups: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Failed to list backups: ' + err.message);
    } finally {
      setGdriveLoadingBackups(false);
    }
  };

  const handleRestoreGDriveBackup = async (fileId: string, fileName: string) => {
    if (!canEditBackup) {
      alert('Permission Denied: Super Admin, Admin, and Owner only.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to restore "${fileName}" from Google Drive?\n\nA safe pre-restore snapshot will be saved on the server automatically before restoration.`
    );
    if (!confirmed) return;

    setGdriveRestoringId(fileId);
    try {
      const res = await restoreGDriveBackup(fileId);
      if (res.success) {
        alert(res.message || 'Backup restored successfully!');
      } else {
        alert('Restore failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Restore failed: ' + err.message);
    } finally {
      setGdriveRestoringId(null);
    }
  };

  const handleSendTestGmailDispatch = async () => {
    setGmailSending(true);
    setGmailStatusMessage(null);
    try {
      const res = await sendGmailDispatchSummary({ to_email: gdriveNotifyEmail });
      if (res.success) {
        setGmailStatusMessage(`Dispatch summary successfully sent to ${gdriveNotifyEmail}!`);
        setTimeout(() => setGmailStatusMessage(null), 5000);
      } else {
        alert('Failed to send email: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error sending email: ' + err.message);
    } finally {
      setGmailSending(false);
    }
  };

  const handleSendTestGmailParties = async () => {
    setGmailSending(true);
    setGmailStatusMessage(null);
    try {
      const res = await sendGmailPartiesList({ to_email: gdriveNotifyEmail });
      if (res.success) {
        setGmailStatusMessage(`Master parties CSV list successfully emailed to ${gdriveNotifyEmail}!`);
        setTimeout(() => setGmailStatusMessage(null), 5000);
      } else {
        alert('Failed to send email: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error sending email: ' + err.message);
    } finally {
      setGmailSending(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    const appWithFluids: AppSettings = {
      ...app,
      iv_fluids_json: JSON.stringify(ivFluids),
      iv_volumes_json: JSON.stringify(ivVolumes.filter((v) => v !== '200ML')),
    };

    // 1. Immediately cache locally in browser so edits are never lost
    localStorage.setItem('sender_settings', JSON.stringify(sender));
    localStorage.setItem('app_settings', JSON.stringify(appWithFluids));
    localStorage.setItem('iv_fluid_types', JSON.stringify(ivFluids));
    localStorage.setItem('iv_fluid_volumes', JSON.stringify(ivVolumes.filter((v) => v !== '200ML')));

    // 2. Sync to backend database
    try {
      await saveSettings({ sender, app: appWithFluids });
      setSuccessMsg('Settings saved successfully and synced to server!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setSuccessMsg('Settings saved locally in browser! (Server offline)');
      alert(`✅ Settings saved in browser!\n\n⚠️ Could not sync to backend database: ${err.message}\n\nPlease check if your server is running.`);
    } finally {
      setSaving(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch(`${API_BASE}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error('Restore failed');
      alert('Database backup restored successfully!');
      window.location.reload();
    } catch (err: any) {
      alert('Failed to restore backup: ' + err.message);
    }
  };

  const handleRestoreSqliteBackup = async (file: File) => {
    if (!confirm(`⚠️ Are you sure you want to restore "${file.name}"? The database will be synchronized. A safety backup (.bak) will be created automatically before overwriting.`)) {
      return;
    }
    try {
      setRestoringSqlite(true);
      const res = await importDatabaseFile(file);
      alert(`✅ ${res.message || 'Database restored successfully!'}`);
      window.location.reload();
    } catch (err: any) {
      alert('❌ Failed to restore database: ' + err.message);
    } finally {
      setRestoringSqlite(false);
    }
  };

  const handleSaveSqliteToAndroid = async () => {
    try {
      setDownloadingSqlite(true);
      const url = getBackupSqliteUrl();
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to download SQLite database from server');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `envelope_manager_${dateStr}.db`;
        if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.saveDatabaseToStorage === 'function') {
          const success = (window as any).AndroidBridge.saveDatabaseToStorage(base64Data, filename);
          if (success) {
            alert(`✅ Database successfully saved to device Download/ShreejiBackups/${filename}`);
          } else {
            alert('❌ Device storage write failed. Please ensure full storage permissions are granted.');
          }
        } else {
          // Standard browser fallback
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
        setDownloadingSqlite(false);
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      setDownloadingSqlite(false);
      alert('Error saving SQLite database: ' + err.message);
    }
  };

  const handleRequestStoragePermission = () => {
    if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.requestStorageAccess === 'function') {
      (window as any).AndroidBridge.requestStorageAccess();
    } else {
      alert('Storage permission request is only applicable inside the Android APK.');
    }
  };

  const handleCheckUpdate = async () => {
    if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.checkForUpdate === 'function') {
      (window as any).AndroidBridge.checkForUpdate();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/app/version`);
      if (res.ok) {
        const data = await res.json();
        alert(`ℹ️ Current App Version: v2.4.0\nLatest Available: v${data.version || '2.4.0'}\n\n${data.release_notes || 'All features are up to date.'}`);
      } else {
        alert('Could not connect to update server.');
      }
    } catch (err: any) {
      alert('Update check error: ' + err.message);
    }
  };

  const handleManualUpdateApk = () => {
    if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.triggerUpdate === 'function') {
      (window as any).AndroidBridge.triggerUpdate('/downloads/EnvelopeManager.apk');
    } else {
      window.location.href = `${API_BASE}/download/apk`;
    }
  };

  useEffect(() => {
    if (activeTab === 'server') {
      loadServerStatus();
    }
  }, [activeTab]);

  const tabs = [
    { id: 'company', label: 'COMPANY DETAILS', icon: Building },
    { id: 'general', label: 'GENERAL', icon: SettingsIcon },
    { id: 'fluids', label: 'IV FLUIDS & PACKAGING', icon: Droplets },
    { id: 'printer', label: 'PRINTER', icon: Printer },
    { id: 'layout', label: 'LAYOUT & MARGINS', icon: Layout },
    { id: 'template', label: 'TEMPLATE TOGGLES', icon: FileText },
    { id: 'backup', label: 'BACKUP & EXPORTS', icon: Database },
    { id: 'server', label: 'SERVER & AUTO-UPDATE', icon: Server },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            <span>Application Settings & Configuration</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Configure sender details, default printer, envelope layout, template elements, and database backups.
          </p>
        </div>

        {successMsg && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>


      {/* Tabs Row */}
      <div className="flex items-center gap-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto text-xs font-bold select-none">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form Area */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-xs space-y-6">
        
        {/* TAB 1: COMPANY DETAILS */}
        {activeTab === 'company' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Sender Business Information</h3>
              <p className="text-slate-500">
                This appears in the "FROM" section of every printed MARG courier envelope.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company / Business Name *</label>
                <input
                  type="text"
                  value={sender.business_name}
                  onChange={(e) => setSender({ ...sender, business_name: e.target.value })}
                  placeholder="e.g. SHREEJI 7"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-extrabold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  value={sender.mobile}
                  onChange={(e) => setSender({ ...sender, mobile: e.target.value })}
                  placeholder="e.g. 9924544283"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={sender.address}
                  onChange={(e) => setSender({ ...sender, address: e.target.value })}
                  placeholder="e.g. DAHEGAM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">City *</label>
                <input
                  type="text"
                  value={sender.city}
                  onChange={(e) => setSender({ ...sender, city: e.target.value })}
                  placeholder="e.g. DAHEGAM"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">State *</label>
                <input
                  type="text"
                  value={sender.state}
                  onChange={(e) => setSender({ ...sender, state: e.target.value })}
                  placeholder="e.g. GUJARAT"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={sender.email || ''}
                  onChange={(e) => setSender({ ...sender, email: e.target.value })}
                  placeholder="contact@shreeji7.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">GST Number (Optional)</label>
                <input
                  type="text"
                  value={sender.gst_no || ''}
                  onChange={(e) => setSender({ ...sender, gst_no: e.target.value })}
                  placeholder="e.g. 24AAACS1234F1Z5"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GENERAL */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">General Print Preferences</h3>
              <p className="text-slate-500">Default options loaded when opening Print Envelope screen.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Envelope Size</label>
                <select
                  value={app.default_envelope_size}
                  onChange={(e) => setApp({ ...app, default_envelope_size: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="A4">A4 (2 Envelopes/Page)</option>
                  <option value="A5">A5 Sheet</option>
                  <option value="DL">DL (220 × 110 mm)</option>
                  <option value="DL Long">DL Long</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Orientation</label>
                <select
                  value={app.default_orientation}
                  onChange={(e) => setApp({ ...app, default_orientation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="Landscape">Landscape</option>
                  <option value="Portrait">Portrait</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Copies</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={app.default_copies}
                  onChange={(e) => setApp({ ...app, default_copies: parseInt(e.target.value || '1', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Envelope Template Format</label>
                <select
                  value={app.envelope_template_format || 'attachment_pdf'}
                  onChange={(e) => setApp({ ...app, envelope_template_format: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="attachment_pdf">Attachment PDF 123 (Borderless Modern Format)</option>
                  <option value="marg_grid_22">Classic MARG 22-Row Grid Format (7 Columns × 22 Rows)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Choose between the borderless attachment layout or the classic MARG ERP table layout.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Envelope Language</label>
                <select
                  value={app.default_language || 'en'}
                  onChange={(e) => setApp({ ...app, default_language: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
                >
                  <option value="en">English (Original)</option>
                  <option value="gu">ગુજરાતી (Gujarati with Gemini AI)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enables printing party details and sender information in Gujarati.
                </p>
              </div>
            </div>

            {/* Dual Brain Architecture Status Card */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between border-b border-purple-500/30 pb-2.5">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-300" />
                  <span className="font-extrabold text-sm tracking-wide">Dual-Brain AI Architecture</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Fully Operational
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-purple-200 flex items-center gap-1.5">
                      <Brain className="w-4 h-4 text-purple-400" />
                      Big Brain (OpenAI ChatGPT)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/80">Online</span>
                  </div>
                  <p className="text-[11px] text-purple-200/90 leading-relaxed">
                    Master UI Design, PDF Print Layout Controls, Dashboard Logistics Intelligence & Assistant Chat.
                  </p>
                </div>

                <div className="p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-200 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      Small Brains (Gemini Pool)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/80">
                      {brainStatus?.small_brains?.key_pool_count || 2} Keys Active
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-200/90 leading-relaxed">
                    High-speed backend batch translations, Gujarati address conversion, barcode and data parsing.
                  </p>
                </div>
              </div>
            </div>

            {/* 1. Big Brain (OpenAI) Configuration */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span>OpenAI API Key (Big Brain Core)</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setOpenAiTesting(true);
                    setOpenAiTestResult(null);
                    setOpenAiTestSuccess(null);
                    try {
                      const res = await testOpenAIApi(app.openai_api_key);
                      setOpenAiTestSuccess(true);
                      setOpenAiTestResult(res.message || 'Connected to OpenAI Big Brain successfully!');
                    } catch (err: any) {
                      setOpenAiTestSuccess(false);
                      setOpenAiTestResult(`Notice: ${err.message || 'Connection test failed'}`);
                    } finally {
                      setOpenAiTesting(false);
                    }
                  }}
                  disabled={openAiTesting}
                  className="px-3 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  <span>{openAiTesting ? 'Testing...' : 'Test Big Brain'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type="password"
                  value={app.openai_api_key || ''}
                  onChange={(e) => setApp({ ...app, openai_api_key: e.target.value })}
                  placeholder="Paste your OpenAI API Key (sk-proj-...) or leave blank to use server environment default"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Powers real-time print layout intelligence, visual density optimization, and ChatGPT operations assistant.
              </p>

              {openAiTestResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-start gap-2 ${
                    openAiTestSuccess
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {openAiTestSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{openAiTestResult}</span>
                </div>
              )}
            </div>

            {/* 2. Small Brains (Gemini) Configuration */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <span>Google Gemini API Key (Small Brains Pool)</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setAiTesting(true);
                    setAiTestResult(null);
                    setAiTestSuccess(null);
                    try {
                      const res = await testGeminiAI();
                      setAiTestSuccess(true);
                      setAiTestResult(`Connected successfully to Gemini! Response: ${res.output}`);
                    } catch (err: any) {
                      setAiTestSuccess(false);
                      setAiTestResult(`Connection notice: ${err.message}`);
                    } finally {
                      setAiTesting(false);
                    }
                  }}
                  disabled={aiTesting}
                  className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  <span>{aiTesting ? 'Testing API...' : 'Test Small Brains'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type="password"
                  value={app.gemini_api_key || ''}
                  onChange={(e) => setApp({ ...app, gemini_api_key: e.target.value })}
                  placeholder="Paste your Google Gemini API Key here (or keep default multi-key pool)..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Powers lightning-fast party translations to Gujarati and MARG text parsing with automatic multi-key failover.
              </p>

              {aiTestResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-start gap-2 ${
                    aiTestSuccess
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {aiTestSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{aiTestResult}</span>
                </div>
              )}
            </div>

            {/* 3. Google Sheets & 3-Route System Integration */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span className="font-extrabold text-slate-900 text-sm">Google Sheets & 3-Route System Integration</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Google Sheets API v4
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                Allows direct live synchronization and editing of Party Delivery Routes (Primary Route 1, Secondary Route 2, Third Route 3) via Google Sheets.
                Spreadsheet must have columns: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-300 font-mono text-[10px] font-bold text-emerald-900">party code, party name, primary route 1, secondary route 2, third route 3</code> and be shared as <strong>"Anyone with the link can view"</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Google Sheets API Key</label>
                  <input
                    type="password"
                    value={app.google_sheets_api_key || ''}
                    onChange={(e) => setApp({ ...app, google_sheets_api_key: e.target.value })}
                    placeholder="Enter Google Sheets API Key..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Pre-configured with your Google Cloud API Key.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Google Sheet ID / Share URL</label>
                  <input
                    type="text"
                    value={app.google_sheet_id || ''}
                    onChange={(e) => setApp({ ...app, google_sheet_id: e.target.value })}
                    placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or URL"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Optional default spreadsheet linked for one-click route synchronization.
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB: IV FLUIDS & PACKAGING */}
        {activeTab === 'fluids' && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-600" />
                <span>IV Fluids & Packaging Sizes</span>
              </h3>
              <p className="text-slate-500">
                Configure IV fluid medicines and bottle volumes available during envelope dispatch. (Note: 200ML is permanently removed).
              </p>
            </div>

            {/* 1. IV Fluids List */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Available IV Fluids ({ivFluids.length})</span>
                </label>
                <span className="text-[11px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-bold">
                  Shows in Envelope Case Builder
                </span>
              </div>

              {/* Chips Grid */}
              <div className="flex flex-wrap items-center gap-2">
                {ivFluids.map((fluid) => (
                  <div
                    key={fluid}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-black text-xs shadow-sm hover:border-blue-400 transition-colors"
                  >
                    <span>{fluid}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFluid(fluid)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded"
                      title={`Remove ${fluid}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add IV Fluid Input Bar */}
              <div className="pt-2 flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={newFluidName}
                  onChange={(e) => setNewFluidName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddFluid();
                    }
                  }}
                  placeholder="Enter IV Fluid (e.g. D5, ISOLYTE, CIPRO)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold uppercase bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddFluid}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add IV Fluid</span>
                </button>
              </div>
            </div>

            {/* 2. Fluid Volumes List (200ML permanently removed) */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Bottle / Packaging Volumes ({ivVolumes.length})</span>
                </label>
                <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-bold">
                  200ML Permanently Removed
                </span>
              </div>

              {/* Chips Grid */}
              <div className="flex flex-wrap items-center gap-2">
                {ivVolumes.map((vol) => (
                  <div
                    key={vol}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-950 font-black text-xs shadow-sm hover:border-blue-400 transition-colors"
                  >
                    <span>{vol}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveVolume(vol)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-0.5 rounded"
                      title={`Remove ${vol}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Volume Input Bar */}
              <div className="pt-2 flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={newVolumeName}
                  onChange={(e) => setNewVolumeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddVolume();
                    }
                  }}
                  placeholder="Enter Volume (e.g. 50ML, 2LTR)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold uppercase bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddVolume}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Volume</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRINTER */}
        {activeTab === 'printer' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Printer Setup</h3>
              <p className="text-slate-500">Select target printer device or virtual PDF driver.</p>
            </div>

            <div className="max-w-md space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Selected Default Printer</label>
                <select
                  value={app.default_printer}
                  onChange={(e) => setApp({ ...app, default_printer: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-800"
                >
                  <option value="Microsoft Print to PDF">Microsoft Print to PDF</option>
                  <option value="Default System Printer">Default System Printer</option>
                  <option value="HP LaserJet Professional">HP LaserJet Professional</option>
                  <option value="Canon LBP2900B">Canon LBP2900B</option>
                  <option value="Epson L3150 Series">Epson L3150 Series</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                <span className="font-bold">Tip:</span> Selecting "Microsoft Print to PDF" allows you to digitally save all dispatched envelopes for paperless filing.
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LAYOUT & MARGINS */}
        {activeTab === 'layout' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Layout & Page Margins</h3>
              <p className="text-slate-500">Fine-tune millimeter margins for precise printer hardware feeding.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Top Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_top_mm}
                  onChange={(e) => setApp({ ...app, margin_top_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bottom Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_bottom_mm}
                  onChange={(e) => setApp({ ...app, margin_bottom_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Left Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_left_mm}
                  onChange={(e) => setApp({ ...app, margin_left_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Right Margin (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={app.margin_right_mm}
                  onChange={(e) => setApp({ ...app, margin_right_mm: parseFloat(e.target.value || '0') })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Scale Percentage</label>
                <input
                  type="number"
                  min={50}
                  max={150}
                  value={app.scale_percent}
                  onChange={(e) => setApp({ ...app, scale_percent: parseInt(e.target.value || '100', 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Envelopes Per Page</label>
                <select
                  value={app.envelopes_per_page}
                  onChange={(e) => setApp({ ...app, envelopes_per_page: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold"
                >
                  <option value={2}>2 Envelopes / Page (A4 Top & Bottom)</option>
                  <option value={1}>1 Envelope / Page</option>
                  <option value={4}>4 Envelopes / Page</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: TEMPLATE TOGGLES */}
        {activeTab === 'template' && (
          <div className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Envelope Elements & Display Toggles</h3>
              <p className="text-slate-500">Toggle individual sections shown on the printed courier envelope.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { key: 'show_header', label: 'Show Header (MARG COURIER Branding Strip)' },
                { key: 'show_barcode', label: 'Show Code128 Barcode & Case Identifier' },
                { key: 'show_case_number', label: 'Show Case Number Badge (e.g. CASE: 1, CASE: 2)' },
                { key: 'show_weight', label: 'Show Case Weight Badge (e.g. WT: 2.50 KG)' },
                { key: 'show_mobile', label: 'Show Recipient Mobile Number' },
                { key: 'show_party_code', label: 'Show Recipient Party Code Tag' },
                { key: 'show_date', label: 'Show Print Date on Envelope' },
                { key: 'show_footer', label: 'Show Disclaimer & Instructions Footer' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(app as any)[item.key] ?? false}
                    onChange={(e) => setApp({ ...app, [item.key]: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="font-bold text-slate-800">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: BACKUP & EXPORTS */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Data Backup & Bulk Exports</h3>
              <p className="text-slate-500">
                Automated daily cloud backups via Rclone and Microsoft Excel (.xlsx) bilingual exports.
              </p>
            </div>

            {/* Rclone Auto Cloud Backup Card */}
            <div className="p-5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-900 text-sm">
                        Auto Cloud Backup (Rclone Google Drive Sync)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                        Daily at 8:00 PM
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Automated daily snapshot of SQLite database synced directly to Google Drive via Rclone.
                    </p>
                  </div>
                </div>

                {canEditBackup ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Admin Access Granted</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Read-Only for Employee</span>
                  </span>
                )}
              </div>

              {!canEditBackup && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-semibold">
                  <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Schedule settings and manual backup triggers can only be modified by Super Admin and Admin.
                  </span>
                </div>
              )}

              {backupMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-bold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{backupMessage}</span>
                </div>
              )}

              {/* Google Mail Account Connection Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-bold text-slate-700">Google Drive Linked Account:</span>
                  <span className="font-extrabold text-blue-900 font-mono bg-white px-2 py-0.5 rounded border border-blue-200">
                    {googleAccount}
                  </span>
                </div>
                <span className="text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Rclone Cloud Target: <strong className="font-mono text-blue-950">{rcloneRemoteName}:{rcloneBackupPath}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {/* Auto Backup Toggle */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1.5">Scheduled Auto-Backup</label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEditBackup}
                      checked={autoBackupEnabled}
                      onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 disabled:opacity-50"
                    />
                    <span className="font-bold text-slate-800">
                      {autoBackupEnabled ? 'Enabled (Daily)' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {/* Auto Backup Time (8:00 PM) */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Backup Time (Default 8:00 PM)</span>
                  </label>
                  <input
                    type="time"
                    disabled={!canEditBackup}
                    value={autoBackupTime}
                    onChange={(e) => setAutoBackupTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Remote & Path */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Rclone Remote & Folder</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      disabled={!canEditBackup}
                      value={rcloneRemoteName}
                      onChange={(e) => setRcloneRemoteName(e.target.value)}
                      placeholder="Remote (gdrive)"
                      className="w-28 px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                    <span className="self-center font-bold text-slate-400">:</span>
                    <input
                      type="text"
                      disabled={!canEditBackup}
                      value={rcloneBackupPath}
                      onChange={(e) => setRcloneBackupPath(e.target.value)}
                      placeholder="Path (MARG_Backups)"
                      className="flex-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-indigo-100/60">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500">Last Cloud Sync:</span>
                    <span className="font-extrabold text-slate-800">
                      {lastBackupTime || 'No backups executed yet'}
                    </span>
                  </div>
                  {lastBackupStatus && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-500">Status:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        lastBackupStatus.toLowerCase().includes('success')
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {lastBackupStatus}
                      </span>
                    </div>
                  )}
                </div>

                {canEditBackup && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={backupSaving}
                      onClick={handleSaveBackupSchedule}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
                    >
                      {backupSaving ? 'Saving...' : 'Save Schedule'}
                    </button>
                    <button
                      type="button"
                      disabled={backupRunning}
                      onClick={handleTriggerManualBackup}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md shadow-indigo-600/30 transition-all hover:scale-102 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${backupRunning ? 'animate-spin' : ''}`} />
                      <span>{backupRunning ? 'Syncing to Cloud...' : 'Backup Now'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* GOOGLE DRIVE & GMAIL WEBHOOK CARD (OPTION 1) */}
            <div className="p-5 rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50/70 via-white to-sky-50/60 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-900 text-sm">
                        Google Drive Auto-Sync & 1-Click Gmail Webhook
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 uppercase tracking-wide">
                        100% Free • Zero OAuth2
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Cloud backup, automatic restore, and instant Gmail dispatch powered by Google Apps Script Webhook API.
                    </p>
                  </div>
                </div>

                {canEditBackup ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Owner & Admin Only</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Restricted Access</span>
                  </span>
                )}
              </div>

              {gdriveStatusMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-bold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{gdriveStatusMessage}</span>
                </div>
              )}

              {gmailStatusMessage && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2 font-bold animate-in fade-in">
                  <Mail className="w-4 h-4 shrink-0 text-blue-600" />
                  <span>{gmailStatusMessage}</span>
                </div>
              )}

              {gdriveTestResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-bold animate-in fade-in ${
                  gdriveTestResult.success 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {gdriveTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  )}
                  <span>{gdriveTestResult.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Webhook URL */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-extrabold text-slate-700 flex items-center gap-1.5">
                      <span>Google Apps Script Webhook URL:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setWebhookHelpOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] font-extrabold transition-all border border-blue-200 shadow-2xs hover:scale-102"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                      <span>How to get Webhook URL? (વેબહુક URL કેવી રીતે મેળવવું?)</span>
                    </button>
                  </div>
                  <input
                    type="url"
                    disabled={!canEditBackup}
                    value={gdriveWebhookUrl}
                    onChange={(e) => setGdriveWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Secret Key */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Secret API Key (apiKey):</label>
                  <input
                    type="password"
                    disabled={!canEditBackup}
                    value={gdriveApiKey}
                    onChange={(e) => setGdriveApiKey(e.target.value)}
                    placeholder="SHREEJI_SECRET_KEY_2026"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-800 disabled:bg-slate-100"
                  />
                </div>

                {/* Backup Folder */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Google Drive Folder Name:</label>
                  <input
                    type="text"
                    disabled={!canEditBackup}
                    value={gdriveBackupFolder}
                    onChange={(e) => setGdriveBackupFolder(e.target.value)}
                    placeholder="Shreeji_Healthcare_Backups"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-800 disabled:bg-slate-100"
                  />
                </div>

                {/* Notification Email */}
                <div className="sm:col-span-2">
                  <label className="font-extrabold text-slate-700 block mb-1">Default Gmail Notification / Dispatch Email:</label>
                  <input
                    type="email"
                    disabled={!canEditBackup}
                    value={gdriveNotifyEmail}
                    onChange={(e) => setGdriveNotifyEmail(e.target.value)}
                    placeholder="shreejiseven@gmail.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-800 disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              {canEditBackup && (
                <div className="pt-3 border-t border-blue-100 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={gdriveSaving}
                    onClick={handleSaveGDriveSettings}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
                  >
                    {gdriveSaving ? 'Saving...' : 'Save Settings'}
                  </button>

                  <button
                    type="button"
                    disabled={gdriveTesting || !gdriveWebhookUrl}
                    onClick={handleTestGDriveConnection}
                    className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-300 hover:bg-blue-100 text-blue-800 font-bold text-xs transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gdriveTesting ? 'animate-spin' : ''}`} />
                    <span>{gdriveTesting ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={gdriveBackupRunning || !gdriveWebhookUrl}
                    onClick={handleTriggerGDriveBackup}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md shadow-blue-600/30 transition-all hover:scale-102 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Cloud className={`w-3.5 h-3.5 ${gdriveBackupRunning ? 'animate-spin' : ''}`} />
                    <span>{gdriveBackupRunning ? 'Uploading Backup...' : 'Backup to Google Drive Now'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={gdriveLoadingBackups || !gdriveWebhookUrl}
                    onClick={handleLoadGDriveBackups}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{gdriveLoadingBackups ? 'Fetching...' : 'Browse Cloud Backups'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={gmailSending || !gdriveWebhookUrl}
                    onClick={handleSendTestGmailParties}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{gmailSending ? 'Sending...' : 'Email Parties CSV to Gmail'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={gmailSending || !gdriveWebhookUrl}
                    onClick={handleSendTestGmailDispatch}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{gmailSending ? 'Sending...' : 'Email Dispatch Report'}</span>
                  </button>
                </div>
              )}

              {/* Backups List Table from Google Drive */}
              {gdriveBackupsList.length > 0 && (
                <div className="mt-4 pt-3 border-t border-blue-100">
                  <h5 className="font-extrabold text-slate-800 text-xs mb-2 flex items-center justify-between">
                    <span>Google Drive Cloud Backups ({gdriveBackupsList.length}):</span>
                    <span className="text-[10px] text-slate-500 font-normal">Pre-restore safety snapshot created automatically</span>
                  </h5>
                  <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <th className="p-2 font-bold">Filename</th>
                          <th className="p-2 font-bold">Date & Time</th>
                          <th className="p-2 font-bold text-right">Size</th>
                          <th className="p-2 font-bold text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gdriveBackupsList.map((bk) => (
                          <tr key={bk.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                            <td className="p-2 font-bold text-slate-800 font-mono text-[11px]">{bk.name}</td>
                            <td className="p-2 text-slate-500 text-[11px]">
                              {bk.createdTime ? new Date(bk.createdTime).toLocaleString() : '-'}
                            </td>
                            <td className="p-2 text-slate-600 text-right font-mono text-[11px]">
                              {bk.size ? `${(bk.size / 1024).toFixed(1)} KB` : 'N/A'}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                disabled={gdriveRestoringId === bk.id}
                                onClick={() => handleRestoreGDriveBackup(bk.id, bk.name)}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-xs transition-colors disabled:opacity-50"
                              >
                                {gdriveRestoringId === bk.id ? 'Restoring...' : 'Restore'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Android Mobile App (.APK) Download & In-App Manual Update Card */}
            <div className="p-5 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-900 text-sm">
                        {isApk ? 'Shreeji Envelope Manager Android APK' : 'Standalone Android Mobile App (.APK)'}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                        v2.4.0 (Latest Release)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {isApk
                        ? 'Includes 30-min background auto-restart watchdog, Scoped Storage bypass, and automatic native APK installer.'
                        : 'Self-contained APK bundling all offline assets locally + auto-syncing with PostgreSQL cloud database.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {isApk ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCheckUpdate}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition-all shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                        <span>Check for Updates (અપડેટ તપાસો)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleManualUpdateApk}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Update APK Now (મેન્યુઅલ અપડેટ કરો)</span>
                      </button>
                    </>
                  ) : (
                    <a
                      href="/downloads/EnvelopeManager.apk"
                      download="EnvelopeManager.apk"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/30 transition-all hover:scale-102 shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Android APK (185 MB)</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Native SQLite Raw Database Storage (.db file) */}
              <div className="sm:col-span-2 p-5 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-blue-50/50 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="font-black text-indigo-950 text-sm flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" />
                    <span>NATIVE SQLITE RAW DATABASE STORAGE (.db)</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-[10px]">WAL-FLUSHED</span>
                  </div>
                  {isApk && (
                    <button
                      type="button"
                      onClick={handleRequestStoragePermission}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>Grant All-Files Storage Access</span>
                    </button>
                  )}
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">
                  Full binary backup and restore for SQLite. Automatically executes a Write-Ahead Log flush (<code className="bg-indigo-100/80 text-indigo-900 px-1 py-0.5 rounded font-mono font-bold">PRAGMA wal_checkpoint(FULL);</code>) so 100% of master parties, GPS pins, envelope records, and drivers are synchronized to disk.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={getBackupSqliteUrl()}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-transform active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Full Database (ડાઉનલોડ .db)</span>
                  </a>

                  {isApk && (
                    <button
                      type="button"
                      onClick={handleSaveSqliteToAndroid}
                      disabled={downloadingSqlite}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-transform active:scale-95"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>{downloadingSqlite ? 'Flushing & Saving...' : 'Save to Android Storage (Downloads/ShreejiBackups)'}</span>
                    </button>
                  )}

                  <input
                    ref={sqliteFileInputRef}
                    type="file"
                    accept=".db,.sqlite,.sqlite3,.json"
                    onChange={(e) => e.target.files && e.target.files[0] && handleRestoreSqliteBackup(e.target.files[0])}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => sqliteFileInputRef.current?.click()}
                    disabled={restoringSqlite}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>{restoringSqlite ? 'Restoring Database...' : 'Import Database (રિસ્ટોર .db / .json)'}</span>
                  </button>
                </div>
              </div>

              {/* Database Export */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                <div className="font-bold text-blue-950 text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Full Database JSON Backup</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Exports all parties, sender details, application settings, and print history into a structured JSON file.
                </p>
                <a
                  href={getBackupExportUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Backup JSON</span>
                </a>
              </div>

              {/* Database Import */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Restore from Backup JSON</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Restore previously saved database JSON backup. Safely merges parties and updates configuration.
                </p>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => e.target.files && e.target.files[0] && handleImportBackup(e.target.files[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Backup JSON File</span>
                </button>
              </div>

              {/* Excel Exports */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-600" />
                  <span>Export Parties Spreadsheet (.xlsx)</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Bilingual workbook featuring two separate sheets: English (ઇંગ્લિશ) and Gujarati (ગુજરાતી) with localized party details. NO PIN code.
                </p>
                <a
                  href={getExportPartiesUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Bilingual Parties (.xlsx)</span>
                </a>
              </div>

              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
                <div className="font-bold text-purple-950 text-sm flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  <span>Export Print History (.xlsx)</span>
                </div>
                <p className="text-slate-600 text-xs">
                  Full historical dispatch records including dates, parties, cases, weights, and status.
                </p>
                <a
                  href={getExportHistoryUrl()}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Export History (.xlsx)</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: SERVER & AUTO-UPDATE */}
        {activeTab === 'server' && (
          <div className="space-y-6">
            {/* Reconnection Countdown Banner */}
            {reconnectCountdown !== null && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                  <div>
                    <div className="font-black text-sm">Server is updating and restarting in background...</div>
                    <div className="text-xs text-blue-700">Reconnecting automatically in {reconnectCountdown} seconds...</div>
                  </div>
                </div>
              </div>
            )}

            {serverActionMsg && (
              <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-bold ${
                serverActionMsg.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : serverActionMsg.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}>
                {serverActionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                <span>{serverActionMsg.text}</span>
              </div>
            )}

            {/* Live Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Current Version */}
              <div className="p-4 rounded-xl bg-slate-900 text-white shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Current Commit</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                    {serverStatus?.current_commit || '...'}
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-medium truncate" title={serverStatus?.commit_message}>
                  {serverStatus?.commit_message || 'Loading details...'}
                </div>
                <div className="text-[10px] text-slate-500">
                  Updated {serverStatus?.commit_date || 'recently'}
                </div>
              </div>

              {/* GitHub Sync Status */}
              <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
                serverStatus?.update_available 
                  ? 'bg-amber-50/70 border-amber-300 text-amber-950' 
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wider uppercase flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    GitHub Remote
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    serverStatus?.update_available ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-600 text-white'
                  }`}>
                    {serverStatus?.update_available ? 'Update Waiting' : 'Up to Date'}
                  </span>
                </div>
                <div className="text-xs font-bold">
                  {serverStatus?.update_available ? (
                    <span className="text-amber-800">New code available on GitHub!</span>
                  ) : (
                    <span className="text-emerald-800">Server matches origin/main</span>
                  )}
                </div>
                <div className="text-[10px] opacity-75 font-mono">
                  Remote: {serverStatus?.remote_commit || '...'}
                </div>
              </div>

              {/* Watchdog Auto-Healer */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    Watchdog 24/7
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    serverStatus?.watchdog_running ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {serverStatus?.watchdog_running ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Auto-Healer & Keep-Alive
                </div>
                <div className="text-[10px] text-slate-500">
                  Android CPU wake-lock + tunnel healer
                </div>
              </div>
            </div>

            {/* Auto-Update Control Card */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                    <span>Automatic Updates from GitHub (સ્વચાલિત અપડેટ)</span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xl">
                    When enabled, the Termux background watchdog checks GitHub every 2 minutes. Whenever new features are committed to GitHub, the server automatically updates itself and reloads with ZERO manual intervention.
                  </p>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => handleToggleAutoUpdate(!serverStatus?.auto_update_enabled)}
                  className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    serverStatus?.auto_update_enabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      serverStatus?.auto_update_enabled ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <span className={`w-2.5 h-2.5 rounded-full ${serverStatus?.auto_update_enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-xs font-bold text-slate-700">
                  {serverStatus?.auto_update_enabled 
                    ? 'Auto-Update is ENABLED: Any new feature pushed to GitHub will auto-deploy within 2 minutes.' 
                    : 'Auto-Update is PAUSED: Server will only update when you click "Update Server Now" or run termux command.'}
                </span>
              </div>
            </div>

            {/* On-Demand Actions */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="font-black text-slate-900 text-sm">On-Demand Server Actions</div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={loadServerStatus}
                  disabled={loadingServerStatus}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingServerStatus ? 'animate-spin' : ''}`} />
                  <span>{loadingServerStatus ? 'Checking GitHub...' : 'Check for Updates'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerServerUpdate}
                  disabled={updatingServer}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{updatingServer ? 'Updating Server...' : '🚀 Update Server Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerServerRestart}
                  disabled={restartingServer}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${restartingServer ? 'animate-spin' : ''}`} />
                  <span>{restartingServer ? 'Restarting...' : '🔄 Restart All Services'}</span>
                </button>
              </div>
            </div>

            {/* Active Network Ports */}
            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-600" />
                <span>Service & Port Health Status</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700">MARG Envelope Manager</div>
                  <span className="text-[11px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Port 8080 : ONLINE
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700">Shreeji Order Book</div>
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
                    serverStatus?.ports?.['3000_orderbook'] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    Port 3000 : {serverStatus?.ports?.['3000_orderbook'] ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700">PostgreSQL Database</div>
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
                    serverStatus?.ports?.['5432_postgres'] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    Port 5432 : {serverStatus?.ports?.['5432_postgres'] ? 'ONLINE' : 'LOCAL DB'}
                  </span>
                </div>
              </div>
            </div>

            {/* Terminal Reference Card */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-900 text-white shadow-sm space-y-3">
              <div className="font-black text-sm flex items-center gap-2 text-slate-200">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Termux Terminal Command Shortcuts</span>
              </div>
              <p className="text-xs text-slate-400">
                You can also execute these shortcuts directly inside the Termux app on your phone:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700">
                  <div className="text-emerald-400 font-bold">bash ~/shreeji/update.sh</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">Pulls latest code & restarts cleanly</div>
                </div>
                <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700">
                  <div className="text-emerald-400 font-bold">bash ~/shreeji/status.sh</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">Displays URLs, tunnels & running ports</div>
                </div>
                <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700">
                  <div className="text-emerald-400 font-bold">bash ~/shreeji/start-all.sh</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">Starts all services with Android wake-lock</div>
                </div>
                <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700">
                  <div className="text-emerald-400 font-bold">bash ~/shreeji/stop-all.sh</div>
                  <div className="text-[11px] text-slate-400 font-sans mt-0.5">Stops all background processes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Footer Button */}
        {activeTab !== 'backup' && activeTab !== 'server' && (
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Settings...' : 'Save Configuration'}</span>
            </button>
          </div>
        )}
      </form>

      {/* Google Apps Script Webhook Help Modal */}
      <WebhookHelpModal
        isOpen={webhookHelpOpen}
        onClose={() => setWebhookHelpOpen(false)}
      />
    </div>
  );
};
