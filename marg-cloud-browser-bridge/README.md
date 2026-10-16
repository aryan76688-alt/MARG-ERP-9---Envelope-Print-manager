# MARG Cloud Dual Bridge Extension

A specialized Chromium/Chrome browser bridge designed to connect **MARG Cloud (`account.margcloud.com`)** directly to:
1. **Marg ERP Envelope Print Manager** (`https://marg-envelope-manager-production.up.railway.app`)
2. **Shreeji Healthcare Order Book** (`https://shreeji-healthcare.up.railway.app`)

---

## 🚀 Quick Setup (Load in Chrome)

1. Open **Google Chrome** on your computer.
2. In the address bar, type: `chrome://extensions` and press Enter.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select this directory:
   ```text
   /home/aryan/ENVELOPE/marg-cloud-browser-bridge
   ```
6. The extension **"MARG Cloud Dual App Bridge"** will appear in your Chrome toolbar!

---

## ⚡ How to Use inside MARG Cloud

1. Log into your Marg Cloud session at **`https://account.margcloud.com/login`**.
2. Notice the floating **`[ ⚡ MARG Bridge ]`** button on the bottom right.
3. Click it anytime to:
   - **`[ ✉️ Sync Parties to Envelope App ]`**
   - **`[ 📦 Sync Stock to Order Book ]`**
   - **`[ 📁 Upload & Sync File ]`**
4. Whenever you export any report in Marg Cloud, the extension will automatically intercept the downloaded file, parse the data with SheetJS, and upload it directly to your Railway backends with a success toast notification!
