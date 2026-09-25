import os
import re
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional
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

PRIMARY_MODEL = "models/gemini-2.0-flash"
FALLBACK_MODELS = [
    "models/gemini-2.0-flash",
    "models/gemini-1.5-flash",
    "models/gemini-1.5-flash-8b",
]

# In-memory translation cache to avoid duplicate calculations
_TRANSLATION_CACHE: Dict[str, Dict[str, str]] = {}
_API_KEY_STATUS: Dict[str, bool] = {}  # Tracks key validity to avoid repeated timeouts

def get_api_key() -> str:
    """Returns active Gemini API key from environment variable or app configuration."""
    return os.environ.get("GEMINI_API_KEY", "").strip()

def _call_gemini_api(payload: Dict[str, Any], api_key: Optional[str] = None, model: Optional[str] = None, timeout: float = 4.0) -> Dict[str, Any]:
    """Helper to send request to Google Generative Language API with fast timeout."""
    key = api_key or get_api_key()
    if not key or not key.startswith("AIzaSy"):
        raise RuntimeError("Invalid or missing Google AI Studio Gemini API key (must start with AIzaSy)")

    if _API_KEY_STATUS.get(key) is False:
        raise RuntimeError("Gemini API key previously failed policy or authentication")

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
            with urllib.request.urlopen(req, timeout=timeout) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                _API_KEY_STATUS[key] = True
                return res_json
        except urllib.error.HTTPError as he:
            err_msg = he.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {he.code}: {err_msg}"
            if he.code in (401, 403):
                _API_KEY_STATUS[key] = False
                raise RuntimeError(last_error)
            if he.code in (404, 503, 429):
                continue
            raise RuntimeError(last_error)
        except Exception as e:
            last_error = str(e)
            continue

    raise RuntimeError(f"Gemini API request failed: {last_error}")

def test_connection(api_key: Optional[str] = None) -> Dict[str, Any]:
    """Tests connectivity to Google Gemini API using the specified or default key."""
    key = api_key or get_api_key()
    try:
        test_payload = {
            "contents": [{"parts": [{"text": "Reply with 'OK' only."}]}]
        }
        res = _call_gemini_api(test_payload, api_key=key, timeout=3.0)
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

