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
        "shree mohangadh", "firm name", "party title"
    ],
    "party_code": [
        "party code", "code", "account code", "ledger code", "partycode",
        "cust code", "customer code", "ac code", "pcode", "id"
    ],
    "address": [
        "address", "address 1", "address1", "address_1", "address-1", "party address", "street",
        "address line 1", "address line1", "addressline1", "addr1", "addr 1", "addr_1",
        "full address", "location", "premises", "street 1", "add1", "add 1", "add_1"
    ],
    "address_line_2": [
        "address line 2", "address line2", "addressline2", "address 2", "address2", "address_2", "address-2",
        "address.1", "addr2", "addr 2", "addr_2", "line 2", "line2", "street 2", "street2",
        "area", "colony", "add2", "add 2", "add_2", "address (line 2)"
    ],
    "address_line_3": [
        "address line 3", "address line3", "addressline3", "address 3", "address3", "address_3", "address-3",
        "address.2", "addr3", "addr 3", "addr_3", "line 3", "line3", "street 3", "street3",
        "landmark", "near", "add3", "add 3", "add_3", "address (line 3)"
    ],
    "city": [
        "city", "town", "station", "place", "city / town", "district"
    ],
    "state": [
        "state", "state name", "province", "region"
    ],
    "mobile_no": [
        "mobile no", "mobile", "mobile number", "mobile no.", "contact no",
        "contact number", "cell", "phone", "phone no", "mo", "mo.", "cell no"
    ],
    "landline": [
        "landline", "landline no", "tel", "telephone", "office phone", "phone (o)"
    ],
    "email": [
        "email", "e-mail", "email id", "email address", "mail"
    ],
    "gst_no": [
        "gst no", "gst", "gst number", "gstin", "gstin/uin", "tax id"
    ],
    "notes": [
        "notes", "remark", "remarks", "dispatch instruction", "comment"
    ]
}

def clean_header(h: Any) -> str:
    if h is None:
        return ""
    return str(h).strip().lower()

