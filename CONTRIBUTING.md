# Contributing Guide — MARG ERP 9 Envelope & Fleet Manager

Welcome to the team! This project is configured so **your Antigravity AI IDE auto-fills all project rules and workflows automatically**, and **everything works 24/7 even when the project owner's laptop is completely turned OFF**.

---

## 1. Zero-Setup Antigravity Auto-Fill

When you clone this repo and open it in **Antigravity**:
- Antigravity automatically reads [`AGENTS.md`](./AGENTS.md) on every turn (project architecture, local dev commands, database migration rules, and Termux safety rules).
- Antigravity automatically discovers [`.agents/skills/team-dev-deploy/SKILL.md`](./.agents/skills/team-dev-deploy/SKILL.md) (full onboarding, PR, and live deployment runbook).

You do **not** need to paste instructions or explain the project to Antigravity — just open the folder and tell Antigravity what feature you want to build!

---

## 2. How It Works 24/7 (Even When Owner's Laptop Is OFF)

- **Source Code:** Hosted 24/7 on GitHub.
- **Live Backend + Database:** Runs 24/7 on the dedicated Termux Android server (`https://shreeji-envelope.aryan76688.workers.dev`), independent of any developer's laptop.
- **Automated Cloud CI/CD (GitHub Actions):**
  1. Every Pull Request is automatically tested by `.github/workflows/pr-check.yml` (TypeScript build + Python syntax check).
  2. When a PR is merged to `main` (even from a phone!), `.github/workflows/deploy-cloudflare.yml` automatically:
     - Builds the React/Vite frontend
     - Syncs `backend/static/` and `android/app/src/main/assets/`
     - Deploys to Cloudflare Pages
     - Pings the live 24/7 Termux server to pull and restart immediately (and Termux's watchdog also polls GitHub every 2 minutes as a fallback).

---

## 3. Quick Local Setup (2 Minutes)

No PostgreSQL, Termux, or Cloudflare setup required!

```bash
# 1. Clone the repository
git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
cd MARG-ERP-9---Envelope-Print-manager
```

### Terminal 1 — Backend (FastAPI + Safe Local SQLite)
```bash
cd backend
python3 -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Terminal 2 — Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser!

---

## 4. Submitting Features & Fixes (Branch + PR Workflow)

> **Never push directly to `main`** — `main` deploys straight to the live production server!

```bash
# 1. Start from latest main
git checkout main
git pull origin main

# 2. Create your feature branch
git checkout -b feature/your-feature-name

# 3. Edit source files ONLY (frontend/src/ and backend/)
# 4. Verify build & syntax locally
cd frontend && npm run build && cd ..
python3 -m py_compile backend/*.py

# 5. Commit source files and push branch
git add frontend/src backend
git commit -m "feat(module): describe your feature"
git push -u origin feature/your-feature-name
```

Then open a **Pull Request** on GitHub! Once CI turns green ✅ and the PR is merged, GitHub Actions + Termux deploy your changes live automatically.
