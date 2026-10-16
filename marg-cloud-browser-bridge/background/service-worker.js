/**
 * MARG Cloud Dual Bridge - Background Service Worker
 * Handles network transmissions, background download monitoring, and dual-app dispatching.
 */

importScripts('../lib/xlsx.full.min.js');

const DEFAULTS = {
  envelopeUrl: 'https://marg-envelope-manager-production.up.railway.app',
  b2bUrl: 'https://shreeji-healthcare.up.railway.app',
  secretKey: 'shreeji-marg-sync-secret-2026',
  autoSync: true
};

async function getConfig() {
  const data = await chrome.storage.local.get(['envelopeUrl', 'b2bUrl', 'secretKey', 'autoSync']);
  return {
    envelopeUrl: data.envelopeUrl || DEFAULTS.envelopeUrl,
    b2bUrl: data.b2bUrl || DEFAULTS.b2bUrl,
    secretKey: data.secretKey || DEFAULTS.secretKey,
    autoSync: data.autoSync !== undefined ? data.autoSync : DEFAULTS.autoSync
  };
}

// 1. Listen for messages from Content Script or Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_MARG_DATA') {
    handleDataUpload(request.fileName, request.rows)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true; // Keep async channel open
  }
});

// 2. Upload Dispatcher to both Railway apps
async function handleDataUpload(fileName, rows) {
  const config = await getConfig();
  const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());

  const isPartyData = headers.some(h => h.includes('party') || h.includes('customer') || h.includes('ledger') || h.includes('station') || h.includes('city') || h.includes('mobile'));
  const isStockData = headers.some(h => h.includes('stock') || h.includes('batch') || h.includes('item') || h.includes('product') || h.includes('mrp') || h.includes('rate') || h.includes('closing'));

  let summary = [];

  // A. Upload Parties
  if (isPartyData || !isStockData) {
    const parties = rows.map(r => {
      const findVal = (pats) => {
        for (let k of Object.keys(r)) {
          for (let p of pats) {
            if (k.toLowerCase().includes(p)) return String(r[k]).trim();
          }
        }
        return '';
      };

      const name = findVal(['party', 'name', 'customer', 'ledger']);
      const code = findVal(['code', 'id']);
      const address = findVal(['address', 'add']);
      const city = findVal(['city', 'station', 'place']) || 'DAHEGAM';
      const mobile = findVal(['mobile', 'phone', 'contact']);
      const route = findVal(['route', 'area', 'beat']);

      return {
        partyCode: code,
        partyName: name || 'UNKNOWN',
        address: address || city,
        city: city,
        state: 'GUJARAT',
        mobile: mobile,
        deliveryRoute: route
      };
    }).filter(p => p.partyName && !p.partyName.toLowerCase().startsWith('total'));

    // Push to Envelope Print Manager
    try {
      const res = await fetch(`${config.envelopeUrl}/api/webhooks/n8n/parties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-secret': config.secretKey
        },
        body: JSON.stringify(parties)
      });
      if (res.ok) summary.push(`Envelope Manager: ${parties.length} Parties`);
    } catch (e) {}

    // Push to Shreeji Order Book
    try {
      const res2 = await fetch(`${config.b2bUrl}/api/import/parties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.secretKey
        },
        body: JSON.stringify({
          fileName: fileName,
          totalRows: parties.length,
          parties: parties
        })
      });
      if (res2.ok) summary.push(`Order Book: ${parties.length} Parties`);
    } catch (e) {}
  }

  // B. Upload Stock
  if (isStockData) {
    const productMap = {};
    const batches = [];

    rows.forEach(r => {
      const findVal = (pats) => {
        for (let k of Object.keys(r)) {
          for (let p of pats) {
            if (k.toLowerCase().includes(p)) return String(r[k]).trim();
          }
        }
        return '';
      };

      const code = findVal(['code', 'item code', 'product code']) || 'P' + Math.random().toString(36).substring(7).toUpperCase();
      const name = findVal(['name', 'item', 'product', 'desc']);
      if (!name || name.toLowerCase().startsWith('total')) return;

      const company = findVal(['company', 'mfg', 'mfr']) || 'General';
      const unit = findVal(['unit', 'pack']) || 'PCS';
      const batchNo = findVal(['batch', 'lot']) || 'DEFAULT';
      const exp = findVal(['exp', 'expiry']);
      const stockQty = parseFloat(findVal(['stock', 'closing', 'qty']) || '0') || 0;
      const mrp = parseFloat(findVal(['mrp', 'price']) || '0') || 0;
      const ptr = parseFloat(findVal(['ptr', 'rate', 'sale']) || '0') || 0;

      if (!productMap[code]) {
        productMap[code] = {
          productCode: code,
          productName: name,
          company: company,
          unit: unit
        };
      }

      batches.push({
        productCode: code,
        batchNo: batchNo,
        stockQty: Math.max(0, stockQty),
        mrp: mrp,
        ptr: ptr,
        expiryDate: exp
      });
    });

    try {
      const resStock = await fetch(`${config.b2bUrl}/api/import/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.secretKey
        },
        body: JSON.stringify({
          fileName: fileName,
          totalRows: batches.length,
          products: Object.values(productMap),
          batches: batches
        })
      });
      if (resStock.ok) summary.push(`Order Book: ${Object.keys(productMap).length} Products, ${batches.length} Batches`);
    } catch (e) {}
  }

  return summary.join(' | ') || 'Sync Complete';
}
