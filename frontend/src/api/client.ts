import { 
  Party, 
  SenderSettings, 
  AppSettings, 
  DashboardData, 
  PrintJob, 
  PrintJobDetails, 
  ImportValidationResult,
  CaseBreakdownItem,
  UnprintedPartyItem,
  DispatchSummaryData,
  TranslatePartyResponse,
  ParseMargTextResponse,
  BigBrainUiControlResult,
  BigBrainDashboardInsights,
  DualBrainStatus,
  DriverStop,
  PODSubmission,
  RouteBatchUpdateItem,
  GoogleSheetsSyncResult,
  RouteSyncErrorItem,
  LiveUserLocation,
  Item,
  ItemsResponse
} from '../types';


const isLocalAsset = typeof window !== 'undefined' && (
  window.location.protocol === 'file:' || 
  window.location.hostname === 'appassets.androidplatform.net' ||
  window.location.hostname.includes('.pages.dev') ||
  (window as any).isAndroidApp === true ||
  navigator.userAgent.includes('ShreejiEnvelopeApp')
);

export const DEFAULT_REMOTE_API = 'https://shreeji-envelope.aryan76688.workers.dev';

export function getApiBase(): string {
  if (typeof window === 'undefined') return '/api';
  const custom = localStorage.getItem('api_server_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '') + '/api';
  }
  const isLocalAssetCheck = (
    window.location.protocol === 'file:' || 
    window.location.hostname === 'appassets.androidplatform.net' ||
    window.location.hostname.includes('.pages.dev') ||
    (window as any).isAndroidApp === true ||
    navigator.userAgent.includes('ShreejiEnvelopeApp')
  );
  if (isLocalAssetCheck) {
    return (localStorage.getItem('api_server_url') || DEFAULT_REMOTE_API).replace(/\/+$/, '') + '/api';
  }
  return '/api';
}

export const API_BASE = {
  toString: () => getApiBase(),
  valueOf: () => getApiBase(),
  [Symbol.toPrimitive]: () => getApiBase(),
} as any as string;

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token || token === 'undefined' || token === 'null' || !token.trim()) {
    return null;
  }
  return token.trim();
}

async function fetchApi(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers } as any;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      console.warn('[Auth] Received 401 from server, retaining local session for offline resilience.');
    }
    return res;
  } catch (err: any) {
    const isFetchErr = err?.name === 'TypeError' || err?.message?.toLowerCase().includes('fetch');
    if (isFetchErr) {
      const activeServer = localStorage.getItem('api_server_url') || (isLocalAsset ? DEFAULT_REMOTE_API : (typeof window !== 'undefined' ? window.location.origin : 'server'));
      throw new Error(`Cannot connect to backend server (${activeServer}). Please ensure your Termux server is running on port 8080.`);
    }
    throw err;
  }
}

export async function fetchDashboard(period: string = 'this_month'): Promise<DashboardData> {
  const res = await fetchApi(`${API_BASE}/dashboard?filter_period=${period}`);
  if (!res.ok) throw new Error('Failed to load dashboard statistics');
  return res.json();
}

export async function fetchParties(params: {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  city?: string;
  cities?: string;
  status?: string;
  route?: string;
  routes?: string;
  has_location?: 'all' | 'set' | 'not_set';
}): Promise<{
  items: Party[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  states: string[];
  cities: string[];
  location_set_count?: number;
  location_not_set_count?: number;
}> {
  try {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.search) query.append('search', params.search);
    if (params.state) query.append('state', params.state);
    if (params.city) query.append('city', params.city);
    if (params.cities) query.append('cities', params.cities);
    if (params.status) query.append('status', params.status);
    if (params.route) query.append('route', params.route);
    if (params.routes) query.append('routes', params.routes);
    if (params.has_location) query.append('has_location', params.has_location);

    const res = await fetchApi(`${API_BASE}/parties?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.items && data.items.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn('fetchParties online failed, using offline bundled storage:', err);
  }

  // Robust fallback to bundled offline parties
  const { getPartiesOffline } = await import('../offline/db');
  return getPartiesOffline(params);
}

const _autocompleteCache = new Map<string, Party[]>();

export async function autocompleteParties(q: string, mode: 'starts_with' | 'contains' = 'contains'): Promise<Party[]> {
  const cleanQ = q.trim();
  const cacheKey = `${mode}:${cleanQ.toLowerCase()}`;
  if (_autocompleteCache.has(cacheKey)) {
    return _autocompleteCache.get(cacheKey)!;
  }

  try {
    const res = await fetchApi(`${API_BASE}/parties/autocomplete?q=${encodeURIComponent(cleanQ)}&mode=${mode}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        if (_autocompleteCache.size > 200) {
          const firstKey = _autocompleteCache.keys().next().value;
          if (firstKey) _autocompleteCache.delete(firstKey);
        }
        _autocompleteCache.set(cacheKey, data);
        return data;
      }
    }
  } catch (err) {
    console.warn('autocompleteParties online failed, fallback to offline:', err);
  }

  // Fallback to offline search
  const { searchPartiesOffline } = await import('../offline/db');
  const offlineData = await searchPartiesOffline(cleanQ, 30);
  return offlineData;
}

