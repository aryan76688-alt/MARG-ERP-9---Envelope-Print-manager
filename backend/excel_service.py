import io
import re
from typing import Dict, List, Any, Optional, Tuple
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Column alias dictionary for MARG ERP and Indian accounting software
MARG_COLUMN_ALIASES: Dict[str, List[str]] = {
    "party_name": [
        "party name", "party", "account name", "ledger name", "partyname",
        "customer name", "customer", "party_name", "account", "client name",
        "firm name", "party title", "name", "cust name", "parties",
        "particulars", "debtor", "sundry debtors", "client", "firm", "ledger",
        "a/c name", "a/c", "ac name", "ac_name", "party/ledger", "dr name", "dr. name"
    ],
    "party_code": [
        "party code", "code", "account code", "ledger code", "partycode",
        "cust code", "customer code", "ac code", "ac_code", "pcode", "id",
        "ledger id", "party id", "sr no", "sr.no", "s.no", "sno", "serial no", "ac no", "acc no", "કોડ", "પાર્ટી કોડ"
    ],
    "route": [
        "route", "route name", "delivery route", "beat", "area route", "route no", "routeno",
        "delivery area", "transport route", "zone", "group", "route / area", "station / route"
    ],
    "address": [
        "address", "address 1", "address1", "address_1", "address-1", "party address", "street",
        "address line 1", "address line1", "addressline1", "addr1", "addr 1", "addr_1",
        "full address", "location", "premises", "street 1", "add1", "add 1", "add_1",
        "address (line 1)", "line 1", "line1", "street1", "addr. 1", "addr."
    ],
    "address_line_2": [
        "address line 2", "address line2", "addressline2", "address 2", "address2", "address_2", "address-2",
        "address.1", "addr2", "addr 2", "addr_2", "line 2", "line2", "street 2", "street2",
        "area", "colony", "add2", "add 2", "add_2", "address (line 2)", "addr. 2",
        "locality", "mohalla", "society", "road"
    ],
    "address_line_3": [
        "address line 3", "address line3", "addressline3", "address 3", "address3", "address_3", "address-3",
        "address.2", "addr3", "addr 3", "addr_3", "line 3", "line3", "street 3", "street3",
        "landmark", "near", "add3", "add 3", "add_3", "address (line 3)", "addr. 3",
        "opp", "opposite", "behind", "building", "bldg"
    ],
    "city": [
        "city", "town", "station", "place", "city / town", "district", "dist", "taluka", "headquarter"
    ],
    "state": [
        "state", "state name", "province", "region", "st"
    ],
    "mobile_no": [
        "mobile no", "mobile", "mobile number", "mobile no.", "contact no",
        "contact number", "cell", "phone", "phone no", "phone no.", "cell no",
        "ph no", "ph", "contact", "whatsapp", "mobile 1", "phone 1"
    ],
    "landline": [
        "landline", "landline no", "tel", "telephone", "office phone", "phone (o)",
        "landline number", "phone 2", "office tel"
    ],
    "email": [
        "email", "e-mail", "email id", "email address", "mail"
    ],
    "gst_no": [
        "gst no", "gst", "gst number", "gstin", "gstin/uin", "tax id", "tin"
    ],
    "notes": [
        "notes", "remark", "remarks", "dispatch instruction", "comment", "description", "narration"
    ],
    # Direct Gujarati Column Aliases from Excel
    "party_name_gu": [
        "party name gujarati", "party name (gujarati)", "gujarati party name", "પાર્ટીનું નામ", "પાર્ટી નામ",
        "નામ (ગુજરાતી)", "party_name_gu", "name_gu", "party name gu", "ગ્રાહક નામ", "ખાતાનું નામ",
        "party name (gujarati) * / પાર્ટીનું નામ"
    ],
    "route_gu": [
        "route gujarati", "route (gujarati)", "રૂટ", "ડિલિવરી રૂટ", "વિસ્તાર રૂટ", "route_gu",
        "delivery route / રૂટ"
    ],
    "address_gu": [
        "address gujarati", "address (gujarati)", "સરનામું", "સરનામું ૧", "સરનામું 1", "address_gu", "addr_gu",
        "address line 1 gujarati", "સરનામું લાઇન ૧", "સરનામું લાઇન 1", "address 1 gujarati",
        "address line 1 (gujarati) * / સરનામું ૧"
    ],
    "address_line_2_gu": [
        "address line 2 gujarati", "સરનામું ૨", "સરનામું 2", "address_line_2_gu", "addr2_gu",
        "સરનામું લાઇન ૨", "સરનામું લાઇન 2", "વિસ્તાર (ગુજરાતી)", "address 2 gujarati",
        "address line 2 (gujarati) / સરનામું ૨"
    ],
    "address_line_3_gu": [
        "address line 3 gujarati", "સરનામું ૩", "સરનામું 3", "address_line_3_gu", "addr3_gu",
        "સરનામું લાઇન ૩", "સરનામું લાઇન 3", "લેન્ડમાર્ક (ગુજરાતી)", "address 3 gujarati",
        "address line 3 (gujarati) / સરનામું ૩"
    ],
    "city_gu": [
        "city gujarati", "city (gujarati)", "શહેર", "ગામ", "મુકામ", "તાલુકો", "જિલ્લો", "city_gu",
        "city (gujarati) * / શહેર"
    ],
    "state_gu": [
        "state gujarati", "state (gujarati)", "રાજ્ય", "રાજ્ય (ગુજરાતી)", "state_gu",
        "state (gujarati) * / રાજ્ય"
    ]
}

