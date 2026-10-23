# 🚀 Full Fresh Setup & Operations Guide
### MARG ERP 9 — Envelope Print Manager & Logistics Suite
**Author / Super Admin:** Aryan Darji  
**Version:** 2.0 (Modernized FastAPI + React + Android APK)

---

## 📑 Table of Contents
1. [🛑 How to Stop All Services Cleanly](#1--how-to-stop-all-services-cleanly)
2. [📦 System Prerequisites](#2--system-prerequisites)
3. [🐍 Backend Setup (FastAPI + Python)](#3--backend-setup-fastapi--python)
4. [⚛️ Frontend Setup (React + Vite + TypeScript)](#4-️-frontend-setup-react--vite--typescript)
5. [📱 Android Mobile App Setup (APK Build)](#5--android-mobile-app-setup-apk-build)
6. [🌐 Cloudflare Tunnel & Remote Access](#6--cloudflare-tunnel--remote-access)
7. [⚙️ Production Service Management (Systemd & Docker)](#7-️-production-service-management-systemd--docker)
8. [🔐 Default Credentials & Role Access](#8--default-credentials--role-access)
9. [🔍 Verification & Troubleshooting](#9--verification--troubleshooting)

---

## 1. 🛑 How to Stop All Services Cleanly

Before performing a fresh setup or restarting, ensure all existing instances and ports are freed:

### On Linux / macOS:
```bash
# 1. Stop backend on port 8080
kill $(lsof -t -i:8080) 2>/dev/null || pkill -f "uvicorn main:app" 2>/dev/null

# 2. Stop frontend dev server on port 5173
kill $(lsof -t -i:5173) 2>/dev/null || pkill -f "vite" 2>/dev/null

# 3. Stop cloudflared tunnel (if running)
pkill -f "cloudflared" 2>/dev/null

# 4. Verify no processes are lingering
ps aux | grep -E "uvicorn|main.py|vite" | grep -v grep
```

### On Windows:
```cmd
:: Free port 8080
for /f "tokens=5" %a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /F /PID %a

:: Free port 5173
for /f "tokens=5" %a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %a

:: Kill cloudflared if running
taskkill /F /IM cloudflared.exe 2>nul
```

### With Docker:
```bash
docker-compose down
```

---

## 2. 📦 System Prerequisites

Ensure you have the following runtimes installed on your machine:

| Component | Minimum Version | Recommended Version |
| :--- | :--- | :--- |
| **Python** | 3.10+ | 3.11 or 3.12 |
| **Node.js** | 18.0+ | 20.x LTS or 22.x |
| **npm** | 9.0+ | 10.x |
| **Java JDK** (For Android build) | JDK 17 | OpenJDK 17 or 21 |
| **Android SDK** (For Android build) | API 34 | Android SDK 34 (Command-line tools / Android Studio) |
| **Git** | 2.30+ | Latest |

### Linux Package Dependencies (Debian / Ubuntu / Raspberry Pi):
```bash
sudo apt update && sudo apt install -y \
    build-essential python3 python3-pip python3-venv \
    libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libpangocairo-1.0-0 \
    libffi-dev shared-mime-info fonts-liberation fonts-noto-core fonts-gujr fonts-indic \
    curl git openjdk-17-jdk
```

---

## 3. 🐍 Backend Setup (FastAPI + Python)

The backend provides the REST APIs, database management, PDF generation, driver POD sync, and serves the frontend web application.

### Step 3.1: Navigate to the Backend Directory
```bash
cd /home/aryan/ENVELOPE/backend
```

### Step 3.2: Create and Activate a Virtual Environment
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On Linux / macOS:
source venv/bin/activate

# On Windows (cmd):
venv\Scripts\activate.bat

# On Windows (PowerShell):
venv\Scripts\Activate.ps1
```

### Step 3.3: Install Python Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3.4: Configure Environment Variables (`backend/.env`)
Create or edit `backend/.env` with your API keys:
```env
# Google Gemini API Key for OCR & Gujarati Translations
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Optional: Google Maps & Google Drive API Keys
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY
GOOGLE_DRIVE_API_KEY=YOUR_GOOGLE_DRIVE_KEY

# Database URL:
# Leave blank for default local SQLite (envelope_manager.db)
# Or configure PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/envelope_db
```

### Step 3.5: Initialize and Migrate Database
Run the automated schema generator and seed script:
```bash
python3 -c "import database; database.init_db()"
```
*This automatically sets up all required tables, handles universal column migrations, and pre-seeds default credentials and settings.*

### Step 3.6: Run the Backend Server
```bash
# In development mode (auto-reload enabled):
python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload

# In production mode (background service):
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 > uvicorn.log 2>&1 &
```

The backend is now live at:
- **API URL:** `http://localhost:8080/api`
- **Interactive Swagger Docs:** `http://localhost:8080/docs`
- **Redoc Documentation:** `http://localhost:8080/redoc`

---

## 4. ⚛️ Frontend Setup (React + Vite + TypeScript)

The frontend is a single-page React app with Tailwind CSS, Lucide icons, Gujarati translations, and offline Driver Mode.

### Step 4.1: Navigate to the Frontend Directory
```bash
cd /home/aryan/ENVELOPE/frontend
```

### Step 4.2: Install NPM Dependencies
```bash
npm install
```

### Step 4.3: Run in Development Mode (Vite Dev Server)
```bash
npm run dev
```
- Opens local dev server on `http://localhost:5173`
- Proxies `/api` calls directly to `http://localhost:8080`

### Step 4.4: Build Production Assets
To compile the production bundle for web serving and mobile embedding:
```bash
npm run build
```
- Compiles TypeScript and builds minified assets to `frontend/dist/`.
- The FastAPI backend on port 8080 automatically serves `frontend/dist/` directly at `http://localhost:8080/`.

---

## 5. 📱 Android Mobile App Setup (APK Build)

The Android app wraps the client in a high-performance native WebView, integrates native camera capture via Android `FileProvider`, and runs background synchronization.

### Step 5.1: Sync Frontend Build to Android Assets
Whenever you make frontend changes, sync the build to Android assets:
```bash
# From repository root:
cp -r frontend/dist/* android/app/src/main/assets/
```

### Step 5.2: Configure Android SDK Location
Ensure `android/local.properties` points to your Android SDK:
```properties
# On Linux:
sdk.dir=/home/aryan/Android/Sdk

# On Windows:
# sdk.dir=C\:\Users\YourUser\AppData\Local\Android\Sdk
```

### Step 5.3: Build Debug APK
```bash
cd /home/aryan/ENVELOPE/android
chmod +x gradlew
./gradlew assembleDebug
```

The generated APK will be at:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Step 5.4: Distribute / Install APK
Copy the built APK to the web download destinations:
```bash
# Copy to root and public downloads
cp android/app/build/outputs/apk/debug/app-debug.apk ../downloads/EnvelopeManager.apk
cp android/app/build/outputs/apk/debug/app-debug.apk ../frontend/public/downloads/EnvelopeManager.apk
cp android/app/build/outputs/apk/debug/app-debug.apk ../backend/static/downloads/EnvelopeManager.apk

# Install directly to a connected Android phone via ADB:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 6. 🌐 Cloudflare Tunnel & Remote Access

To access the server securely outside the local Wi-Fi without port-forwarding:

### Step 6.1: Start Cloudflare Tunnel
```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8080
```
- Cloudflare will print a public tunnel URL (e.g., `https://shreeji-envelope-xyz.trycloudflare.com`).

### Step 6.2: Connect Mobile App to Remote Server
1. Open the Android App or Web App.
2. Go to **Settings (સેટિંગ્સ)** -> **API Server URL**.
3. Enter your tunnel URL: `https://shreeji-envelope-xyz.trycloudflare.com` and tap **Save & Connect**.

---

## 7. ⚙️ Production Service Management (Systemd & Docker)

### Option A: Linux Systemd Service (Auto-Start on Boot)
Create `/etc/systemd/system/envelope.service`:
```ini
[Unit]
Description=MARG ERP 9 Envelope Print Manager Service
After=network.target

[Service]
Type=simple
User=aryan
WorkingDirectory=/home/aryan/ENVELOPE/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=5
EnvironmentFile=/home/aryan/ENVELOPE/backend/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable envelope
sudo systemctl start envelope
sudo systemctl status envelope
```

### Option B: Docker Compose
```bash
# Build and run containers in background
docker-compose up --build -d

# View container logs
docker-compose logs -f

# Stop containers
docker-compose down
```

---

## 8. 🔐 Default Credentials & Role Access

The system initializes with role-based access control. All passwords can be changed in **Settings -> User Management**.

| Full Name | Role | Username | Default Password | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Aryan Darji** | `super_admin` | `Aryan180607` | `Aryan@2007` | Full System Control, Device Access, Settings, Super Admin Note Calculator, Parties Calculator |
| **Super Admin** | `super_admin` | `Shreeji7` | `Aryan@2007` | Full System Control, Settings, User Management |
| **Tushar Patel** | `owner` | `Tushar9263` | `Shreeji9263` | Owner Access, Note Calculator, Financial Insights, Reports |
| **Owner** | `owner` | `owner` | `Aryan@2007` | Owner Access, Financial Insights, Reports |
| **Admin** | `admin` | `Aryan007` | `Aryan@2007` | Create & Print Envelopes, Manage Parties, Dispatch Summary |
| **Driver** | `driver` | `driver` | `driver123` | Driver Mode, Take Photo & Deliver, Route Navigation |

---

## 9. 🔍 Verification & Troubleshooting

### Verification Checklist:
1. **Health Check:**
   ```bash
   curl -s http://localhost:8080/api/dispatch-summary
   ```
   Should return JSON with date, package counts, and dispatches.
2. **Frontend Test:**
   Open browser at `http://localhost:8080` — verify page renders and login succeeds.
3. **Driver Mode Camera Test:**
   In Driver Mode, tap **"Take Photo & Deliver"** — verify device camera opens directly without file picker dialog.
4. **Delivered By Verification:**
   Deliver a stop — verify `Delivered by: <Name>` badge appears on stop card and in Dispatch Summary.

### Common Troubleshooting:
- **Port 8080 already in use:**
  Run `kill $(lsof -t -i:8080)` to terminate old uvicorn instances.
- **WeasyPrint / Pango library missing error:**
  Run `sudo apt install libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libpangocairo-1.0-0`.
- **Database Locked (SQLite):**
  Ensure only one process writes to `envelope_manager.db` at a time.
- **Android Gradle build error:**
  Ensure `android/local.properties` has `sdk.dir=/path/to/Sdk` set correctly and JDK 17 is active (`java -version`).

---

## 10. 📱 Android Termux 24/7 Mobile Server Guide

Run both **Shreeji Order Book (:3000)** and **MARG Envelope Print Manager (:8080)** on any Android device 24/7 with zero hosting fees.

### Step 10.1: Install Termux & Termux:Boot
1. Download **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/) (Do NOT use Google Play Store version).
2. (Optional) Download **Termux:Boot** from F-Droid to auto-start servers when phone reboots.
3. Open Termux and grant battery optimization exemption:
   - Android Settings -> Apps -> Termux -> Battery -> Set to **Unrestricted / Don't optimize**.

### Step 10.2: One-Click Setup Command
In Termux, paste this single command:
```bash
pkg update -y && pkg install git -y && \
git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git "$HOME/ENVELOPE" && \
bash "$HOME/ENVELOPE/termux_setup.sh"
```
The script automatically:
- Installs Node.js, Python, PostgreSQL, Git, Cronie, SQLite, and Cloudflared.
- Sets up databases, dependencies, and environment files.
- Configures 30-minute auto-restart cron job and background watchdog.
- Sets up permanent Cloudflare public tunnel domains.
- Registers convenient bash shortcut aliases.

### Step 10.3: Daily Shortcut Commands in Termux
Once installed, simply type any of these short commands in Termux:
- `status` — View running servers, port status, and Cloudflare URLs.
- `update` — Fetch latest GitHub code, run database migrations, and safely restart.
- `restart` — Immediately perform safe 30-minute memory recycle (0 data loss).
- `watchdog` — View live background auto-healing and auto-update logs (`tail -f`).
- `stop` — Stop all running servers cleanly.
- `start` — Start all services and Cloudflare tunnels.

### Step 10.4: 30-Minute Auto-Restart (Zero Data Loss)
- Recycles Node.js (:3000) and Python (:8080) every 30 minutes to eliminate RAM bloat and avoid Android memory killer.
- **Safety guarantee**: Flushes PostgreSQL (`CHECKPOINT;`) and SQLite (`PRAGMA wal_checkpoint(FULL);`) before restarting.
- **Dual protection**: Managed by both hardware crond (`*/30 * * * *`) and continuous `watchdog.sh`.

### Step 10.5: Auto-Update & Manual Update Guide
1. **In Termux (Manual Update)**:
   ```bash
   update
   ```
   *No git merge conflicts*: Uses `git stash` + `git reset --hard origin/main` to guarantee clean updates.
2. **In Termux (Auto-Update)**:
   - `watchdog.sh` checks GitHub every 60 seconds. When new commits are detected, it updates code and restarts services automatically.
3. **In Android APK (Version 2.4.0)**:
   - **Auto-Check**: The APK automatically checks `/api/app/version` on launch. If a newer version exists, a prompt *"Update Now • નવી આવૃત્તિ"* appears.
   - **Manual Update**: Open APK -> **Settings** -> Scroll to **Android Mobile App & Native Services** -> Tap **"Check for Updates (અપડેટ તપાસો)"** or **"Update APK Now (મેન્યુઅલ અપડેટ કરો)"**.
