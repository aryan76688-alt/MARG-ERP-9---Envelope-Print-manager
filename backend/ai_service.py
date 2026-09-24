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

PRIMARY_MODEL = "models/gemini-flash-lite-latest"
FALLBACK_MODELS = [
    "models/gemini-flash-lite-latest",
    "models/gemini-3.5-flash-lite",
    "models/gemini-3.1-flash-lite",
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
    Translates/transliterates party name, address, and city into Gujarati for delivery envelopes.
    Maintains pharma/medical phonetics (e.g. Pharmacy -> ફાર્મસી, Healthcare -> હેલ્થકેર, Chemist -> કેમિસ્ટ).
    """
    cache_key = f"{party_name}|{address}|{city}|{state}".strip().lower()
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]

    prompt = f"""You are a professional translator and transliterator for pharmaceutical delivery envelopes in Gujarat, India.
Translate and transliterate the following medical store delivery details from English into Gujarati script (ગુજરાતી).

Rules:
1. Maintain phonetic accuracy for medical store names (e.g. "Pharmacy" -> "ફાર્મસી", "Medical Store" -> "મેડિકલ સ્ટોર", "Healthcare" -> "હેલ્થકેર", "Chemist" -> "કેમિસ્ટ", "Agency" -> "એજન્સી").
2. Translate standard city and state names into Gujarati (e.g. "NARODA" -> "નરોડા", "AHMEDABAD" -> "અમદાવાદ", "GUJARAT" -> "ગુજરાત", "DEHGAM" -> "દહેગામ", "VADODARA" -> "વડોદરા", "SURAT" -> "સુરત", "RAJKOT" -> "રાજકોટ").
3. Transliterate street addresses, complex names, shop numbers so local Gujarati delivery boys can easily read and locate the shop.
4. Output strictly valid JSON matching this schema:
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
            "party_name_gu": parsed.get("party_name_gu") or party_name,
            "address_gu": parsed.get("address_gu") or address,
            "address_line_2_gu": parsed.get("address_line_2_gu") or (address_line_2 or ""),
            "address_line_3_gu": parsed.get("address_line_3_gu") or (address_line_3 or ""),
            "city_gu": parsed.get("city_gu") or city,
            "state_gu": parsed.get("state_gu") or state,
        }
        _TRANSLATION_CACHE[cache_key] = result
        return result
    except Exception as e:
        print("Gemini Gujarati translation error:", e)
        # Fallback to original text if offline
        return {
            "party_name_gu": party_name,
            "address_gu": address,
            "address_line_2_gu": address_line_2 or "",
            "address_line_3_gu": address_line_3 or "",
            "city_gu": city,
            "state_gu": state,
        }

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