export async function createParty(party: Party): Promise<Party> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { savePartyOffline } = await import('../offline/db');
    return await savePartyOffline(party);
  }

  try {
    const res = await fetchApi(`${API_BASE}/parties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(party),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create party' }));
      throw new Error(err.detail || 'Failed to create party');
    }
    const created = await res.json();
    try {
      const { cachePartiesOffline } = await import('../offline/db');
      await cachePartiesOffline([created]);
    } catch {}
    return created;
  } catch (err: any) {
    console.warn('Network error creating party, saving offline:', err);
    const { savePartyOffline } = await import('../offline/db');
    return await savePartyOffline(party);
  }
}

export async function updateParty(id: number, party: Party): Promise<Party> {
  let updatedParty: Party;
  try {
    const res = await fetchApi(`${API_BASE}/parties/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(party),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update party' }));
      throw new Error(err.detail || 'Failed to update party');
    }
    updatedParty = await res.json();
  } catch (err: any) {
    if (!navigator.onLine) {
      updatedParty = { ...party, id };
    } else {
      throw err;
    }
  }

  // Synchronize to offline IndexedDB store immediately
  try {
    const { cachePartiesOffline } = await import('../offline/db');
    await cachePartiesOffline([updatedParty]);
  } catch (dbErr) {
    console.warn('Could not cache updated party offline:', dbErr);
  }

  return updatedParty;
}

export async function deleteParty(id: number): Promise<void> {
  const res = await fetchApi(`${API_BASE}/parties/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete party');
}

export async function bulkDeleteParties(partyIds: number[]): Promise<{ deleted_count: number; message: string }> {
  const res = await fetchApi(`${API_BASE}/parties/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids: partyIds }),
  });
  if (!res.ok) throw new Error('Failed to bulk delete parties');
  return res.json();
}

export async function deleteAllParties(): Promise<{ deleted_count: number; message: string }> {
  const res = await fetchApi(`${API_BASE}/parties/delete-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to delete all parties');
  return res.json();
}

export async function exportSelectedParties(partyIds: number[]): Promise<void> {
  const res = await fetchApi(`${API_BASE}/parties/export-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids: partyIds }),
  });
  if (!res.ok) throw new Error('Failed to export selected parties');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Selected_Parties_${partyIds.length}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function uploadExcelFile(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchApi(`${API_BASE}/import/excel`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to upload Excel file' }));
    throw new Error(err.detail || 'Failed to upload Excel file');
  }
  return res.json();
}