def clean_header(h: Any) -> str:
    if h is None:
        return ""
    return str(h).strip().lower()

def detect_column_mappings(headers: List[str]) -> Dict[str, Optional[str]]:
    """
    Automatically detects best-matching column headers for MARG ERP party imports.
    Supports Route and all 3 address lines (address, address_line_2, address_line_3)
    plus direct Gujarati columns (party_name_gu, address_gu, etc.).
    Strictly ignores and excludes any PIN code / Postal code columns.
    """
    mapping: Dict[str, Optional[str]] = {
        "party_name": None,
        "party_code": None,
        "route": None,
        "address": None,
        "address_line_2": None,
        "address_line_3": None,
        "city": None,
        "state": None,
        "mobile_no": None,
        "landline": None,
        "email": None,
        "gst_no": None,
        "notes": None,
        "party_name_gu": None,
        "route_gu": None,
        "address_gu": None,
        "address_line_2_gu": None,
        "address_line_3_gu": None,
        "city_gu": None,
        "state_gu": None,
    }
    
    used_headers = set()
    cleaned = [(orig, clean_header(orig)) for orig in headers if orig]

    def is_pin(text: str) -> bool:
        return any(k in text for k in ["pin", "zip", "postal", "pincode", "પીન", "પીનકોડ"])

    # 0. Direct key match (e.g. party_name_gu, address_gu)
    for k in mapping.keys():
        for orig, cl in cleaned:
            if orig in used_headers:
                continue
            if cl == k or cl.replace("_", "") == k.replace("_", ""):
                mapping[k] = orig
                used_headers.add(orig)
                break

    # 1. Exact alias matching (normalized unicode-safe)
    for field, aliases in MARG_COLUMN_ALIASES.items():
        if mapping[field] is not None:
            continue
        for orig, cl in cleaned:
            if orig in used_headers or is_pin(cl):
                continue
            norm_cl = re.sub(r"[\s\-_/\\().*:,#+\[\]]", "", cl)
            for alias in aliases:
                norm_alias = re.sub(r"[\s\-_/\\().*:,#+\[\]]", "", alias)
                if cl == alias or norm_cl == norm_alias:
                    mapping[field] = orig
                    used_headers.add(orig)
                    break
            if mapping[field] is not None:
                break

    # 2. Word-boundary / token matching (aliases >= 3 characters)
    for field, aliases in MARG_COLUMN_ALIASES.items():
        if mapping[field] is not None:
            continue
        for orig, cl in cleaned:
            if orig in used_headers or is_pin(cl):
                continue
            for alias in aliases:
                if len(alias) >= 3:
                    if alias in cl:
                        mapping[field] = orig
                        used_headers.add(orig)
                        break
            if mapping[field] is not None:
                break

    # 3. Substring matching for longer keywords (>= 4 chars)
    for field, aliases in MARG_COLUMN_ALIASES.items():
        if mapping[field] is not None:
            continue
        for orig, cl in cleaned:
            if orig in used_headers or is_pin(cl):
                continue
            for alias in aliases:
                if len(alias) >= 4 and (alias in cl or cl in alias):
                    mapping[field] = orig
                    used_headers.add(orig)
                    break
            if mapping[field] is not None:
                break

    # 4. Sequential 3-Address Line Fallback:
    unmapped_addr_cols = [
        orig for orig, cl in cleaned 
        if orig not in used_headers and ("address" in cl or "addr" in cl or "street" in cl or "line" in cl or "સરનામું" in cl) and not is_pin(cl)
    ]
    if mapping["address"] is None and unmapped_addr_cols:
        mapping["address"] = unmapped_addr_cols.pop(0)
        used_headers.add(mapping["address"])
    if mapping["address_line_2"] is None and unmapped_addr_cols:
        mapping["address_line_2"] = unmapped_addr_cols.pop(0)
        used_headers.add(mapping["address_line_2"])
    if mapping["address_line_3"] is None and unmapped_addr_cols:
        mapping["address_line_3"] = unmapped_addr_cols.pop(0)
        used_headers.add(mapping["address_line_3"])

    # 5. Last resort fallback for party_name:
    if mapping["party_name"] is None:
        for orig, cl in cleaned:
            if orig not in used_headers and not is_pin(cl):
                if any(k in cl for k in ["name", "party", "ledger", "account", "customer"]):
                    mapping["party_name"] = orig
                    used_headers.add(orig)
                    break

    # 6. Fallback for route:
    if mapping["route"] is None:
        for orig, cl in cleaned:
            if orig not in used_headers and not is_pin(cl):
                if "route" in cl or "beat" in cl or "રૂટ" in cl:
                    mapping["route"] = orig
                    used_headers.add(orig)
                    break

    return mapping

