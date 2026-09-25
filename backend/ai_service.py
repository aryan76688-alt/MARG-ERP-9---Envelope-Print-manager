import os
import re
import json
import time
import threading
import urllib.request
import urllib.parse
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

_BG_WORKER_RUNNING = False
_BG_WORKER_LOCK = threading.Lock()
_BG_STATS = {"total": 0, "processed": 0, "status": "idle"}

def google_translate_free(text: str, target_lang: str = "gu", max_retries: int = 3) -> str:
    """
    Translates English text into authentic Gujarati using Google Translate without API keys.
    Uses English source detection ('sl=en'), segments joining, Title-Case fallback for acronyms,
    and automatic retries for complete reliability and accuracy.
    """
    if not text or not text.strip():
        return ""
    clean_text = text.strip()
    cache_key = f"gt:{clean_text.lower()}"
    if cache_key in _TRANSLATION_CACHE and isinstance(_TRANSLATION_CACHE[cache_key], str):
        return _TRANSLATION_CACHE[cache_key]

    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q=" + urllib.parse.quote(clean_text)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*"
        }
    )

    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data and data[0]:
                    translated = "".join([c[0] for c in data[0] if c and c[0]]).strip()
                    if translated:
                        # If string remains pure Latin letters without Gujarati characters, retry with Title Case
                        if re.search(r'[A-Za-z]', translated) and not re.search(r'[\u0A80-\u0AFF]', translated):
                            title_url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q=" + urllib.parse.quote(clean_text.title())
                            title_req = urllib.request.Request(title_url, headers=req.headers)
                            with urllib.request.urlopen(title_req, timeout=10) as t_resp:
                                t_data = json.loads(t_resp.read().decode("utf-8"))
                                if t_data and t_data[0]:
                                    t_trans = "".join([c[0] for c in t_data[0] if c and c[0]]).strip()
                                    if t_trans and re.search(r'[\u0A80-\u0AFF]', t_trans):
                                        _TRANSLATION_CACHE[cache_key] = t_trans
                                        return t_trans

                        _TRANSLATION_CACHE[cache_key] = translated
                        return translated
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1.0 * (attempt + 1))

    # Ultimate offline dictionary fallback
    fallback = fast_translate_phrase(clean_text)
    _TRANSLATION_CACHE[cache_key] = fallback
    return fallback