export async function validateImportRows(raw_rows: any[], mapping: Record<string, string | null>): Promise<ImportValidationResult> {
  const res = await fetchApi(`${API_BASE}/import/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_rows, mapping }),
  });
  if (!res.ok) throw new Error('Validation failed');
  return res.json();
}

export async function confirmImport(payload: {
  rows: any[];
  skip_warnings?: boolean;
  duplicate_action?: 'skip' | 'update' | 'allow';
  filename: string;
  file_size: number;
  sheet_name: string;
}): Promise<{
  imported: number;
  skipped: number;
  updated?: number;
  duplicates: number;
  errors: number;
  skipped_parties?: any[];
  updated_parties?: any[];
  import_job_id?: number;
}> {
  const res = await fetchApi(`${API_BASE}/import/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to import rows');
  return res.json();
}

export async function fetchImportHistory(): Promise<any[]> {
  const res = await fetchApi(`${API_BASE}/import/history`);
  if (!res.ok) throw new Error('Failed to load import history');
  return res.json();
}

export async function createPrintJob(payload: {
  party_id?: number | null;
  party_name: string;
  party_code?: string | null;
  address: string;
  address_line_2?: string | null;
  address_line_3?: string | null;
  city: string;
  state: string;
  mobile_no?: string | null;
  gst_no?: string | null;
  parcel_type: string;
  total_cases: number;
  case_weights: number[];
  envelope_size: string;
  orientation: string;
  printer_name: string;
  envelopes_per_page: number;
  status: string;
  sender?: SenderSettings;
  case_breakdown?: CaseBreakdownItem[];
  delivery_boy_name?: string;
  delivery_route?: string;
  template_format?: string;
  language?: string;
  party_name_gu?: string;
  address_gu?: string;
  address_line_2_gu?: string;
  address_line_3_gu?: string;
  city_gu?: string;
  state_gu?: string;
  allow_duplicate?: boolean;
  created_by?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/print-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create print job' }));
    throw new Error(err.detail || 'Failed to create print job');
  }
  return res.json();
}

export async function updatePrintJob(jobId: number, payload: any): Promise<any> {
  const res = await fetchApi(`${API_BASE}/print-jobs/${jobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update print job' }));
    throw new Error(err.detail || 'Failed to update print job');
  }
  return res.json();
}

export async function createBulkPrintJobs(payload: {
  party_ids: number[];
  case_breakdown?: CaseBreakdownItem[];
  total_cases?: number;
  parcel_type?: string;
  envelope_size?: string;
  envelopes_per_page?: number;
  delivery_boy_name?: string;
  driver_name?: string;
  delivery_route?: string;
  template_format?: string;
  language?: string;
}): Promise<{ success: boolean; created_count: number; job_ids: number[] }> {
  const res = await fetchApi(`${API_BASE}/print-jobs/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to process bulk print jobs' }));
    throw new Error(err.detail || 'Failed to process bulk print jobs');
  }
  return res.json();
}

export async function fetchUnprintedPartiesToday(unprintedOnly: boolean = true): Promise<{
  items: UnprintedPartyItem[];
  total: number;
  total_unprinted: number;
  total_printed_today: number;
}> {
  const res = await fetchApi(`${API_BASE}/parties/unprinted-today?unprinted_only=${unprintedOnly}`);
  if (!res.ok) throw new Error('Failed to load unprinted parties');
  return res.json();
}

export async function fetchPrintJobs(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  parcel_type?: string;
  date_from?: string;
  date_to?: string;
  unique_per_day?: boolean;
}): Promise<{ items: PrintJob[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.status) query.append('status', params.status);
  if (params.parcel_type) query.append('parcel_type', params.parcel_type);
  if (params.date_from) query.append('date_from', params.date_from);
  if (params.date_to) query.append('date_to', params.date_to);
  if (params.unique_per_day) query.append('unique_per_day', 'true');

  const res = await fetchApi(`${API_BASE}/print-jobs?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch print history');
  return res.json();
}

export async function fetchPrintJobDetails(id: number): Promise<PrintJobDetails> {
  const res = await fetchApi(`${API_BASE}/print-jobs/${id}`);
  if (!res.ok) throw new Error('Failed to load print job');
  return res.json();
}

export async function deletePrintJob(id: number): Promise<void> {
  const res = await fetchApi(`${API_BASE}/print-jobs/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete print job');
}

export async function fetchSettings(): Promise<{ sender: SenderSettings; app: AppSettings }> {
  try {
    const res = await fetchApi(`${API_BASE}/settings`);
    if (res.ok) {
      const data = await res.json();
      if (data.sender) localStorage.setItem('sender_settings', JSON.stringify(data.sender));
      if (data.app) localStorage.setItem('app_settings', JSON.stringify(data.app));
      return data;
    }
  } catch (err) {
    console.warn('Network error fetching settings from server, checking local cache:', err);
  }

  // Local fallback if backend is offline or not yet connected
  const localSender = localStorage.getItem('sender_settings');
  const localApp = localStorage.getItem('app_settings');
  if (localSender || localApp) {
    return {
      sender: localSender ? JSON.parse(localSender) : {} as any,
      app: localApp ? JSON.parse(localApp) : {} as any,
    };
  }
  throw new Error('Failed to load settings: backend server is offline and no local settings cached.');
}

export async function saveSettings(payload: { sender?: SenderSettings; app?: Partial<AppSettings> }): Promise<void> {
  // Always cache locally so changes are never lost!
  if (payload.sender) {
    localStorage.setItem('sender_settings', JSON.stringify(payload.sender));
  }
  if (payload.app) {
    localStorage.setItem('app_settings', JSON.stringify(payload.app));
  }
  const res = await fetchApi(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save settings to server');
}

export interface ServerStatusResponse {
  status: string;
  current_commit: string;
  commit_date: string;
  commit_message: string;
  remote_commit: string;
  update_available: boolean;
  auto_update_enabled: boolean;
  watchdog_running: boolean;
  is_termux: boolean;
  ports: {
    '8080_envelope': boolean;
    '3000_orderbook': boolean;
    '5432_postgres': boolean;
  };
  server_time: string;
}

export async function fetchServerStatus(): Promise<ServerStatusResponse> {
  const res = await fetchApi(`${API_BASE}/system/server-status`);
  if (!res.ok) throw new Error('Failed to fetch server status');
  return await res.json();
}

export async function toggleAutoUpdate(enabled: boolean): Promise<{ success: boolean; auto_update_enabled: boolean; message: string }> {
  const res = await fetchApi(`${API_BASE}/system/toggle-auto-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('Failed to toggle auto-update');
  return await res.json();
}

export async function triggerServerUpdate(): Promise<{ success: boolean; message: string; estimated_restart_seconds: number }> {
  const res = await fetchApi(`${API_BASE}/system/server-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to trigger update' }));
    throw new Error(err.detail || 'Failed to trigger update');
  }
  return await res.json();
}

export async function triggerServerRestart(): Promise<{ success: boolean; message: string; estimated_restart_seconds: number }> {
  const res = await fetchApi(`${API_BASE}/system/server-restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to trigger restart');
  return await res.json();
}

export async function downloadEnvelopePDF(payload: {
  job_id?: number;
  job_ids?: number[];
  case_breakdown?: CaseBreakdownItem[];
  party_name?: string;
  party_code?: string;
  address?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  mobile_no?: string;
  gst_no?: string;
  parcel_type?: string;
  total_cases?: number;
  case_weights?: number[];
  sender?: SenderSettings;
  envelopes_per_page?: number;
  envelope_size?: string;
  margin_top_mm?: number;
  margin_bottom_mm?: number;
  margin_left_mm?: number;
  margin_right_mm?: number;
  scale_percent?: number;
  template_format?: string;
  language?: string;
  party_name_gu?: string;
  address_gu?: string;
  address_line_2_gu?: string;
  address_line_3_gu?: string;
  city_gu?: string;
  state_gu?: string;
  bill_inside?: boolean;
}): Promise<void> {
  const res = await fetchApi(`${API_BASE}/pdf/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'PDF generation failed on server');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  let filename = 'MARG_Envelope.pdf';
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {}
  }, 15000);
}

// ==========================================
// GEMINI AI INTEGRATION API CALLS
// ==========================================

export async function testGeminiAI(): Promise<{ success: boolean; model: string; message: string; output: string }> {
  const res = await fetchApi(`${API_BASE}/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Gemini AI test failed' }));
    throw new Error(err.detail || 'Gemini AI test failed');
  }
  return res.json();
}

export async function translatePartyToGujarati(payload: {
  party_id?: number;
  party_name: string;
  address: string;
  address_line_2?: string | null;
  address_line_3?: string | null;
  city: string;
  state: string;
  save_to_db?: boolean;
}): Promise<TranslatePartyResponse> {
  const res = await fetchApi(`${API_BASE}/ai/translate-party`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Translation to Gujarati failed' }));
    throw new Error(err.detail || 'Translation to Gujarati failed');
  }
  return res.json();
}

export async function parseMargTextWithAI(text: string): Promise<ParseMargTextResponse> {
  const res = await fetchApi(`${API_BASE}/ai/parse-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'AI text parsing failed' }));
    throw new Error(err.detail || 'AI text parsing failed');
  }
  return res.json();
}

