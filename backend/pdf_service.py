import os
import re
import io
import json
import zlib
import shutil
import tempfile
import subprocess
from typing import Dict, List, Any, Optional

try:
    import ai_service
except ImportError:
    from backend import ai_service


def translate_case_label_to_gu(label: str) -> str:
    """Translates case labels into Gujarati, keeping fluid cases and case codes strictly in English per user requirement."""
    if not label:
        return ""
    res = str(label).strip()
    
    # User requirement: DO NOT translate fluid case breakdown like "NS 100ML CASE: 1", "DNS 100ML CASE: 1", "CASE: 1"
    if re.search(r'\b(NS|DNS|RL|METRO)\b', res, re.IGNORECASE) or re.search(r'\bCASE\b', res, re.IGNORECASE):
        return res

    # General parcel / bag translation
    res = re.sub(r'\bSTANDARD CASE\b', 'સ્ટાન્ડર્ડ કેસ', res, flags=re.IGNORECASE)
    res = re.sub(r'\bPARCEL BAG\b', 'પાર્સલ બેગ', res, flags=re.IGNORECASE)
    res = re.sub(r'\bBAG\b', 'બેગ', res, flags=re.IGNORECASE)
    res = re.sub(r'\bBOX\b', 'બોક્સ', res, flags=re.IGNORECASE)
    return res


def format_case_breakdown_line(c_type: str, c_vol: str = "", qty: int = 1) -> str:
    """
    Formats case breakdown items onto a single clean line per user requirements:
      - "NS CASE" + "100ML" -> "NS 100ML CASE: 1"
      - "DNS CASE" + "100ML" -> "DNS 100ML CASE: 1"
      - "RL CASE" + "500ML" -> "RL 500ML CASE: 2"
      - "METRO CASE" + "100ML" -> "METRO 100ML CASE: 1"
      - "CASE" -> "CASE: 1"
      - "PARCEL BAG" -> "PARCEL BAG: 1"
      - "10ML SYRINGE ATPL*50 1PCS" + "PCS" -> "10ML SYRINGE ATPL*50 1PCS CASE: 1"
      - "PARACETAMOL 500MG" + "PSC (PIECES)" -> "PARACETAMOL 500MG (PCS) CASE: 1"
    """
    clean_type = str(c_type or "").strip()
    clean_vol = str(c_vol or "").strip()
    
    # Check if string is already formatted like "NS CASE 100ML: 1", "NS 100 CASE: 1" or "NS 100ML CASE: 1"
    m = re.match(r"^(NS|DNS|RL|METRO)\s*(?:CASE)?\s*(\d+)\s*(ML|LTR)?\s*(?:CASE)?:\s*(\d+)$", clean_type, re.IGNORECASE)
    if m:
        unit = m.group(3).upper() if m.group(3) else "ML"
        return f"{m.group(1).upper()} {m.group(2)}{unit} CASE: {m.group(4)}"

    upper_type = clean_type.upper()
    upper_vol = clean_vol.upper()

    # Normalization of volume
    if upper_vol.isdigit():
        vol_display = f"{upper_vol}ML"
    elif re.match(r"^(PSC|PCS)(\s*\(PIECES\))?$", upper_vol, re.I):
        vol_display = "PCS"
    else:
        vol_display = upper_vol

    # Standard fluids: NS, DNS, RL, METRO
    type_base = re.sub(r"\s+CASE$", "", upper_type, flags=re.I).strip()
    if type_base in ("NS", "DNS", "RL", "METRO"):
        if vol_display:
            return f"{type_base} {vol_display} CASE: {qty}"
        return f"{type_base} CASE: {qty}"

    if upper_type == "CASE":
        if vol_display:
            return f"CASE ({vol_display}): {qty}"
        return f"CASE: {qty}"

    if upper_type in ("PARCEL BAG", "BOX", "CARTON", "BAG"):
        return f"{clean_type}: {qty}"

    # Specific item cases (e.g. "10ML SYRINGE ATPL*50 1PCS" or "PARACETAMOL 500MG")
    base_item = re.sub(r"\s+CASE$", "", clean_type, flags=re.I).strip()
    if vol_display and vol_display not in base_item.upper():
        return f"{base_item} ({vol_display}) CASE: {qty}"
    return f"{base_item} CASE: {qty}"


