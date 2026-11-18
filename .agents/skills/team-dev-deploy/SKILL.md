---
name: team-dev-deploy
description: >-
  Complete teammate onboarding, local development, build verification, PR submission,
  and 24/7 laptop-off live deployment runbook for MARG ERP 9 Envelope Print Manager.
  Use when a teammate asks to set up the project, run locally, add/modify a feature,
  create a PR, sync frontend bundles, or deploy/verify updates on the live Termux server.
---

# Team Development & 24/7 Autonomous Deploy Skill

Use this runbook whenever helping a teammate set up, develop, test, or ship changes to this repository. Everything here works **even when the project owner's laptop is completely turned OFF**.

---

## 1. First-Time Local Setup (Any Teammate Machine)

Check prerequisites (`git`, `node >= 18`, `python3 >= 3.10`), then bootstrap:

### Backend (Safe Local SQLite — Zero Production Risk)
```bash
cd backend
python3 -m venv venv
# Linux / macOS:
source venv/bin/activate
# Windows PowerShell:
# .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (React + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```

Verify local health:
- Frontend UI: `http://localhost:5173`
- Backend Swagger / Health: `http://127.0.0.1:8000/api/health`

---

## 2. Adding a Feature or Fix (Standard Team Flow)

1. **Sync latest `main` and create a branch:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/<short-description>
   ```
2. **Implement changes cleanly:**
   - Frontend changes go in `frontend/src/`.
   - Backend changes go in `backend/`.
   - If adding columns in `backend/models.py`, add idempotent `ALTER TABLE` startup migrations in `backend/database.py`.
   - Never use `FileResponse` for SPA routes in `backend/main.py` (use `HTMLResponse` for Termux compatibility).
3. **Run mandatory pre-PR checks:**
   ```bash
   # 1. Verify TypeScript & Vite bundle
   cd frontend && npm run build

   # 2. Verify Python syntax across backend
   python3 -m py_compile backend/main.py backend/models.py backend/database.py backend/auth.py
   ```
4. **Stage ONLY source files (avoid minified bundle merge conflicts on PRs):**
   ```bash
   git status
   # Do NOT commit frontend/dist, backend/static/assets, or android/app/src/main/assets/assets on feature branches
   git add frontend/src backend/*.py
   git commit -m "feat(<scope>): <clear summary>"
   git push -u origin feature/<short-description>
   ```
5. **Open a Pull Request on GitHub:**
   - GitHub Actions (`.github/workflows/pr-check.yml`) automatically verifies the frontend build and backend syntax.
   - Once approved and merged into `main`, `.github/workflows/deploy-cloudflare.yml` automatically:
     1. Builds the frontend (`npm ci && npm run build`)
     2. Syncs `backend/static/` and `android/app/src/main/assets/` back to `main` (skipping CI loops with `[skip ci]`)
     3. Deploys to Cloudflare Pages
     4. Triggers the 24/7 Termux Android server to pull & restart!

---

## 3. Manual Bundle Sync (Only When Releasing Directly)

If explicitly asked to build & sync static assets locally:
```bash
bash scripts/sync-frontend.sh
```
This script builds `frontend/dist`, refreshes `backend/static/` (preserving `backend/static/downloads/`), and refreshes `android/app/src/main/assets/`.

---

## 4. Verifying & Triggering Live 24/7 Termux Server (Owner Laptop OFF)

Because the production backend runs 24/7 on the Termux phone behind Cloudflare Tunnel:

1. **Trigger instant remote update (optional — Termux watchdog also auto-pulls every ~2 min):**
   ```bash
   curl -s -X POST "https://shreeji-envelope.aryan76688.workers.dev/api/system/server-update" \
     -H "User-Agent: Mozilla/5.0" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
2. **Wait ~15–25 seconds and verify live health:**
   ```bash
   curl -s "https://shreeji-envelope.aryan76688.workers.dev/api/health" \
     -H "User-Agent: Mozilla/5.0"
   ```
3. **Verify SPA deep links (e.g. Driver Mode):**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "User-Agent: Mozilla/5.0" \
     "https://shreeji-envelope.aryan76688.workers.dev/driver"
   ```
   Expected: `200`.