export async function batchTranslateParties(party_ids: number[]): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetchApi(`${API_BASE}/ai/batch-translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Batch translation failed' }));
    throw new Error(err.detail || 'Batch translation failed');
  }
  return res.json();
}

export async function triggerBackgroundTranslation(force: boolean = false): Promise<{ success: boolean; started: boolean; message: string }> {
  const url = force ? `${API_BASE}/ai/translate-background?force=true` : `${API_BASE}/ai/translate-background`;
  const res = await fetchApi(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger background translation');
  return res.json();
}

export async function fetchTranslationStatus(): Promise<{ is_running: boolean; total: number; processed: number; status: string }> {
  const res = await fetchApi(`${API_BASE}/ai/translate-status`);
  if (!res.ok) throw new Error('Failed to fetch translation status');
  return res.json();
}

export async function fetchBrainStatus(): Promise<DualBrainStatus> {
  const res = await fetchApi(`${API_BASE}/ai/brain-status`);
  if (!res.ok) throw new Error('Failed to fetch AI brain status');
  return res.json();
}

export async function testOpenAIApi(apiKey?: string): Promise<{ success: boolean; message: string; model?: string; output?: string }> {
  const res = await fetchApi(`${API_BASE}/ai/openai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'OpenAI Big Brain connection test failed' }));
    throw new Error(err.detail || 'OpenAI Big Brain connection test failed');
  }
  return res.json();
}

export async function fetchBigBrainUiControl(payload: {
  party_data?: any;
  template_format?: string;
  language?: string;
  envelopes_per_page?: number;
  api_key?: string;
}): Promise<{ success: boolean; ui_control: BigBrainUiControlResult }> {
  const res = await fetchApi(`${API_BASE}/ai/big-brain/ui-control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Big Brain layout optimization failed');
  return res.json();
}

export async function fetchBigBrainDashboardInsights(payload: {
  stats_data?: any;
  api_key?: string;
}): Promise<{ success: boolean; insights: BigBrainDashboardInsights }> {
  const res = await fetchApi(`${API_BASE}/ai/big-brain/dashboard-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to fetch Big Brain logistics insights');
  return res.json();
}

export async function chatWithBigBrain(payload: {
  message: string;
  history?: { role: string; content: string }[];
  context_data?: any;
  api_key?: string;
}): Promise<{ success: boolean; reply: string; model?: string; usage?: any; notice?: string }> {
  const res = await fetchApi(`${API_BASE}/ai/big-brain/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to get answer from Big Brain Assistant');
  return res.json();
}


export async function cleanAddressAI(address: string, city?: string, state?: string): Promise<{ success: boolean; data: any }> {
  const res = await fetchApi(`${API_BASE}/ai/clean-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, city, state })
  });
  if (!res.ok) throw new Error('Failed to clean address via AI');
  return res.json();
}

export async function parseSmartText(text: string): Promise<{ success: boolean; data: any }> {
  const res = await fetchApi(`${API_BASE}/ai/parse-smart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('Failed to parse text via AI');
  return res.json();
}

export async function fetchDispatchSummary(params?: {
  date?: string;
  delivery_boy?: string;
  route?: string;
  language?: string;
}): Promise<DispatchSummaryData> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.delivery_boy) query.append('delivery_boy', params.delivery_boy);
  if (params?.route) query.append('route', params.route);
  if (params?.language) query.append('language', params.language);

  const res = await fetchApi(`${API_BASE}/dispatch-summary?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load dispatch summary');
  return res.json();
}

export async function updateDispatchJobs(payload: {
  job_ids: number[];
  delivery_boy_name?: string;
  delivery_route?: string;
  status?: string;
}): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetchApi(`${API_BASE}/dispatch-summary/update-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update dispatch jobs');
  return res.json();
}

export async function bulkAssignPartyRoute(partyIds: number[], route: string): Promise<{ success: boolean; updated_count: number; route: string }> {
  const res = await fetchApi(`${API_BASE}/parties/bulk-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids: partyIds, route }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to assign route' }));
    throw new Error(err.detail || 'Failed to assign route');
  }
  return res.json();
}

export async function fetchPartyRoutes(): Promise<string[]> {
  const res = await fetchApi(`${API_BASE}/parties/routes`);
  if (!res.ok) return [];
  return res.json();
}

