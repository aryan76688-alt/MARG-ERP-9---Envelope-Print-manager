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
  ParseMargTextResponse
} from '../types';

const API_BASE = '/api';

export async function fetchDashboard(period: string = 'this_month'): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/dashboard?filter_period=${period}`);
  if (!res.ok) throw new Error('Failed to load dashboard statistics');
  return res.json();
}

export async function fetchParties(params: {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  city?: string;
  status?: string;
}): Promise<{ items: Party[]; total: number; page: number; limit: number; pages: number; states: string[]; cities: string[] }> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.search) query.append('search', params.search);
  if (params.state) query.append('state', params.state);
  if (params.city) query.append('city', params.city);
  if (params.status) query.append('status', params.status);

  const res = await fetch(`${API_BASE}/parties?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load parties');
  return res.json();
}

export async function autocompleteParties(q: string, mode: 'starts_with' | 'contains' = 'contains'): Promise<Party[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${API_BASE}/parties/autocomplete?q=${encodeURIComponent(q.trim())}&mode=${mode}`);
  if (!res.ok) return [];
  return res.json();
}

export async function createParty(party: Party): Promise<Party> {
  const res = await fetch(`${API_BASE}/parties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(party),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create party' }));
    throw new Error(err.detail || 'Failed to create party');
  }
  return res.json();
}

export async function updateParty(id: number, party: Party): Promise<Party> {
  const res = await fetch(`${API_BASE}/parties/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(party),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update party' }));
    throw new Error(err.detail || 'Failed to update party');
  }
  return res.json();
}

export async function deleteParty(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/parties/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete party');
}

export async function bulkDeleteParties(partyIds: number[]): Promise<{ deleted_count: number; message: string }> {
  const res = await fetch(`${API_BASE}/parties/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ party_ids: partyIds }),
  });
  if (!res.ok) throw new Error('Failed to bulk delete parties');
  return res.json();
}

export async function deleteAllParties(): Promise<{ deleted_count: number; message: string }> {
  const res = await fetch(`${API_BASE}/parties/delete-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to delete all parties');
  return res.json();
}

export async function exportSelectedParties(partyIds: number[]): Promise<void> {
  const res = await fetch(`${API_BASE}/parties/export-selected`, {
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
  const res = await fetch(`${API_BASE}/import/excel`, {
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
  const res = await fetch(`${API_BASE}/import/validate`, {
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
  const res = await fetch(`${API_BASE}/import/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to import rows');
  return res.json();
}

export async function fetchImportHistory(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/import/history`);
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
}): Promise<any> {
  const res = await fetch(`${API_BASE}/print-jobs`, {
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

export async function createBulkPrintJobs(payload: {
  party_ids: number[];
  case_breakdown?: CaseBreakdownItem[];
  total_cases?: number;
  parcel_type?: string;
  envelope_size?: string;
  envelopes_per_page?: number;
  delivery_boy_name?: string;
  delivery_route?: string;
  template_format?: string;
  language?: string;
}): Promise<{ success: boolean; created_count: number; job_ids: number[] }> {
  const res = await fetch(`${API_BASE}/print-jobs/bulk`, {
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
  const res = await fetch(`${API_BASE}/parties/unprinted-today?unprinted_only=${unprintedOnly}`);
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

  const res = await fetch(`${API_BASE}/print-jobs?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch print history');
  return res.json();
}

export async function fetchPrintJobDetails(id: number): Promise<PrintJobDetails> {
  const res = await fetch(`${API_BASE}/print-jobs/${id}`);
  if (!res.ok) throw new Error('Failed to load print job');
  return res.json();
}

export async function deletePrintJob(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/print-jobs/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete print job');
}

export async function fetchSettings(): Promise<{ sender: SenderSettings; app: AppSettings }> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function saveSettings(payload: { sender?: SenderSettings; app?: Partial<AppSettings> }): Promise<void> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save settings');
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
}): Promise<void> {
  const res = await fetch(`${API_BASE}/pdf/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('PDF generation failed on server');

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
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ==========================================
// GEMINI AI INTEGRATION API CALLS
// ==========================================

export async function testGeminiAI(): Promise<{ success: boolean; model: string; message: string; output: string }> {
  const res = await fetch(`${API_BASE}/ai/test`, {
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
  city: string;
  state: string;
  save_to_db?: boolean;
}): Promise<TranslatePartyResponse> {
  const res = await fetch(`${API_BASE}/ai/translate-party`, {
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
  const res = await fetch(`${API_BASE}/ai/parse-text`, {
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
  const res = await fetch(`${API_BASE}/ai/batch-translate`, {
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
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger background translation');
  return res.json();
}

export async function fetchTranslationStatus(): Promise<{ is_running: boolean; total: number; processed: number; status: string }> {
  const res = await fetch(`${API_BASE}/ai/translate-status`);
  if (!res.ok) throw new Error('Failed to fetch translation status');
  return res.json();
}

export async function fetchBrainStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/ai/brain-status`);
  if (!res.ok) throw new Error('Failed to fetch AI brain status');
  return res.json();
}

export async function cleanAddressAI(address: string, city?: string, state?: string): Promise<{ success: boolean; data: any }> {
  const res = await fetch(`${API_BASE}/ai/clean-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, city, state })
  });
  if (!res.ok) throw new Error('Failed to clean address via AI');
  return res.json();
}

export async function parseSmartText(text: string): Promise<{ success: boolean; data: any }> {
  const res = await fetch(`${API_BASE}/ai/parse-smart`, {
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

  const res = await fetch(`${API_BASE}/dispatch-summary?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load dispatch summary');
  return res.json();
}

export async function updateDispatchJobs(payload: {
  job_ids: number[];
  delivery_boy_name?: string;
  delivery_route?: string;
  status?: string;
}): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetch(`${API_BASE}/dispatch-summary/update-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update dispatch jobs');
  return res.json();
}

export async function bulkAssignPartyRoute(partyIds: number[], route: string): Promise<{ success: boolean; updated_count: number; route: string }> {
  const res = await fetch(`${API_BASE}/parties/bulk-route`, {
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
  const res = await fetch(`${API_BASE}/parties/routes`);
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

  const res = await fetch(`${API_BASE}/dispatch-summary/pdf?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to download dispatch summary run-sheet');

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
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
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

  const res = await fetch(`${API_BASE}/dispatch-summary/pdf?${query.toString()}`);
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
  auto_print?: boolean;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/pdf/generate`, {
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

export function getSampleTemplateUrl(): string {
  return `${API_BASE}/import/sample-template`;
}

export function getBackupExportUrl(): string {
  return `${API_BASE}/backup/export`;
}