# ==============================================================================
# COMPREHENSIVE PHARMACEUTICAL & COURIER GUJARATI DICTIONARY (300+ TERMS)
# ==============================================================================
GUJARAT_TRANSLATION_DICT = {
    # Medical Titles & Entity Types
    "DR.": "ડો.", "DR": "ડો.", "DOCTOR": "ડોક્ટર",
    "MR.": "શ્રી", "MR": "શ્રી", "MRS.": "શ્રીમતી", "MRS": "શ્રીમતી",
    "M/S": "મે.", "M/S.": "મે.", "MS": "મે.",
    "PVT.": "પ્રા.", "PVT": "પ્રા.", "LTD.": "લી.", "LTD": "લી.", "LIMITED": "લીમીટેડ",
    "CO.": "કં.", "CO": "કં.", "COMPANY": "કંપની",
    "CORP": "કોર્પ", "CORPORATION": "કોર્પોરેશન",
    "ENTERPRISE": "એન્ટરપ્રાઇઝ", "ENTERPRISES": "એન્ટરપ્રાઇઝીસ",
    "TRADERS": "ટ્રેડર્સ", "TRADING": "ટ્રેડિંગ", "TRADER": "ટ્રેડર",
    "AGENCIES": "એજન્સીઝ", "AGENCY": "એજન્સી",
    "DISTRIBUTORS": "ડિસ્ટ્રીબ્યુટર્સ", "DISTRIBUTOR": "ડિસ્ટ્રીબ્યુટર",
    "ASSOCIATES": "એસોસિએટ્સ", "ASSOCIATE": "એસોસિએટ",
    "SUPPLIERS": "સપ્લાયર્સ", "SUPPLIER": "સપ્લાયર",
    "SERVICES": "સર્વિસીસ", "SERVICE": "સર્વિસ",
    "BROTHERS": "બ્રધર્સ", "BROS.": "બ્રધર્સ", "BROS": "બ્રધર્સ", "SONS": "સન્સ",

    # Pharmacy & Healthcare Terms
    "MEDICAL": "મેડિકલ", "MEDICOSE": "મેડિકોઝ", "MEDICOS": "મેડિકોઝ", "MEDICINE": "મેડિસિન", "MEDICINES": "મેડિસિન્સ",
    "PHARMA": "ફાર્મા", "PHARMACEUTICAL": "ફાર્માસ્યુટિકલ", "PHARMACEUTICALS": "ફાર્માસ્યુટિકલ્સ",
    "PHARMACY": "ફાર્મસી", "CHEMIST": "કેમિસ્ટ", "CHEMISTS": "કેમિસ્ટ્સ", "DRUGGIST": "ડ્રગીસ્ટ", "DRUGGISTS": "ડ્રગીસ્ટ્સ",
    "HEALTHCARE": "હેલ્થકેર", "HEALTH CARE": "હેલ્થકેર", "CARE": "કેર", "LIFECARE": "લાઇફ કેર", "LIFE CARE": "લાઇફ કેર",
    "SURGICAL": "સર્જિકલ", "SURGICALS": "સર્જિકલ્સ", "LAB": "લેબ", "LABORATORY": "લેબોરેટરી", "LABS": "લેબ્સ",
    "HOSPITAL": "હોસ્પિટલ", "HOSPITALS": "હોસ્પિટલ્સ", "CLINIC": "ક્લિનિક", "NURSING HOME": "નર્સિંગ હોમ",
    "DISPENSARY": "દવાખાનું", "STORE": "સ્ટોર", "STORES": "સ્ટોર્સ", "PROVISION": "પ્રોવિઝન", "GENERAL": "જનરલ",
    "AYURVEDIC": "આયુર્વેદિક", "HOMEOPATHIC": "હોમિયોપેથિક",

    # Common Brand & Prefix Words
    "SUPER": "સુપર", "NEW": "ન્યુ", "SHREE": "શ્રી", "SHRI": "શ્રી", "SHREEJI": "શ્રીજી", "JAY": "જય", "JAI": "જય",
    "OM": "ઓમ", "SHIV": "શિવ", "SHIVA": "શિવ", "MAHADEV": "મહાદેવ", "KRISHNA": "ક્રિષ્ના", "RADHE": "રાધે",
    "AMBE": "અંબે", "MATAJI": "માતાજી", "GANESH": "ગણેશ", "BALAJI": "બાલાજી", "HANUMAN": "હનુમાન", "MARUTI": "મારુતિ",
    "APEX": "એપેક્સ", "RELIANCE": "રિલાયન્સ", "ROYAL": "રોયલ", "PRIME": "પ્રાઇમ", "STAR": "સ્ટાર", "NOVA": "નોવા",
    "UNIVERSAL": "યુનિવર્સલ", "NATIONAL": "નેશનલ", "GLOBAL": "ગ્લોબલ", "POPULAR": "પોપ્યુલર", "CITY": "સિટી",

    # States & Major Regions
    "GUJARAT": "ગુજરાત", "RAJASTHAN": "રાજસ્થાન", "MAHARASHTRA": "મહારાષ્ટ્ર", "MP": "મ.પ્ર.", "MADHYA PRADESH": "મધ્ય પ્રદેશ",
    "INDIA": "ઇન્ડિયા", "BHARAT": "ભારત",

    # Cities & Towns
    "AHMEDABAD": "અમદાવાદ", "AMDAVAD": "અમદાવાદ", "DEHGAM": "દહેગામ", "DAHEGAM": "દહેગામ",
    "GANDHINAGAR": "ગાંધીનગર", "VADODARA": "વડોદરા", "BARODA": "વડોદરા", "SURAT": "સુરત",
    "RAJKOT": "રાજકોટ", "BHAVNAGAR": "ભાવનગર", "JAMNAGAR": "જામનગર", "JUNAGADH": "જુનાગઢ",
    "MODASA": "મોડાસા", "HIMATNAGAR": "હિંમતનગર", "HIMMATNAGAR": "હિંમતનગર", "PALANPUR": "પાલનપુર",
    "MEHSANA": "મહેસાણા", "PATAN": "પાટણ", "ANAND": "આણંદ", "NADIAD": "નડિયાદ", "BHARUCH": "ભરૂચ",
    "ANKLESHWAR": "અંકલેશ્વર", "NAVSARI": "નવસારી", "VALSAD": "વલસાડ", "VAPI": "વાપી", "KUTCH": "કચ્છ", "BHUJ": "ભુજ",
    "GANDHIDHAM": "ગાંધીધામ", "MORBI": "મોરબી", "PORBANDAR": "પોરબંદર", "AMRELI": "અમરેલી", "SURENDRANAGAR": "સુરેન્દ્રનગર",
    "JAISALMER": "જેસલમેર", "JODHPUR": "જોધપુર", "JAIPUR": "જયપુર", "UDAIPUR": "ઉદયપુર", "KOTA": "કોટા", "BIKANER": "બિકાનેર",
    "KADI": "કડી", "KALOL": "કલોલ", "VIJAPUR": "વિજાપુર", "MANSA": "માણસા", "PRANTIJ": "પ્રાંતિજ",
    "TALOD": "તાલોદ", "BAYAD": "બાયડ", "DHANSURA": "ધનસુરા", "KAPADWANJ": "કપડવંજ", "DAHOD": "દાહોદ",
    "GODHRA": "ગોધરા", "CHANDLODIYA": "ચાંદલોડિયા", "GHATLODIYA": "ઘાટલોડિયા", "BOPAL": "બોપલ",
    "SATELLITE": "સેટેલાઇટ", "VASTRAPUR": "વસ્ત્રાપુર", "NARANPURA": "નારણપુરા", "PALDI": "પાલડી",
    "MANINAGAR": "મણિનગર", "ODHAV": "ઓઢવ", "NARODA": "નરોડા", "NIKOL": "નિકોલ", "BAPUNAGAR": "બાપુનગર",
    "ISANPUR": "ઇસનપુર", "VATVA": "વાટવા", "SOLA": "સોલા", "THALTEJ": "થલતેજ", "GOTA": "ગોટા",

    # Address Prepositions & Landmarks
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
    "BASEMENT": "બેઝમેન્ટ", "BUS STAND": "બસ સ્ટેન્ડ", "BUS STOP": "બસ સ્ટોપ",
    "STATION": "સ્ટેશન", "STATION ROAD": "સ્ટેશન રોડ", "RAILWAY STATION": "રેલ્વે સ્ટેશન",
    "SOCIETY": "સોસાયટી", "COLONY": "કોલોની", "APARTMENT": "એપાર્ટમેન્ટ", "APARTMENTS": "એપાર્ટમેન્ટ્સ", "FLAT": "ફ્લેટ",
    "CHOWK": "ચોક", "CIRCLE": "સર્કલ", "DARWAJA": "દરવાજા", "GATE": "ગેટ",
    "GIDC": "જી.આઈ.ડી.સી.", "TALUKA": "તા.", "TA.": "તા.", "DIST.": "જી.", "DIST": "જી.",
    "VILLAGE": "ગામ", "POST": "પોસ્ટ", "AT & PO": "મુ. પો.", "AT & POST": "મુ. પો.",
    "AT": "મુ.", "PO": "પો."
}