export async function downloadDispatchSummaryPDF(params?: {
  date?: string;
  delivery_boy?: string;
  route?: string;
  job_ids?: number[] | string;
  language?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.delivery_boy) query.append('delivery_boy', params.delivery_boy);
  if (params?.route) query.append('route', params.route);
  if (params?.language) query.append('language', params.language);
  if (params?.job_ids) {
    const idsStr = Array.isArray(params.job_ids) ? params.job_ids.join(',') : String(params.job_ids);
    query.append('job_ids', idsStr);
  }

  const res = await fetchApi(`${API_BASE}/dispatch-summary/pdf?${query.toString()}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to download dispatch summary run-sheet');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  let filename = 'Dispatch_Run_Sheet.pdf';
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {}
  }, 15000);
}

export async function printDispatchSummaryPDF(params?: {
  date?: string;
  delivery_boy?: string;
  route?: string;
  job_ids?: number[] | string;
  language?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.delivery_boy) query.append('delivery_boy', params.delivery_boy);
  if (params?.route) query.append('route', params.route);
  if (params?.language) query.append('language', params.language);
  if (params?.job_ids) {
    const idsStr = Array.isArray(params.job_ids) ? params.job_ids.join(',') : String(params.job_ids);
    query.append('job_ids', idsStr);
  }
  query.append('auto_print', 'true');

  const res = await fetchApi(`${API_BASE}/dispatch-summary/pdf?${query.toString()}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to load dispatch summary run-sheet');
  }

  const blob = await res.blob();
  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(pdfBlob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  iframe.style.width = '1024px';
  iframe.style.height = '1024px';
  iframe.style.opacity = '0.01';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        printed = true;
      }
    } catch {
      window.open(url, '_blank');
      printed = true;
    }
  };

  iframe.onload = () => {
    setTimeout(doPrint, 500);
  };

  setTimeout(() => {
    if (!printed) {
      doPrint();
      if (!printed) {
        window.open(url, '_blank');
        printed = true;
      }
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
  }, 1200);
}

export async function printEnvelopePDF(payload: {
  job_id?: number;
  job_ids?: number[];
  party_ids?: number[];
  case_breakdown?: CaseBreakdownItem[];
  party_name?: string;
  party_code?: string;
  address?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  mobile_no?: string;
  gst_no?: string;
  parcel_type?: string;
  total_cases?: number;
  case_weights?: number[];
  sender?: SenderSettings;
  envelopes_per_page?: number;
  envelope_size?: string;
  template_format?: string;
  language?: string;
  party_name_gu?: string;
  address_gu?: string;
  address_line_2_gu?: string;
  address_line_3_gu?: string;
  city_gu?: string;
  state_gu?: string;
  bill_inside?: boolean;
  auto_print?: boolean;
}): Promise<void> {
  const res = await fetchApi(`${API_BASE}/pdf/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, auto_print: true }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'PDF generation failed on server');
  }

  const blob = await res.blob();
  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(pdfBlob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  iframe.style.width = '1024px';
  iframe.style.height = '1024px';
  iframe.style.opacity = '0.01';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        printed = true;
      }
    } catch {
      window.open(url, '_blank');
      printed = true;
    }
  };

  iframe.onload = () => {
    setTimeout(doPrint, 500);
  };

  setTimeout(() => {
    if (!printed) {
      doPrint();
      if (!printed) {
        window.open(url, '_blank');
        printed = true;
      }
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
  }, 1200);
}

export function getExportPartiesUrl(): string {
  return `${API_BASE}/export/parties.xlsx`;
}

export function getExportHistoryUrl(): string {
  return `${API_BASE}/export/history.xlsx`;
}

export async function importPrintJobs(file: File): Promise<{ success: boolean; imported: number; skipped: number; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token && !token.startsWith('offline_token_')) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/print-jobs/import`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to import print history' }));
    throw new Error(err.detail || 'Failed to import print history');
  }
  return res.json();
}

export function getSampleTemplateUrl(): string {
  return `${API_BASE}/import/sample-template`;
}

export function getBackupExportUrl(): string {
  return `${API_BASE}/backup/export`;
}

export function getBackupSqliteUrl(): string {
  const token = getAuthToken();
  return `${API_BASE}/backup/download-sqlite${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getDatabaseExportUrl(): string {
  const token = getAuthToken();
  return `${API_BASE}/database/export${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export interface DatabaseInfo {
  type: string;
  file_name: string;
  file_size_bytes: number;
  file_size_formatted: string;
  last_modified: string | null;
  parties_count: number;
  jobs_count: number;
  users_count: number;
  download_sqlite_url: string;
  export_json_url: string;
}

export async function fetchDatabaseInfo(): Promise<DatabaseInfo> {
  const res = await fetchApi(`${API_BASE}/database/info`);
  if (!res.ok) throw new Error('Failed to fetch database metadata');
  return res.json();
}

export async function importDatabaseFile(file: File): Promise<{ status: string; message: string; format?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/database/import`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to import database file' }));
    throw new Error(errorData.detail || 'Failed to import database file');
  }
  return res.json();
}

export async function restoreSqliteBackup(file: File): Promise<{ status: string; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/backup/restore-sqlite`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to restore SQLite database' }));
    throw new Error(errorData.detail || 'Failed to restore SQLite database');
  }
  return res.json();
}

export function getPrintJobPdfUrl(jobId: number, autoPrint: boolean = false): string {
  return `${API_BASE}/print-jobs/${jobId}/pdf${autoPrint ? '?auto_print=true' : ''}`;
}

export interface BackupSettingsData {
  auto_backup_enabled: boolean;
  auto_backup_time: string;
  rclone_remote_name: string;
  rclone_backup_path: string;
  last_backup_time?: string | null;
  last_backup_status?: string | null;
  google_account?: string | null;
}

export async function fetchBackupSettings(): Promise<BackupSettingsData> {
  const res = await fetchApi(`${API_BASE}/backup/settings`);
  if (!res.ok) throw new Error('Failed to load backup settings');
  return res.json();
}

export async function updateBackupSettings(data: {
  auto_backup_enabled: boolean;
  auto_backup_time: string;
  rclone_remote_name: string;
  rclone_backup_path: string;
}): Promise<{ message: string }> {
  const res = await fetchApi(`${API_BASE}/backup/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update backup settings' }));
    throw new Error(err.detail || 'Failed to update backup settings');
  }
  return res.json();
}

export async function triggerManualBackup(): Promise<{ success: boolean; message: string; rclone?: boolean }> {
  const res = await fetchApi(`${API_BASE}/backup/run`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to trigger backup' }));
    throw new Error(err.detail || 'Failed to trigger backup');
  }
  return res.json();
}

// ==========================================
// GOOGLE DRIVE & GMAIL WEBHOOK CLIENT (OPTION 1)
// ==========================================

export interface GDriveSettingsData {
  gdrive_webhook_url: string;
  gdrive_api_key: string;
  gdrive_backup_folder: string;
  gdrive_notify_email: string;
  last_backup_time?: string | null;
  last_backup_status?: string | null;
}

export interface GDriveBackupItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdTime: string;
}

export async function fetchGDriveSettings(): Promise<GDriveSettingsData> {
  const res = await fetchApi(`${API_BASE}/gdrive/settings`);
  if (!res.ok) throw new Error('Failed to load Google Drive settings');
  return res.json();
}

export async function updateGDriveSettings(data: {
  gdrive_webhook_url: string;
  gdrive_api_key: string;
  gdrive_backup_folder: string;
  gdrive_notify_email: string;
}): Promise<{ message: string }> {
  const res = await fetchApi(`${API_BASE}/gdrive/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update Google Drive settings' }));
    throw new Error(err.detail || 'Failed to update Google Drive settings');
  }
  return res.json();
}

export async function testGDriveConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetchApi(`${API_BASE}/gdrive/test`, { method: 'POST' });
  return res.json();
}

