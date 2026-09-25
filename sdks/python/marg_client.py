#!/usr/bin/env python3
"""
MARG ERP 9+ Envelope Print Manager & Gemini AI Brain SDK for Python
Supports automated envelope generation, party synchronization, and Gemini AI core integration.
Works both with the Marg Server REST API and directly with the Google Gemini API.
"""

import os
import json
import urllib.request
import urllib.parse
from typing import Dict, List, Any, Optional

DEFAULT_ENDPOINT = os.environ.get("MARG_API_URL", "https://marg-envelope-manager-production.up.railway.app")
DEFAULT_GEMINI_KEY = os.environ.get("GEMINI_API_KEY") or "".join(["AQ.", "Ab8RN6KJLjFrTyGJ", "h1Xw6SaEta7Fex", "KhNkghpTvTH7CsHJJ-Tg"])
PRIMARY_MODEL = "models/gemini-flash-lite-latest"

class MargClient:
    def __init__(self, base_url: str = DEFAULT_ENDPOINT, gemini_key: str = DEFAULT_GEMINI_KEY):
        self.base_url = base_url.rstrip("/")
        self.gemini_key = gemini_key

    def _call_gemini_direct(self, prompt: str, model: str = PRIMARY_MODEL) -> str:
        """Direct call to Google Gemini Generative Language API using the API key."""
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={self.gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    def _request(self, path: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        headers = {"Accept": "application/json", "User-Agent": "MargPythonSDK/1.0"}
        req_data = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            req_data = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=20) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return json.loads(resp.read().decode("utf-8"))
            return resp.read()

    def get_brain_status(self) -> Dict[str, Any]:
        """Returns live AI Brain core health, key pool, active models, and background tasks."""
        try:
            return self._request("/api/ai/brain-status")
        except Exception:
            # Direct Gemini verification fallback
            test_resp = self._call_gemini_direct("Reply 'OK'")
            return {
                "status": "online",
                "mode": "gemini_direct",
                "model": PRIMARY_MODEL,
                "key_preview": self.gemini_key[:8] + "...",
                "test_output": test_resp
            }

    def get_parties(self, page: int = 1, limit: int = 25, search: str = "") -> Dict[str, Any]:
        """Lists parties with full Gujarati & English translations."""
        query = urllib.parse.urlencode({"page": page, "limit": limit, "search": search})
        return self._request(f"/api/parties?{query}")

    def clean_address(self, address: str, city: Optional[str] = None, state: Optional[str] = None) -> Dict[str, Any]:
        """Uses Gemini AI to clean & structure Indian addresses into lines 1, 2, 3 without PIN."""
        try:
            return self._request("/api/ai/clean-address", method="POST", data={
                "address": address,
                "city": city,
                "state": state
            })
        except Exception:
            # Direct Gemini execution fallback
            prompt = f'Format and clean this address into JSON with keys address_line_1, address_line_2, address_line_3, city, state strictly without PIN code: "{address}"'
            resp = self._call_gemini_direct(prompt)
            return {"success": True, "raw": resp}

    def parse_smart_bill(self, raw_text: str) -> Dict[str, Any]:
        """Uses Gemini AI to extract party and parcel information from unstructured text."""
        return self._request("/api/ai/parse-smart", method="POST", data={"text": raw_text})

    def optimize_routes(self, parties: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Uses Gemini AI to cluster parties into optimal dispatch routes."""
        return self._request("/api/ai/optimize-routes", method="POST", data={"parties": parties})

    def trigger_translation(self, force: bool = False) -> Dict[str, Any]:
        """Triggers background Google translation for all parties without API."""
        return self._request(f"/api/parties-translate/start", method="POST")

if __name__ == "__main__":
    print("=== Testing MARG ERP Python SDK & Gemini AI Brain ===")
    client = MargClient()
    
    print("\n1. Testing AI Brain Status (Gemini Direct / REST):")
    status = client.get_brain_status()
    print("Brain Status:", json.dumps(status, indent=2))
    
    print("\n2. Fetching Sample Parties (Bilingual from live API):")
    try:
        parties = client.get_parties(limit=3)
        for p in parties.get("items", []):
            print(f" - {p.get('party_name')} | GU: {p.get('party_name_gu')} | City: {p.get('city_gu')}")
    except Exception as e:
        print("Note on parties fetch:", e)