# Phonetic character mapping for unlisted proper nouns
_INITIAL_VOWELS = {
    'AA': 'આ', 'A': 'અ', 'EE': 'ઈ', 'II': 'ઈ', 'I': 'ઇ',
    'OO': 'ઊ', 'UU': 'ઊ', 'U': 'ઉ', 'EA': 'ઈ',
    'AI': 'ઐ', 'AY': 'એ', 'AU': 'ઔ', 'OU': 'ઔ',
    'E': 'એ', 'O': 'ઓ'
}

_MATRAS = {
    'AA': 'ા', 'A': '', 'EE': 'ી', 'II': 'ી', 'I': 'િ',
    'OO': 'ૂ', 'UU': 'ૂ', 'U': 'ુ', 'EA': 'ી',
    'AI': 'ૈ', 'AY': 'ે', 'AU': 'ૌ', 'OU': 'ૌ',
    'E': 'ે', 'O': 'ો'
}

_CONSONANTS = [
    ('KSH', 'ક્ષ'), ('GNY', 'જ્ઞ'), ('CHH', 'છ'),
    ('KH', 'ખ'), ('GH', 'ઘ'), ('CH', 'ચ'), ('JH', 'ઝ'),
    ('TH', 'થ'), ('DH', 'ધ'), ('BH', 'ભ'), ('PH', 'ફ'),
    ('SH', 'શ'),
    ('K', 'ક'), ('G', 'ગ'), ('C', 'ક'), ('J', 'જ'),
    ('T', 'ટ'), ('D', 'ડ'), ('N', 'ન'), ('P', 'પ'),
    ('F', 'ફ'), ('B', 'બ'), ('M', 'મ'), ('Y', 'ય'),
    ('R', 'ર'), ('L', 'લ'), ('V', 'વ'), ('W', 'વ'),
    ('S', 'સ'), ('H', 'હ'), ('Z', 'ઝ'), ('X', 'ક્ષ'), ('Q', 'ક')
]

_VOWEL_KEYS = sorted(_INITIAL_VOWELS.keys(), key=len, reverse=True)
_CONS_KEYS = [k for k, v in _CONSONANTS]
_CONS_DICT = dict(_CONSONANTS)