def _load_all_raw_sheets(file_bytes: bytes) -> Dict[str, List[List[Any]]]:
    """
    Safely loads tabular data from all sheets in diverse formats produced by MARG ERP 9+:
    1. openpyxl (Modern .xlsx) - extracts all worksheets
    2. xlrd (Legacy binary .xls BIFF8) - extracts all worksheets
    3. pandas.read_html (HTML tables exported with .xls extension)
    4. pandas.read_csv (CSV / TSV text exports)
    Returns Dict[sheet_name, raw_2d_table_rows].
    """
    # 1. Try openpyxl (.xlsx)
    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(file_bytes),
            data_only=True,
            read_only=True,
            keep_vba=False
        )
        sheets_dict = {}
        for sname in wb.sheetnames:
            sheet = wb[sname]
            rows = [list(r) for r in sheet.iter_rows(values_only=True)]
            if rows and any(any(c is not None for c in r) for r in rows):
                sheets_dict[sname] = rows
        wb.close()
        if sheets_dict:
            return sheets_dict
    except Exception:
        pass

    # 2. Try xlrd (binary .xls)
    try:
        import xlrd
        wb = xlrd.open_workbook(file_contents=file_bytes)
        sheets_dict = {}
        for sname in wb.sheet_names():
            sheet = wb.sheet_by_name(sname)
            rows = []
            for r in range(sheet.nrows):
                rows.append([sheet.cell_value(r, c) for c in range(sheet.ncols)])
            if rows and any(any(c not in (None, "") for c in r) for r in rows):
                sheets_dict[sname] = rows
        if sheets_dict:
            return sheets_dict
    except Exception:
        pass

    # 3. Try pandas read_html (HTML disguised as .xls)
    try:
        import pandas as pd
        dfs = pd.read_html(io.BytesIO(file_bytes))
        if dfs:
            sheets_dict = {}
            for idx, df in enumerate(dfs):
                sname = f"Sheet{idx + 1}"
                headers = [str(c) for c in df.columns]
                rows = [headers] + [[cell if pd.notna(cell) else "" for cell in r] for r in df.values.tolist()]
                sheets_dict[sname] = rows
            return sheets_dict
    except Exception:
        pass

    # 4. Try CSV / TSV
    try:
        import pandas as pd
        for sep in [",", "\t", ";"]:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), sep=sep, encoding="utf-8-sig", on_bad_lines="skip")
                if not df.empty and len(df.columns) >= 2:
                    headers = [str(c) for c in df.columns]
                    rows = [headers] + [[cell if pd.notna(cell) else "" for cell in r] for r in df.values.tolist()]
                    return {"CSV_Export": rows}
            except Exception:
                continue
    except Exception:
        pass

    raise ValueError("Unable to read Excel workbook. Supported formats: .xlsx, .xls, and MARG ERP HTML/CSV exports.")

