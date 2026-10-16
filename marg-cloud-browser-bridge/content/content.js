/**
 * MARG Cloud In-Page Floating Bridge Widget
 * Injected into account.margcloud.com and margbooks.com
 */

(() => {
  if (document.getElementById('marg-cloud-bridge-pill')) return;

  // 1. Create floating container
  const container = document.createElement('div');
  container.id = 'marg-cloud-bridge-pill';

  container.innerHTML = `
    <div class="mcb-dropdown-panel hidden" id="mcbPanel">
      <div class="mcb-panel-title">MARG Cloud Dual Bridge</div>
      <button class="mcb-action-btn" id="mcbSyncParties">
        <span>✉️</span> Sync Parties to Envelope App
      </button>
      <button class="mcb-action-btn" id="mcbSyncStock">
        <span>📦</span> Sync Stock to Order Book
      </button>
      <button class="mcb-action-btn" id="mcbUploadFile">
        <span>📁</span> Upload &amp; Sync File (.xlsx/.csv)
      </button>
      <input type="file" id="mcbHiddenFileInput" accept=".xlsx,.xls,.csv" style="display:none;">
    </div>
    <button class="mcb-floating-btn" id="mcbToggleBtn">
      <span>⚡</span> MARG Bridge
    </button>
  `;

  document.body.appendChild(container);

  const toggleBtn = document.getElementById('mcbToggleBtn');
  const panel = document.getElementById('mcbPanel');
  const syncPartiesBtn = document.getElementById('mcbSyncParties');
  const syncStockBtn = document.getElementById('mcbSyncStock');
  const uploadFileBtn = document.getElementById('mcbUploadFile');
  const hiddenFileInput = document.getElementById('mcbHiddenFileInput');

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  uploadFileBtn.addEventListener('click', () => {
    hiddenFileInput.click();
  });

  syncPartiesBtn.addEventListener('click', () => {
    showToast('✉️ Please select your exported Marg Party list file.');
    hiddenFileInput.click();
  });

  syncStockBtn.addEventListener('click', () => {
    showToast('📦 Please select your exported Marg Stock report file.');
    hiddenFileInput.click();
  });

  hiddenFileInput.addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    showToast(`⏳ Reading ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (!rows || rows.length === 0) {
        showToast('❌ No rows found in file.');
        return;
      }

      // Send to background service worker to upload
      chrome.runtime.sendMessage({
        action: 'PROCESS_MARG_DATA',
        fileName: file.name,
        rows: rows
      }, (res) => {
        if (res && res.success) {
          showToast(`✅ Synced ${rows.length} records to your Apps!`);
        } else {
          showToast(`⚠️ Sync finished: ${res ? res.message : 'Check popup for details'}`);
        }
      });
    } catch (err) {
      showToast(`❌ Parse error: ${err.message}`);
    }
  });

  function showToast(msg) {
    const existing = document.querySelector('.mcb-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'mcb-toast';
    toast.innerHTML = `<span>🚀</span> ${msg}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // Listen for background notifications
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'SHOW_TOAST') {
      showToast(request.message);
    }
  });
})();
