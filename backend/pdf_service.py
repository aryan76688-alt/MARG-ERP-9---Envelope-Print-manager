import os
import json
import shutil
import tempfile
import subprocess
from typing import Dict, List, Any, Optional

try:
    import ai_service
except ImportError:
    from backend import ai_service


def translate_case_label_to_gu(label: str) -> str:
    """Translates case breakdown types and labels into Gujarati."""
    if not label:
        return ""
    up = str(label).strip()
    gu_map = [
        ("STANDARD CASE", "સ્ટાન્ડર્ડ કેસ"),
        ("PARCEL BAG", "પાર્સલ બેગ"),
        ("NS CASE", "એન.એસ. કેસ"),
        ("RL CASE", "આર.એલ. કેસ"),
        ("DNS CASE", "ડી.એન.એસ. કેસ"),
        ("METRO CASE", "મેટ્રો કેસ"),
        ("CASE", "કેસ"),
        ("BAG", "બેગ"),
        ("BOX", "બોક્સ")
    ]
    res = up
    for k, v in gu_map:
        if k in res.upper():
            # case insensitive replace
            idx = res.upper().find(k)
            res = res[:idx] + v + res[idx + len(k):]
    return res


def get_case_breakdown_lines(
    job_data: Dict[str, Any],
    case_data: Dict[str, Any],
    settings: Dict[str, Any],
    language: str = "en"
) -> List[str]:
    """
    Extracts non-zero case breakdown items for display on the envelope.
    Items with quantity 0 are strictly excluded.
    Supports multi-volume items (e.g. NS CASE 100ML: 1 and NS CASE 200ML: 1).
    Supports English and Gujarati language output.
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
                
                # User requirement: DON'T TRANSLATE TO-,FROM-,CASES
                if c_vol:
                    lines.append(f"{c_type} {c_vol}: {qty}")
                else:
                    lines.append(f"{c_type}: {qty}")
            elif isinstance(item, str) and item.strip():
                txt = item.strip().upper()
                lines.append(txt)

    if not lines and settings.get("show_case_number", True):
        case_total = case_data.get("case_total", job_data.get("total_cases", 1))
        if case_total and int(case_total) > 0:
            lines.append(f"CASE: {case_total}")

    return lines


def render_single_envelope_html(
    case_data: Dict[str, Any],
    job_data: Dict[str, Any],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en"
) -> str:
    """
    Renders a single envelope half.
    Supports:
      - template_format: "attachment_pdf" (Borderless modern Attachment PDF 123)
                         or "marg_grid_22" (Classic MARG 22-row grid table)
      - language: "en" (English) or "gu" (Gujarati)
    """
    # 1. Determine Party Details based on language
    party_name = (job_data.get("party_name_snap") or job_data.get("party_name") or "").strip()
    address = (job_data.get("party_address_snap") or job_data.get("party_address") or job_data.get("address") or "").strip()
    address_line_2 = (job_data.get("party_address_line_2_snap") or job_data.get("party_address_line_2") or job_data.get("address_line_2") or "").strip()
    address_line_3 = (job_data.get("party_address_line_3_snap") or job_data.get("party_address_line_3") or job_data.get("address_line_3") or "").strip()
    city = (job_data.get("party_city_snap") or job_data.get("party_city") or job_data.get("city") or "").strip()
    state = (job_data.get("party_state_snap") or job_data.get("party_state") or job_data.get("state") or "").strip()
    mobile = (job_data.get("party_mobile_snap") or job_data.get("party_mobile") or job_data.get("mobile_no") or job_data.get("mobile") or "").strip()
    notes = (job_data.get("party_notes_snap") or job_data.get("notes") or "").strip()

    # If Gujarati requested, check for pre-translated fields or call Gemini
    if language == "gu":
        party_name_gu = job_data.get("party_name_gu") or job_data.get("party_name_gu_snap")
        address_gu = job_data.get("address_gu") or job_data.get("address_gu_snap")
        city_gu = job_data.get("city_gu") or job_data.get("city_gu_snap")
        state_gu = job_data.get("state_gu") or job_data.get("state_gu_snap")

        if not party_name_gu and party_name:
            try:
                tr = ai_service.translate_party_to_gujarati(
                    party_name, address, city, state,
                    address_line_2=address_line_2, address_line_3=address_line_3
                )
                party_name = tr.get("party_name_gu", party_name)
                address = tr.get("address_gu", address)
                address_line_2 = tr.get("address_line_2_gu", address_line_2)
                address_line_3 = tr.get("address_line_3_gu", address_line_3)
                city = tr.get("city_gu", city)
                state = tr.get("state_gu", state)
            except Exception as e:
                print("Translation error in PDF render:", e)
        else:
            if party_name_gu: party_name = party_name_gu
            if address_gu: address = address_gu
            if city_gu: city = city_gu
            if state_gu: state = state_gu

    party_name = party_name.upper() if language == "en" else party_name
    address = address.upper() if language == "en" else address
    address_line_2 = address_line_2.upper() if language == "en" else address_line_2
    address_line_3 = address_line_3.upper() if language == "en" else address_line_3
    city = city.upper() if language == "en" else city
    state = state.upper() if language == "en" else state

    # 2. Sender Details
    if language == "gu":
        sender_name = "શ્રીજી હેલ્થકેર"
        sender_addr_1 = "શોપ ૩&૪ જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ,"
        sender_addr_2 = "દહેગામ-૩૮૨૩૦૫."
        to_header = f"TO - {city}" if city else "TO -"
        from_title = "FROM,"
        mob_label = "મો. નં.: "
        mail_label = "ઈમેલ: "
    else:
        sender_name = (sender_data.get("business_name") or "SHREEJI HEALTHCARE-HEALTHCARE").strip().upper()
        sender_addr = (sender_data.get("address") or "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305").strip().upper()
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
        from_title = "FROM,"
        mob_label = "MOB NO.: "
        mail_label = "MAIL: "

    sender_mob = (sender_data.get("mobile") or "+91 99245 44283").strip()
    sender_mail = (sender_data.get("email") or "SHREEJISEVEN@GMAIL.COM").strip()

    # Address lines HTML
    addr_lines = [f"<div>{address}</div>"]
    if address_line_2:
        addr_lines.append(f"<div>{address_line_2}</div>")
    if address_line_3:
        addr_lines.append(f"<div>{address_line_3}</div>")
    address_html = "".join(addr_lines)

    state_line = state

    # Dynamic Case Breakdown lines
    case_lines = get_case_breakdown_lines(job_data, case_data, settings, language=language)

    # 3. Format Branching
    if template_format == "marg_grid_22":
        # Classic 22-row MARG ERP grid table layout (Previous Function restored)
        case_badge = case_lines[0] if case_lines else ("CASE: 1" if language == "en" else "કેસ: 1")
        extra_cases_html = "".join([f'<div style="font-size: 8.5pt; font-weight: 800; margin-top: 1px;">{c}</div>' for c in case_lines[1:]])
        sender_addr_2_row = f"""
        <tr class="h-row">
          <td></td><td></td><td></td>
          <td colspan="4" class="cell-sender-addr font-bold">{sender_addr_2}</td>
        </tr>
        """ if sender_addr_2 else '<tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'

        return f"""
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
              <!-- Row 1: TO - CITY & Case Number in Highlight Box -->
              <tr class="h-row">
                <td class="cell-to font-bold" colspan="3">{to_header}</td>
                <td></td>
                <td></td>
                <td></td>
                <td class="cell-case font-bold">
                  <div class="case-highlight-box">{case_badge}</div>
                  {extra_cases_html}
                </td>
              </tr>

              <!-- Row 2: empty row -->
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

              <!-- Row 3: Party Name (Printed ONCE only) -->
              <tr class="h-row-lg">
                <td colspan="3" class="cell-party font-bold">{party_name}</td>
                <td></td><td></td><td></td><td></td>
              </tr>

              <!-- Row 4: Multi-line Address (Lines 1, 2, 3) -->
              <tr class="h-row-addr">
                <td colspan="3" class="cell-address font-bold">{address_html}</td>
                <td></td><td></td><td></td><td></td>
              </tr>

              <!-- Row 5: State (City / State, no dr.name) -->
              <tr class="h-row">
                <td colspan="3" class="cell-state font-bold">{state_line}</td>
                <td></td><td></td><td></td><td></td>
              </tr>

              <!-- Row 6: Recipient Mobile -->
              <tr class="h-row">
                <td colspan="3" class="cell-mobile font-bold">{mob_label}{mobile}</td>
                <td></td><td></td><td></td><td></td>
              </tr>

              <!-- Rows 7-10: Spacers to maintain exact 22-row grid alignment -->
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

              <!-- Rows 11-18: Sender Details -->
              <tr class="h-row">
                <td></td><td></td><td></td>
                <td colspan="4" class="cell-from font-bold">{from_title}</td>
              </tr>
              <tr class="h-row-lg">
                <td></td><td></td><td></td>
                <td colspan="4" class="cell-sender-title font-bold">{sender_name}</td>
              </tr>
              <tr class="h-row">
                <td></td><td></td><td></td>
                <td colspan="4" class="cell-sender-addr font-bold">{sender_addr_1}</td>
              </tr>
              {sender_addr_2_row}
              <tr class="h-row">
                <td></td><td></td><td></td>
                <td colspan="4" class="cell-sender-mob font-bold">{mob_label}{sender_mob}</td>
              </tr>
              <tr class="h-row">
                <td></td><td></td><td></td>
                <td colspan="4" class="cell-sender-mail font-bold">{mail_label}{sender_mail}</td>
              </tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>

              <!-- Rows 19-22: bottom empty rows -->
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              <tr class="h-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            </tbody>
          </table>
        </div>
        """
    else:
        # Default: Attachment PDF 123 (Clean borderless format with large bold fonts)
        case_items_html = "".join([f'<div class="case-item">{line}</div>' for line in case_lines])
        sender_addr_2_html = f'<div class="sender-addr">{sender_addr_2}</div>' if sender_addr_2 else ""
        return f"""
        <div class="envelope-half">
          <div class="left-col">
            <div class="to-title">{to_header}</div>
            <div class="party-name">{party_name}</div>
            <div class="address-lines">
              {address_html}
            </div>
            {f'<div class="state-line">{state_line}</div>' if state_line else ''}
            {f'<div class="mobile-no">{mob_label}{mobile}</div>' if mobile else ''}
          </div>
          <div class="right-col">
            <div class="case-block">
              {case_items_html}
            </div>
            <div class="sender-block">
              <div class="from-title">{from_title}</div>
              <div class="sender-name">{sender_name}</div>
              <div class="sender-addr">{sender_addr_1}</div>
              {sender_addr_2_html}
              <div class="sender-mob">{mob_label}{sender_mob}</div>
              <div class="sender-mail">{mail_label}{sender_mail}</div>
            </div>
          </div>
        </div>
        """


def build_full_html_document(
    job_data: Dict[str, Any],
    cases_data: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en"
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
            env_html = render_single_envelope_html(case, job_data, sender_data, settings, template_format=template_format, language=language)
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

            top_html = render_single_envelope_html(top_case, job_data, sender_data, settings, template_format=template_format, language=language)
            bottom_html = render_single_envelope_html(bottom_case, job_data, sender_data, settings, template_format=template_format, language=language) if bottom_case else ""

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
      font-family: 'Noto Sans Gujarati', 'Lohit Gujarati', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
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

    /* Modern Borderless Attachment PDF Format */
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

    .to-title {{
      font-size: 18pt;
      font-weight: 900;
      text-decoration: underline;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 0.3px;
    }}

    .party-name {{
      font-size: 17pt;
      font-weight: 900;
      line-height: 1.25;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }}

    .address-lines {{
      font-size: 14pt;
      font-weight: 800;
      line-height: 1.3;
      margin-top: 6px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }}

    .state-notes, .state-line {{
      font-size: 14pt;
      font-weight: 800;
      line-height: 1.3;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}

    .mobile-no {{
      font-size: 15.5pt;
      font-weight: 900;
      text-decoration: underline;
      letter-spacing: 0.2px;
    }}

    .case-block {{
      text-align: right;
      padding-top: 2px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }}

    .case-item {{
      font-size: 22pt;
      font-weight: 900;
      line-height: 1.25;
      letter-spacing: 0.3px;
      color: #000000;
      border: 2.5px solid #000000;
      border-radius: 5px;
      padding: 3px 12px;
      margin-bottom: 5px;
      background: #ffffff;
      display: inline-block;
    }}

    .sender-block {{
      text-align: left;
      margin-top: auto;
      padding-left: 10px;
    }}

    .from-title {{
      font-size: 14pt;
      font-weight: 900;
      margin-bottom: 3px;
    }}

    .sender-name {{
      font-size: 13.5pt;
      font-weight: 900;
      line-height: 1.25;
      margin-bottom: 2px;
    }}

    .sender-addr {{
      font-size: 11.5pt;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 3px;
    }}

    .sender-mob {{
      font-size: 12.5pt;
      font-weight: 900;
      text-decoration: underline;
      margin-bottom: 2px;
    }}

    .sender-mail {{
      font-size: 11pt;
      font-weight: 800;
    }}

    /* Classic MARG 22-Row Grid Table Format */
    .marg-envelope-wrapper {{
      width: 100%;
      height: 132mm;
      padding: 1mm 2mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }}

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

    .h-row {{
      height: 11pt;
      line-height: 11pt;
    }}

    .h-row-lg {{
      height: 18pt;
      line-height: 18pt;
    }}

    .h-row-addr {{
      min-height: 18pt;
      line-height: 1.15;
    }}

    .cell-to {{
      font-size: 13.5pt;
      font-weight: 900;
      letter-spacing: 0.3px;
      text-decoration: underline;
    }}

    .cell-case {{
      font-size: 12pt;
      font-weight: 900;
      text-align: right;
      color: #000000;
    }}

    .case-highlight-box {{
      font-size: 16pt;
      font-weight: 900;
      border: 2px solid #000000;
      border-radius: 4px;
      padding: 2px 8px;
      display: inline-block;
      background: #ffffff;
      color: #000000;
    }}

    .cell-party {{
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}

    .cell-address {{
      font-size: 11pt;
      font-weight: 800;
      line-height: 1.15;
    }}

    .cell-state {{
      font-size: 10.5pt;
      font-weight: 800;
      letter-spacing: 0.2px;
    }}

    .cell-mobile {{
      font-size: 12pt;
      font-weight: 900;
      letter-spacing: 0.2px;
      text-decoration: underline;
    }}

    .cell-from {{
      font-size: 11.5pt;
      font-weight: 900;
      letter-spacing: 0.2px;
    }}

    .cell-sender-title {{
      font-size: 12pt;
      font-weight: 900;
      letter-spacing: 0.2px;
    }}

    .cell-sender-addr {{
      font-size: 10pt;
      font-weight: 800;
      line-height: 1.15;
    }}

    .cell-sender-mob {{
      font-size: 10.5pt;
      font-weight: 900;
      text-decoration: underline;
    }}

    .cell-sender-mail {{
      font-size: 8.5pt;
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
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en"
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

        top_html = render_single_envelope_html(
            top_item.get("case", {}), top_item.get("job", {}), sender_data, settings,
            template_format=template_format, language=language
        )
        bottom_html = render_single_envelope_html(
            bottom_item.get("case", {}), bottom_item.get("job", {}), sender_data, settings,
            template_format=template_format, language=language
        ) if bottom_item else ""

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
      font-family: 'Noto Sans Gujarati', 'Lohit Gujarati', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
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
    
    /* Modern Borderless Attachment PDF Format */
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

    /* Classic MARG 22-Row Grid Table Format */
    .marg-envelope-wrapper {{
      width: 100%;
      height: 132mm;
      padding: 1mm 2mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }}
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
    .font-bold {{ font-weight: 800; }}
    .h-row {{ height: 10.5pt; line-height: 10.5pt; }}
    .h-row-lg {{ height: 18pt; line-height: 18pt; }}
    .h-row-addr {{ min-height: 18pt; line-height: 1.15; }}
    .cell-to {{ font-size: 11.5pt; font-weight: 800; letter-spacing: 0.3px; text-decoration: underline; }}
    .cell-case {{ font-size: 10pt; font-weight: 800; text-align: right; color: #000000; }}
    .cell-party {{ font-size: 11pt; font-weight: 800; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .cell-address {{ font-size: 9.5pt; font-weight: 700; line-height: 1.15; }}
    .cell-state {{ font-size: 9pt; font-weight: 700; letter-spacing: 0.2px; }}
    .cell-mobile {{ font-size: 10pt; font-weight: 800; letter-spacing: 0.2px; text-decoration: underline; }}
    .cell-from {{ font-size: 10pt; font-weight: 800; letter-spacing: 0.2px; }}
    .cell-sender-title {{ font-size: 10.5pt; font-weight: 800; letter-spacing: 0.2px; }}
    .cell-sender-addr {{ font-size: 8.5pt; font-weight: 700; line-height: 1.15; }}
    .cell-sender-mob {{ font-size: 9pt; font-weight: 800; text-decoration: underline; }}
    .cell-sender-mail {{ font-size: 8.5pt; font-weight: 700; }}
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
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en",
    auto_print: bool = False
) -> bytes:
    """
    Generates a high-quality vector PDF of envelopes matching the user's MARG Courier Envelope layout.
    Supports both Attachment PDF and Classic 22-Row Grid templates, in English or Gujarati.
    """
    if not cases_data:
        cases_data = [{
            "case_number": 1,
            "case_total": job_data.get("total_cases", 1) or 1,
            "weight": 1.0,
            "barcode_value": f"{job_data.get('job_number', 'JOB')}-C1"
        }]

    html_content = build_full_html_document(
        job_data, cases_data, sender_data, settings,
        template_format=template_format, language=language
    )
    return compile_html_to_pdf(html_content, auto_print=auto_print)


def generate_bulk_envelopes_pdf(
    jobs_cases_list: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en",
    auto_print: bool = False
) -> bytes:
    """
    Generates a combined PDF with all selected parties printed together (2 envelopes per A4 sheet).
    Supports both Attachment PDF and Classic 22-Row Grid templates, in English or Gujarati.
    """
    html_content = build_bulk_html_document(
        jobs_cases_list, sender_data, settings,
        template_format=template_format, language=language
    )
    return compile_html_to_pdf(html_content, auto_print=auto_print)


def add_autoprint_js_to_pdf(pdf_bytes: bytes) -> bytes:
    """Injects Acrobat / browser PDF JavaScript to automatically open the print dialog."""
    try:
        import io
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        writer.append(reader)
        writer.add_js("this.print({bUI: true, bSilent: false, bShrinkToFit: true});")
        out_stream = io.BytesIO()
        writer.write(out_stream)
        return out_stream.getvalue()
    except Exception as e:
        print("Could not add auto-print JS:", e)
        return pdf_bytes


def compile_html_to_pdf(html_content: str, auto_print: bool = False) -> bytes:
    temp_dir = tempfile.mkdtemp()
    html_path = os.path.join(temp_dir, "document.html")
    pdf_path = os.path.join(temp_dir, "document.pdf")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    raw_pdf = None

    # Check for Chromium binary first before attempting subprocess execution
    chrome_bin = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if chrome_bin:
        try:
            cmd = [
                chrome_bin,
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
                    raw_pdf = pf.read()
        except Exception as e:
            print("Chromium PDF error:", e)

    # Use WeasyPrint if Chromium is not available or failed
    if not raw_pdf:
        try:
            import weasyprint
            raw_pdf = weasyprint.HTML(string=html_content).write_pdf()
        except Exception as we:
            raise RuntimeError(f"Could not generate PDF: {we}")
        finally:
            try:
                if os.path.exists(html_path): os.remove(html_path)
                if os.path.exists(pdf_path): os.remove(pdf_path)
                os.rmdir(temp_dir)
            except Exception:
                pass
    else:
        try:
            if os.path.exists(html_path): os.remove(html_path)
            if os.path.exists(pdf_path): os.remove(pdf_path)
            os.rmdir(temp_dir)
        except Exception:
            pass

    if auto_print and raw_pdf:
        return add_autoprint_js_to_pdf(raw_pdf)
    return raw_pdf


def generate_dispatch_summary_pdf(
    date_str: str,
    delivery_boy: str,
    route: str,
    dispatches: List[Dict[str, Any]],
    sender_data: Dict[str, Any],
    auto_print: bool = False,
    language: str = "en"
) -> bytes:
    """
    Generates a driver dispatch run sheet / summary manifest PDF.
    Contains: Header, Route, Driver Name, Dispatches table, Totals, and Signatures.
    Supports English ('en') and Gujarati ('gu') languages.
    """
    is_gu = (language == "gu")
    business_name = (sender_data.get("business_name") or "SHREEJI HEALTHCARE").strip()

    if is_gu:
        company_name_display = "શ્રીજી હેલ્થકેર" if ("SHREEJI" in business_name.upper() or not business_name) else ai_service.fast_translate_phrase(business_name)
        company_sub_display = "શોપ ૩&૪ જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ, દહેગામ-૩૮૨૩૦૫ • ફોન: +૯૧ ૯૯૨૪૫ ૪૪૨૮૩"
        sheet_title_main = "ડ્રાઈવર ડિસ્પેચ રન શીટ"
        sheet_title_sub = "ડિસ્પેચ સારાંશ (DISPATCH SUMMARY MANIFEST)"

        lbl_date = "તારીખ (DATE)"
        lbl_driver = "ડ્રાઈવરનું નામ (DRIVER NAME)"
        lbl_route = "રૂટ (ROUTE)"
        lbl_stops = "કુલ સ્ટોપ (TOTAL STOPS)"

        driver_display = delivery_boy.strip() if delivery_boy else "બધા ડ્રાઈવર (ALL DRIVERS)"
        route_display = route.strip() if route else "બધા રૂટ (ALL ROUTES)"

        th_sr = "ક્રમ (SR)"
        th_party = "પાર્ટીનું નામ (PARTY NAME)"
        th_city = "મુકામ / શહેર (DESTINATION)"
        th_mobile = "મોબાઈલ નં. (MOBILE NO.)"
        th_breakdown = "કેસ અને વિગત (CASES & BREAKDOWN)"
        th_pkgs = "પાર્સલ (PKGS)"
        th_sign = "ગ્રાહક સહી (RECEIVER SIGN)"

        kpi_parties_label = "કુલ પાર્ટી (Parties)"
        kpi_pkgs_label = "કુલ પાર્સલ (Packages)"
        kpi_standard_label = "સ્ટાન્ડર્ડ કેસ"
        kpi_fluid_label = "IV ફ્લુઈડ કેસ"
        kpi_bag_label = "પાર્સલ બેગ"

        breakdown_box_header = "કેસ વાઇઝ વિગતવાર ગણતરી (CASE BREAKDOWN COUNT):"

        sign_driver = "ડ્રાઈવરની સહી (Driver Signature)"
        sign_manager = "ડિસ્પેચ મેનેજર સહી (Dispatch Manager)"
        sign_security = "સિક્યોરિટી ગેટ પાસ સહી (Gate Pass)"
    else:
        company_name_display = business_name.upper()
        sender_addr = (sender_data.get("address") or "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305").strip().upper()
        sender_mob = (sender_data.get("mobile") or "+91 99245 44283").strip()
        company_sub_display = f"{sender_addr} • Phone: {sender_mob}"
        sheet_title_main = "DRIVER DISPATCH RUN SHEET"
        sheet_title_sub = "DISPATCH SUMMARY MANIFEST"

        lbl_date = "DATE"
        lbl_driver = "DRIVER NAME"
        lbl_route = "ROUTE"
        lbl_stops = "TOTAL STOPS"

        driver_display = delivery_boy.strip().upper() if delivery_boy else "ALL DRIVERS"
        route_display = route.strip().upper() if route else "ALL ROUTES"

        th_sr = "SR"
        th_party = "PARTY NAME"
        th_city = "DESTINATION"
        th_mobile = "MOBILE NO."
        th_breakdown = "CASES & BREAKDOWN"
        th_pkgs = "PKGS"
        th_sign = "RECEIVER SIGN"

        kpi_parties_label = "Total Parties"
        kpi_pkgs_label = "Total Packages"
        kpi_standard_label = "Standard Cases"
        kpi_fluid_label = "IV Fluid Cases"
        kpi_bag_label = "Parcel Bags"

        breakdown_box_header = "FULL CASE BREAKDOWN COUNT (NS CASE, RL CASE, DNS, METRO, BAGS):"

        sign_driver = "Driver Signature"
        sign_manager = "Dispatch Manager Signature"
        sign_security = "Security / Gate Pass Sign"

    total_parties = len(dispatches)
    total_pkgs = 0
    total_standard_cases = 0
    total_bags = 0
    total_fluid_cases = 0
    full_breakdown_counts: Dict[str, int] = {}

    rows_html = []
    for idx, d in enumerate(dispatches, start=1):
        party_name_en = (d.get("party_name") or "").strip().upper()
        party_name_gu = (d.get("party_name_gu") or "").strip()
        if not party_name_gu and party_name_en:
            party_name_gu = ai_service.fast_translate_phrase(party_name_en)

        city_en = (d.get("city") or "").strip().upper()
        city_gu = (d.get("city_gu") or "").strip()
        if not city_gu and city_en:
            city_gu = ai_service.fast_translate_phrase(city_en)

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
                    item_label = f"{b_type} {b_vol}".strip() if b_vol else b_type
                    full_breakdown_counts[item_label] = full_breakdown_counts.get(item_label, 0) + qty

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
                    txt = b.strip().upper()
                    breakdown_text_parts.append(txt)
                    full_breakdown_counts[txt] = full_breakdown_counts.get(txt, 0) + 1
        else:
            breakdown_text_parts.append(f"CASE: {pkg_count}")
            total_standard_cases += pkg_count
            full_breakdown_counts["CASE"] = full_breakdown_counts.get("CASE", 0) + pkg_count

        if is_gu:
            translated_parts = [translate_case_label_to_gu(p) for p in breakdown_text_parts]
            breakdown_str = ", ".join(translated_parts) if translated_parts else f"કેસ: {pkg_count}"
            party_cell_html = f"""
            <div style="font-weight: 800; font-size: 10pt; color: #000000; line-height: 1.2;">{party_name_gu}</div>
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-top: 1px;">{party_name_en}</div>
            """
            city_cell_html = f"""
            <div style="font-weight: 800; font-size: 9.5pt; color: #0f172a;">{city_gu}</div>
            {f'<div style="font-size: 7pt; font-weight: 600; color: #64748b;">{city_en}</div>' if city_gu != city_en else ''}
            """
        else:
            breakdown_str = ", ".join(breakdown_text_parts) if breakdown_text_parts else f"CASE: {pkg_count}"
            party_cell_html = f'<div style="font-weight: 800; font-size: 10pt;">{party_name_en}</div>'
            city_cell_html = f'<div style="font-weight: 700;">{city_en}</div>'

        rows_html.append(f"""
        <tr>
          <td style="text-align: center; font-weight: bold;">{idx}</td>
          <td>{party_cell_html}</td>
          <td>{city_cell_html}</td>
          <td style="font-family: monospace; font-size: 9pt;">{mobile}</td>
          <td style="font-size: 9pt; font-weight: 700; color: #1e3a8a;">{breakdown_str}</td>
          <td style="text-align: center; font-weight: 800; font-size: 11pt;">{pkg_count}</td>
          <td style="border: 1px dashed #999; height: 28px;"></td>
        </tr>
        """)

    breakdown_total_label = f"કુલ: {total_pkgs} પાર્સલ" if is_gu else f"TOTAL: {total_pkgs} PKGS"

    breakdown_badges_html = "".join([
        f"""
        <div style="background: #ffffff; border: 1.5px solid #1e3a8a; border-radius: 6px; padding: 4px 6px; text-align: center;">
          <div style="font-size: 7.5pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase;">
            {translate_case_label_to_gu(k) if is_gu else k}
          </div>
          <div style="font-size: 13pt; font-weight: 900; color: #000000; margin-top: 1px;">{v}</div>
        </div>
        """
        for k, v in sorted(full_breakdown_counts.items())
    ]) if full_breakdown_counts else '<div style="font-size: 9pt; color: #64748b;">No items</div>'

    detailed_breakdown_box = f"""
    <div style="margin-top: 10px; border: 1.5px solid #000000; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
      <div style="font-size: 9pt; font-weight: 900; color: #0f172a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; display: flex; justify-content: space-between;">
        <span>{breakdown_box_header}</span>
        <span style="color: #1e3a8a;">{breakdown_total_label}</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px;">
        {breakdown_badges_html}
      </div>
    </div>
    """

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{sheet_title_main} - {date_str}</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 10mm 10mm 10mm 10mm;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Noto Sans Gujarati', 'Lohit Gujarati', 'Shruti', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif;
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
      font-size: 9.5pt;
      font-weight: 700;
      margin-bottom: 12px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }}
    th {{
      background: #1e293b;
      color: #ffffff;
      padding: 6px 8px;
      text-align: left;
      font-size: 8.5pt;
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
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      border: 1.5px solid #000000;
      border-radius: 6px;
      padding: 8px 14px;
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
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      padding: 0 10px;
    }}
    .sign-col {{
      text-align: center;
      width: 30%;
      border-top: 1.5px solid #000000;
      padding-top: 6px;
      font-size: 8.5pt;
      font-weight: 800;
    }}
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <div class="company-title">{company_name_display}</div>
      <div class="company-sub">{company_sub_display}</div>
    </div>
    <div class="sheet-title">
      <h2>{sheet_title_main}</h2>
      <div style="font-size: 8.5pt; font-weight: 700; color: #475569;">{sheet_title_sub}</div>
    </div>
  </div>

  <div class="meta-bar">
    <div>{lbl_date}: <span style="color: #0284c7;">{date_str}</span></div>
    <div>{lbl_driver}: <span style="color: #0284c7;">{driver_display}</span></div>
    <div>{lbl_route}: <span style="color: #0284c7;">{route_display}</span></div>
    <div>{lbl_stops}: <span style="color: #0284c7;">{total_parties}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">{th_sr}</th>
        <th style="width: 31%;">{th_party}</th>
        <th style="width: 14%;">{th_city}</th>
        <th style="width: 14%;">{th_mobile}</th>
        <th style="width: 18%;">{th_breakdown}</th>
        <th style="width: 6%; text-align: center;">{th_pkgs}</th>
        <th style="width: 12%; text-align: center;">{th_sign}</th>
      </tr>
    </thead>
    <tbody>
      {"".join(rows_html)}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="kpi-item">
      <div class="kpi-num">{total_parties}</div>
      <div class="kpi-label">{kpi_parties_label}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_pkgs}</div>
      <div class="kpi-label">{kpi_pkgs_label}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_standard_cases}</div>
      <div class="kpi-label">{kpi_standard_label}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_fluid_cases}</div>
      <div class="kpi-label">{kpi_fluid_label}</div>
    </div>
    <div class="kpi-item">
      <div class="kpi-num">{total_bags}</div>
      <div class="kpi-label">{kpi_bag_label}</div>
    </div>
  </div>

  {detailed_breakdown_box}

  <div class="signatures">
    <div class="sign-col">{sign_driver}</div>
    <div class="sign-col">{sign_manager}</div>
    <div class="sign-col">{sign_security}</div>
  </div>
</body>
</html>
"""
    return compile_html_to_pdf(html, auto_print=auto_print)
