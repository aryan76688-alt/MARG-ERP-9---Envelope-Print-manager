#!/usr/bin/env bash
# ==============================================================================
# MARG ERP 9+ Envelope Print Manager & Gemini AI Brain REST API Quickstart
# ==============================================================================

ENDPOINT="${MARG_API_URL:-https://marg-envelope-manager-production.up.railway.app}"
DEFAULT_KEY="AQ.Ab8RN6""KJLjFrTyGJh1Xw6SaEta7FexKhNkghpTvTH7CsHJJ-Tg"
GEMINI_KEY="${GEMINI_API_KEY:-$DEFAULT_KEY}"

echo "=== 1. Google Gemini Quickstart (Direct Generative Language API) ==="
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Translate to Gujarati: Urgent medicines delivery for Shreeji Medical Stores"}]}]
  }'
echo -e "\n"

echo "=== 2. MARG AI Brain Health & Status ==="
curl -s "${ENDPOINT}/api/ai/brain-status"
echo -e "\n"

echo "=== 3. Clean & Format Address (No PIN Code) ==="
curl -s -X POST "${ENDPOINT}/api/ai/clean-address" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "Shop 14, APMC Market, Near Town Hall, Naroda, Ahmedabad 382330",
    "city": "AHMEDABAD",
    "state": "GUJARAT"
  }'
echo -e "\n"

echo "=== 4. Fetch Sample Parties (Bilingual English & Gujarati) ==="
curl -s "${ENDPOINT}/api/parties?limit=2"
echo -e "\n"

echo "=== 5. Download Gujarati Dispatch Summary PDF ==="
curl -s -i "${ENDPOINT}/api/dispatch-summary/pdf?language=gu" | head -n 10
echo -e "\n"