def _parse_raw_sheet_table(raw_table: List[List[Any]]) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Scans a 2D raw table, detects true header row, deduplicates column headers,
    and returns (headers, rows).
    """
    if not raw_table:
        return [], []

    HEADER_KEYWORDS = {
        "party", "name", "ledger", "account", "customer", "code", "address",
        "addr", "add1", "add2", "add3", "city", "station", "state", "mobile",
        "phone", "contact", "route", "area", "gst", "gstin", "email", "remarks",
        "notes", "sno", "s.no", "sr", "particulars", "ac", "dr", "balance",
        # Gujarati keywords
        "પાર્ટી", "નામ", "કોડ", "સરનામું", "શહેર", "રાજ્ય", "રૂટ", "ગામ", "મુકામ"
    }

    best_header_idx = 0
    max_score = 0

    scan_limit = min(len(raw_table), 15)
    for r_idx in range(scan_limit):
        row = raw_table[r_idx]
        if not row or not any(row):
            continue
        score = 0
        for cell in row:
            if cell is None:
                continue
            cell_str = str(cell).strip().lower()
            cell_norm = re.sub(r"[\s\-_/\\().*:,#+\[\]]", "", cell_str)
            if any(k in cell_norm for k in HEADER_KEYWORDS):
                score += 1
        if score > max_score:
            max_score = score
            best_header_idx = r_idx

    # If no row had keyword matches, pick first row with at least 2 non-empty cells
    if max_score < 2:
        for r_idx in range(scan_limit):
            row = raw_table[r_idx]
            non_empty = [c for c in row if c is not None and str(c).strip()]
            if len(non_empty) >= 2:
                best_header_idx = r_idx
                break

    # Build unique headers
    raw_headers = raw_table[best_header_idx]
    headers: List[str] = []
    seen_headers = set()

    for col_idx, cell in enumerate(raw_headers):
        if cell is not None and str(cell).strip():
            h_text = str(cell).strip()
        else:
            h_text = f"Column_{col_idx + 1}"
        
        base_h = h_text
        dup_count = 2
        while h_text in seen_headers:
            h_text = f"{base_h}_{dup_count}"
            dup_count += 1
        seen_headers.add(h_text)
        headers.append(h_text)

    # Process data rows
    rows: List[Dict[str, Any]] = []
    for row in raw_table[best_header_idx + 1:]:
        if not row or not any(row):
            continue

        if all(c is None or str(c).strip() == "" for c in row):
            continue

        row_dict: Dict[str, Any] = {}
        has_any_val = False
        for col_idx, cell_value in enumerate(row):
            if col_idx < len(headers):
                h = headers[col_idx]
                if cell_value is not None:
                    val_str = str(cell_value).strip()
                    if isinstance(cell_value, float) and cell_value.is_integer():
                        val_str = str(int(cell_value))
                    elif isinstance(cell_value, float) and val_str.endswith(".0"):
                        val_str = val_str[:-2]
                    row_dict[h] = val_str
                    if val_str:
                        has_any_val = True
                else:
                    row_dict[h] = ""
        
        if has_any_val:
            rows.append(row_dict)

    return headers, rows

def read_excel_file(file_bytes: bytes) -> Tuple[List[str], List[Dict[str, Any]], str, int, List[str], bool]:
    """
    Safely reads an Excel workbook without executing formulas or macros.
    Supports Dual-Sheet imports:
    - Sheet 1 (English): English party particulars (name, address, city, route, contact, etc.)
    - Sheet 2 (Gujarati): Gujarati party particulars (પાર્ટીનું નામ, સરનામું, શહેર, રૂટ, etc.)
    Matches rows across sheets by Party Code, English Name, or sequential Row Index.
    Returns (headers, rows, sheet_name, total_rows, sheets_found, has_gujarati_data).
    """
    sheets_dict = _load_all_raw_sheets(file_bytes)
    if not sheets_dict:
        return [], [], "Sheet1", 0, [], False

    sheet_names = list(sheets_dict.keys())
    
    # Identify English vs Gujarati sheets
    en_sheet_name = sheet_names[0]
    gu_sheet_name = None

    if len(sheet_names) >= 2:
        # Check sheet names for Gujarati hints
        for name in sheet_names:
            norm_name = name.strip().lower()
            if any(k in norm_name for k in ["guj", "gujarati", "ગુજરાતી"]):
                gu_sheet_name = name
                break
        
        # If no explicit "gujarati" in name, assume Sheet 1 is English and Sheet 2 is Gujarati
        if not gu_sheet_name:
            gu_sheet_name = sheet_names[1]

        # Find English sheet name
        for name in sheet_names:
            if name != gu_sheet_name:
                en_sheet_name = name
                break

    # Parse primary / English sheet
    en_headers, en_rows = _parse_raw_sheet_table(sheets_dict[en_sheet_name])
    has_gujarati_data = False

    # Check if primary sheet already contains Gujarati columns
    for h in en_headers:
        norm_h = h.strip().lower()
        if any(k in norm_h for k in ["gujarati", "ગુજરાતી", "party_name_gu", "address_gu", "પાર્ટી"]):
            has_gujarati_data = True
            break

    # If Gujarati sheet was found, parse it and merge into en_rows
    if gu_sheet_name and gu_sheet_name in sheets_dict:
        gu_headers, gu_rows = _parse_raw_sheet_table(sheets_dict[gu_sheet_name])
        gu_mapping = detect_column_mappings(gu_headers)

        # Detect columns in Sheet 2
        gu_party_col = gu_mapping.get("party_name_gu") or gu_mapping.get("party_name")
        gu_code_col = gu_mapping.get("party_code")
        gu_route_col = gu_mapping.get("route_gu") or gu_mapping.get("route")
        gu_addr_col = gu_mapping.get("address_gu") or gu_mapping.get("address")
        gu_addr2_col = gu_mapping.get("address_line_2_gu") or gu_mapping.get("address_line_2")
        gu_addr3_col = gu_mapping.get("address_line_3_gu") or gu_mapping.get("address_line_3")
        gu_city_col = gu_mapping.get("city_gu") or gu_mapping.get("city")
        gu_state_col = gu_mapping.get("state_gu") or gu_mapping.get("state")

        # Check for English reference name column in Sheet 2
        en_ref_col = None
        for gh in gu_headers:
            gh_clean = gh.strip().lower()
            if "english" in gh_clean or "ref" in gh_clean:
                en_ref_col = gh
                break

        # Build index maps for matching:
        gu_by_code: Dict[str, Dict[str, Any]] = {}
        gu_by_name: Dict[str, Dict[str, Any]] = {}
        for r_idx, g_row in enumerate(gu_rows):
            if gu_code_col and g_row.get(gu_code_col):
                c_val = str(g_row[gu_code_col]).strip().upper()
                if c_val:
                    gu_by_code[c_val] = g_row

            if en_ref_col and g_row.get(en_ref_col):
                n_val = str(g_row[en_ref_col]).strip().upper()
                if n_val:
                    gu_by_name[n_val] = g_row

        # Determine English sheet's code and name columns
        en_mapping = detect_column_mappings(en_headers)
        en_code_col = en_mapping.get("party_code")
        en_name_col = en_mapping.get("party_name")

        for idx, r in enumerate(en_rows):
            match_row = None
            # 1. Try match by code
            if en_code_col and r.get(en_code_col):
                c_key = str(r[en_code_col]).strip().upper()
                if c_key in gu_by_code:
                    match_row = gu_by_code[c_key]
            
            # 2. Try match by English name
            if not match_row and en_name_col and r.get(en_name_col):
                n_key = str(r[en_name_col]).strip().upper()
                if n_key in gu_by_name:
                    match_row = gu_by_name[n_key]

            # 3. Match by sequential row index (Row 1 -> Row 1)
            if not match_row and idx < len(gu_rows):
                match_row = gu_rows[idx]

            if match_row:
                p_gu = str(match_row.get(gu_party_col) or "").strip() if gu_party_col else ""
                r_gu = str(match_row.get(gu_route_col) or "").strip() if gu_route_col else ""
                a_gu = str(match_row.get(gu_addr_col) or "").strip() if gu_addr_col else ""
                a2_gu = str(match_row.get(gu_addr2_col) or "").strip() if gu_addr2_col else ""
                a3_gu = str(match_row.get(gu_addr3_col) or "").strip() if gu_addr3_col else ""
                c_gu = str(match_row.get(gu_city_col) or "").strip() if gu_city_col else ""
                s_gu = str(match_row.get(gu_state_col) or "").strip() if gu_state_col else ""

                if p_gu:
                    r["party_name_gu"] = p_gu
                    has_gujarati_data = True
                if r_gu:
                    r["route_gu"] = r_gu
                if a_gu:
                    r["address_gu"] = a_gu
                if a2_gu:
                    r["address_line_2_gu"] = a2_gu
                if a3_gu:
                    r["address_line_3_gu"] = a3_gu
                if c_gu:
                    r["city_gu"] = c_gu
                if s_gu:
                    r["state_gu"] = s_gu

        # Append Gujarati headers to en_headers so user can inspect / map them
        for gh_key in ["party_name_gu", "route_gu", "address_gu", "address_line_2_gu", "address_line_3_gu", "city_gu", "state_gu"]:
            if gh_key not in en_headers:
                en_headers.append(gh_key)

    display_sheet_name = f"{en_sheet_name} + {gu_sheet_name}" if (gu_sheet_name and gu_sheet_name != en_sheet_name) else en_sheet_name

    return en_headers, en_rows, display_sheet_name, len(en_rows), sheet_names, has_gujarati_data

def validate_imported_rows(
    raw_rows: List[Dict[str, Any]],
    mapping: Dict[str, Optional[str]],
    existing_party_names: set,
    existing_party_codes: set
) -> Dict[str, Any]:
    """
    Validates rows against MARG rules and existing DB records.
    Returns categorized rows: valid_rows, warning_rows, error_rows.
    Preserves Gujarati party particulars (party_name_gu, address_gu, etc.) directly from Excel.
    Guarantees that rows with a party name are never rejected due to missing address lines;
    they are intelligently auto-filled with warnings instead of fatal errors.
    """
    valid_rows = []
    warning_rows = []
    error_rows = []

    seen_names_in_file = set()
    seen_codes_in_file = set()

    for idx, row in enumerate(raw_rows, start=1):
        def get_val(key: str) -> str:
            col = mapping.get(key)
            if col and col in row:
                return str(row[col]).strip()
            # Also fallback to direct key if present
            if key in row and row[key] is not None:
                return str(row[key]).strip()
            return ""

        party_name = get_val("party_name")
        party_code = get_val("party_code")
        route = get_val("route")
        address = get_val("address")
        address_line_2 = get_val("address_line_2")
        address_line_3 = get_val("address_line_3")
        city = get_val("city")
        state = get_val("state")
        mobile = get_val("mobile_no")
        landline = get_val("landline")
        email = get_val("email")
        gst_no = get_val("gst_no")
        notes = get_val("notes")

        # Gujarati particulars directly from Excel
        party_name_gu = get_val("party_name_gu")
        route_gu = get_val("route_gu")
        address_gu = get_val("address_gu")
        address_line_2_gu = get_val("address_line_2_gu")
        address_line_3_gu = get_val("address_line_3_gu")
        city_gu = get_val("city_gu")
        state_gu = get_val("state_gu")

        # Normalize mobile (strip non-digits)
        clean_mob = re.sub(r"[^\d]", "", mobile) if mobile else ""

        errors = []
        warnings = []

        # Party name is the only strictly fatal requirement
        if not party_name:
            errors.append("Party Name is required")

        # Intelligent address cascade:
        # If address (line 1) is empty, pull from line 2 or line 3 or city
        if not address:
            if address_line_2:
                address = address_line_2
                address_line_2 = address_line_3
                address_line_3 = ""
            elif address_line_3:
                address = address_line_3
                address_line_3 = ""
            elif city:
                address = city
                warnings.append("Address Line 1 was empty; defaulted to City")
            else:
                address = "DAHEGAM"
                warnings.append("Address Line 1 missing; defaulted to DAHEGAM")

        # City / State defaults if missing
        if not city:
            warnings.append("City is missing (defaults to DAHEGAM)")
            city = "DAHEGAM"
        if not state:
            warnings.append("State is missing (defaults to GUJARAT)")
            state = "GUJARAT"

        # Duplicate checking against Database & File
        norm_name = party_name.strip().upper()
        norm_code = party_code.strip().upper() if party_code else ""
        is_already_exists = False
        match_reason = ""

        if norm_name and norm_name in existing_party_names:
            is_already_exists = True
            match_reason = f"Party name '{party_name}' already exists in ledger"
            warnings.append(match_reason)
        elif norm_code and norm_code in existing_party_codes:
            is_already_exists = True
            match_reason = f"Party code '{party_code}' already exists in ledger"
            warnings.append(match_reason)

        if norm_name:
            if norm_name in seen_names_in_file:
                warnings.append(f"Party name '{party_name}' repeated multiple times in this Excel file")
            seen_names_in_file.add(norm_name)

        if norm_code:
            if norm_code in seen_codes_in_file:
                warnings.append(f"Party code '{party_code}' repeated in this Excel file")
            seen_codes_in_file.add(norm_code)

        # Mobile validation (Indian 10-digit mobile)
        if mobile:
            if len(clean_mob) < 10:
                warnings.append(f"Mobile number '{mobile}' seems incomplete")

        # Email validation
        if email and "@" not in email:
            warnings.append(f"Email '{email}' format invalid")

        row_status = "error" if errors else ("already_exists" if is_already_exists else ("warning" if warnings else "valid"))

        record = {
            "row_index": idx,
            "party_name": party_name,
            "party_code": party_code,
            "route": route,
            "address": address,
            "address_line_2": address_line_2,
            "address_line_3": address_line_3,
            "city": city,
            "state": state,
            "mobile_no": mobile,
            "landline": landline,
            "email": email,
            "gst_no": gst_no,
            "notes": notes,
            "party_name_gu": party_name_gu,
            "route_gu": route_gu,
            "address_gu": address_gu,
            "address_line_2_gu": address_line_2_gu,
            "address_line_3_gu": address_line_3_gu,
            "city_gu": city_gu,
            "state_gu": state_gu,
            "has_gujarati": bool(party_name_gu),
            "errors": errors,
            "warnings": warnings,
            "is_already_exists": is_already_exists,
            "match_reason": match_reason,
            "status": row_status
        }

        if errors:
            error_rows.append(record)
        elif is_already_exists:
            warning_rows.append(record)
        elif warnings:
            warning_rows.append(record)
        else:
            valid_rows.append(record)

    already_exists_rows = [r for r in warning_rows if r.get("is_already_exists")]
    new_rows = valid_rows + [r for r in warning_rows if not r.get("is_already_exists")]

    return {
        "total_rows": len(raw_rows),
        "valid_count": len(valid_rows),
        "warning_count": len(warning_rows),
        "error_count": len(error_rows),
        "already_exists_count": len(already_exists_rows),
        "new_count": len(new_rows),
        "has_gujarati_data": any(bool(r.get("party_name_gu")) for r in (valid_rows + warning_rows + error_rows)),
        "valid_rows": valid_rows,
        "warning_rows": warning_rows,
        "error_rows": error_rows,
        "already_exists_rows": already_exists_rows,
        "all_preview_rows": valid_rows + warning_rows + error_rows
    }

def generate_sample_excel_template() -> bytes:
    """
    Creates a pre-formatted Dual-Sheet Excel workbook template for MARG ERP party data:
    - Sheet 1: "English Parties" with complete English particulars
    - Sheet 2: "Gujarati Parties" with corresponding Gujarati particulars (પાર્ટીનું નામ, સરનામું, શહેર, etc.)
    Eliminates reliance on automated translation and allows direct office Excel entry.
    """
    wb = openpyxl.Workbook()

    # -------------------------------------------------------------
    # SHEET 1: English Parties (MARG Navy styling)
    # -------------------------------------------------------------
    ws_en = wb.active
    ws_en.title = "English Parties"

    en_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    en_columns = [
        ("Party Name *", 28),
        ("Party Code", 14),
        ("Delivery Route", 18),
        ("Address Line 1 *", 35),
        ("Address Line 2", 30),
        ("Address Line 3", 25),
        ("City *", 18),
        ("State *", 18),
        ("Mobile No.", 16),
        ("Landline", 16),
        ("Email", 25),
        ("GST No.", 20),
        ("Notes", 30)
    ]

    for col_idx, (col_name, width) in enumerate(en_columns, start=1):
        cell = ws_en.cell(row=1, column=col_idx, value=col_name)
        cell.fill = en_header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws_en.column_dimensions[col_letter].width = width

    ws_en.row_dimensions[1].height = 28

    sample_en_data = [
        ["JODHPUR MEDICOSE", "P0001", "RAJASTHAN ROUTE", "SHREE MOHANGADH", "NEAR STN ROAD", "OPP CIVIL HOSPITAL", "JAISALMER", "RAJASTHAN", "9829012345", "0291-2645120", "jodhpurmedicose@gmail.com", "08ABCDE1234F1Z2", "Express courier"],
        ["JAY SHREE TRADERS", "P0002", "CITY MAIN ROUTE", "SHOP 14, APMC MARKET", "SECTOR 19", "PHARMA WING", "AHMEDABAD", "GUJARAT", "9876543210", "079-25418900", "jayshreetraders@yahoo.com", "24ABCDE5678G2Z1", "Medical consignments"],
        ["JIGNESH ENTERPRISE", "P0003", "VADODARA HIGHWAY", "GIDC PHASE 2", "PLOT 45/A", "", "VADODARA", "GUJARAT", "9824098765", "0265-2890123", "jignesh_ent@rediffmail.com", "24XYZAB9876C1Z8", "Priority"],
        ["J K PHARMA DISTRIBUTOR", "P0004", "SOUTH GUJARAT", "MEDICINE COMPLEX", "RING ROAD", "", "SURAT", "GUJARAT", "9898011223", "0261-2478901", "jkpharma@suratpharma.com", "24LMNOP4321D1Z9", ""],
        ["JALARAM AGENCIES", "P0005", "SAURASHTRA ROUTE", "GRAIN MARKET", "OPP TOWN HALL", "", "RAJKOT", "GUJARAT", "9426033445", "0281-2234567", "jalaram_rajkot@gmail.com", "24PQRSU8765E1Z4", ""],
        ["JANTA MEDICALS", "P0006", "NORTH ZONE", "MAIN HOSPITAL ROAD", "NEAR BUS STAND", "", "JAIPUR", "RAJASTHAN", "9829567890", "0141-2356789", "jantamedicals.jpr@gmail.com", "08JKLMN3456H1Z3", "Cold chain parcel"]
    ]

    for row_idx, row_values in enumerate(sample_en_data, start=2):
        ws_en.row_dimensions[row_idx].height = 20
        for col_idx, val in enumerate(row_values, start=1):
            cell = ws_en.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [2, 3, 9, 10]:
                cell.alignment = Alignment(horizontal="center")

    # -------------------------------------------------------------
    # SHEET 2: Gujarati Parties (Emerald Green styling)
    # -------------------------------------------------------------
    ws_gu = wb.create_sheet(title="Gujarati Parties")
    gu_header_fill = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")

    gu_columns = [
        ("Party Name (Gujarati) * / પાર્ટીનું નામ", 34),
        ("Party Code / કોડ", 16),
        ("English Name (Reference)", 28),
        ("Delivery Route / રૂટ", 22),
        ("Address Line 1 (Gujarati) * / સરનામું ૧", 38),
        ("Address Line 2 (Gujarati) / સરનામું ૨", 32),
        ("Address Line 3 (Gujarati) / સરનામું ૩", 28),
        ("City (Gujarati) * / શહેર", 20),
        ("State (Gujarati) * / રાજ્ય", 20)
    ]

    for col_idx, (col_name, width) in enumerate(gu_columns, start=1):
        cell = ws_gu.cell(row=1, column=col_idx, value=col_name)
        cell.fill = gu_header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws_gu.column_dimensions[col_letter].width = width

    ws_gu.row_dimensions[1].height = 28

    sample_gu_data = [
        ["જોધપુર મેડીકોઝ", "P0001", "JODHPUR MEDICOSE", "રાજસ્થાન રૂટ", "શ્રી મોહનગઢ", "સ્ટેશન રોડ નજીક", "સિવિલ હોસ્પિટલ સામે", "જેસલમેર", "રાજસ્થાન"],
        ["જય શ્રી ટ્રેડર્સ", "P0002", "JAY SHREE TRADERS", "સિટી મેઇન રૂટ", "દુકાન ૧૪, એપીએમસી માર્કેટ", "સેક્ટર ૧૯", "ફાર્મા વિંગ", "અમદાવાદ", "ગુજરાત"],
        ["જીગ્નેશ એન્ટરપ્રાઇઝ", "P0003", "JIGNESH ENTERPRISE", "વડોદરા હાઇવે", "જીઆઈડીસી ફેઝ ૨", "પ્લોટ ૪૫/એ", "", "વડોદરા", "ગુજરાત"],
        ["જે કે ફાર્મા ડિસ્ટ્રીબ્યુટર", "P0004", "J K PHARMA DISTRIBUTOR", "દક્ષિણ ગુજરાત", "મેડિસિન કોમ્પ્લેક્સ", "રિંગ રોડ", "", "સુરત", "ગુજરાત"],
        ["જલારામ એજન્સીઝ", "P0005", "JALARAM AGENCIES", "સૌરાષ્ટ્ર રૂટ", "દાણા પીઠ (ગ્રેન માર્કેટ)", "ટાઉન હોલ સામે", "", "રાજકોટ", "ગુજરાત"],
        ["જનતા મેડીકલ્સ", "P0006", "JANTA MEDICALS", "ઉત્તર ઝોન", "મુખ્ય હોસ્પિટલ રોડ", "બસ સ્ટેન્ડ પાસે", "", "જયપુર", "રાજસ્થાન"]
    ]

    for row_idx, row_values in enumerate(sample_gu_data, start=2):
        ws_gu.row_dimensions[row_idx].height = 20
        for col_idx, val in enumerate(row_values, start=1):
            cell = ws_gu.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [2, 3, 4]:
                cell.alignment = Alignment(horizontal="center")

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

def export_parties_to_excel(parties: List[Any]) -> bytes:
    """
    Exports parties to a dual-sheet formatted XLSX spreadsheet:
    - Sheet 1: English Parties
    - Sheet 2: Gujarati Parties (Direct Gujarati particulars matching Sheet 1)
    """
    wb = openpyxl.Workbook()

    # -------------------------------------------------------------
    # SHEET 1: English Parties
    # -------------------------------------------------------------
    ws_en = wb.active
    ws_en.title = "English Parties"

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    thin_border = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )

    headers_en = [
        ("Party Name", 28),
        ("Code", 14),
        ("Delivery Route", 18),
        ("Address Line 1", 35),
        ("Address Line 2", 30),
        ("Address Line 3", 25),
        ("City", 18),
        ("State", 18),
        ("Mobile No.", 16),
        ("Landline", 16),
        ("Email", 25),
        ("GST No.", 20),
        ("Status", 12)
    ]

    for col_idx, (col_name, width) in enumerate(headers_en, start=1):
        cell = ws_en.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws_en.column_dimensions[col_letter].width = width

    ws_en.row_dimensions[1].height = 26

    for row_idx, p in enumerate(parties, start=2):
        ws_en.row_dimensions[row_idx].height = 20
        row_vals = [
            p.party_name,
            p.party_code or "",
            getattr(p, "route", "") or "",
            p.address,
            getattr(p, "address_line_2", "") or "",
            getattr(p, "address_line_3", "") or "",
            p.city,
            p.state,
            p.mobile_no or "",
            p.landline or "",
            p.email or "",
            p.gst_no or "",
            "Active" if p.is_active else "Inactive"
        ]
        for col_idx, val in enumerate(row_vals, start=1):
            cell = ws_en.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border

    # -------------------------------------------------------------
    # SHEET 2: Gujarati Parties
    # -------------------------------------------------------------
    ws_gu = wb.create_sheet(title="Gujarati Parties")
    gu_header_fill = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")

    headers_gu = [
        ("Party Name (Gujarati) * / પાર્ટીનું નામ", 34),
        ("Party Code / કોડ", 16),
        ("English Name (Reference)", 28),
        ("Delivery Route / રૂટ", 22),
        ("Address Line 1 (Gujarati) * / સરનામું ૧", 38),
        ("Address Line 2 (Gujarati) / સરનામું ૨", 32),
        ("Address Line 3 (Gujarati) / સરનામું ૩", 28),
        ("City (Gujarati) * / શહેર", 20),
        ("State (Gujarati) * / રાજ્ય", 20)
    ]

    for col_idx, (col_name, width) in enumerate(headers_gu, start=1):
        cell = ws_gu.cell(row=1, column=col_idx, value=col_name)
        cell.fill = gu_header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws_gu.column_dimensions[col_letter].width = width

    ws_gu.row_dimensions[1].height = 26

    for row_idx, p in enumerate(parties, start=2):
        ws_gu.row_dimensions[row_idx].height = 20
        row_vals_gu = [
            getattr(p, "party_name_gu", "") or "",
            p.party_code or "",
            p.party_name or "",
            getattr(p, "route_gu", "") or getattr(p, "route", "") or "",
            getattr(p, "address_gu", "") or "",
            getattr(p, "address_line_2_gu", "") or "",
            getattr(p, "address_line_3_gu", "") or "",
            getattr(p, "city_gu", "") or "",
            getattr(p, "state_gu", "") or ""
        ]
        for col_idx, val in enumerate(row_vals_gu, start=1):
            cell = ws_gu.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [2, 3, 4]:
                cell.alignment = Alignment(horizontal="center")

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

def export_print_history_to_excel(jobs: List[Any]) -> bytes:
    """Exports print jobs history to an XLSX spreadsheet."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Print History"

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    thin_border = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )

    headers = [
        ("Job No.", 18),
        ("Date & Time", 20),
        ("Party Name", 28),
        ("Parcel Type", 16),
        ("Cases", 10),
        ("Total Weight", 14),
        ("Size", 12),
        ("Printer", 24),
        ("Status", 12)
    ]

    for col_idx, (col_name, width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    ws.row_dimensions[1].height = 26

    for row_idx, j in enumerate(jobs, start=2):
        ws.row_dimensions[row_idx].height = 20
        date_str = j.created_at.strftime("%d-%m-%Y %H:%M") if j.created_at else ""
        row_vals = [
            j.job_number,
            date_str,
            j.party_name_snap,
            j.parcel_type,
            j.total_cases,
            f"{j.total_weight:.2f} KG" if j.total_weight else "0.00 KG",
            j.envelope_size,
            j.printer_name,
            j.status
        ]
        for col_idx, val in enumerate(row_vals, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()
