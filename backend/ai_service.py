import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional
from pathlib import Path

# Load .env file if available
try:
    from dotenv import load_dotenv
    env_paths = [Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env"]
    for ep in env_paths:
        if ep.exists():
            load_dotenv(ep)
except ImportError:
    pass

PRIMARY_MODEL = "models/gemini-2.5-flash"
FALLBACK_MODELS = [
    "models/gemini-2.5-flash",
    "models/gemini-2.0-flash",
    "models/gemini-1.5-flash",
    "models/gemini-flash-lite-latest",
    "models/gemini-flash-latest"
]

# In-memory translation cache to avoid duplicate API calls
_TRANSLATION_CACHE: Dict[str, Dict[str, str]] = {}

def get_api_key() -> str:
    """Returns active Gemini API key from environment variable or app configuration."""
    return os.environ.get("GEMINI_API_KEY", "").strip()

def _call_gemini_api(payload: Dict[str, Any], api_key: Optional[str] = None, model: Optional[str] = None) -> Dict[str, Any]:
    """Helper to send request to Google Generative Language API with fallback models."""
    key = api_key or get_api_key()
    models_to_try = [model] if model else FALLBACK_MODELS

    last_error = None
    for m in models_to_try:
        if not m:
            continue
        url = f"https://generativelanguage.googleapis.com/v1beta/{m}:generateContent?key={key}"
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                return res_json
        except urllib.error.HTTPError as he:
            err_msg = he.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {he.code}: {err_msg}"
            if he.code in (404, 503, 429):
                # Try next model
                continue
            raise RuntimeError(last_error)
        except Exception as e:
            last_error = str(e)
            continue

    raise RuntimeError(f"Gemini API request failed across all models. Last error: {last_error}")

def test_connection(api_key: Optional[str] = None) -> Dict[str, Any]:
    """Tests connectivity to Google Gemini API using the specified or default key."""
    key = api_key or get_api_key()
    try:
        test_payload = {
            "contents": [{"parts": [{"text": "Reply with 'OK' only."}]}]
        }
        res = _call_gemini_api(test_payload, api_key=key)
        text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return {
            "success": True,
            "message": "Connected to Google Gemini API successfully",
            "model": PRIMARY_MODEL,
            "output": text.strip()
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "model": PRIMARY_MODEL
        }

# Pre-compiled Gujarati dictionary for high-accuracy pharma courier translations
GUJARAT_TRANSLATION_DICT = {
    "NEAR": "પાસે", "NR.": "પાસે", "NR": "પાસે", "N/R": "પાસે",
    "OPP.": "સામે", "OPP": "સામે", "OPPOSITE": "સામે", "O/S": "સામે", "O/P": "સામે",
    "BEHIND": "પાછળ", "B/H": "પાછળ", "BH": "પાછળ",
    "BESIDE": "બાજુમાં", "NEXT TO": "બાજુમાં",
    "CROSS ROAD": "ચાર રસ્તા", "CROSS ROADS": "ચાર રસ્તા", "CHAR RASTA": "ચાર રસ્તા",
    "COMPLEX": "કોમ્પ્લેક્ષ", "PLAZA": "પ્લાઝા", "CENTRE": "સેન્ટર", "CENTER": "સેન્ટર",
    "SHOP NO.": "દુકાન નં.", "SHOP NO": "દુકાન નં.", "SHOP": "શોપ", "SHOPS": "શોપ્સ",
    "MARKET": "માર્કેટ", "HIGHWAY": "હાઇવે", "ROAD": "રોડ", "STREET": "શેરી",
    "GROUND FLOOR": "ગ્રાઉન્ડ ફ્લોર", "G.F.": "ગ્રાઉન્ડ ફ્લોર", "GF": "ગ્રાઉન્ડ ફ્લોર",
    "FIRST FLOOR": "પહેલો માળ", "1ST FLOOR": "પહેલો માળ", "F.F.": "પહેલો માળ",
    "SECOND FLOOR": "બીજો માળ", "2ND FLOOR": "બીજો માળ", "THIRD FLOOR": "ત્રીજો માળ", "3RD FLOOR": "ત્રીજો માળ",
    "BASEMENT": "બેઝમેન્ટ", "HOSPITAL": "હોસ્પિટલ", "CLINIC": "ક્લિનિક",
    "MEDICAL": "મેડિકલ", "MEDICOSE": "મેડિકોઝ", "MEDICOS": "મેડિકોઝ",
    "PHARMACY": "ફાર્મસી", "CHEMIST": "કેમિસ્ટ", "CHEMISTS": "કેમિસ્ટ્સ",
    "DRUGGIST": "ડ્રગીસ્ટ", "AGENCY": "એજન્સી", "AGENCIES": "એજન્સીઝ",
    "HEALTHCARE": "હેલ્થકેર", "PHARMA": "ફાર્મા", "DISTRIBUTOR": "ડિસ્ટ્રીબ્યુટર", "DISTRIBUTORS": "ડિસ્ટ્રીબ્યુટર્સ",
    "LIFE CARE": "લાઇફ કેર", "LIFECARE": "લાઇફ કેર", "CARE": "કેર", "GENERAL": "જનરલ",
    "STORE": "સ્ટોર", "STORES": "સ્ટોર્સ", "PROVISION": "પ્રોવિઝન",
    "BUS STAND": "બસ સ્ટેન્ડ", "BUS STOP": "બસ સ્ટોપ", "STATION": "સ્ટેશન", "STATION ROAD": "સ્ટેશન રોડ",
    "SOCIETY": "સોસાયટી", "COLONY": "કોલોની", "APARTMENT": "એપાર્ટમેન્ટ", "FLAT": "ફ્લેટ",
    "CHOWK": "ચોક", "CIRCLE": "સર્કલ", "GIDC": "જી.આઈ.ડી.સી.", "TALUKA": "તા.", "TA.": "તા.", "DIST.": "જી.",
    "GUJARAT": "ગુજરાત", "RAJASTHAN": "રાજસ્થાન", "MAHARASHTRA": "મહારાષ્ટ્ર",
    "AHMEDABAD": "અમદાવાદ", "DEHGAM": "દહેગામ", "DAHEGAM": "દહેગામ", "GANDHINAGAR": "ગાંધીનગર",
    "VADODARA": "વડોદરા", "BARODA": "વડોદરા", "SURAT": "સુરત", "RAJKOT": "રાજકોટ",
    "BHAVNAGAR": "ભાવનગર", "JAMNAGAR": "જામનગર", "JUNAGADH": "જુનાગઢ", "MODASA": "મોડાસા",
    "HIMATNAGAR": "હિંમતનગર", "HIMMATNAGAR": "હિંમતનગર", "PALANPUR": "પાલનપુર",
    "MEHSANA": "મહેસાણા", "PATAN": "પાટણ", "ANAND": "આણંદ", "NADIAD": "નડિયાદ",
    "BHARUCH": "ભરૂચ", "NAVSARI": "નવસારી", "VALSAD": "વલસાડ", "KUTCH": "કચ્છ",
    "BHUJ": "ભુજ", "MORBI": "મોરબી", "PORBANDAR": "પોરબંદર", "AMRELI": "અમરેલી",
    "SURENDRANAGAR": "સુરેન્દ્રનગર", "JAISALMER": "જેસલમેર", "JODHPUR": "જોધપુર",
    "JAIPUR": "જયપુર", "KADI": "કડી", "KALOL": "કલોલ", "VIJAPUR": "વિજાપુર",
    "MANSA": "માણસા", "PRANTIJ": "પ્રાંતિજ", "TALOD": "તાલોદ", "BAYAD": "બાયડ",
    "SHREEJI": "શ્રીજી", "SHREE": "શ્રી", "MAHADEV": "મહાદેવ", "KRISHNA": "ક્રિષ્ના",
    "JAY": "જય", "JAI": "જય", "OM": "ઓમ", "SHIV": "શિવ", "APEX": "એપેક્સ"
}

def offline_fallback_translate(text: str) -> str:
    """Translates known address/pharma phrases into Gujarati even if offline."""
    if not text:
        return ""
    import re
    res = text
    # Sort keys by length descending to match multi-word phrases first
    sorted_keys = sorted(GUJARAT_TRANSLATION_DICT.keys(), key=lambda k: len(k), reverse=True)
    for k in sorted_keys:
        val = GUJARAT_TRANSLATION_DICT[k]
        pattern = r'\b' + re.escape(k) + r'\b'
        res = re.sub(pattern, val, res, flags=re.IGNORECASE)
    return res

def translate_party_to_gujarati(
    party_name: str,
    address: str,
    city: str,
    state: str,
    address_line_2: Optional[str] = None,
    address_line_3: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, str]:
    """
    Translates and transliterates party name, address lines 1, 2, 3, city, and state into Gujarati.
    Phonetically transliterates brand names (never literal word translations).
    Strictly keeps labels TO-, FROM-, CASE, BOX in English.
    """
    cache_key = f"{party_name}|{address}|{address_line_2 or ''}|{address_line_3 or ''}|{city}|{state}".strip().lower()
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]

    prompt = f"""You are a pharmaceutical dispatch transliterator for courier delivery envelopes in Gujarat, India.
Translate and transliterate the recipient medical store details into authentic, clean Gujarati script (ગુજરાતી).

CRITICAL TRANSLATION RULES:
1. NEVER translate proper nouns or brand names literally. Always transliterate them phonetically into Gujarati script.
   (Examples: "Apple Medical" -> "એપલ મેડિકલ" [NOT સફરજન], "Galaxy Pharma" -> "ગેલેક્સી ફાર્મા", "Shreeji Healthcare" -> "શ્રીજી હેલ્થકેર").
2. Accurately translate delivery landmarks and prepositions:
   - "Near" or "Nr." -> "પાસે"
   - "Opp." or "Opposite" -> "સામે"
   - "Behind" or "B/H" -> "પાછળ"
   - "Beside" or "Next to" -> "બાજુમાં"
   - "Cross Road" or "Char Rasta" -> "ચાર રસ્તા"
   - "Complex" -> "કોમ્પ્લેક્ષ"
   - "Road" -> "રોડ"
   - "Shop" -> "શોપ"
3. DO NOT translate headers like TO-, FROM-, CASE, BOX, WEIGHT, KG. Only translate the party address details.
4. Translate all 3 address lines (Line 1, Line 2, Line 3) accurately so courier delivery staff can easily find the premises.
5. Output strictly valid JSON matching this schema:
{{
  "party_name_gu": "...",
  "address_gu": "...",
  "address_line_2_gu": "...",
  "address_line_3_gu": "...",
  "city_gu": "...",
  "state_gu": "..."
}}

Input details to translate:
- Party Name: {party_name}
- Address: {address}
- Address Line 2: {address_line_2 or ''}
- Address Line 3: {address_line_3 or ''}
- City: {city}
- State: {state}
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        res = _call_gemini_api(payload, api_key=api_key)
        raw_text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
        parsed = json.loads(raw_text)
        result = {
            "party_name_gu": parsed.get("party_name_gu") or offline_fallback_translate(party_name),
            "address_gu": parsed.get("address_gu") or offline_fallback_translate(address),
            "address_line_2_gu": parsed.get("address_line_2_gu") or offline_fallback_translate(address_line_2 or ""),
            "address_line_3_gu": parsed.get("address_line_3_gu") or offline_fallback_translate(address_line_3 or ""),
            "city_gu": parsed.get("city_gu") or offline_fallback_translate(city),
            "state_gu": parsed.get("state_gu") or offline_fallback_translate(state),
        }
        _TRANSLATION_CACHE[cache_key] = result
        return result
    except Exception as e:
        print("Gemini Gujarati translation note, using dictionary fallback:", e)
        fallback_res = {
            "party_name_gu": offline_fallback_translate(party_name),
            "address_gu": offline_fallback_translate(address),
            "address_line_2_gu": offline_fallback_translate(address_line_2 or ""),
            "address_line_3_gu": offline_fallback_translate(address_line_3 or ""),
            "city_gu": offline_fallback_translate(city),
            "state_gu": offline_fallback_translate(state),
        }
        _TRANSLATION_CACHE[cache_key] = fallback_res
        return fallback_res

def parse_unstructured_marg_data(raw_text: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Intelligently extracts party, invoice, and dispatch details from pasted MARG ERP text,
    WhatsApp bill shares, or invoice summaries.
    """
    prompt = f"""You are an intelligent data parser for MARG ERP 9+ pharmaceutical accounting software.
Analyze the following unstructured text copied from a MARG invoice, ledger, or courier dispatch slip.
Extract the structured party and parcel fields.

Text:
\"\"\"
{raw_text}
\"\"\"

Respond strictly in valid JSON with these fields:
{{
  "party_name": "...",
  "party_code": "...",
  "address": "...",
  "address_line_2": "...",
  "address_line_3": "...",
  "city": "...",
  "state": "...",
  "mobile_no": "...",
  "gst_no": "...",
  "total_cases": 1,
  "parcel_type": "Medicine",
  "notes": "..."
}}
If a field is not found, set it to empty string or appropriate default.
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        res = _call_gemini_api(payload, api_key=api_key)
        raw_text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
        parsed = json.loads(raw_text)
        return parsed
    except Exception as e:
        raise RuntimeError(f"AI parsing failed: {e}")