export async function triggerGDriveBackup(): Promise<{ success: boolean; filename: string; size_kb: number; gdrive_response?: any }> {
  const res = await fetchApi(`${API_BASE}/gdrive/backup/run`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to execute Google Drive backup' }));
    throw new Error(err.detail || 'Failed to execute Google Drive backup');
  }
  return res.json();
}

export async function listGDriveBackups(): Promise<{ success: boolean; backups?: GDriveBackupItem[]; error?: string }> {
  const res = await fetchApi(`${API_BASE}/gdrive/backups`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to list Google Drive backups' }));
    throw new Error(err.detail || 'Failed to list Google Drive backups');
  }
  return res.json();
}

export async function restoreGDriveBackup(fileId: string): Promise<{ success: boolean; message?: string; error?: string; restored_parties?: number }> {
  const res = await fetchApi(`${API_BASE}/gdrive/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to restore backup' }));
    throw new Error(err.detail || 'Failed to restore backup');
  }
  return res.json();
}

export async function sendGmailInvoice(data: {
  to_email?: string;
  party_id?: number;
  party_name?: string;
  invoice_no?: string;
  invoice_date?: string;
  amount?: number;
  cases?: number;
  transport?: string;
  notes?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetchApi(`${API_BASE}/gmail/send-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to send invoice email' }));
    throw new Error(err.detail || 'Failed to send invoice email');
  }
  return res.json();
}