def detect_column_mappings(headers: List[str]) -> Dict[str, Optional[str]]:
    """
    Automatically detects best-matching column headers for MARG ERP party imports.
    Supports all 3 address lines (address, address_line_2, address_line_3).
    Strictly ignores and excludes any PIN code / Postal code columns.
    """
    mapping: Dict[str, Optional[str]] = {
        "party_name": None,
        "party_code": None,
        "address": None,
        "address_line_2": None,
        "address_line_3": None,
        "city": None,
        "state": None,
        "mobile_no": None,
        "landline": None,
        "email": None,
        "gst_no": None,
        "notes": None
    }
    
    used_headers = set()
    cleaned = [(orig, clean_header(orig)) for orig in headers if orig]

    # 1. Exact or alias matching
    for field, aliases in MARG_COLUMN_ALIASES.items():
        for orig, cl in cleaned:
            if orig in used_headers:
                continue
            if "pin" in cl or "zip" in cl or "postal" in cl:
                continue
            if cl in aliases:
                mapping[field] = orig
                used_headers.add(orig)
                break

    # 2. Fallback partial matching
    for field, aliases in MARG_COLUMN_ALIASES.items():
        if mapping[field] is None:
            for orig, cl in cleaned:
                if orig in used_headers:
                    continue
                if "pin" in cl or "zip" in cl or "postal" in cl:
                    continue
                for alias in aliases:
                    if alias in cl or cl in alias:
                        mapping[field] = orig
                        used_headers.add(orig)
                        break
                if mapping[field] is not None:
                    break

    # 3. Sequential 3-Address Line Fallback:
    # If file has multiple address columns (e.g. Address, Address, Address or Address 1, Address 2, Address 3)
    unmapped_addr_cols = [
        orig for orig, cl in cleaned 
        if orig not in used_headers and ("address" in cl or "addr" in cl) and not any(p in cl for p in ["pin", "zip", "postal"])
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

    return mapping

def read_excel_file(file_bytes: bytes) -> Tuple[List[str], List[Dict[str, Any]], str, int]:
    """
    Safely reads an Excel workbook without executing formulas or macros.
    Returns (headers, rows, sheet_name, total_rows).
    """
    wb = openpyxl.load_workbook(
        io.BytesIO(file_bytes),
        data_only=True,
        read_only=True,
        keep_vba=False
    )
    sheet = wb.active
    sheet_name = sheet.title

    headers: List[str] = []
    rows: List[Dict[str, Any]] = []

    for row_idx, row in enumerate(sheet.iter_rows(values_only=True)):
        if row_idx == 0:
            headers = [str(cell).strip() if cell is not None else f"Column_{i+1}" for i, cell in enumerate(row)]
            continue

        # Check if entire row is empty
        if not any(row):
            continue

        row_dict: Dict[str, Any] = {}
        for col_idx, cell_value in enumerate(row):
            if col_idx < len(headers):
                h = headers[col_idx]
                val = cell_value
                if val is not None:
                    val_str = str(val).strip()
                    # Remove trailing .0 from phone numbers or integers parsed as float
                    if isinstance(val, float) and val.is_integer():
                        val_str = str(int(val))
                    row_dict[h] = val_str
                else:
                    row_dict[h] = ""
        rows.append(row_dict)

    wb.close()
    return headers, rows, sheet_name, len(rows)

def validate_imported_rows(
    raw_rows: List[Dict[str, Any]],
    mapping: Dict[str, Optional[str]],
    existing_party_names: set,
    existing_party_codes: set
) -> Dict[str, Any]:
    """
    Validates rows against MARG rules and existing DB records.
    Returns categorized rows: valid_rows, warning_rows, error_rows.
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
            return ""

        party_name = get_val("party_name")
        party_code = get_val("party_code")
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

        # Normalize mobile (strip non-digits)
        clean_mob = re.sub(r"[^\d]", "", mobile) if mobile else ""

        errors = []
        warnings = []

        # Critical validations
        if not party_name:
            errors.append("Party Name is required")
        if not address:
            errors.append("Address is required")

        # City / State defaults if missing
        if not city:
            warnings.append("City is missing (defaults to Dahegam/Local)")
            city = "DAHEGAM"
        if not state:
            warnings.append("State is missing (defaults to GUJARAT)")
            state = "GUJARAT"

        # Duplicate checking against Database & File
        norm_name = party_name.strip().upper()
        norm_code = party_code.strip().upper() if party_code else ""
        is_already_exists = False
        match_reason = ""

        if norm_name in existing_party_names:
            is_already_exists = True
            match_reason = f"Party name '{party_name}' already exists in ledger"
            warnings.append(match_reason)
        elif norm_code and norm_code in existing_party_codes:
            is_already_exists = True
            match_reason = f"Party code '{party_code}' already exists in ledger"
            warnings.append(match_reason)

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

        row_status = "error" if errors else ("already_exists" if is_already_exists else ("warning" if warnings else "new"))

        record = {
            "row_index": idx,
            "party_name": party_name,
            "party_code": party_code,
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
        "valid_rows": valid_rows,
        "warning_rows": warning_rows,
        "error_rows": error_rows,
        "already_exists_rows": already_exists_rows,
        "all_preview_rows": valid_rows + warning_rows + error_rows
    }

def generate_sample_excel_template() -> bytes:
    """
    Creates a pre-formatted Excel workbook template for office staff to import MARG ERP party data.
    Strictly excludes PIN code.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "MARG Parties"

    # Header styling: MARG navy header with bold white text
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    columns = [
        ("Party Name *", 28),
        ("Party Code", 14),
        ("Address *", 35),
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

    for col_idx, (col_name, width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    ws.row_dimensions[1].height = 28

    # Realistic MARG ERP sample data rows
    sample_data = [
        ["JODHPUR MEDICOSE", "P0001", "SHREE MOHANGADH", "NEAR STN ROAD", "OPP CIVIL HOSPITAL", "JODHPUR", "RAJASTHAN", "9829012345", "0291-2645120", "jodhpurmedicose@gmail.com", "08ABCDE1234F1Z2", "Express courier"],
        ["JAY SHREE TRADERS", "P0002", "SHOP 14, APMC MARKET", "SECTOR 19", "PHARMA WING", "AHMEDABAD", "GUJARAT", "9876543210", "079-25418900", "jayshreetraders@yahoo.com", "24ABCDE5678G2Z1", "Medical consignments"],
        ["JIGNESH ENTERPRISE", "P0003", "GIDC PHASE 2", "PLOT 45/A", "", "VADODARA", "GUJARAT", "9824098765", "0265-2890123", "jignesh_ent@rediffmail.com", "24XYZAB9876C1Z8", "Priority"],
        ["J K PHARMA DISTRIBUTOR", "P0004", "MEDICINE COMPLEX", "RING ROAD", "", "SURAT", "GUJARAT", "9898011223", "0261-2478901", "jkpharma@suratpharma.com", "24LMNOP4321D1Z9", ""],
        ["JALARAM AGENCIES", "P0005", "GRAIN MARKET", "OPP TOWN HALL", "", "RAJKOT", "GUJARAT", "9426033445", "0281-2234567", "jalaram_rajkot@gmail.com", "24PQRSU8765E1Z4", ""],
        ["JANTA MEDICALS", "P0006", "MAIN HOSPITAL ROAD", "NEAR BUS STAND", "", "JAIPUR", "RAJASTHAN", "9829567890", "0141-2356789", "jantamedicals.jpr@gmail.com", "08JKLMN3456H1Z3", "Cold chain parcel"]
    ]

    for row_idx, row_values in enumerate(sample_data, start=2):
        ws.row_dimensions[row_idx].height = 20
        for col_idx, val in enumerate(row_values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [2, 8, 9]:
                cell.alignment = Alignment(horizontal="center")

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

def export_parties_to_excel(parties: List[Any]) -> bytes:
    """Exports parties to a clean, formatted XLSX spreadsheet."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Parties"

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
        ("Party Name", 28),
        ("Code", 14),
        ("Address", 35),
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

    for col_idx, (col_name, width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    ws.row_dimensions[1].height = 26

    for row_idx, p in enumerate(parties, start=2):
        ws.row_dimensions[row_idx].height = 20
        row_vals = [
            p.party_name,
            p.party_code or "",
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
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.border = thin_border

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