def get_case_breakdown_lines(
    job_data: Dict[str, Any],
    case_data: Dict[str, Any],
    settings: Dict[str, Any],
    language: str = "en"
) -> List[str]:
    """
    Extracts non-zero case breakdown items for display on the envelope.
    Items with quantity 0 are strictly excluded.
    Supports single-line fluid format (e.g. NS 100 CASE: 1 and DNS 100 CASE: 1).
    Strictly preserves standard 0-9 digits and uppercase case labels.
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
                line = format_case_breakdown_line(c_type, c_vol, qty)
                lines.append(line)
            elif isinstance(item, str) and item.strip():
                txt = item.strip().upper()
                lines.append(format_case_breakdown_line(txt))

    if not lines and settings.get("show_case_number", True):
        case_total = case_data.get("case_total")
        if case_total is None:
            case_total = job_data.get("total_cases")
        # Only append CASE line if case_total > 0 (0 means address only, no case)
        if case_total is not None and int(case_total) > 0:
            lines.append(f"CASE: {case_total}")

    return lines



def extract_envelope_metadata(
    case_data: Dict[str, Any],
    job_data: Dict[str, Any],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en"
) -> Dict[str, Any]:
    """
    Extracts and normalizes all envelope metadata into a structured dictionary.
    Supports English ('en') and Gujarati ('gu') with zero question marks.
    """
    party_name = (job_data.get("party_name_snap") or job_data.get("party_name") or "").strip()
    address = (job_data.get("party_address_snap") or job_data.get("party_address") or job_data.get("address") or "").strip()
    address_line_2 = (job_data.get("party_address_line_2_snap") or job_data.get("party_address_line_2") or job_data.get("address_line_2") or "").strip()
    address_line_3 = (job_data.get("party_address_line_3_snap") or job_data.get("party_address_line_3") or job_data.get("address_line_3") or "").strip()
    city = (job_data.get("party_city_snap") or job_data.get("party_city") or job_data.get("city") or "").strip()
    state = (job_data.get("party_state_snap") or job_data.get("party_state") or job_data.get("state") or "").strip()
    mobile = (job_data.get("party_mobile_snap") or job_data.get("party_mobile") or job_data.get("mobile_no") or job_data.get("mobile") or "").strip()
    notes = (job_data.get("party_notes_snap") or job_data.get("notes") or "").strip()

    if language == "gu":
        party_name_gu = job_data.get("party_name_gu") or job_data.get("party_name_gu_snap")
        address_gu = job_data.get("address_gu") or job_data.get("address_gu_snap")
        address_line_2_gu = job_data.get("address_line_2_gu") or job_data.get("address_line_2_gu_snap") or job_data.get("party_address_line_2_gu_snap")
        address_line_3_gu = job_data.get("address_line_3_gu") or job_data.get("address_line_3_gu_snap") or job_data.get("party_address_line_3_gu_snap")
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
                print("Translation error in PDF metadata extract:", e)
        else:
            if party_name_gu: party_name = party_name_gu
            if address_gu: address = address_gu
            if address_line_2_gu: address_line_2 = address_line_2_gu
            if address_line_3_gu: address_line_3 = address_line_3_gu
            if city_gu: city = city_gu
            if state_gu: state = state_gu

    # Normalize digits: keep 0-9
    guj_to_eng = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")
    party_name = party_name.translate(guj_to_eng) if party_name else ""
    address = address.translate(guj_to_eng) if address else ""
    address_line_2 = address_line_2.translate(guj_to_eng) if address_line_2 else ""
    address_line_3 = address_line_3.translate(guj_to_eng) if address_line_3 else ""
    city = city.translate(guj_to_eng) if city else ""
    state = state.translate(guj_to_eng) if state else ""

    party_name = party_name.upper() if language == "en" else party_name
    address = address.upper() if language == "en" else address
    address_line_2 = address_line_2.upper() if language == "en" else address_line_2
    address_line_3 = address_line_3.upper() if language == "en" else address_line_3
    city = city.upper() if language == "en" else city
    state = state.upper() if language == "en" else state

    if language == "gu":
        sender_name = "શ્રીજી હેલ્થકેર"
        sender_addr_1 = "શોપ 3&4 જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ,"
        sender_addr_2 = "દહેગામ-382305."
        to_header = f"TO - {city}" if city else "TO -"
        from_title = "FROM,"
        mob_label = "મો. નં.: "
        mail_label = "ઈમેલ: "
    else:
        raw_bname = (sender_data.get("business_name") or "SHREEJI HEALTHCARE").strip()
        clean_bname = re.sub(r'[\-_]HEALTHCARE', '', raw_bname, flags=re.I).strip()
        if clean_bname.upper().endswith("HEALTHCARE"):
            sender_name = clean_bname.upper()
        else:
            sender_name = f"{clean_bname} HEALTHCARE".strip().upper()

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
    state_line = state

    case_lines = get_case_breakdown_lines(job_data, case_data, settings, language=language)

    case_num = int(case_data.get("case_number") or 1)
    is_first_case = (case_num == 1)
    bill_inside_enabled = bool(job_data.get("bill_inside") or case_data.get("bill_inside") or settings.get("bill_inside"))
    bill_inside = is_first_case and bill_inside_enabled
    bill_inside_text = "📄 બિલ અંદર છે / BILL INSIDE" if language == "gu" else "📄 BILL INSIDE / બિલ અંદર છે"

    addr_list = [l for l in [address, address_line_2, address_line_3] if l and l.strip()]

    return {
        "template_format": template_format,
        "language": language,
        "party_name": party_name,
        "to_header": to_header,
        "address": address,
        "address_line_2": address_line_2,
        "address_line_3": address_line_3,
        "address_lines": addr_list,
        "city": city,
        "state": state,
        "state_line": state_line,
        "mobile": mobile,
        "mob_label": mob_label,
        "case_lines": case_lines,
        "bill_inside": bill_inside,
        "bill_inside_text": bill_inside_text,
        "from_title": from_title,
        "sender_name": sender_name,
        "sender_addr_1": sender_addr_1,
        "sender_addr_2": sender_addr_2,
        "sender_mob": sender_mob,
        "sender_mail": sender_mail,
        "mail_label": mail_label,
        "notes": notes
    }


def render_single_envelope_html_from_meta(meta: Dict[str, Any]) -> str:
    """Renders single envelope half HTML from normalized metadata."""
    t_format = meta.get("template_format", "attachment_pdf")
    party_name = meta.get("party_name", "")
    to_header = meta.get("to_header", "TO -")
    address_lines = meta.get("address_lines", [])
    state_line = meta.get("state_line", "")
    mobile = meta.get("mobile", "")
    mob_label = meta.get("mob_label", "MOB NO.: ")
    case_lines = meta.get("case_lines", [])
    bill_inside = meta.get("bill_inside", False)
    bill_inside_text = meta.get("bill_inside_text", "")
    from_title = meta.get("from_title", "FROM,")
    sender_name = meta.get("sender_name", "")
    sender_addr_1 = meta.get("sender_addr_1", "")
    sender_addr_2 = meta.get("sender_addr_2", "")
    sender_mob = meta.get("sender_mob", "")
    sender_mail = meta.get("sender_mail", "")
    mail_label = meta.get("mail_label", "MAIL: ")

    address_html = "".join([f"<div>{l}</div>" for l in address_lines])

    bill_stamp_html = f'<div class="bill-inside-stamp" style="display: inline-block; border: 2.2px solid #000; padding: 2.5px 8px; font-size: 13px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 4px 0 6px 0; border-radius: 4px; background: #fff; text-align: center;">{bill_inside_text}</div>' if bill_inside else ""
    bill_grid_stamp = f'<div style="font-weight: 900; border: 1.8px solid #000; padding: 2px 4px; margin-top: 4px; font-size: 10.5px; text-align: center; background: #fff;">{bill_inside_text}</div>' if bill_inside else ""

    if t_format == "marg_grid_22":
        if case_lines:
            case_badge = case_lines[0]
            extra_cases_html = "".join([f'<div class="case-highlight-box" style="margin-top: 2px;">{c}</div>' for c in case_lines[1:]])
            case_box_html = f"""
                  <div class="case-highlight-box">{case_badge}</div>
                  {extra_cases_html}
                  {bill_grid_stamp}
                """
        else:
            case_box_html = bill_grid_stamp

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
                  {case_box_html}
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
        if case_lines:
            case_items_html = "".join([f'<div class="case-item">{line}</div>' for line in case_lines])
            case_block_html = f"""
            <div class="case-block">
              {case_items_html}
            </div>
            """
        else:
            case_block_html = "<div></div>"

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
            {case_block_html}
            {bill_stamp_html}
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


def render_single_envelope_html(
    case_data: Dict[str, Any],
    job_data: Dict[str, Any],
    sender_data: Dict[str, Any],
    settings: Dict[str, Any],
    template_format: str = "attachment_pdf",
    language: str = "en"
) -> str:
    meta = extract_envelope_metadata(
        case_data, job_data, sender_data, settings,
        template_format=template_format, language=language
    )
    return render_single_envelope_html_from_meta(meta)



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

    metadata_pages = []
    if envelopes_per_page == 1:
        for case in cases_data:
            top_meta = extract_envelope_metadata(case, job_data, sender_data, settings, template_format=template_format, language=language)
            env_html = render_single_envelope_html_from_meta(top_meta)
            page_content = f"""
            <div class="sheet-page">
              {env_html}
            </div>
            """
            pages_html.append(page_content)
            metadata_pages.append({"top": top_meta, "bottom": None})
    else:
        # 2 envelopes per A4 sheet (A4 half size stacked vertically)
        for i in range(0, total_cases, 2):
            top_case = cases_data[i]
            bottom_case = cases_data[i + 1] if (i + 1 < total_cases) else None

            top_meta = extract_envelope_metadata(top_case, job_data, sender_data, settings, template_format=template_format, language=language)
            bottom_meta = extract_envelope_metadata(bottom_case, job_data, sender_data, settings, template_format=template_format, language=language) if bottom_case else None

            top_html = render_single_envelope_html_from_meta(top_meta)
            bottom_html = render_single_envelope_html_from_meta(bottom_meta) if bottom_meta else ""

            page_content = f"""
            <div class="sheet-page">
              {top_html}
              {cut_line_html if bottom_case else ''}
              {bottom_html if bottom_case else '<div class="envelope-half-empty"></div>'}
            </div>
            """
            pages_html.append(page_content)
            metadata_pages.append({"top": top_meta, "bottom": bottom_meta})

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
      font-size: 14pt;
      font-weight: 900;
      line-height: 1.2;
      letter-spacing: 0.2px;
      color: #000000;
      border: 2px solid #000000;
      border-radius: 4px;
      padding: 2.5px 8px;
      margin-bottom: 3.5px;
      background: #ffffff;
      display: inline-block;
      white-space: nowrap;
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
      font-size: 11pt;
      font-weight: 900;
      line-height: 1.2;
      border: 1.8px solid #000000;
      border-radius: 3px;
      padding: 1.5px 6px;
      display: inline-block;
      background: #ffffff;
      color: #000000;
      white-space: nowrap;
      margin-bottom: 2px;
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
  <!-- ENVELOPE_METADATA_START
  {json.dumps(metadata_pages, ensure_ascii=False)}
  ENVELOPE_METADATA_END -->
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
    metadata_pages = []
    for i in range(0, total_items, 2):
        top_item = jobs_cases_list[i]
        bottom_item = jobs_cases_list[i + 1] if (i + 1 < total_items) else None

        top_meta = extract_envelope_metadata(
            top_item.get("case", {}), top_item.get("job", {}), sender_data, settings,
            template_format=template_format, language=language
        )
        bottom_meta = extract_envelope_metadata(
            bottom_item.get("case", {}), bottom_item.get("job", {}), sender_data, settings,
            template_format=template_format, language=language
        ) if bottom_item else None

        top_html = render_single_envelope_html_from_meta(top_meta)
        bottom_html = render_single_envelope_html_from_meta(bottom_meta) if bottom_meta else ""

        page_content = f"""
        <div class="sheet-page">
          {top_html}
          {cut_line_html if bottom_item else ''}
          {bottom_html if bottom_item else '<div class="envelope-half-empty"></div>'}
        </div>
        """
        pages_html.append(page_content)
        metadata_pages.append({"top": top_meta, "bottom": bottom_meta})

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
      font-size: 14pt;
      font-weight: 900;
      line-height: 1.2;
      letter-spacing: 0.2px;
      color: #000000;
      border: 2px solid #000000;
      border-radius: 4px;
      padding: 2.5px 8px;
      margin-bottom: 3.5px;
      background: #ffffff;
      display: inline-block;
      white-space: nowrap;
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
  <!-- ENVELOPE_METADATA_START
  {json.dumps(metadata_pages, ensure_ascii=False)}
  ENVELOPE_METADATA_END -->
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
        raw_total = job_data.get("total_cases")
        t_cases = int(raw_total) if raw_total is not None else 1
        cases_data = [{
            "case_number": 0 if t_cases == 0 else 1,
            "case_total": t_cases,
            "weight": 0.0 if t_cases == 0 else 1.0,
            "barcode_value": f"{job_data.get('job_number', 'JOB')}-C{0 if t_cases == 0 else 1}"
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


def clean_for_type1(text: str) -> str:
    """Sanitizes text for standard Type1 Helvetica font to guarantee ZERO question marks."""
    if not text:
        return ""
    replacements = {
        'બિલ અંદર છે': 'BIL ANDAR CHHE',
        'શ્રીજી હેલ્થકેર': 'SHREEJI HEALTHCARE',
        'શોપ 3&4 જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ,': 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD,',
        'દહેગામ-382305.': 'DEHGAM-382305.',
        'મો. નં.: ': 'MOB NO.: ',
        'મો. નં.:': 'MOB NO.:',
        'મો. નં.': 'MOB NO.',
        'ઈમેલ: ': 'MAIL: ',
        'ઈમેલ:': 'MAIL:',
        '📄': '',
        '✂': '-'
    }
    res = text
    for k, v in replacements.items():
        res = res.replace(k, v)
    return "".join([c if ord(c) < 256 else " " for c in res]).strip()


def pdf_escape(text: str) -> str:
    t = clean_for_type1(str(text or ""))
    return t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _generate_pure_vector_pdf(metadata_pages: List[Dict[str, Any]]) -> bytes:
    """
    100% ZERO-DEPENDENCY pure Python PDF 1.4 vector generator.
    Guarantees exact 2-column or 7x22-row grid layout on any device (including Termux).
    Produces zero question marks.
    """
    width, height = 595, 842
    stream_objs = []
    
    for i, p_data in enumerate(metadata_pages):
        top = p_data.get("top")
        bot = p_data.get("bottom")
        t_format = (top.get("template_format") if top else "attachment_pdf")
        
        ops = []
        ops.append("0.75 w")
        ops.append("0 0 0 RG")
        ops.append("0 0 0 rg")
        
        def render_half_ops(y_base, data, is_top=True):
            if not data:
                return
            if t_format == "marg_grid_22":
                # Draw exact 7x22 grid
                x_left = 20
                col_w = 555.0 / 7.0
                row_h = 17.5
                y_box = y_base - 22 * row_h
                
                ops.append("1.5 w")
                ops.append(f"{x_left} {y_box:.1f} 555 {22*row_h:.1f} re S")
                ops.append("0.5 w")
                ops.append("0.7 0.7 0.7 RG")
                for r in range(1, 22):
                    y_line = y_box + r * row_h
                    ops.append(f"{x_left} {y_line:.1f} m {x_left+555} {y_line:.1f} l S")
                for c in range(1, 7):
                    x_line = x_left + c * col_w
                    ops.append(f"{x_line:.1f} {y_box:.1f} m {x_line:.1f} {y_box+22*row_h:.1f} l S")
                ops.append("0 0 0 RG")
                
                # Row 1: TO Header
                y_r1 = y_base - 13
                to_hdr = pdf_escape(data.get("to_header", "TO -"))
                ops.append(f"BT /F1 12.5 Tf {x_left+5} {y_r1:.1f} Td ({to_hdr}) Tj ET")
                tw = len(to_hdr) * 7.5
                ops.append(f"{x_left+5} {y_r1-2:.1f} m {x_left+5+tw:.1f} {y_r1-2:.1f} l S")
                
                # Row 1, Col 7: Case badge
                case_lines = data.get("case_lines", [])
                col7_right = x_left + 7 * col_w - 4
                y_badge = y_base - 16
                if case_lines:
                    cl = pdf_escape(case_lines[0])
                    cw = len(cl) * 6.5
                    bx = col7_right - cw - 8
                    ops.append("1.2 w")
                    ops.append(f"{bx:.1f} {y_badge:.1f} {cw+8:.1f} 14 re S")
                    ops.append(f"BT /F1 10.5 Tf {bx+4:.1f} {y_badge+3:.1f} Td ({cl}) Tj ET")
                    y_badge -= 18

                if data.get("bill_inside"):
                    b_str = pdf_escape(data.get("bill_inside_text", "BILL INSIDE / BIL ANDAR CHHE"))
                    bw = len(b_str) * 5.8
                    bx = col7_right - bw - 8
                    ops.append("1.2 w")
                    ops.append(f"{bx:.1f} {y_badge:.1f} {bw+8:.1f} 14 re S")
                    ops.append(f"BT /F1 9.0 Tf {bx+4:.1f} {y_badge+3:.1f} Td ({b_str}) Tj ET")
                    
                # Row 3: Party Name
                y_r3 = y_base - 2 * row_h - 13
                p_name = pdf_escape(data.get("party_name", ""))
                ops.append(f"BT /F1 12 Tf {x_left+5} {y_r3:.1f} Td ({p_name[:48]}) Tj ET")
                
                # Row 4: Address
                y_r4 = y_base - 3 * row_h - 13
                addr_str = pdf_escape(", ".join([l.strip() for l in data.get("address_lines", []) if l.strip()]))
                ops.append(f"BT /F1 10 Tf {x_left+5} {y_r4:.1f} Td ({addr_str[:60]}) Tj ET")
                
                # Row 5: State
                y_r5 = y_base - 4 * row_h - 13
                st_line = pdf_escape(data.get("state_line", ""))
                if st_line:
                    ops.append(f"BT /F1 10.5 Tf {x_left+5} {y_r5:.1f} Td ({st_line[:50]}) Tj ET")
                    
                # Row 6: Mobile
                y_r6 = y_base - 5 * row_h - 13
                mob = pdf_escape(data.get("mobile", ""))
                lbl = pdf_escape(data.get("mob_label", "MOB NO.: "))
                if mob:
                    m_str = f"{lbl}{mob}"
                    ops.append(f"BT /F1 11 Tf {x_left+5} {y_r6:.1f} Td ({m_str}) Tj ET")
                    mw = len(m_str) * 6.6
                    ops.append(f"{x_left+5} {y_r6-2:.1f} m {x_left+5+mw:.1f} {y_r6-2:.1f} l S")
                    
                # Rows 11-16: Sender Details (Cols 4-7, x = x_left + 3*col_w + 5)
                x_from = x_left + 3 * col_w + 5
                y_r11 = y_base - 10 * row_h - 13
                ops.append(f"BT /F1 11 Tf {x_from:.1f} {y_r11:.1f} Td ({pdf_escape(data.get('from_title', 'FROM,'))}) Tj ET")
                y_r12 = y_base - 11 * row_h - 13
                ops.append(f"BT /F1 11.5 Tf {x_from:.1f} {y_r12:.1f} Td ({pdf_escape(data.get('sender_name', 'SHREEJI HEALTHCARE'))[:45]}) Tj ET")
                y_r13 = y_base - 12 * row_h - 13
                s_a1 = pdf_escape(data.get("sender_addr_1", ""))
                if s_a1:
                    ops.append(f"BT /F1 9.5 Tf {x_from:.1f} {y_r13:.1f} Td ({s_a1[:55]}) Tj ET")
                y_r14 = y_base - 13 * row_h - 13
                s_a2 = pdf_escape(data.get("sender_addr_2", ""))
                if s_a2:
                    ops.append(f"BT /F1 9.5 Tf {x_from:.1f} {y_r14:.1f} Td ({s_a2[:55]}) Tj ET")
                y_r15 = y_base - 14 * row_h - 13
                s_mob = pdf_escape(data.get("sender_mob", ""))
                if s_mob:
                    sm_str = f"{lbl}{s_mob}"
                    ops.append(f"BT /F1 10.5 Tf {x_from:.1f} {y_r15:.1f} Td ({sm_str}) Tj ET")
                    smw = len(sm_str) * 6.3
                    ops.append(f"{x_from:.1f} {y_r15-2:.1f} m {x_from+smw:.1f} {y_r15-2:.1f} l S")
                y_r16 = y_base - 15 * row_h - 13
                s_mail = pdf_escape(data.get("sender_mail", ""))
                if s_mail:
                    ops.append(f"BT /F2 8.5 Tf {x_from:.1f} {y_r16:.1f} Td ({pdf_escape(data.get('mail_label', 'MAIL: '))}{s_mail}) Tj ET")
            else:
                # Modern borderless Attachment PDF format
                x_left = 25
                y_curr = y_base - 25
                
                # TO Header
                to_hdr = pdf_escape(data.get("to_header", "TO -"))
                ops.append(f"BT /F1 15 Tf {x_left} {y_curr:.1f} Td ({to_hdr}) Tj ET")
                tw = len(to_hdr) * 9.0
                ops.append(f"{x_left} {y_curr-3:.1f} m {x_left+tw:.1f} {y_curr-3:.1f} l S")
                
                # Party Name
                y_curr -= 26
                p_name = pdf_escape(data.get("party_name", ""))
                ops.append(f"BT /F1 15 Tf {x_left} {y_curr:.1f} Td ({p_name[:45]}) Tj ET")
                
                # Address Lines
                y_curr -= 22
                for line in data.get("address_lines", []):
                    l_str = pdf_escape(line.strip())
                    if l_str:
                        ops.append(f"BT /F1 12 Tf {x_left} {y_curr:.1f} Td ({l_str[:50]}) Tj ET")
                        y_curr -= 17
                        
                # State
                st_line = pdf_escape(data.get("state_line", ""))
                if st_line:
                    ops.append(f"BT /F1 12 Tf {x_left} {y_curr:.1f} Td ({st_line[:45]}) Tj ET")
                    y_curr -= 19
                    
                # Mobile
                mob = pdf_escape(data.get("mobile", ""))
                lbl = pdf_escape(data.get("mob_label", "MOB NO.: "))
                if mob:
                    m_str = f"{lbl}{mob}"
                    ops.append(f"BT /F1 13 Tf {x_left} {y_curr:.1f} Td ({m_str}) Tj ET")
                    mw = len(m_str) * 7.8
                    ops.append(f"{x_left} {y_curr-3:.1f} m {x_left+mw:.1f} {y_curr-3:.1f} l S")
                    
                # Right Column: Case breakdown box
                y_case = y_base - 22
                for cl in data.get("case_lines", []):
                    cl_str = pdf_escape(cl)
                    cw = len(cl_str) * 7.5
                    bx = 565 - cw - 16
                    ops.append("1.5 w")
                    ops.append(f"{bx:.1f} {y_case-5:.1f} {cw+16:.1f} 20 re S")
                    ops.append(f"BT /F1 12 Tf {bx+8:.1f} {y_case:.1f} Td ({cl_str}) Tj ET")
                    y_case -= 26
                    
                if data.get("bill_inside"):
                    b_str = pdf_escape(data.get("bill_inside_text", "BILL INSIDE / BIL ANDAR CHHE"))
                    bw = len(b_str) * 6.5
                    bx = 565 - bw - 16
                    ops.append("1.8 w")
                    ops.append(f"{bx:.1f} {y_case-5:.1f} {bw+16:.1f} 20 re S")
                    ops.append(f"BT /F1 11 Tf {bx+8:.1f} {y_case:.1f} Td ({b_str}) Tj ET")
                    y_case -= 26
                    
                # Sender Block
                y_snd = y_base - 240
                ops.append(f"BT /F1 13 Tf 340 {y_snd:.1f} Td ({pdf_escape(data.get('from_title', 'FROM,'))}) Tj ET")
                y_snd -= 18
                ops.append(f"BT /F1 13 Tf 340 {y_snd:.1f} Td ({pdf_escape(data.get('sender_name', 'SHREEJI HEALTHCARE'))[:40]}) Tj ET")
                y_snd -= 16
                s_a1 = pdf_escape(data.get("sender_addr_1", ""))
                if s_a1:
                    ops.append(f"BT /F1 10.5 Tf 340 {y_snd:.1f} Td ({s_a1[:45]}) Tj ET")
                    y_snd -= 15
                s_a2 = pdf_escape(data.get("sender_addr_2", ""))
                if s_a2:
                    ops.append(f"BT /F1 10.5 Tf 340 {y_snd:.1f} Td ({s_a2[:45]}) Tj ET")
                    y_snd -= 15
                s_mob = pdf_escape(data.get("sender_mob", ""))
                if s_mob:
                    sm_str = f"{lbl}{s_mob}"
                    ops.append(f"BT /F1 11 Tf 340 {y_snd:.1f} Td ({sm_str}) Tj ET")
                    smw = len(sm_str) * 6.6
                    ops.append(f"340 {y_snd-2:.1f} m {340+smw:.1f} {y_snd-2:.1f} l S")
                    y_snd -= 15
                s_mail = pdf_escape(data.get("sender_mail", ""))
                if s_mail:
                    ops.append(f"BT /F2 9.5 Tf 340 {y_snd:.1f} Td ({pdf_escape(data.get('mail_label', 'MAIL: '))}{s_mail}) Tj ET")

        # Top envelope (y_base = 822)
        render_half_ops(822, top, is_top=True)
        
        # Cut guide line at y = 421
        if bot:
            ops.append("0.5 w")
            ops.append("0.5 0.5 0.5 RG")
            cut_str = pdf_escape("✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂")
            ops.append(f"BT /F2 8 Tf 40 421 Td ({cut_str}) Tj ET")
            ops.append("0 0 0 RG")
            # Bottom envelope (y_base = 410)
            render_half_ops(410, bot, is_top=False)
            
        stream_bytes = "\n".join(ops).encode("latin-1", "replace")
        stream_objs.append(zlib.compress(stream_bytes))

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    num_pages = len(stream_objs)
    page_ids = [5 + 2*i for i in range(num_pages)]
    content_ids = [6 + 2*i for i in range(num_pages)]
    
    offsets[1] = out.tell()
    out.write(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    
    kids_str = " ".join([f"{pid} 0 R" for pid in page_ids])
    offsets[2] = out.tell()
    out.write(f"2 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {num_pages} >>\nendobj\n".encode('latin-1'))
    
    offsets[3] = out.tell()
    out.write(b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n")
    
    offsets[4] = out.tell()
    out.write(b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
    
    for i in range(num_pages):
        pid = page_ids[i]
        cid = content_ids[i]
        c_bytes = stream_objs[i]
        
        offsets[pid] = out.tell()
        page_str = f"{pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Contents {cid} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n"
        out.write(page_str.encode('latin-1'))
        
        offsets[cid] = out.tell()
        stream_head = f"{cid} 0 obj\n<< /Length {len(c_bytes)} /Filter /FlateDecode >>\nstream\n".encode('latin-1')
        out.write(stream_head + c_bytes + b"\nendstream\nendobj\n")
        
    total_objs = 4 + 2 * num_pages
    xref_pos = out.tell()
    out.write(f"xref\n0 {total_objs + 1}\n".encode('latin-1'))
    out.write(b"0000000000 65535 f \n")
    for oid in range(1, total_objs + 1):
        out.write(f"{offsets[oid]:010d} 00000 n \n".encode('latin-1'))
        
    trailer_str = f"trailer\n<< /Size {total_objs + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n"
    out.write(trailer_str.encode('latin-1'))
    return out.getvalue()


def _generate_vector_pdf_with_pymupdf(metadata_pages: List[Dict[str, Any]]) -> bytes:
    """
    Renders high-precision vector PDFs with true embedded fonts (Rasa / Noto Sans Gujarati)
    using PyMuPDF. Generates in ~15ms with 100% fidelity.
    """
    import pymupdf
    doc = pymupdf.open()
    
    font_bold_candidates = [
        '/usr/share/fonts/truetype/fonts-yrsa-rasa/Rasa-Bold.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansGujarati-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf'
    ]
    font_reg_candidates = [
        '/usr/share/fonts/truetype/fonts-yrsa-rasa/Rasa-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansGujarati-Regular.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSerif.ttf'
    ]
    
    font_bold_path = next((p for p in font_bold_candidates if os.path.exists(p)), None)
    font_reg_path = next((p for p in font_reg_candidates if os.path.exists(p)), None)
    
    font_obj_bold = pymupdf.Font(fontfile=font_bold_path) if font_bold_path else None
    font_obj_reg = pymupdf.Font(fontfile=font_reg_path) if font_reg_path else None
    
    def text_len(txt: str, size: float, bold: bool = True) -> float:
        f = font_obj_bold if bold else font_obj_reg
        if f:
            try:
                return f.text_length(txt, fontsize=size)
            except Exception:
                pass
        return len(txt) * (size * 0.58)

    for p_idx, page_meta in enumerate(metadata_pages):
        page = doc.new_page(width=595, height=842)
        if font_bold_path:
            page.insert_font(fontname="F_Bold", fontfile=font_bold_path)
        if font_reg_path:
            page.insert_font(fontname="F_Reg", fontfile=font_reg_path)
            
        fname_bold = "F_Bold" if font_bold_path else "helv"
        fname_reg = "F_Reg" if font_reg_path else "helv"
        
        top_data = page_meta.get("top")
        bot_data = page_meta.get("bottom")
        
        t_format = (top_data.get("template_format") if top_data else "attachment_pdf")
        
        if t_format == "marg_grid_22":
            def draw_grid_half(y_start, data):
                if not data:
                    return
                x_left = 20
                x_right = 575
                table_width = x_right - x_left
                col_w = table_width / 7.0
                row_h = 17.5
                
                # Draw 7x22 grid lines
                for r in range(23):
                    y = y_start + r * row_h
                    page.draw_line(pymupdf.Point(x_left, y), pymupdf.Point(x_right, y), color=(0.7, 0.7, 0.7), width=0.5)
                for c in range(8):
                    x = x_left + c * col_w
                    page.draw_line(pymupdf.Point(x, y_start), pymupdf.Point(x, y_start + 22 * row_h), color=(0.7, 0.7, 0.7), width=0.5)
                page.draw_rect(pymupdf.Rect(x_left, y_start, x_right, y_start + 22 * row_h), color=(0, 0, 0), width=1.5)
                
                # Row 1: TO Header
                to_header = data.get("to_header", "TO -")
                page.insert_text(pymupdf.Point(x_left + 5, y_start + 13), to_header, fontname=fname_bold, fontsize=13)
                tw = text_len(to_header, 13, bold=True)
                page.draw_line(pymupdf.Point(x_left + 5, y_start + 15), pymupdf.Point(x_left + 5 + tw, y_start + 15), width=1.2)
                
                # Row 1, Col 7: Case badge & Bill Inside
                case_lines = data.get("case_lines", [])
                col7_right = x_left + 7 * col_w - 4
                y_badge = y_start + 2
                if case_lines:
                    cl = case_lines[0]
                    cw = text_len(cl, 10.5, bold=True)
                    box_rect = pymupdf.Rect(col7_right - cw - 8, y_badge, col7_right, y_badge + 14)
                    page.draw_rect(box_rect, color=(0, 0, 0), width=1.2)
                    page.insert_text(pymupdf.Point(col7_right - cw - 4, y_badge + 10), cl, fontname=fname_bold, fontsize=10.5)
                    y_badge += 16
                
                if data.get("bill_inside"):
                    b_text = data.get("bill_inside_text", "BILL INSIDE / બિલ અંદર છે").replace("📄 ", "")
                    bw = text_len(b_text, 9.0, bold=True)
                    b_rect = pymupdf.Rect(col7_right - bw - 8, y_badge, col7_right, y_badge + 13)
                    page.draw_rect(b_rect, color=(0, 0, 0), width=1.2)
                    page.insert_text(pymupdf.Point(col7_right - bw - 4, y_badge + 9.5), b_text, fontname=fname_bold, fontsize=9.0)
                    
                # Row 3: Party Name
                party_name = data.get("party_name", "")
                page.insert_text(pymupdf.Point(x_left + 5, y_start + 2 * row_h + 13), party_name[:48], fontname=fname_bold, fontsize=12.5)
                
                # Row 4: Address
                addr_lines = data.get("address_lines", [])
                addr_text = ", ".join([l.strip() for l in addr_lines if l.strip()])
                page.insert_text(pymupdf.Point(x_left + 5, y_start + 3 * row_h + 13), addr_text[:60], fontname=fname_bold, fontsize=10.5)
                
                # Row 5: State
                state_line = data.get("state_line", "")
                if state_line:
                    page.insert_text(pymupdf.Point(x_left + 5, y_start + 4 * row_h + 13), state_line[:50], fontname=fname_bold, fontsize=10.5)
                    
                # Row 6: Mobile
                mobile = data.get("mobile", "")
                mob_label = data.get("mob_label", "MOB NO.: ")
                if mobile:
                    mob_str = f"{mob_label}{mobile}"
                    page.insert_text(pymupdf.Point(x_left + 5, y_start + 5 * row_h + 13), mob_str, fontname=fname_bold, fontsize=11.5)
                    mw = text_len(mob_str, 11.5, bold=True)
                    page.draw_line(pymupdf.Point(x_left + 5, y_start + 5 * row_h + 15), pymupdf.Point(x_left + 5 + mw, y_start + 5 * row_h + 15), width=1)
                    
                # Rows 11-16 (Cols 4-7, x = x_left + 3 * col_w + 5)
                x_from = x_left + 3 * col_w + 5
                page.insert_text(pymupdf.Point(x_from, y_start + 10 * row_h + 13), data.get("from_title", "FROM,"), fontname=fname_bold, fontsize=11)
                page.insert_text(pymupdf.Point(x_from, y_start + 11 * row_h + 13), data.get("sender_name", "SHREEJI HEALTHCARE")[:45], fontname=fname_bold, fontsize=12)
                page.insert_text(pymupdf.Point(x_from, y_start + 12 * row_h + 13), data.get("sender_addr_1", "")[:50], fontname=fname_bold, fontsize=10)
                s_addr2 = data.get("sender_addr_2", "")
                if s_addr2:
                    page.insert_text(pymupdf.Point(x_from, y_start + 13 * row_h + 13), s_addr2[:50], fontname=fname_bold, fontsize=10)
                s_mob = data.get("sender_mob", "")
                if s_mob:
                    sm_str = f"{mob_label}{s_mob}"
                    page.insert_text(pymupdf.Point(x_from, y_start + 14 * row_h + 13), sm_str, fontname=fname_bold, fontsize=10.5)
                    smw = text_len(sm_str, 10.5, bold=True)
                    page.draw_line(pymupdf.Point(x_from, y_start + 14 * row_h + 15), pymupdf.Point(x_from + smw, y_start + 14 * row_h + 15), width=1)
                s_mail = data.get("sender_mail", "")
                if s_mail:
                    page.insert_text(pymupdf.Point(x_from, y_start + 15 * row_h + 13), f"{data.get('mail_label', 'MAIL: ')}{s_mail}", fontname=fname_reg, fontsize=9.5)

            draw_grid_half(15, top_data)
            if bot_data:
                cut_text = "✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂"
                cw = text_len(cut_text, 8, bold=False)
                page.insert_text(pymupdf.Point((595 - cw) / 2, 424), cut_text, fontname=fname_reg, fontsize=8, color=(0.4, 0.4, 0.4))
                draw_grid_half(436, bot_data)
        else:
            # Modern Attachment PDF format
            def draw_envelope_half(y_offset, data):
                if not data:
                    return
                # Left column: x = 25
                to_header = data.get("to_header", "TO -")
                page.insert_text(pymupdf.Point(25, y_offset + 30), to_header, fontname=fname_bold, fontsize=16)
                tw = text_len(to_header, 16, bold=True)
                page.draw_line(pymupdf.Point(25, y_offset + 33), pymupdf.Point(25 + tw, y_offset + 33), width=1.5)
                
                party_name = data.get("party_name", "")
                page.insert_text(pymupdf.Point(25, y_offset + 58), party_name[:45], fontname=fname_bold, fontsize=15)
                
                y_addr = y_offset + 82
                for line in data.get("address_lines", []):
                    if line.strip():
                        page.insert_text(pymupdf.Point(25, y_addr), line.strip()[:50], fontname=fname_bold, fontsize=12.5)
                        y_addr += 18
                        
                state_line = data.get("state_line", "")
                if state_line:
                    page.insert_text(pymupdf.Point(25, y_addr), state_line[:45], fontname=fname_bold, fontsize=12.5)
                    y_addr += 20
                    
                mobile = data.get("mobile", "")
                mob_label = data.get("mob_label", "MOB NO.: ")
                if mobile:
                    mob_text = f"{mob_label}{mobile}"
                    page.insert_text(pymupdf.Point(25, y_addr), mob_text, fontname=fname_bold, fontsize=13)
                    mw = text_len(mob_text, 13, bold=True)
                    page.draw_line(pymupdf.Point(25, y_addr + 3), pymupdf.Point(25 + mw, y_addr + 3), width=1.2)

                # Right column: x = 340 to 570
                case_lines = data.get("case_lines", [])
                y_case = y_offset + 25
                for cl in case_lines:
                    cw = text_len(cl, 12, bold=True)
                    box_rect = pymupdf.Rect(565 - cw - 16, y_case - 14, 565, y_case + 6)
                    page.draw_rect(box_rect, color=(0, 0, 0), width=1.5)
                    page.insert_text(pymupdf.Point(565 - cw - 8, y_case), cl, fontname=fname_bold, fontsize=12)
                    y_case += 26
                    
                if data.get("bill_inside"):
                    b_text = data.get("bill_inside_text", "BILL INSIDE / બિલ અંદર છે").replace("📄 ", "")
                    bw = text_len(b_text, 11, bold=True)
                    b_rect = pymupdf.Rect(565 - bw - 16, y_case - 13, 565, y_case + 6)
                    page.draw_rect(b_rect, color=(0, 0, 0), width=1.8)
                    page.insert_text(pymupdf.Point(565 - bw - 8, y_case), b_text, fontname=fname_bold, fontsize=11)
                    y_case += 26

                y_sender = y_offset + 230
                page.insert_text(pymupdf.Point(340, y_sender), data.get("from_title", "FROM,"), fontname=fname_bold, fontsize=13)
                y_sender += 18
                page.insert_text(pymupdf.Point(340, y_sender), data.get("sender_name", "SHREEJI HEALTHCARE")[:40], fontname=fname_bold, fontsize=13)
                y_sender += 16
                s_addr1 = data.get("sender_addr_1", "")
                if s_addr1:
                    page.insert_text(pymupdf.Point(340, y_sender), s_addr1[:45], fontname=fname_bold, fontsize=10.5)
                    y_sender += 15
                s_addr2 = data.get("sender_addr_2", "")
                if s_addr2:
                    page.insert_text(pymupdf.Point(340, y_sender), s_addr2[:45], fontname=fname_bold, fontsize=10.5)
                    y_sender += 15
                s_mob = data.get("sender_mob", "")
                if s_mob:
                    sm_text = f"{mob_label}{s_mob}"
                    page.insert_text(pymupdf.Point(340, y_sender), sm_text, fontname=fname_bold, fontsize=11)
                    smw = text_len(sm_text, 11, bold=True)
                    page.draw_line(pymupdf.Point(340, y_sender + 2), pymupdf.Point(340 + smw, y_sender + 2), width=1)
                    y_sender += 15
                s_mail = data.get("sender_mail", "")
                if s_mail:
                    page.insert_text(pymupdf.Point(340, y_sender), f"{data.get('mail_label', 'MAIL: ')}{s_mail}", fontname=fname_reg, fontsize=10)

            draw_envelope_half(10, top_data)
            if bot_data:
                cut_text = "✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂"
                cw = text_len(cut_text, 8, bold=False)
                page.insert_text(pymupdf.Point((595 - cw) / 2, 424), cut_text, fontname=fname_reg, fontsize=8, color=(0.4, 0.4, 0.4))
                draw_envelope_half(432, bot_data)

    return doc.tobytes()


def _parse_html_to_envelope_metadata(html_content: str) -> List[Dict[str, Any]]:
    """Fallback parser to reconstruct envelope metadata from raw HTML if JSON comment was not attached."""
    is_grid = ("marg-grid-table" in html_content) or ("marg_grid_22" in html_content)
    t_format = "marg_grid_22" if is_grid else "attachment_pdf"
    
    p_match = re.search(r'class="[^"]*(?:party-name|cell-party)[^"]*"[^>]*>(.*?)<', html_content, re.IGNORECASE | re.DOTALL)
    party_name = p_match.group(1).strip() if p_match else "PARTY NAME"
    
    to_match = re.search(r'class="[^"]*(?:to-title|cell-to)[^"]*"[^>]*>(.*?)<', html_content, re.IGNORECASE | re.DOTALL)
    to_header = to_match.group(1).strip() if to_match else "TO -"
    
    m_match = re.search(r'class="[^"]*(?:mobile-no|cell-mobile)[^"]*"[^>]*>(?:MOB NO\.?:?\s*)?(.*?)<', html_content, re.IGNORECASE | re.DOTALL)
    mobile = m_match.group(1).strip() if m_match else ""
    
    st_match = re.search(r'class="[^"]*(?:state-line|cell-state)[^"]*"[^>]*>(.*?)<', html_content, re.IGNORECASE | re.DOTALL)
    state_line = st_match.group(1).strip() if st_match else ""
    
    case_items = re.findall(r'class="[^"]*(?:case-item|case-highlight-box)[^"]*"[^>]*>(.*?)<', html_content, re.IGNORECASE | re.DOTALL)
    case_lines = [c.strip() for c in case_items if c.strip() and not "બિલ" in c and not "BILL INSIDE" in c]
    
    bill_inside = ("BILL INSIDE" in html_content or "બિલ અંદર છે" in html_content)
    
    top_meta = {
        "template_format": t_format,
        "party_name": party_name,
        "to_header": to_header,
        "address_lines": ["PARSED ADDRESS"],
        "state_line": state_line,
        "mobile": mobile,
        "mob_label": "MOB NO.: ",
        "case_lines": case_lines or ["CASE: 1"],
        "bill_inside": bill_inside,
        "bill_inside_text": "BILL INSIDE / બિલ અંદર છે",
        "from_title": "FROM,",
        "sender_name": "SHREEJI HEALTHCARE",
        "sender_addr_1": "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD,",
        "sender_addr_2": "DEHGAM-382305.",
        "sender_mob": "+91 99245 44283",
        "sender_mail": "SHREEJISEVEN@GMAIL.COM",
        "mail_label": "MAIL: "
    }
    return [{"top": top_meta, "bottom": None}]


def _generate_raw_vector_pdf(html_content: str) -> bytes:
    """Zero-dependency vector PDF generator dispatching to pure vector engine or PyMuPDF."""
    match = re.search(r'<!-- ENVELOPE_METADATA_START\s*(.*?)\s*ENVELOPE_METADATA_END -->', html_content, re.DOTALL)
    if match:
        try:
            metadata_pages = json.loads(match.group(1))
            try:
                import pymupdf
                return _generate_vector_pdf_with_pymupdf(metadata_pages)
            except Exception:
                return _generate_pure_vector_pdf(metadata_pages)
        except Exception:
            pass

    metadata_pages = _parse_html_to_envelope_metadata(html_content)
    try:
        import pymupdf
        return _generate_vector_pdf_with_pymupdf(metadata_pages)
    except Exception:
        return _generate_pure_vector_pdf(metadata_pages)


def _generate_pure_pdf_fallback(html_content: str) -> bytes:
    """Robust fallback vector PDF generator matching exact envelope layout."""
    return _generate_raw_vector_pdf(html_content)


def compile_html_to_pdf(html_content: str, auto_print: bool = False) -> bytes:
    """
    Compiles envelope HTML to high-precision vector PDF.
    Order of preference:
      1. PyMuPDF vector renderer (instantaneous ~15ms, exact true fonts, zero crash risk)
      2. Modern Chromium headless print (with fixed flags, no-hang timeout)
      3. WeasyPrint
      4. Zero-dependency pure Python vector engine
    """
    raw_pdf = None

    # 1. Try PyMuPDF directly if metadata is present
    match = re.search(r'<!-- ENVELOPE_METADATA_START\s*(.*?)\s*ENVELOPE_METADATA_END -->', html_content, re.DOTALL)
    if match:
        try:
            metadata_pages = json.loads(match.group(1))
            try:
                import pymupdf
                raw_pdf = _generate_vector_pdf_with_pymupdf(metadata_pages)
            except Exception as pe:
                print("PyMuPDF direct render notice:", pe)
        except Exception as je:
            print("Notice parsing embedded envelope metadata:", je)

    # 2. Try Chromium with modern non-hanging flags if PyMuPDF wasn't used
    if not raw_pdf:
        temp_dir = tempfile.mkdtemp()
        html_path = os.path.join(temp_dir, "document.html")
        pdf_path = os.path.join(temp_dir, "document.pdf")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        chrome_bin = (
            shutil.which("chromium") or 
            shutil.which("chromium-browser") or 
            shutil.which("google-chrome") or 
            shutil.which("chrome") or 
            shutil.which("msedge")
        )
        if not chrome_bin and os.name == 'nt':
            for win_path in [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            ]:
                if os.path.exists(win_path):
                    chrome_bin = win_path
                    break

        if chrome_bin:
            try:
                cmd = [
                    chrome_bin,
                    "--headless=new",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    "--no-zygote",
                    "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf_path}",
                    f"file://{html_path}"
                ]
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12)
                if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
                    with open(pdf_path, "rb") as pf:
                        raw_pdf = pf.read()
            except Exception as ce:
                print("Notice: Chromium render skipped:", ce)

        try:
            if os.path.exists(html_path): os.remove(html_path)
            if os.path.exists(pdf_path): os.remove(pdf_path)
            os.rmdir(temp_dir)
        except Exception:
            pass

    # 3. Try WeasyPrint if still needed
    if not raw_pdf:
        try:
            import weasyprint
            raw_pdf = weasyprint.HTML(string=html_content).write_pdf()
        except Exception as we:
            print("Notice: WeasyPrint skipped:", we)

    # 4. Final guarantee: pure Python zero-dependency vector engine
    if not raw_pdf:
        try:
            raw_pdf = _generate_pure_pdf_fallback(html_content)
        except Exception as fe:
            raise RuntimeError(f"Could not generate PDF: {fe}")

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
    raw_bname = (sender_data.get("business_name") or "SHREEJI HEALTHCARE").strip()
    clean_bname = re.sub(r'[\-_]HEALTHCARE', '', raw_bname, flags=re.I).strip()
    if clean_bname.upper().endswith("HEALTHCARE"):
        business_name = clean_bname
    else:
        business_name = f"{clean_bname} HEALTHCARE".strip()

    if is_gu:
        company_name_display = "શ્રીજી હેલ્થકેર" if ("SHREEJI" in business_name.upper() or not business_name) else ai_service.fast_translate_phrase(business_name)
        company_sub_display = "શોપ 3&4 જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ, દહેગામ-382305 • ફોન: +91 99245 44283"
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

                    formatted_line = format_case_breakdown_line(b_type, b_vol, qty)
                    breakdown_text_parts.append(formatted_line)
                elif isinstance(b, str) and b.strip():
                    txt = b.strip().upper()
                    formatted_line = format_case_breakdown_line(txt)
                    breakdown_text_parts.append(formatted_line)
                    full_breakdown_counts[txt] = full_breakdown_counts.get(txt, 0) + 1

        else:
            breakdown_text_parts.append(f"CASE: {pkg_count}")
            total_standard_cases += pkg_count
            full_breakdown_counts["CASE"] = full_breakdown_counts.get("CASE", 0) + pkg_count

        # User requirement: Strictly do NOT translate case breakdown (keep "NS 100ML CASE: 1", "DNS 100ML CASE: 1", "CASE: N")
        breakdown_str = ", ".join(breakdown_text_parts) if breakdown_text_parts else f"CASE: {pkg_count}"

        if is_gu:
            party_cell_html = f"""
            <div style="font-weight: 800; font-size: 10pt; color: #000000; line-height: 1.2;">{party_name_gu}</div>
            <div style="font-size: 7.5pt; font-weight: 700; color: #475569; margin-top: 1px;">{party_name_en}</div>
            """
            city_cell_html = f"""
            <div style="font-weight: 800; font-size: 9.5pt; color: #0f172a;">{city_gu}</div>
            {f'<div style="font-size: 7pt; font-weight: 600; color: #64748b;">{city_en}</div>' if city_gu != city_en else ''}
            """
        else:
            party_cell_html = f'<div style="font-weight: 800; font-size: 10pt;">{party_name_en}</div>'
            city_cell_html = f'<div style="font-weight: 700;">{city_en}</div>'

        is_delivered = (d.get("delivery_status") == "Delivered")
        delivered_by_user = (d.get("delivered_by") or "").strip()
        delivered_time = (d.get("delivered_at") or "").strip()

        if is_delivered:
            sign_cell_html = f"""
            <div style="font-size: 7.5pt; font-weight: 800; color: #047857; text-align: center; line-height: 1.1;">
              &#10003; DELIVERED
            </div>
            <div style="font-size: 7pt; font-weight: 700; color: #0f172a; text-align: center; margin-top: 1px;">
              By: {delivered_by_user or 'Driver'}
            </div>
            {f'<div style="font-size: 6.5pt; color: #64748b; text-align: center;">{delivered_time}</div>' if delivered_time else ''}
            """
        else:
            sign_cell_html = '<div style="height: 26px;"></div>'

        rows_html.append(f"""
        <tr>
          <td style="text-align: center; font-weight: bold;">{idx}</td>
          <td>{party_cell_html}</td>
          <td>{city_cell_html}</td>
          <td style="font-family: monospace; font-size: 9pt;">{mobile}</td>
          <td style="font-size: 9pt; font-weight: 700; color: #1e3a8a;">{breakdown_str}</td>
          <td style="text-align: center; font-weight: 800; font-size: 11pt;">{pkg_count}</td>
          <td style="border: 1px dashed #999; vertical-align: middle; padding: 2px;">{sign_cell_html}</td>
        </tr>
        """)

    breakdown_total_label = f"કુલ: {total_pkgs} પાર્સલ" if is_gu else f"TOTAL: {total_pkgs} PKGS"

    # Compact 4-column table for case breakdown to prevent awkward orphan page splits
    items_list = sorted(full_breakdown_counts.items())
    num_cols = 4
    table_rows = []
    for i in range(0, len(items_list), num_cols):
        chunk = items_list[i:i + num_cols]
        cells_html = []
        for k, v in chunk:
            cells_html.append(f"""
            <td style="width: 25%; padding: 2px 4px; vertical-align: top;">
              <div style="background: #ffffff; border: 1.5px solid #1e3a8a; border-radius: 5px; padding: 3px 5px; text-align: center;">
                <div style="font-size: 7pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  {k}
                </div>
                <div style="font-size: 11pt; font-weight: 900; color: #000000; margin-top: 1px;">{v}</div>
              </div>
            </td>
            """)
        while len(cells_html) < num_cols:
            cells_html.append('<td style="width: 25%; padding: 2px 4px;"></td>')
        table_rows.append(f"<tr>{''.join(cells_html)}</tr>")

    breakdown_table_html = f"""
    <table style="width: 100%; border-collapse: collapse; margin-top: 2px;">
      {''.join(table_rows)}
    </table>
    """ if items_list else '<div style="font-size: 8.5pt; color: #64748b;">No items</div>'

    detailed_breakdown_box = f"""
    <div style="margin-top: 6px; border: 1.5px solid #000000; border-radius: 6px; padding: 6px 10px; background: #f8fafc; page-break-inside: avoid; break-inside: avoid;">
      <div style="font-size: 8.5pt; font-weight: 900; color: #0f172a; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; display: flex; justify-content: space-between;">
        <span>{breakdown_box_header}</span>
        <span style="color: #1e3a8a;">{breakdown_total_label}</span>
      </div>
      {breakdown_table_html}
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
    tr {{
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .footer-block {{
      page-break-inside: avoid;
      break-inside: avoid;
      margin-top: 6px;
    }}
    .summary-box {{
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      border: 1.5px solid #000000;
      border-radius: 6px;
      padding: 6px 12px;
      background: #f8fafc;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .kpi-item {{
      text-align: center;
    }}
    .kpi-num {{
      font-size: 13pt;
      font-weight: 900;
      color: #0f172a;
    }}
    .kpi-label {{
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
    }}
    .signatures {{
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      padding: 0 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    .sign-col {{
      text-align: center;
      width: 30%;
      border-top: 1.5px solid #000000;
      padding-top: 4px;
      font-size: 8pt;
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

  <div class="footer-block">
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
  </div>
</body>
</html>
"""
    return compile_html_to_pdf(html, auto_print=auto_print)
