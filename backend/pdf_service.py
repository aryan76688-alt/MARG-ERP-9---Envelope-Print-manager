import os
import json
import tempfile
import subprocess
from typing import Dict, List, Any, Optional

def get_case_breakdown_lines(
    job_data: Dict[str, Any],
    case_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> List[str]:
    """
    Extracts non-zero case breakdown items for display on the envelope.
    Items with quantity 0 are strictly excluded.
    Supports multi-volume items (e.g. NS CASE 100ML: 1 and NS CASE 200ML: 1).
    """
    breakdown = job_data.get("case_breakdown")
    if not breakdown and job_data.get("case_breakdown_json"):
        try:
            raw = job_data.get("case_breakdown_json")
            if isinstance(raw, str):
                breakdown = json.loads(raw)
            elif isinstance(raw, list):
                breakdown = raw
        except Exception:
            breakdown = []
    if not breakdown and case_data.get("case_breakdown"):
        breakdown = case_data.get("case_breakdown")

    lines = []
    if breakdown and isinstance(breakdown, list):
        for item in breakdown:
            if isinstance(item, dict):
                qty = int(item.get("qty", 0))
                # 0 (zero) quantity MUST NOT print!
                if qty <= 0:
                    continue
                c_type = str(item.get("type", "CASE")).strip().upper()
                c_vol = str(item.get("volume", "")).strip().upper()
                if c_vol:
                    lines.append(f"{c_type} {c_vol}: {qty}")
                else:
                    lines.append(f"{c_type}: {qty}")
            elif isinstance(item, str) and item.strip():
                lines.append(item.strip().upper())

    if not lines and settings.get("show_case_number", True):
        case_total = case_data.get("case_total", job_data.get("total_cases", 1))
        if case_total and int(case_total) > 0:
            lines.append(f"CASE: {case_total}")

    return lines


def render_single_envelope_html(
    case_data: Dict[str, Any],
    job_data: Dict[str, Any],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> str:
    """
    Renders the exact borderless MARG Courier Envelope format matching the user attachment.
    Clean typography with larger bold text.
    Left: Recipient details & City header.
    Right Top: Dynamic case breakdown (items with qty > 0).
    Right Bottom: Sender details.
    """
    party_name = (job_data.get("party_name_snap") or "").strip().upper()
    address = (job_data.get("party_address_snap") or "").strip().upper()
    address_line_2 = (job_data.get("party_address_line_2_snap") or "").strip().upper()
    address_line_3 = (job_data.get("party_address_line_3_snap") or "").strip().upper()
    city = (job_data.get("party_city_snap") or "").strip().upper()
    state = (job_data.get("party_state_snap") or "").strip().upper()
    mobile = (job_data.get("party_mobile_snap") or "").strip()
    notes = (job_data.get("party_notes_snap") or "").strip().upper()

    sender_name = (sender_data.get("business_name") or "SHREEJI HEALTHCARE-HEALTHCARE").strip().upper()
    sender_addr = (sender_data.get("address") or "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305").strip().upper()
    sender_mob = (sender_data.get("mobile") or "+91 99245 44283").strip()
    sender_mail = (sender_data.get("email") or "SHREEJISEVEN@GMAIL.COM").strip().upper()

    # Split sender address into 2 clean rows
    if "DEHGAM-MODASA ROAD" in sender_addr:
        sender_addr_1 = "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD,"
        sender_addr_2 = "DEHGAM-382305."
    elif "," in sender_addr:
        parts = [p.strip() for p in sender_addr.split(",")]
        mid = max(1, len(parts) // 2)
        sender_addr_1 = ", ".join(parts[:mid]) + ","
        sender_addr_2 = ", ".join(parts[mid:])
    else:
        sender_addr_1 = sender_addr
        sender_addr_2 = ""

    to_header = f"TO - {city}" if city else "TO -"

    # Build multi-line address HTML
    addr_lines = [f"<div>{address}</div>"]
    if address_line_2:
        addr_lines.append(f"<div>{address_line_2}</div>")
    if address_line_3:
        addr_lines.append(f"<div>{address_line_3}</div>")
    address_html = "".join(addr_lines)

    # State & Remarks line
    state_notes = f"{state} {notes}".strip() if (state or notes) else ""

    # Dynamic Case Breakdown lines
    case_lines = get_case_breakdown_lines(job_data, case_data, settings)
    case_items_html = "".join([f'<div class="case-item">{line}</div>' for line in case_lines])

    sender_addr_2_html = f'<div class="sender-addr">{sender_addr_2}</div>' if sender_addr_2 else ""

    html = f"""
    <div class="envelope-half">
      <div class="left-col">
        <div class="to-title">{to_header}</div>
        <div class="party-name">{party_name}</div>
        <div class="party-name">{party_name},</div>
        <div class="address-lines">
          {address_html}
        </div>
        {f'<div class="state-notes">{state_notes}</div>' if state_notes else ''}
        {f'<div class="mobile-no">MOB NO:- {mobile}</div>' if mobile else ''}
      </div>
      <div class="right-col">
        <div class="case-block">
          {case_items_html}
        </div>
        <div class="sender-block">
          <div class="from-title">FROM,</div>
          <div class="sender-name">{sender_name}</div>
          <div class="sender-addr">{sender_addr_1}</div>
          {sender_addr_2_html}
          <div class="sender-mob">MOB NO.: {sender_mob}</div>
          <div class="sender-mail">MAIL: {sender_mail}</div>
        </div>
      </div>
    </div>
    """
    return html


def build_full_html_document(
    job_data: Dict[str, Any],
    cases_data: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> str:
    margin_top = float(settings.get("margin_top_mm", 15.0))
    margin_bottom = float(settings.get("margin_bottom_mm", 10.0))
    margin_left = float(settings.get("margin_left_mm", 3.0))
    margin_right = float(settings.get("margin_right_mm", 3.0))
    envelopes_per_page = int(settings.get("envelopes_per_page", 2))

    pages_html = []
    total_cases = len(cases_data)

    cut_line_html = """
    <div class="cut-guide">
      <span>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
    </div>
    """

    if envelopes_per_page == 1:
        for case in cases_data:
            env_html = render_single_envelope_html(case, job_data, sender_data, settings)
            page_content = f"""
            <div class="sheet-page">
              {env_html}
            </div>
            """
            pages_html.append(page_content)
    else:
        # 2 envelopes per A4 sheet (A4 half size stacked vertically)
        for i in range(0, total_cases, 2):
            top_case = cases_data[i]
            bottom_case = cases_data[i + 1] if (i + 1 < total_cases) else None

            top_html = render_single_envelope_html(top_case, job_data, sender_data, settings)
            bottom_html = render_single_envelope_html(bottom_case, job_data, sender_data, settings) if bottom_case else ""

            page_content = f"""
            <div class="sheet-page">
              {top_html}
              {cut_line_html if bottom_case else ''}
              {bottom_html if bottom_case else '<div class="envelope-half-empty"></div>'}
            </div>
            """
            pages_html.append(page_content)

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Courier Envelope - {job_data.get('job_number', 'ENVELOPE')}</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: {margin_top:.1f}mm {margin_right:.1f}mm {margin_bottom:.1f}mm {margin_left:.1f}mm;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
      color: #000000;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .sheet-page {{
      width: 100%;
      height: 272mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      position: relative;
      box-sizing: border-box;
    }}

    .sheet-page:last-child {{
      page-break-after: avoid;
    }}

    .envelope-half {{
      width: 100%;
      height: 132mm;
      padding: 2mm 6mm;
      display: flex;
      justify-content: space-between;
      box-sizing: border-box;
    }}

    .envelope-half-empty {{
      width: 100%;
      height: 132mm;
    }}

    .cut-guide {{
      width: 100%;
      text-align: center;
      font-size: 8pt;
      color: #666666;
      border-top: 1px dashed #888888;
      margin: 1mm 0;
      padding-top: 1mm;
      letter-spacing: 2px;
    }}

    .left-col {{
      width: 58%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }}

    .right-col {{
      width: 40%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-align: right;
    }}

    /* Bigger, bolder fonts matching user reference */
    .to-title {{
      font-size: 15.5pt;
      font-weight: 800;
      text-decoration: underline;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 0.3px;
    }}

    .party-name {{
      font-size: 13.5pt;
      font-weight: 800;
      line-height: 1.25;
      text-transform: uppercase;
      letter-spacing: 0.1px;
    }}

    .address-lines {{
      font-size: 11.5pt;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 6px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }}

    .state-notes {{
      font-size: 11.5pt;
      font-weight: 700;
      line-height: 1.3;
      text-transform: uppercase;
      margin-bottom: 10px;
    }}

    .mobile-no {{
      font-size: 13pt;
      font-weight: 800;
      text-decoration: underline;
      letter-spacing: 0.2px;
    }}

    .case-block {{
      text-align: right;
      padding-top: 2px;
    }}

    .case-item {{
      font-size: 12pt;
      font-weight: 800;
      line-height: 1.35;
      letter-spacing: 0.2px;
      color: #000000;
    }}

    .sender-block {{
      text-align: left;
      margin-top: auto;
      padding-left: 10px;
    }}

    .from-title {{
      font-size: 12.5pt;
      font-weight: 800;
      margin-bottom: 3px;
    }}

    .sender-name {{
      font-size: 11.5pt;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 2px;
    }}

    .sender-addr {{
      font-size: 10pt;
      font-weight: 700;
      line-height: 1.25;
      margin-bottom: 3px;
    }}

    .sender-mob {{
      font-size: 11pt;
      font-weight: 800;
      text-decoration: underline;
      margin-bottom: 2px;
    }}

    .sender-mail {{
      font-size: 10pt;
      font-weight: 700;
    }}
  </style>
</head>
<body>
  {"".join(pages_html)}
</body>
</html>
"""


def build_bulk_html_document(
    jobs_cases_list: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> str:
    """
    Renders multiple envelope jobs (2 envelopes per A4 sheet).
    """
    margin_top = float(settings.get("margin_top_mm", 15.0))
    margin_bottom = float(settings.get("margin_bottom_mm", 10.0))
    margin_left = float(settings.get("margin_left_mm", 3.0))
    margin_right = float(settings.get("margin_right_mm", 3.0))

    pages_html = []
    cut_line_html = """
    <div class="cut-guide">
      <span>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span>
    </div>
    """

    total_items = len(jobs_cases_list)
    for i in range(0, total_items, 2):
        top_item = jobs_cases_list[i]
        bottom_item = jobs_cases_list[i + 1] if (i + 1 < total_items) else None

        top_html = render_single_envelope_html(top_item.get("case", {}), top_item.get("job", {}), sender_data, settings)
        bottom_html = render_single_envelope_html(bottom_item.get("case", {}), bottom_item.get("job", {}), sender_data, settings) if bottom_item else ""

        page_content = f"""
        <div class="sheet-page">
          {top_html}
          {cut_line_html if bottom_item else ''}
          {bottom_html if bottom_item else '<div class="envelope-half-empty"></div>'}
        </div>
        """
        pages_html.append(page_content)

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bulk Envelopes</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: {margin_top:.1f}mm {margin_right:.1f}mm {margin_bottom:.1f}mm {margin_left:.1f}mm;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
      color: #000000;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    .sheet-page {{
      width: 100%;
      height: 272mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      position: relative;
      box-sizing: border-box;
    }}
    .sheet-page:last-child {{ page-break-after: avoid; }}
    .envelope-half {{
      width: 100%;
      height: 132mm;
      padding: 2mm 6mm;
      display: flex;
      justify-content: space-between;
      box-sizing: border-box;
    }}
    .envelope-half-empty {{ width: 100%; height: 132mm; }}
    .cut-guide {{
      width: 100%;
      text-align: center;
      font-size: 8pt;
      color: #666666;
      border-top: 1px dashed #888888;
      margin: 1mm 0;
      padding-top: 1mm;
      letter-spacing: 2px;
    }}
    .left-col {{ width: 58%; display: flex; flex-direction: column; justify-content: flex-start; }}
    .right-col {{ width: 40%; display: flex; flex-direction: column; justify-content: space-between; text-align: right; }}
    .to-title {{ font-size: 15.5pt; font-weight: 800; text-decoration: underline; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.3px; }}
    .party-name {{ font-size: 13.5pt; font-weight: 800; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.1px; }}
    .address-lines {{ font-size: 11.5pt; font-weight: 700; line-height: 1.3; margin-top: 6px; margin-bottom: 6px; text-transform: uppercase; }}
    .state-notes {{ font-size: 11.5pt; font-weight: 700; line-height: 1.3; text-transform: uppercase; margin-bottom: 10px; }}
    .mobile-no {{ font-size: 13pt; font-weight: 800; text-decoration: underline; letter-spacing: 0.2px; }}
    .case-block {{ text-align: right; padding-top: 2px; }}
    .case-item {{ font-size: 12pt; font-weight: 800; line-height: 1.35; letter-spacing: 0.2px; color: #000000; }}
    .sender-block {{ text-align: left; margin-top: auto; padding-left: 10px; }}
    .from-title {{ font-size: 12.5pt; font-weight: 800; margin-bottom: 3px; }}
    .sender-name {{ font-size: 11.5pt; font-weight: 800; line-height: 1.25; margin-bottom: 2px; }}
    .sender-addr {{ font-size: 10pt; font-weight: 700; line-height: 1.25; margin-bottom: 3px; }}
    .sender-mob {{ font-size: 11pt; font-weight: 800; text-decoration: underline; margin-bottom: 2px; }}
    .sender-mail {{ font-size: 10pt; font-weight: 700; }}
  </style>
</head>
<body>
  {"".join(pages_html)}
</body>
</html>
"""


def generate_envelopes_pdf(
    job_data: Dict[str, Any],
    cases_data: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> bytes:
    """
    Generates a high-quality vector PDF of envelopes matching the user's MARG Courier Envelope layout.
    """
    html_content = build_full_html_document(job_data, cases_data, sender_data, settings)
    return compile_html_to_pdf(html_content)


def generate_bulk_envelopes_pdf(
    jobs_cases_list: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> bytes:
    """
    Generates a combined PDF with all selected parties printed together (2 envelopes per A4 sheet).
    """
    html_content = build_bulk_html_document(jobs_cases_list, sender_data, settings)
    return compile_html_to_pdf(html_content)


def compile_html_to_pdf(html_content: str) -> bytes:
    temp_dir = tempfile.mkdtemp()
    html_path = os.path.join(temp_dir, "document.html")
    pdf_path = os.path.join(temp_dir, "document.pdf")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    try:
        cmd = [
            "chromium",
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            "--run-all-compositor-stages-before-draw",
            f"file://{html_path}"
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            with open(pdf_path, "rb") as pf:
                return pf.read()
    except Exception as e:
        print("Chromium PDF error:", e)

    # Fallback to WeasyPrint
    try:
        import weasyprint
        return weasyprint.HTML(string=html_content).write_pdf()
    except Exception as we:
        raise RuntimeError(f"Could not generate PDF: {we}")
    finally:
        try:
            if os.path.exists(html_path): os.remove(html_path)
            if os.path.exists(pdf_path): os.remove(pdf_path)
            os.rmdir(temp_dir)
        except Exception:
            pass


def generate_dispatch_summary_pdf(
    date_str: str,
    delivery_boy: str,
    route: str,
    dispatches: List[Dict[str, Any]],
    sender_data: Dict[str, Any]
) -> bytes:
    """
    Generates a delivery boy dispatch run sheet / summary manifest PDF.
    Contains: Header, Route, Driver, Dispatches table, Totals, and Signatures.
    """
    business_name = (sender_data.get("business_name") or "SHREEJI HEALTHCARE-HEALTHCARE").strip().upper()
    sender_addr = (sender_data.get("address") or "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305").strip().upper()
    sender_mob = (sender_data.get("mobile") or "+91 99245 44283").strip()

    total_parties = len(dispatches)
    total_pkgs = 0
    total_standard_cases = 0
    total_bags = 0
    total_fluid_cases = 0

    rows_html = []
    for idx, d in enumerate(dispatches, start=1):
        party_name = (d.get("party_name") or "").strip().upper()
        city = (d.get("city") or "").strip().upper()
        mobile = (d.get("mobile") or "").strip()
        pkg_count = int(d.get("total_cases") or 1)
        total_pkgs += pkg_count

        breakdown = d.get("case_breakdown", [])
        if isinstance(breakdown, str):
            try:
                breakdown = json.loads(breakdown)
            except Exception:
                breakdown = []

        breakdown_text_parts = []
        if breakdown and isinstance(breakdown, list):
            for b in breakdown:
                if isinstance(b, dict):
                    qty = int(b.get("qty", 0))
                    if qty <= 0:
                        continue
                    b_type = str(b.get("type", "CASE")).strip().upper()
                    b_vol = str(b.get("volume", "")).strip().upper()
                    if "BAG" in b_type:
                        total_bags += qty
                    elif "CASE" in b_type and not b_vol:
                        total_standard_cases += qty
                    else:
                        total_fluid_cases += qty

                    if b_vol:
                        breakdown_text_parts.append(f"{b_type} {b_vol}: {qty}")
                    else:
                        breakdown_text_parts.append(f"{b_type}: {qty}")
                elif isinstance(b, str) and b.strip():
                    breakdown_text_parts.append(b.strip().upper())
        else:
            breakdown_text_parts.append(f"CASE: {pkg_count}")
            total_standard_cases += pkg_count

        breakdown_str = ", ".join(breakdown_text_parts) if breakdown_text_parts else f"CASE: {pkg_count}"

        rows_html.append(f"""
        <tr>
          <td style="text-align: center; font-weight: bold;">{idx}</td>
          <td>
            <div style="font-weight: 800; font-size: 10pt;">{party_name}</div>
          </td>
          <td style="font-weight: 700;">{city}</td>
          <td style="font-family: monospace; font-size: 9pt;">{mobile}</td>
          <td style="font-size: 9pt; font-weight: 700; color: #1e3a8a;">{breakdown_str}</td>
          <td style="text-align: center; font-weight: 800; font-size: 11pt;">{pkg_count}</td>
          <td style="border: 1px dashed #999; height: 28px;"></td>
        </tr>
        """)

    driver_display = delivery_boy if delivery_boy else "ALL DELIVERY BOYS"
    route_display = route if route else "ALL ROUTES"

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Dispatch Run Sheet - {date_str}</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 10mm 10mm 10mm 10mm;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
      color: #000000;
      background: #ffffff;
      padding: 0;
    }}
    .header-box {{
      border-bottom: 2px solid #000000;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }}
    .company-title {{
      font-size: 16pt;
      font-weight: 900;
      letter-spacing: 0.5px;
    }}
    .company-sub {{
      font-size: 9pt;
      font-weight: 600;
      color: #333333;
      margin-top: 2px;
    }}
    .sheet-title {{
      text-align: right;
    }}
    .sheet-title h2 {{
      font-size: 13pt;
      font-weight: 900;
      color: #0f172a;
    }}
    .meta-bar {{
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      font-size: 10pt;
      font-weight: 700;
      margin-bottom: 12px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }}
    th {{
      background: #1e293b;
      color: #ffffff;
      padding: 6px 8px;
      text-align: left;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    td {{
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      vertical-align: middle;
    }}
    tr:nth-child(even) {{
      background: #f8fafc;
    }}
    .summary-box {{
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      border: 1.5px solid #000000;
      border-radius: 6px;
      padding: 10px 14px;
      background: #f8fafc;
    }}
    .kpi-item {{
      text-align: center;
    }}
    .kpi-num {{
      font-size: 14pt;
      font-weight: 900;
      color: #0f172a;
    }}
    .kpi-label {{
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
    }}
    .signatures {{
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      padding: 0 10px;
    }}
    .sign-col {{
      text-align: center;
      width: 28%;
      border-top: 1.5px solid #000000;
      padding-top: 6px;
      font-size: 9pt;
      font-weight: 800;
    }}
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <div class="company-title">{business_name}</div>
      <div class="company-sub">{sender_addr} • Phone: {sender_mob}</div>
    </div>
    <div class="sheet-title">
      <h2>DELIVERY RUN SHEET</h2>
      <div style="font-size: 9pt; font-weight: 700; color: #475569;">DISPATCH SUMMARY MANIFEST</div>
    </div>
  </div>

  <div class="meta-bar">
    <div>DATE: <span style="color: #0284c7;">{date_str}</span></div>
    <div>DELIVERY BOY: <span style="color: #0284c7;">{driver_display}</span></div>
    <div>ROUTE: <span style="color: #0284c7;">{route_display}</span></div>
    <div>TOTAL STOPS: <span style="color: #0284c7;">{total_parties}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">SR</th>
        <th style="width: 32%;">PARTY NAME</th>
        <th style="width: 14%;">DESTINATION</th>
        <th style="width: 15%;">MOBILE NO.</th>
        <th style="width: 18%;">CASES & BREAKDOWN</th>
        <th style="width: 6%; text-align: center;">PKGS</th>
        <th style="width: 10%; text-align: center;">RECEIVER SIGN</th>
      </tr>
    </thead>
    <tbody>
      {"".join(rows_html)}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="kpi-item">
      <div class="kpi-num">{total_parties}</div>
      <div class="kpi-label">Total Parties</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_pkgs}</div>
      <div class="kpi-label">Total Packages</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_standard_cases}</div>
      <div class="kpi-label">Standard Cases</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_fluid_cases}</div>
      <div class="kpi-label">IV Fluid Cases</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_bags}</div>
      <div class="kpi-label">Parcel Bags</div>
    </div>
  </div>

  <div class="signatures">
    <div class="sign-col">Delivery Boy Signature</div>
    <div class="sign-col">Dispatch Manager Signature</div>
    <div class="sign-col">Security / Gate Pass Sign</div>
  </div>
</body>
</html>
"""
    return compile_html_to_pdf(html)
