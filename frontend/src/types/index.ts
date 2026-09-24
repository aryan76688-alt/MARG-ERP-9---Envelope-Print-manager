export interface Party {
  id?: number;
  party_name: string;
  party_code?: string | null;
  address: string;
  address_line_2?: string | null;
  address_line_3?: string | null;
  city: string;
  state: string;
  mobile_no?: string | null;
  landline?: string | null;
  email?: string | null;
  gst_no?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface SenderSettings {
  business_name: string;
  address: string;
  city: string;
  state: string;
  mobile: string;
  landline?: string | null;
  email?: string | null;
  gst_no?: string | null;
}

export interface AppSettings {
  default_envelope_size: string;
  default_orientation: string;
  default_copies: number;
  default_printer: string;
  margin_top_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  scale_percent: number;
  envelopes_per_page: number;
  show_header: boolean;
  show_footer: boolean;
  show_barcode: boolean;
  show_case_number: boolean;
  show_weight: boolean;
  show_mobile: boolean;
  show_party_code: boolean;
  show_date: boolean;
  show_gst: boolean;
  show_pan: boolean;
}

export interface CaseItem {
  case_number: number;
  case_total: number;
  weight: number;
  barcode_value?: string;
}

export interface CaseBreakdownItem {
  type: string; // 'CASE' | 'NS CASE' | 'RL CASE' | 'DNS CASE' | 'METRO CASE' | 'PARCEL BAG'
  volume?: string; // '100ML' | '200ML' | '250ML' | '500ML' | '1LTR'
  qty: number;
}

export interface UnprintedPartyItem extends Party {
  printed_today: boolean;
}

export interface PrintJob {
  id: number;
  job_number: string;
  party_id?: number | null;
  party_name: string;
  party_code?: string | null;
  address: string;
  address_line_2?: string | null;
  address_line_3?: string | null;
  city: string;
  state: string;
  mobile?: string | null;
  parcel_type: string;
  total_cases: number;
  total_weight: number;
  envelope_size: string;
  printer_name: string;
  status: string;
  case_breakdown_json?: string | null;
  delivery_boy_name?: string | null;
  delivery_route?: string | null;
  created_at: string;
  cases_count?: number;
}

export interface DispatchSummaryJob {
  id: number;
  job_number: string;
  party_id?: number | null;
  party_name: string;
  party_code?: string | null;
  city: string;
  state: string;
  mobile?: string | null;
  total_cases: number;
  case_breakdown?: CaseBreakdownItem[];
  delivery_boy_name?: string | null;
  delivery_route?: string | null;
  status: string;
  created_at?: string;
}

export interface DispatchSummaryData {
  date: string;
  total_parties: number;
  total_packages: number;
  breakdown_totals: Record<string, number>;
  available_delivery_boys: string[];
  available_routes: string[];
  dispatches: DispatchSummaryJob[];
}

export interface PrintJobDetails extends PrintJob {
  gst_no?: string | null;
  orientation: string;
  envelopes_per_page: number;
  sender: SenderSettings;
  cases: {
    id: number;
    case_number: number;
    case_total: number;
    weight: number;
    barcode_value: string;
    status: string;
  }[];
}

export interface DashboardData {
  metrics: {
    total_parties: number;
    total_envelopes_printed: number;
    total_cases: number;
    print_jobs: number;
    todays_prints: number;
  };
  print_summary: {
    printed: number;
    pending: number;
    failed: number;
  };
  trend: {
    labels: string[];
    data: number[];
  };
  recent_activity: {
    id: number;
    job_number: string;
    party_name: string;
    time: string;
    action: string;
    status: string;
    cases: number;
    weight: string;
  }[];
}

export interface ImportedRow {
  row_index: number;
  party_name: string;
  party_code?: string;
  address: string;
  address_line_2?: string;
  address_line_3?: string;
  city: string;
  state: string;
  mobile_no?: string;
  landline?: string;
  email?: string;
  gst_no?: string;
  notes?: string;
  errors: string[];
  warnings: string[];
  is_already_exists?: boolean;
  match_reason?: string;
  status: 'valid' | 'warning' | 'error' | 'already_exists' | 'new';
}

export interface ImportValidationResult {
  total_rows: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  already_exists_count?: number;
  new_count?: number;
  valid_rows: ImportedRow[];
  warning_rows: ImportedRow[];
  error_rows: ImportedRow[];
  already_exists_rows?: ImportedRow[];
  all_preview_rows?: ImportedRow[];
}

export interface ConfirmImportPayload {
  rows: any[];
  skip_warnings?: boolean;
  duplicate_action?: 'skip' | 'update' | 'allow';
  filename?: string;
  file_size?: number;
  sheet_name?: string;
}

export interface ImportConfirmationResult {
  imported: number;
  skipped: number;
  updated?: number;
  duplicates: number;
  errors: number;
  skipped_parties?: { row_index?: number; party_name: string; party_code?: string; reason?: string }[];
  updated_parties?: { party_name: string; party_code?: string; status?: string }[];
  import_job_id?: number;
}