export async function sendGmailDispatchSummary(data: {
  to_email?: string;
  limit?: number;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetchApi(`${API_BASE}/gmail/send-dispatch-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to send dispatch summary email' }));
    throw new Error(err.detail || 'Failed to send dispatch summary email');
  }
  return res.json();
}

export async function sendGmailPartiesList(data: {
  to_email?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetchApi(`${API_BASE}/gmail/send-parties-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to send parties list email' }));
    throw new Error(err.detail || 'Failed to send parties list email');
  }
  return res.json();
}

// ==========================================
// DRIVER MODE & OFFLINE SYNC APIs
// ==========================================

export async function fetchDriverJobs(params: {
  date?: string;
  driver?: string;
  route?: string;
  status?: string;
}): Promise<{
  date: string;
  total_stops: number;
  delivered_count: number;
  pending_count: number;
  stops: DriverStop[];
}> {
  const q = new URLSearchParams();
  if (params.date) q.append('date', params.date);
  if (params.driver) q.append('driver', params.driver);
  if (params.route) q.append('route', params.route);
  if (params.status) q.append('status', params.status);

  const res = await fetchApi(`${API_BASE}/driver/jobs?${q.toString()}`);
  if (!res.ok) throw new Error('Failed to load driver jobs');
  return res.json();
}

export async function recordPOD(data: {
  job_id: number;
  delivered_by?: string;
  pod_signature?: string;
  pod_photo?: string;
  pod_notes?: string;
  delivered_latitude?: number | null;
  delivered_longitude?: number | null;
  accuracy_meters?: number | null;
  pin_shop_geofence?: boolean;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/driver/pod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to record proof of delivery' }));
    throw new Error(err.detail || 'Failed to record proof of delivery');
  }
  return res.json();
}

export async function updatePartyGeofence(partyId: number, data: {
  latitude: number | null;
  longitude: number | null;
  radius_meters?: number;
}): Promise<{
  success: boolean;
  party_id: number;
  party_name: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  geofence_set_at?: string;
}> {
  const res = await fetchApi(`${API_BASE}/parties/${partyId}/geofence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update pharmacy GPS pin' }));
    throw new Error(err.detail || 'Failed to update pharmacy GPS pin');
  }
  return res.json();
}

export async function unsetPartyLocation(partyId: number): Promise<{
  success: boolean;
  party_id: number;
  party_name: string;
  latitude: null;
  longitude: null;
  message: string;
}> {
  const res = await fetchApi(`${API_BASE}/parties/${partyId}/unset-location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to unset party location' }));
    throw new Error(err.detail || 'Failed to unset party location');
  }
  return res.json();
}

export async function bulkUnsetPartyLocations(partyIds: number[]): Promise<{
  success: boolean;
  updated_count: number;
  party_ids: number[];
  message: string;
}> {
  const res = await fetchApi(`${API_BASE}/parties/bulk-unset-location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids: partyIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to bulk unset party locations' }));
    throw new Error(err.detail || 'Failed to bulk unset party locations');
  }
  return res.json();
}

export async function syncBatchPOD(items: PODSubmission[]): Promise<{
  success: boolean;
  synced_count: number;
  job_ids: number[];
}> {
  const res = await fetchApi(`${API_BASE}/driver/pod/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('Failed to batch sync POD items');
  return res.json();
}

export async function syncBatchPrintJobs(jobs: any[]): Promise<{
  success: boolean;
  synced_count: number;
  jobs: any[];
}> {
  const res = await fetchApi(`${API_BASE}/sync/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs }),
  });
  if (!res.ok) throw new Error('Failed to batch sync offline jobs');
  return res.json();
}

export async function fetchDriverList(): Promise<{ drivers: string[] }> {
  const res = await fetchApi(`${API_BASE}/driver/list`);
  if (!res.ok) return { drivers: [] };
  return res.json();
}

export async function syncGoogleSheetRoutes(params: {
  sheet_url_or_id: string;
  sheet_name?: string;
  api_key?: string;
}): Promise<GoogleSheetsSyncResult> {
  const res = await fetchApi(`${API_BASE}/routes/sync-google-sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to sync Google Sheet' }));
    throw new Error(err.detail || 'Failed to sync Google Sheet');
  }
  return res.json();
}

export function getExportRoutesTemplateUrl(): string {
  return `${API_BASE}/routes/export-template`;
}

export async function batchUpdateRoutes(updates: RouteBatchUpdateItem[]): Promise<{
  success: boolean;
  updated_count: number;
  message: string;
}> {
  const res = await fetchApi(`${API_BASE}/routes/batch-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update routes' }));
    throw new Error(err.detail || 'Failed to update routes');
  }
  return res.json();
}

export async function fetchNextPartyCode(): Promise<{ next_code: string }> {
  const res = await fetchApi(`${API_BASE}/parties/next-code`);
  if (!res.ok) {
    return { next_code: 'MARG000001' };
  }
  return res.json();
}

export async function uploadRoutesFile(file: File): Promise<GoogleSheetsSyncResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchApi(`${API_BASE}/routes/upload-file`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to upload route file' }));
    throw new Error(err.detail || 'Failed to upload route file');
  }
  return res.json();
}

export async function downloadRouteErrorReport(errors: RouteSyncErrorItem[]): Promise<void> {
  const res = await fetchApi(`${API_BASE}/routes/export-error-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errors }),
  });
  if (!res.ok) {
    throw new Error('Failed to download error report');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Route_Sync_Error_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export function getN8nWebhookUrl(): string {
  return `${API_BASE}/webhooks/n8n/sheets-update`;
}

export async function fetchN8nWebhookInfo(): Promise<any> {
  const res = await fetchApi(`${API_BASE}/webhooks/n8n/info`);
  if (!res.ok) throw new Error('Failed to fetch n8n webhook info');
  return res.json();
}

export async function fetchN8nWorkflowTemplate(): Promise<any> {
  const res = await fetchApi(`${API_BASE}/webhooks/n8n/workflow-template`);
  if (!res.ok) throw new Error('Failed to fetch n8n workflow template');
  return res.json();
}

export async function testN8nWebhook(payload: any): Promise<any> {
  const res = await fetchApi(`${API_BASE}/webhooks/n8n/sheets-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Webhook test failed' }));
    throw new Error(err.detail || 'Webhook test failed');
  }
  return res.json();
}

export async function updateLiveLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery?: number;
  speed?: number;
}): Promise<any> {
  try {
    const res = await fetchApi(`${API_BASE}/users/live-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLiveUserLocations(): Promise<LiveUserLocation[]> {
  try {
    const res = await fetchApi(`${API_BASE}/users/live-locations`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function searchItems(q: string, limit: number = 30): Promise<Item[]> {
  const cleanQ = q.trim();
  if (!cleanQ) return [];
  const res = await fetchApi(`${API_BASE}/items/search?q=${encodeURIComponent(cleanQ)}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to search items catalog');
  return res.json();
}

export async function fetchItems(params?: { q?: string; limit?: number; offset?: number }): Promise<ItemsResponse> {
  const p = new URLSearchParams();
  if (params?.q) p.append('q', params.q);
  if (params?.limit) p.append('limit', String(params.limit));
  if (params?.offset) p.append('offset', String(params.offset));
  const qs = p.toString();
  const res = await fetchApi(`${API_BASE}/items${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch items');
  return res.json();
}

export async function uploadItemsExcel(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/items/import-excel`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Failed to upload stock items excel');
  }
  return res.json();
}

// ==========================================
// ANTIGRAVITY 2.0 FLEET & TELEMETRY API
// ==========================================

export async function fetchFleetVehicles(): Promise<{ vehicles: any[] }> {
  const res = await fetchApi(`${API_BASE}/fleet/vehicles`);
  if (!res.ok) throw new Error('Failed to fetch fleet vehicles');
  return res.json();
}

export async function createFleetVehicle(payload: {
  vehicle_number: string;
  model: string;
  vehicle_type?: string;
  fuel_type?: string;
  fuel_capacity_liters?: number;
  odometer_km?: number;
  driver_id?: number;
  status?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create vehicle' }));
    throw new Error(err.detail || 'Failed to create vehicle');
  }
  return res.json();
}

export async function updateFleetVehicle(vehicleId: number, payload: any): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/vehicles/${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update vehicle' }));
    throw new Error(err.detail || 'Failed to update vehicle');
  }
  return res.json();
}

export async function deleteFleetVehicle(vehicleId: number): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/vehicles/${vehicleId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete vehicle');
  return res.json();
}

export async function assignFleetVehicleDriver(vehicleId: number, driverId: number | null, notes?: string): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/vehicles/${vehicleId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver_id: driverId, notes }),
  });
  if (!res.ok) throw new Error('Failed to assign driver');
  return res.json();
}

export async function fetchActiveFleetTrips(): Promise<{ trips: any[] }> {
  const res = await fetchApi(`${API_BASE}/fleet/trips/active`);
  if (!res.ok) throw new Error('Failed to fetch active fleet trips');
  return res.json();
}

export async function fetchFleetTrips(params?: {
  date_filter?: string;
  driver_id?: number;
  vehicle_id?: number;
  status_filter?: string;
  limit?: number;
}): Promise<{ trips: any[] }> {
  const p = new URLSearchParams();
  if (params?.date_filter) p.append('date_filter', params.date_filter);
  if (params?.driver_id) p.append('driver_id', String(params.driver_id));
  if (params?.vehicle_id) p.append('vehicle_id', String(params.vehicle_id));
  if (params?.status_filter) p.append('status_filter', params.status_filter);
  if (params?.limit) p.append('limit', String(params.limit));
  const qs = p.toString();
  const res = await fetchApi(`${API_BASE}/fleet/trips${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to list fleet trips');
  return res.json();
}

export async function fetchUsers(): Promise<any[]> {
  const res = await fetchApi(`${API_BASE}/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function startFleetTrip(payload: {
  vehicle_id?: number;
  route_name?: string;
  start_odometer_km?: number;
  party_ids: number[];
  start_latitude?: number;
  start_longitude?: number;
  notes?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/trips/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to start trip' }));
    throw new Error(err.detail || 'Failed to start trip');
  }
  return res.json();
}

export async function endFleetTrip(tripId: number, payload: {
  end_odometer_km?: number;
  end_latitude?: number;
  end_longitude?: number;
  notes?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/trips/${tripId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to end trip' }));
    throw new Error(err.detail || 'Failed to end trip');
  }
  return res.json();
}

export async function updateTripStopStatus(tripId: number, payload: {
  stop_id: number;
  status: string;
  cash_collected?: number;
  pod_signature?: string | null;
  pod_photo?: string | null;
  failure_reason?: string | null;
  notes?: string | null;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/trips/${tripId}/stop-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update stop status');
  return res.json();
}

export async function fetchTripReplay(tripId: number): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/trips/${tripId}/replay`);
  if (!res.ok) throw new Error('Failed to fetch trip replay');
  return res.json();
}

export async function ingestFleetTelemetry(payload: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  speed_unit?: string;
  speed_type?: string;
  heading?: number;
  battery?: number;
  trip_id?: number;
  vehicle_id?: number;
  driver_id?: number;
  source?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to ingest telemetry');
  return res.json();
}

export async function fetchFleetAlerts(unresolvedOnly: boolean = true): Promise<{ alerts: any[] }> {
  const res = await fetchApi(`${API_BASE}/fleet/alerts?unresolved_only=${unresolvedOnly}`);
  if (!res.ok) throw new Error('Failed to fetch fleet alerts');
  return res.json();
}

export async function resolveFleetAlert(alertId: number, notes?: string): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error('Failed to resolve alert');
  return res.json();
}

export async function fetchFuelRecords(vehicleId?: number): Promise<{ records: any[] }> {
  const qs = vehicleId ? `?vehicle_id=${vehicleId}` : '';
  const res = await fetchApi(`${API_BASE}/fleet/fuel${qs}`);
  if (!res.ok) throw new Error('Failed to fetch fuel records');
  return res.json();
}

export async function addFuelRecord(payload: {
  vehicle_id: number;
  fuel_liters: number;
  cost_total: number;
  odometer_km: number;
  fuel_station?: string;
  bill_number?: string;
  receipt_photo?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/fuel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to add fuel record' }));
    throw new Error(err.detail || 'Failed to add fuel record');
  }
  return res.json();
}

export async function fetchMaintenanceRecords(vehicleId?: number): Promise<{ records: any[] }> {
  const qs = vehicleId ? `?vehicle_id=${vehicleId}` : '';
  const res = await fetchApi(`${API_BASE}/fleet/maintenance${qs}`);
  if (!res.ok) throw new Error('Failed to fetch maintenance records');
  return res.json();
}

export async function addMaintenanceRecord(payload: {
  vehicle_id: number;
  service_type: string;
  odometer_km: number;
  cost?: number;
  service_center?: string;
  service_date?: string;
  next_due_km?: number;
  next_due_date?: string;
  notes?: string;
}): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to add maintenance record' }));
    throw new Error(err.detail || 'Failed to add maintenance record');
  }
  return res.json();
}

export async function fetchFleetSummaryKPI(): Promise<any> {
  const res = await fetchApi(`${API_BASE}/fleet/reports/summary`);
  if (!res.ok) throw new Error('Failed to fetch fleet KPI summary');
  return res.json();
}



