import os
import tempfile
import subprocess
from typing import Dict, List, Any

def render_single_envelope_html(
    case_data: Dict[str, Any],
    job_data: Dict[str, Any],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any]
) -> str:
    """
    Renders the exact MARG Courier Envelope format matching the user reference image.
    Strictly NO Barcode, NO Weight, NO PIN Code.
    Grid table layout with recipient top-left and sender mid-right.
    """
    case_num = case_data.get("case_number", 1)
    case_total = case_data.get("case_total", 1)
    show_case_number = settings.get("show_case_number", True)

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

    # Split sender address into 2 rows matching reference envelope
    # e.g. "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD," and "DEHGAM-382305."
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
    case_badge = f"CASE: {case_num}" if show_case_number else ""

    # Build multi-line address HTML
    addr_lines = [f"<div>{address}</div>"]
    if address_line_2:
        addr_lines.append(f"<div>{address_line_2}</div>")
    if address_line_3:
        addr_lines.append(f"<div>{address_line_3}</div>")
    address_html = "".join(addr_lines)

    # Generate the exact 7-column grid matching MARG Courier Envelope (EXACTLY 22 ROWS)
    html = f"""
    <div class="marg-envelope-wrapper">
      <table class="marg-grid-table">
        <colgroup>
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
          <col style="width: 14.2857%;" />
        </colgroup>
        <tbody>
          <!-- Row 1: TO - CITY & Case Number -->
          <tr class="h-row">
            <td class="cell-to font-bold" colspan="3">{to_header}</td>
            <td></td>
            <td></td>
            <td></td>
            <td class="cell-case font-bold">{case_badge}</td>
          </tr>

          <!-- Row 2: empty row (7 cols) -->
          <tr class="h-row">
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 3: Party Name Line 1 (Double height) -->
          <tr class="h-row-lg">
            <td colspan="3" class="cell-party font-bold">{party_name}</td>
            <td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 4: Party Name Line 2 (with comma) -->
          <tr class="h-row">
            <td colspan="3" class="cell-party font-bold">{party_name},</td>
            <td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 5: Multi-line Address (Double height) -->
          <tr class="h-row-addr">
            <td colspan="3" class="cell-address font-bold">{address_html}</td>
            <td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 6: State & Doctor/Notes -->
          <tr class="h-row">
            <td colspan="3" class="cell-state font-bold">{state} {notes}</td>
            <td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 7: empty row (merged full span double height) -->
          <tr class="h-row-lg">
            <td colspan="7"></td>
          </tr>

          <!-- Row 8: Recipient Mobile -->
          <tr class="h-row">
            <td colspan="3" class="cell-mobile font-bold">MOB NO:- {mobile}</td>
            <td></td><td></td><td></td><td></td>
          </tr>

          <!-- Row 9: empty row (merged full span double height) -->
          <tr class="h-row-lg">
            <td colspan="7"></td>
          </tr>

          <!-- Rows 10, 11, 12: empty spacing rows (7 cols each) -->
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

          <!-- Row 13: FROM, -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="4" class="cell-from font-bold">FROM,</td>
          </tr>

          <!-- Row 14: empty row (7 cols) -->
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

          <!-- Row 15: Sender Name -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="3" class="cell-sender-name font-bold">{sender_name}</td>
            <td></td>
          </tr>

          <!-- Row 16: empty row (7 cols) -->
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

          <!-- Row 17: Sender Address Line 1 -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="4" class="cell-sender-addr font-bold">{sender_addr_1}</td>
          </tr>

          <!-- Row 18: Sender Address Line 2 (City & PIN) -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="4" class="cell-sender-addr font-bold">{sender_addr_2}</td>
          </tr>

          <!-- Row 19: empty row (7 cols) -->
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

          <!-- Row 20: Sender Mobile -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="2" class="cell-sender-mob font-bold">MOB NO.: {sender_mob}</td>
            <td></td><td></td>
          </tr>

          <!-- Row 21: Sender Email -->
          <tr class="h-row">
            <td></td><td></td><td></td>
            <td colspan="2" class="cell-sender-mail font-bold">MAIL: {sender_mail}</td>
            <td></td><td></td>
          </tr>

          <!-- Row 22: empty closing row (all 7 cols with solid bottom border) -->
          <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
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

    if envelopes_per_page == 1:
        for case in cases_data:
            env_html = render_single_envelope_html(case, job_data, sender_data, settings)
            page_content = f"""
            <div class="sheet-page">
              <div class="envelope-half-slot">
                {env_html}
              </div>
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

            cut_line = """
            <div class="cut-guide">
              <span class="cut-icon">✂</span> - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - <span class="cut-icon">✂</span>
            </div>
            """ if bottom_case else ""

            bottom_slot = f"""
            <div class="envelope-half-slot">
              {bottom_html}
            </div>
            """ if bottom_case else ""

            page_content = f"""
            <div class="sheet-page">
              <div class="envelope-half-slot">
                {top_html}
              </div>
              {cut_line}
              {bottom_slot}
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
      page-break-after: always;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      position: relative;
      box-sizing: border-box;
    }}

    .sheet-page:last-child {{
      page-break-after: avoid;
    }}

    .envelope-half-slot {{
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      box-sizing: border-box;
      margin-bottom: 1.5mm;
    }}

    .envelope-half-slot-empty {{
      width: 100%;
      flex: 1;
    }}

    .cut-guide {{
      width: 100%;
      text-align: center;
      font-size: 8pt;
      color: #666666;
      border-top: 1px dashed #888888;
      margin: 2mm 0;
      padding-top: 1mm;
      letter-spacing: 1px;
    }}

    .cut-icon {{
      font-size: 9.5pt;
    }}

    .marg-envelope-wrapper {{
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding: 0;
      box-sizing: border-box;
    }}

    /* The exact MARG Table with gridlines */
    .marg-grid-table {{
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000000;
      box-sizing: border-box;
    }}

    .marg-grid-table td {{
      border: 1px solid #000000;
      padding: 1px 3.5px;
      vertical-align: middle;
      color: #000000;
      box-sizing: border-box;
    }}

    .font-bold {{
      font-weight: 800;
    }}

    /* Exact calibrated row heights matching reference image (22 rows total) */
    .h-row {{
      height: 10.5pt;
      line-height: 10.5pt;
    }}

    .h-row-lg {{
      height: 18pt;
      line-height: 18pt;
    }}

    .h-row-addr {{
      min-height: 18pt;
      line-height: 1.15;
    }}

    /* Typography & Alignments matching reference image */
    .cell-to {{
      font-size: 11.5pt;
      font-weight: 800;
      letter-spacing: 0.3px;
      text-decoration: underline;
    }}

    .cell-case {{
      font-size: 10pt;
      font-weight: 800;
      text-align: right;
      color: #000000;
    }}

    .cell-party {{
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 0.1px;
    }}

    .cell-address {{
      font-size: 8.5pt;
      font-weight: 700;
      line-height: 1.15;
    }}

    .cell-state {{
      font-size: 9pt;
      font-weight: 700;
    }}

    .cell-mobile {{
      font-size: 9.5pt;
      font-weight: 800;
      text-decoration: underline;
    }}

    .cell-from {{
      font-size: 11.5pt;
      font-weight: 800;
    }}

    .cell-sender-name {{
      font-size: 9.5pt;
      font-weight: 800;
      letter-spacing: 0.1px;
    }}

    .cell-sender-addr {{
      font-size: 8pt;
      line-height: 1.15;
      font-weight: 700;
    }}

    .cell-sender-mob {{
      font-size: 9pt;
      font-weight: 800;
      text-decoration: underline;
    }}

    .cell-sender-mail {{
      font-size: 8.5pt;
      font-weight: 700;
    }}

    /* Footer label at bottom of envelope */
    .marg-footer-label {{
      text-align: center;
      font-size: 6pt;
      font-family: Arial, Helvetica, sans-serif;
      color: #444444;
      padding-top: 1.5mm;
      padding-bottom: 0.5mm;
    }}
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
    Strictly NO Barcode, NO Weight.
    """
    html_content = build_full_html_document(job_data, cases_data, sender_data, settings)

    temp_dir = tempfile.mkdtemp()
    html_path = os.path.join(temp_dir, "envelopes.html")
    pdf_path = os.path.join(temp_dir, "envelopes.pdf")

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
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
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

if __name__ == "__main__":
    job = {
        "job_number": "MRG-2026-000001",
        "party_name_snap": "JODHPUR MEDICOSE",
        "party_code_snap": "P0001",
        "party_address_snap": "SHREE MOHANGADH , JAISALMER",
        "party_city_snap": "JAISALMER",
        "party_state_snap": "RAJASTHAN",
        "party_mobile_snap": "+91 8963003012",
        "party_notes_snap": "DR.FIROZ"
    }
    cases = [{"case_number": 1, "case_total": 1, "weight": 0.0, "barcode_value": ""}]
    sender = {
        "business_name": "SHREEJI HEALTHCARE-HEALTHCARE",
        "address": "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305.",
        "mobile": "+91 99245 44283",
        "email": "SHREEJISEVEN@GMAIL.COM"
    }
    settings = {"show_case_number": True}
    pdf = generate_envelopes_pdf(job, cases, sender, settings)
    print(f"Generated MARG Grid PDF bytes: {len(pdf)}")
