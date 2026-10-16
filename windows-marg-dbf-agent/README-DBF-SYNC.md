# MARG ERP 9+ Direct FoxPro .DBF Sync Agent (Option B)

### 100% Free & Automatic Direct Real-Time Sync (No Manual Exports Needed)

This agent reads Visual FoxPro `.DBF` files directly from your MARG ERP directory (`C:\MARGPROG\DATA\...`) using **shared read-only streaming**. 
- **Zero Database Locking**: Marg ERP 9+ can be operated by billing clerks continuously without any collision, file-lock, or interruption.
- **Syncs Parties & Routes**: Reads `LEDGER.DBF` and automatically syncs all parties, addresses, cities, mobile numbers, routes, and GSTIN.
- **Syncs Live Stock & Batches**: Reads `BATCH.DBF` / `PROD.DBF` and syncs live MRP, PTR, batches, and closing quantities.
- **Syncs Outstanding Balances**: Reads `OUTSTAND.DBF` for real-time ledger dues.

---

## 🚀 Quick Setup Instructions (Windows MARG PC)

1. **Extract/Copy this folder** to your MARG PC (e.g. `C:\MargSyncAgent`).
2. Open `config.json` in Notepad:
   - Check `margDataFolder`: Defaults to `C:\MARGPROG\DATA`. If your Marg is on `D:\` or has a company folder like `C:\MARGPROG\DATA\SHREEJI`, set it here.
   - Adjust `syncIntervalSeconds` (default: `60` seconds).
3. Double-click **`Run-DBF-Agent.bat`**.
   - It will verify Python, auto-install required dependencies (`dbfread`, `requests`), and begin monitoring for changes.
   - Whenever a bill is saved or party is added in Marg, it automatically updates both the Envelope Manager and B2B Order Book within seconds!

---

## ⚡ Run Silently in Background (Optional)
To run without showing a command prompt window, you can run via `run-silent.vbs` or add a shortcut to the Windows Startup folder (`shell:startup`).