def google_translate_batch_free(texts: List[str], target_lang: str = "gu", chunk_size: int = 12) -> List[str]:
    """
    Translates a list of strings reliably using Google Translate with delimiter-preserving batching.
    Uses ' ||| ' delimiter so Google leaves separators untouched, guaranteeing exact 1-to-1 mapping.
    """
    if not texts:
        return []

    results = ["" for _ in texts]
    non_empty_indices = [i for i, t in enumerate(texts) if t and str(t).strip()]
    if not non_empty_indices:
        return results

    delim = " ||| "

    for i in range(0, len(non_empty_indices), chunk_size):
        chunk_indices = non_empty_indices[i:i + chunk_size]
        chunk_texts = [str(texts[idx]).strip() for idx in chunk_indices]

        # Check in-memory cache first for all items in chunk
        unresolved_sub_indices = []
        for c_idx, t_str in zip(chunk_indices, chunk_texts):
            c_key = f"gt:{t_str.lower()}"
            if c_key in _TRANSLATION_CACHE and isinstance(_TRANSLATION_CACHE[c_key], str):
                results[c_idx] = _TRANSLATION_CACHE[c_key]
            else:
                unresolved_sub_indices.append((c_idx, t_str))

        if not unresolved_sub_indices:
            continue

        sub_orig_indices = [item[0] for item in unresolved_sub_indices]
        sub_texts = [item[1] for item in unresolved_sub_indices]

        combined = delim.join(sub_texts)
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q=" + urllib.parse.quote(combined)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        )

        translated_chunk = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data and data[0]:
                        full = "".join([c[0] for c in data[0] if c and c[0]]).strip()
                        parts = full.split("|||")
                        if len(parts) == len(sub_texts):
                            translated_chunk = [p.strip() for p in parts]
                            break
            except Exception:
                time.sleep(1.0)

        if translated_chunk and len(translated_chunk) == len(sub_texts):
            for orig_idx, orig_text, trans in zip(sub_orig_indices, sub_texts, translated_chunk):
                # If an item still has Latin characters without Gujarati, try single translation
                if re.search(r'[A-Za-z]', trans) and not re.search(r'[\u0A80-\u0AFF]', trans):
                    trans = google_translate_free(orig_text, target_lang=target_lang)
                results[orig_idx] = trans
                _TRANSLATION_CACHE[f"gt:{orig_text.lower()}"] = trans
        else:
            # Fallback to single translate for unresolved items in this chunk
            for orig_idx, orig_text in zip(sub_orig_indices, sub_texts):
                trans = google_translate_free(orig_text, target_lang=target_lang)
                results[orig_idx] = trans
                _TRANSLATION_CACHE[f"gt:{orig_text.lower()}"] = trans

        time.sleep(0.15)

    return results

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
    Translates party details into authentic Gujarati using Google Translator (no API key required).
    """
    cache_key = f"{party_name}|{address}|{address_line_2 or ''}|{address_line_3 or ''}|{city}|{state}".strip().lower()
    if cache_key in _TRANSLATION_CACHE and isinstance(_TRANSLATION_CACHE[cache_key], dict):
        return _TRANSLATION_CACHE[cache_key]

    raw_items = [
        party_name or "",
        address or "",
        address_line_2 or "",
        address_line_3 or "",
        city or "",
        state or ""
    ]
    translated = google_translate_batch_free(raw_items, target_lang="gu")

    res = {
        "party_name_gu": translated[0] or fast_translate_phrase(party_name),
        "address_gu": translated[1] or fast_translate_phrase(address),
        "address_line_2_gu": translated[2] or (fast_translate_phrase(address_line_2) if address_line_2 else ""),
        "address_line_3_gu": translated[3] or (fast_translate_phrase(address_line_3) if address_line_3 else ""),
        "city_gu": translated[4] or fast_translate_phrase(city),
        "state_gu": translated[5] or fast_translate_phrase(state),
    }
    _TRANSLATION_CACHE[cache_key] = res
    return res

def batch_translate_parties_fast(
    parties: List[Dict[str, Any]],
    api_key: Optional[str] = None
) -> Dict[int, Dict[str, str]]:
    """
    Translates multiple parties into Gujarati reliably using delimiter-preserving Google Translator.
    """
    results: Dict[int, Dict[str, str]] = {}
    to_translate = []

    for p in parties:
        pid = p.get("id")
        if p.get("party_name_gu") and p.get("address_gu"):
            results[pid] = {
                "party_name_gu": p.get("party_name_gu"),
                "address_gu": p.get("address_gu") or "",
                "address_line_2_gu": p.get("address_line_2_gu") or "",
                "address_line_3_gu": p.get("address_line_3_gu") or "",
                "city_gu": p.get("city_gu") or "",
                "state_gu": p.get("state_gu") or ""
            }
        else:
            to_translate.append(p)

    chunk_size = 5
    for i in range(0, len(to_translate), chunk_size):
        chunk = to_translate[i:i + chunk_size]
        flat_texts = []
        for p in chunk:
            flat_texts.append(p.get("party_name") or "")
            flat_texts.append(p.get("address") or "")
            flat_texts.append(p.get("address_line_2") or "")
            flat_texts.append(p.get("address_line_3") or "")
            flat_texts.append(p.get("city") or "")
            flat_texts.append(p.get("state") or "")

        translated_flat = google_translate_batch_free(flat_texts, target_lang="gu")
        idx = 0
        for p in chunk:
            pid = p.get("id")
            results[pid] = {
                "party_name_gu": translated_flat[idx] or fast_translate_phrase(p.get("party_name", "")),
                "address_gu": translated_flat[idx + 1] or fast_translate_phrase(p.get("address", "")),
                "address_line_2_gu": translated_flat[idx + 2],
                "address_line_3_gu": translated_flat[idx + 3],
                "city_gu": translated_flat[idx + 4] or fast_translate_phrase(p.get("city", "")),
                "state_gu": translated_flat[idx + 5] or fast_translate_phrase(p.get("state", ""))
            }
            idx += 6

    return results

def start_background_translation_worker(get_db_session_fn, force: bool = False) -> bool:
    """
    Spawns a background thread to translate any parties in SQLite
    that don't have Gujarati translation yet (or all parties if force=True),
    using Google Translator without API.
    """
    global _BG_WORKER_RUNNING, _BG_STATS
    with _BG_WORKER_LOCK:
        if _BG_WORKER_RUNNING:
            return False
        _BG_WORKER_RUNNING = True
        _BG_STATS = {"total": 0, "processed": 0, "status": "running"}

    def _worker():
        global _BG_WORKER_RUNNING, _BG_STATS
        try:
            db = get_db_session_fn()
            try:
                from models import Party
                query = db.query(Party)
                if not force:
                    query = query.filter(
                        (Party.party_name_gu == None) | (Party.party_name_gu == "") |
                        (Party.address_gu == None) | (Party.address_gu == "")
                    )
                parties_to_process = query.all()

                _BG_STATS["total"] = len(parties_to_process)
                if not parties_to_process:
                    _BG_STATS["status"] = "completed"
                    return

                batch_size = 5  # 5 parties * 6 fields = 30 fields, chunked in batches of 12
                for i in range(0, len(parties_to_process), batch_size):
                    chunk = parties_to_process[i:i + batch_size]
                    flat_texts = []
                    for p in chunk:
                        flat_texts.append(p.party_name or "")
                        flat_texts.append(p.address or "")
                        flat_texts.append(p.address_line_2 or "")
                        flat_texts.append(p.address_line_3 or "")
                        flat_texts.append(p.city or "")
                        flat_texts.append(p.state or "")

                    translated_flat = google_translate_batch_free(flat_texts, target_lang="gu")
                    idx = 0
                    for p in chunk:
                        p.party_name_gu = translated_flat[idx] or fast_translate_phrase(p.party_name)
                        p.address_gu = translated_flat[idx + 1] or fast_translate_phrase(p.address)
                        p.address_line_2_gu = translated_flat[idx + 2]
                        p.address_line_3_gu = translated_flat[idx + 3]
                        p.city_gu = translated_flat[idx + 4] or fast_translate_phrase(p.city)
                        p.state_gu = translated_flat[idx + 5] or fast_translate_phrase(p.state)
                        idx += 6

                    db.commit()
                    _BG_STATS["processed"] += len(chunk)
                    time.sleep(0.15)
                _BG_STATS["status"] = "completed"
            finally:
                db.close()
        except Exception as e:
            print("Background translation worker error:", e)
            _BG_STATS["status"] = f"error: {str(e)}"
        finally:
            with _BG_WORKER_LOCK:
                _BG_WORKER_RUNNING = False

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True

def get_background_translation_status() -> Dict[str, Any]:
    global _BG_WORKER_RUNNING, _BG_STATS
    return {
        "is_running": _BG_WORKER_RUNNING,
        **_BG_STATS
    }

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