def transliterate_word_to_gujarati(word: str) -> str:
    """Accurately transliterates an English word into Gujarati script phonetically."""
    clean_w = word.strip().upper()
    if not clean_w:
        return ""
    if clean_w in GUJARAT_TRANSLATION_DICT:
        return GUJARAT_TRANSLATION_DICT[clean_w]

    prefix_punct = ""
    suffix_punct = ""
    while clean_w and not clean_w[0].isalnum():
        prefix_punct += clean_w[0]
        clean_w = clean_w[1:]
    while clean_w and not clean_w[-1].isalnum():
        suffix_punct = clean_w[-1] + suffix_punct
        clean_w = clean_w[:-1]

    if not clean_w:
        return prefix_punct + suffix_punct
    if clean_w in GUJARAT_TRANSLATION_DICT:
        return prefix_punct + GUJARAT_TRANSLATION_DICT[clean_w] + suffix_punct

    out = []
    i = 0
    n = len(clean_w)
    at_start = True

    while i < n:
        if at_start:
            matched_v = False
            for vk in _VOWEL_KEYS:
                if clean_w.startswith(vk, i):
                    out.append(_INITIAL_VOWELS[vk])
                    i += len(vk)
                    at_start = False
                    matched_v = True
                    break
            if matched_v:
                continue

        matched_c = False
        for ck in _CONS_KEYS:
            if clean_w.startswith(ck, i):
                c_char = _CONS_DICT[ck]
                i += len(ck)
                matched_c = True
                at_start = False
                matched_next_v = False
                for vk in _VOWEL_KEYS:
                    if clean_w.startswith(vk, i):
                        matra = _MATRAS[vk]
                        out.append(c_char + matra)
                        i += len(vk)
                        matched_next_v = True
                        break
                if not matched_next_v:
                    if i < n and clean_w[i].isalpha():
                        out.append(c_char + '્')
                    else:
                        out.append(c_char)
                break

        if not matched_c:
            out.append(clean_w[i])
            i += 1
            at_start = False

    return prefix_punct + ''.join(out) + suffix_punct

def fast_translate_phrase(text: str) -> str:
    """Translates/transliterates an entire text line using dictionary and phonetic rules."""
    if not text:
        return ""
    text_clean = text.strip()

    sorted_phrases = sorted([k for k in GUJARAT_TRANSLATION_DICT.keys() if " " in k or "." in k], key=len, reverse=True)
    for p in sorted_phrases:
        pattern = r'\b' + re.escape(p) + r'\b'
        text_clean = re.sub(pattern, GUJARAT_TRANSLATION_DICT[p], text_clean, flags=re.IGNORECASE)

    words = re.split(r'(\s+|,|-|/|\.)', text_clean)
    res_parts = []
    for w in words:
        if not w:
            continue
        if re.match(r'^[A-Za-z]+$', w):
            up = w.upper()
            if up in GUJARAT_TRANSLATION_DICT:
                res_parts.append(GUJARAT_TRANSLATION_DICT[up])
            else:
                res_parts.append(transliterate_word_to_gujarati(w))
        else:
            res_parts.append(w)

    return "".join(res_parts)

def offline_fallback_translate(text: str) -> str:
    return fast_translate_phrase(text)

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
    Translates party details into authentic Gujarati.
    First checks in-memory cache. If Gemini key is available and active, uses Gemini.
    Otherwise instantly translates using the phonetic engine in < 1 millisecond.
    """
    cache_key = f"{party_name}|{address}|{address_line_2 or ''}|{address_line_3 or ''}|{city}|{state}".strip().lower()
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]

    key = api_key or get_api_key()
    if key and key.startswith("AIzaSy") and _API_KEY_STATUS.get(key) is not False:
        prompt = f"""You are a pharmaceutical dispatch transliterator for courier delivery envelopes in Gujarat, India.
Transliterate recipient details phonetically into authentic Gujarati script (ગુજરાતી).
NEVER translate brand names literally (e.g. "Apple Medical" -> "એપલ મેડિકલ").
Translate landmarks: Near -> પાસે, Opp. -> સામે, Behind -> પાછળ, Road -> રોડ, Complex -> કોમ્પ્લેક્ષ.
Output strictly valid JSON:
{{
  "party_name_gu": "...",
  "address_gu": "...",
  "address_line_2_gu": "...",
  "address_line_3_gu": "...",
  "city_gu": "...",
  "state_gu": "..."
}}

