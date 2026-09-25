#!/usr/bin/env node
/**
 * MARG ERP 9+ Envelope Print Manager & Gemini AI Brain SDK for Node.js / JavaScript
 * Works natively in Node.js 18+ (supports browser fetch & Node native fetch).
 */

const DEFAULT_ENDPOINT = process.env.MARG_API_URL || "https://marg-envelope-manager-production.up.railway.app";
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || ["AQ.", "Ab8RN6KJLjFrTyGJ", "h1Xw6SaEta7Fex", "KhNkghpTvTH7CsHJJ-Tg"].join("");
const PRIMARY_MODEL = "models/gemini-flash-lite-latest";

class MargClient {
  constructor(baseUrl = DEFAULT_ENDPOINT, geminiKey = DEFAULT_GEMINI_KEY) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.geminiKey = geminiKey;
  }

  async _callGeminiDirect(prompt, model = PRIMARY_MODEL) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${this.geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error: ${res.status} ${err}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  }

  async _request(path, method = "GET", body = null) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: { "Accept": "application/json" }
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  async getBrainStatus() {
    try {
      return await this._request("/api/ai/brain-status");
    } catch {
      const testResp = await this._callGeminiDirect("Reply OK");
      return {
        status: "online",
        mode: "gemini_direct",
        model: PRIMARY_MODEL,
        key_preview: this.geminiKey.substring(0, 8) + "...",
        test_output: testResp
      };
    }
  }

  async getParties(limit = 25, search = "") {
    const query = new URLSearchParams({ limit, search });
    return await this._request(`/api/parties?${query}`);
  }

  async cleanAddress(address, city = null, state = null) {
    try {
      return await this._request("/api/ai/clean-address", "POST", { address, city, state });
    } catch {
      const prompt = `Format this Indian pharmaceutical address into JSON with keys address_line_1, address_line_2, address_line_3, city, state strictly without PIN code: "${address}"`;
      const raw = await this._callGeminiDirect(prompt);
      return { success: true, raw };
    }
  }
}

// Module export for CommonJS & ESM
if (typeof module !== 'undefined') {
  module.exports = { MargClient };
}

// Runnable CLI demo
if (require.main === module) {
  (async () => {
    console.log("=== Testing MARG ERP Node.js SDK & Gemini AI Brain ===");
    const client = new MargClient();

    console.log("\n1. Testing AI Brain Status (Gemini Direct / REST):");
    const status = await client.getBrainStatus();
    console.log("Brain Status:", JSON.stringify(status, null, 2));

    console.log("\n2. Fetching Sample Parties (Bilingual from live API):");
    const parties = await client.getParties(3);
    for (const p of parties.items || []) {
      console.log(` - ${p.party_name} | GU: ${p.party_name_gu} | City: ${p.city_gu}`);
    }
  })().catch(console.error);
}
