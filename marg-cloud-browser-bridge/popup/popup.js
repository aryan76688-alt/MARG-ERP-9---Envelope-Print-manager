/**
 * MARG Cloud Dual Bridge - Popup Script
 * Directly syncs data from MARG Cloud to:
 * 1. Marg ERP Envelope Print Manager (/api/webhooks/n8n/parties)
 * 2. Shreeji Healthcare Order Book (/api/import/stock & /api/import/parties)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const envelopeUrlInput = document.getElementById('envelopeUrlInput');
  const b2bUrlInput = document.getElementById('b2bUrlInput');
  const secretKeyInput = document.getElementById('secretKeyInput');
  const autoSyncToggle = document.getElementById('autoSyncToggle');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testConnBtn = document.getElementById('testConnBtn');
  const syncBothBtn = document.getElementById('syncBothBtn');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const logBox = document.getElementById('logBox');
  const logTitle = document.getElementById('logTitle');
  const logBody = document.getElementById('logBody');
  const badgeEnvelope = document.getElementById('badgeEnvelope');
  const badgeB2B = document.getElementById('badgeB2B');

  // Default configs
  const DEFAULTS = {
    envelopeUrl: 'https://marg-envelope-manager-production.up.railway.app',
    b2bUrl: 'https://shreeji-healthcare.up.railway.app',
    secretKey: 'shreeji-marg-sync-secret-2026',
    autoSync: true
  };

  // Load configs
  const stored = await chrome.storage.local.get(['envelopeUrl', 'b2bUrl', 'secretKey', 'autoSync']);
  envelopeUrlInput.value = stored.envelopeUrl || DEFAULTS.envelopeUrl;
  b2bUrlInput.value = stored.b2bUrl || DEFAULTS.b2bUrl;
  secretKeyInput.value = stored.secretKey || DEFAULTS.secretKey;
  autoSyncToggle.checked = stored.autoSync !== undefined ? stored.autoSync : DEFAULTS.autoSync;

  // Save configs
  saveSettingsBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      envelopeUrl: envelopeUrlInput.value.trim(),
      b2bUrl: b2bUrlInput.value.trim(),
      secretKey: secretKeyInput.value.trim(),
      autoSync: autoSyncToggle.checked
    });
    showLog('Settings Saved', '✅ Server configurations saved successfully!');
  });

  autoSyncToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoSync: autoSyncToggle.checked });
  });

  // Test Connection
  testConnBtn.addEventListener('click', async () => {
    showLog('Testing Connections', 'Pinging both applications...');
    badgeEnvelope.textContent = 'Checking...';
    badgeB2B.textContent = 'Checking...';

    const envUrl = envelopeUrlInput.value.trim();
    const b2bUrl = b2bUrlInput.value.trim();
    const secret = secretKeyInput.value.trim();

    // 1. Test Envelope Manager
    let envOk = false;
    try {
      const res = await fetch(`${envUrl}/api/dashboard`, {
        headers: { 'x-sync-secret': secret }
      });
      if (res.ok || res.status === 200 || res.status === 401) {
        envOk = true;
        badgeEnvelope.textContent = 'Online';
        badgeEnvelope.style.color = '#10b981';
      }
    } catch (e) {
      badgeEnvelope.textContent = 'Offline';
      badgeEnvelope.style.color = '#ef4444';
    }

    // 2. Test B2B Order Book
    let b2bOk = false;
    try {
      const res2 = await fetch(`${b2bUrl}/api/import/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': secret
        },
        body: JSON.stringify({ ping: true })
      });
      if (res2.ok) {
        b2bOk = true;
        badgeB2B.textContent = 'Online';
        badgeB2B.style.color = '#10b981';
      }
    } catch (e) {
      badgeB2B.textContent = 'Offline';
      badgeB2B.style.color = '#ef4444';
    }

    showLog(
      'Connection Results',
      `Envelope Manager: ${envOk ? '✅ CONNECTED' : '❌ Failed'}\nShreeji Order Book: ${b2bOk ? '✅ CONNECTED' : '❌ Failed'}`
    );
  });

  // Drop zone events
  browseBtn.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', (e) => {
    if (e.target !== browseBtn) fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
  });

  syncBothBtn.addEventListener('click', () => {
    fileInput.click();
  });

  function showLog(title, body) {
    logBox.classList.remove('hidden');
    logTitle.textContent = title;
    logBody.textContent = body;
  }

  // Parse Excel / CSV File
  async function processFile(file) {
    showLog('Reading File', `Reading ${file.name}...`);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (!rows || rows.length === 0) {
        showLog('Empty File', '❌ No data rows found in this file.');
        return;
      }

      showLog('Analyzing Data', `Parsed ${rows.length} rows. Classifying columns...`);
      await dispatchData(file.name, rows);
    } catch (err) {
      showLog('File Error', `❌ Could not read file: ${err.message}`);
    }
  }

  // Dispatch to Envelope Manager & Shreeji Order Book
  async function dispatchData(fileName, rows) {
    const envUrl = envelopeUrlInput.value.trim();
    const b2bUrl = b2bUrlInput.value.trim();
    const secret = secretKeyInput.value.trim();

    const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());
    
    // Check if rows look like Parties
    const isPartyData = headers.some(h => h.includes('party') || h.includes('customer') || h.includes('ledger') || h.includes('station') || h.includes('city') || h.includes('mobile'));
    // Check if rows look like Stock
    const isStockData = headers.some(h => h.includes('stock') || h.includes('batch') || h.includes('item') || h.includes('product') || h.includes('mrp') || h.includes('rate') || h.includes('closing'));

    let logOutput = `File: ${fileName}\nRows: ${rows.length}\n`;

    // 1. Sync to Envelope Print Manager (Parties)
    if (isPartyData || !isStockData) {
      showLog('Uploading Parties', 'Sending parties to Marg Envelope Manager...');
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

      try {
        const res = await fetch(`${envUrl}/api/webhooks/n8n/parties`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-sync-secret': secret
          },
          body: JSON.stringify(parties)
        });

        if (res.ok) {
          logOutput += `✅ Envelope Manager: ${parties.length} Parties updated!\n`;
        } else {
          logOutput += `⚠️ Envelope Manager returned status ${res.status}\n`;
        }
      } catch (err) {
        logOutput += `❌ Envelope Manager Error: ${err.message}\n`;
      }

      // Also send parties to Shreeji Order Book
      try {
        const res2 = await fetch(`${b2bUrl}/api/import/parties`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': secret
          },
          body: JSON.stringify({
            fileName: fileName,
            totalRows: parties.length,
            parties: parties
          })
        });
        if (res2.ok) {
          logOutput += `✅ Shreeji Order Book: ${parties.length} Parties synced!\n`;
        }
      } catch (e) {}
    }

    // 2. Sync to Shreeji Order Book (Stock & Batches)
    if (isStockData) {
      showLog('Uploading Stock', 'Sending live stock & batches to Shreeji Order Book...');
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
        const resStock = await fetch(`${b2bUrl}/api/import/stock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': secret
          },
          body: JSON.stringify({
            fileName: fileName,
            totalRows: batches.length,
            products: Object.values(productMap),
            batches: batches
          })
        });

        if (resStock.ok) {
          logOutput += `✅ Shreeji Order Book: ${Object.keys(productMap).length} Products & ${batches.length} Batches synced!\n`;
        } else {
          logOutput += `⚠️ Shreeji Stock sync returned status ${resStock.status}\n`;
        }
      } catch (err) {
        logOutput += `❌ Shreeji Stock Error: ${err.message}\n`;
      }
    }

    showLog('Sync Complete!', logOutput);
  }
});