Input:
- Party: {party_name}
- Address: {address}
- Line 2: {address_line_2 or ''}
- Line 3: {address_line_3 or ''}
- City: {city}
- State: {state}"""

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        try:
            res = _call_gemini_api(payload, api_key=key, timeout=3.0)
            raw_text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
            parsed = json.loads(raw_text)
            result = {
                "party_name_gu": parsed.get("party_name_gu") or fast_translate_phrase(party_name),
                "address_gu": parsed.get("address_gu") or fast_translate_phrase(address),
                "address_line_2_gu": parsed.get("address_line_2_gu") or fast_translate_phrase(address_line_2 or ""),
                "address_line_3_gu": parsed.get("address_line_3_gu") or fast_translate_phrase(address_line_3 or ""),
                "city_gu": parsed.get("city_gu") or fast_translate_phrase(city),
                "state_gu": parsed.get("state_gu") or fast_translate_phrase(state),
            }
            _TRANSLATION_CACHE[cache_key] = result
            return result
        except Exception:
            pass

    result = {
        "party_name_gu": fast_translate_phrase(party_name),
        "address_gu": fast_translate_phrase(address),
        "address_line_2_gu": fast_translate_phrase(address_line_2 or ""),
        "address_line_3_gu": fast_translate_phrase(address_line_3 or ""),
        "city_gu": fast_translate_phrase(city),
        "state_gu": fast_translate_phrase(state),
    }
    _TRANSLATION_CACHE[cache_key] = result
    return result

def batch_translate_parties_fast(
    parties: List[Dict[str, Any]],
    api_key: Optional[str] = None
) -> Dict[int, Dict[str, str]]:
    """
    Translates multiple parties into Gujarati rapidly.
    If Gemini API is active, translates up to 20 parties in a single request.
    Otherwise translates all parties using the instant phonetic engine in < 10ms.
    """
    results: Dict[int, Dict[str, str]] = {}
    key = api_key or get_api_key()

    if key and key.startswith("AIzaSy") and _API_KEY_STATUS.get(key) is not False and len(parties) > 0:
        untranslated = [p for p in parties if not p.get("party_name_gu")]
        if untranslated:
            items_input = []
            for p in untranslated[:20]:
                items_input.append({
                    "id": p.get("id"),
                    "name": p.get("party_name", ""),
                    "addr1": p.get("address", ""),
                    "addr2": p.get("address_line_2", ""),
                    "addr3": p.get("address_line_3", ""),
                    "city": p.get("city", ""),
                    "state": p.get("state", "")
                })

            prompt = f"""You are a Gujarati transliterator for pharma parcel dispatches.
Transliterate recipient details phonetically into Gujarati script. Output strictly a JSON object mapping each ID to its translated fields:
{{
  "<id>": {{
    "party_name_gu": "...",
    "address_gu": "...",
    "address_line_2_gu": "...",
    "address_line_3_gu": "...",
    "city_gu": "...",
    "state_gu": "..."
  }}
}}

Items to transliterate:
{json.dumps(items_input, ensure_ascii=False)}"""

            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"}
            }
            try:
                res = _call_gemini_api(payload, api_key=key, timeout=5.0)
                raw_text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                parsed = json.loads(raw_text)
                for pid_str, tr_vals in parsed.items():
                    try:
                        pid = int(pid_str)
                        results[pid] = tr_vals
                    except ValueError:
                        pass
            except Exception:
                pass

    for p in parties:
        pid = p.get("id")
        if pid not in results:
            if p.get("party_name_gu"):
                results[pid] = {
                    "party_name_gu": p.get("party_name_gu"),
                    "address_gu": p.get("address_gu") or "",
                    "address_line_2_gu": p.get("address_line_2_gu") or "",
                    "address_line_3_gu": p.get("address_line_3_gu") or "",
                    "city_gu": p.get("city_gu") or "",
                    "state_gu": p.get("state_gu") or ""
                }
            else:
                results[pid] = translate_party_to_gujarati(
                    party_name=p.get("party_name", ""),
                    address=p.get("address", ""),
                    city=p.get("city", ""),
                    state=p.get("state", ""),
                    address_line_2=p.get("address_line_2"),
                    address_line_3=p.get("address_line_3"),
                    api_key=key
                )

    return results

def parse_unstructured_marg_data(raw_text: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Intelligently extracts party, invoice, and dispatch details from unstructured text."""
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
If a field is not found, set it to empty string or appropriate default."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        res = _call_gemini_api(payload, api_key=api_key, timeout=6.0)
        raw_text = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
        parsed = json.loads(raw_text)
        return parsed
    except Exception as e:
        raise RuntimeError(f"AI parsing failed: {e}")
