# MARG ERP 9 — Envelope Print & Fleet Manager (Team Antigravity Rules)

> **Auto-loaded by Antigravity for every teammate.**
> Whenever you open this repository in Antigravity, follow these rules and workflows automatically without asking the user to repeat project setup, deployment architecture, or coding conventions.

---

## 1. Project Overview & 24/7 Architecture (Works With Owner's Laptop OFF)

This is a full-stack ERP envelope printing, party management, daily route sharing, driver GPS radar, and cash/cheque collection tracking platform for **Shreeji Healthcare**.

- **GitHub Repository (24/7 Cloud Source of Truth):**
  `https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager`
- **Live Production Server (24/7 Termux Android Server via Cloudflare Tunnel):**
  `https://shreeji-envelope.aryan76688.workers.dev`
- **Frontend Hosting (24/7 Cloudflare Pages):**
  Auto-deployed via `.github/workflows/deploy-cloudflare.yml` on every push/merge to `main`.
- **Zero Dependency on Owner's Laptop:**
  - The production backend + PostgreSQL database run **24/7 on a dedicated Android phone (Termux)**, NOT on any developer's laptop.
  - Termux runs `scripts/termux/watchdog.sh`, which checks GitHub `origin/main` every ~2 minutes and auto-updates via `git fetch origin main && git reset --hard origin/main`, plus accepts instant update triggers at `POST https://shreeji-envelope.aryan76688.workers.dev/api/system/server-update`.
  - GitHub Actions runs cloud CI checks on every Pull Request (`.github/workflows/pr-check.yml`), builds & syncs frontend assets, deploys Cloudflare Pages, and pings the Termux server on merge to `main`.
  - **Every teammate can develop, test locally, open PRs, merge, and deploy live even when the project owner's laptop is completely turned OFF.**

---

## 2. Tech Stack & Directory Layout

| Layer | Technology | Path |
| :--- | :--- | :--- |
| **Backend API** | Python 3, FastAPI, SQLAlchemy ORM, Uvicorn | `backend/` (`main.py`, `models.py`, `database.py`, `auth.py`, `pdf_service.py`, `excel_service.py`) |
| **Frontend SPA** | React 18, TypeScript, Vite, Tailwind CSS, Leaflet, Lucide | `frontend/src/` (`pages/`, `components/`, `mobile/`, `api/client.ts`, `types/index.ts`) |
| **Compiled Web Assets** | Served by FastAPI & Android WebView | `backend/static/` (preserve `downloads/`), `android/app/src/main/assets/` |
| **24/7 Termux Scripts** | Bash watchdog, start/stop/update scripts | `scripts/termux/` |
| **CI/CD Pipelines** | GitHub Actions (PR check + Cloud deploy + Termux trigger) | `.github/workflows/` |

---

## 3. Mandatory Git & Collaboration Rules

1. **NEVER push untested code directly to `main`.**
   `main` auto-deploys to BOTH Cloudflare Pages and the live 24/7 Termux server immediately!
2. **Always work on a feature/fix branch:**
   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/<short-topic>   # or fix/<short-topic>
   ```
3. **Avoid bundle merge conflicts on feature branches:**
   - Edit source files ONLY (`frontend/src/`, `backend/`).
   - Do **not** commit `frontend/dist/`, `backend/static/assets/`, or `android/app/src/main/assets/assets/` on feature branches unless explicitly preparing a direct release — GitHub Actions automatically builds and syncs static bundles on merge to `main` (or use `bash scripts/sync-frontend.sh` when explicitly releasing locally).
4. **Always verify before committing or opening a PR:**
   - Frontend TypeScript + production bundle: `cd frontend && npm run build` (must pass with `0` errors).
   - Backend Python syntax: `python3 -m py_compile backend/main.py backend/models.py backend/database.py`.
5. **Never commit secrets:**
   - Never commit `.env`, API keys, JWT secrets, or Cloudflare tokens. Use `.env.example` as reference.

---

## 4. Zero-Friction Local Development Commands

Teammates do **not** need PostgreSQL, Termux, or Cloudflare installed locally.

- **Start Backend (Terminal 1 — safe local SQLite DB by default):**
  ```bash
  cd backend
  python3 -m venv venv
  # Linux/Mac: source venv/bin/activate | Windows: venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000
  ```
  *Note:* Vite proxies `/api` to `http://127.0.0.1:8000` (configured in `frontend/vite.config.ts`). Leaving `DATABASE_URL` unset automatically creates an isolated local SQLite DB so production data is never touched.

- **Start Frontend (Terminal 2):**
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
  Open `http://localhost:5173`.

---

## 5. Critical Codebase Gotchas (Do Not Break!)

- **Termux Compatibility (`/driver` SPA & Static Responses):**
  - Never use FastAPI `FileResponse` for serving `index.html` in `backend/main.py` — Termux often lacks `aiofiles`, causing HTTP 500. Always read HTML and return `HTMLResponse`.
  - Keep `SPA_STATIC_DIR` resolution compatible with `uvicorn main:app --app-dir backend`.
- **Database Schema Migrations:**
  - Whenever you add a column to any SQLAlchemy model in `backend/models.py`, **also** add the idempotent migration (`ALTER TABLE ... ADD COLUMN ...`) in `backend/database.py` so both local SQLite and live Termux PostgreSQL auto-upgrade on startup without manual SQL intervention.
- **Cloudflare User-Agent Rule:**
  - When verifying or calling live endpoints (`https://shreeji-envelope.aryan76688.workers.dev/api/...`) from Python (`urllib`) or `curl`, always pass `-H "User-Agent: Mozilla/5.0"` to avoid Cloudflare HTTP 403 bot blocks.
- **Preserve Android APK:**
  - Never delete `backend/static/downloads/EnvelopeManager.apk` or `backend/downloads/EnvelopeManager.apk` when syncing frontend assets (Cloudflare Pages deploy strips `dist/downloads` automatically due to the 25MB limit).

---

## 6. Workspace Skill Reference

For full step-by-step runbooks (first-time onboarding, local dev startup, building/syncing bundles, creating PRs, and verifying 24/7 live Termux deployment), read and follow the workspace skill at `.agents/skills/team-dev-deploy/SKILL.md`.
