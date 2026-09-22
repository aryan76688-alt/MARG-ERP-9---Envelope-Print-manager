---
title: Envelope Print Manager
emoji: ✉️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8080
pinned: false
---

# Envelope Print Manager

Complete full-stack envelope print manager with authentic courier grid format, A4 half-size (2 envelopes per paper), Address Line 1/2/3, daily party deduplication, and pre-seeded database of 2,339 parties.

## 🚀 24/7 Cloud Deployment (No Laptop Required)

### Option 1: Render.com (100% Free)
1. Push this repository to your GitHub.
2. Go to [https://dashboard.render.com](https://dashboard.render.com) -> **New +** -> **Web Service**.
3. Select your GitHub repository.
4. Runtime: **Docker** (Auto-detected).
5. Plan: **Free**.
6. Click **Create Web Service** -> Live at `https://<your-name>.onrender.com` 24/7!

### Option 2: Hugging Face Spaces (100% Free Docker Cloud)
1. Create a free account at [https://huggingface.co](https://huggingface.co).
2. Click **New Space** -> Space Name: `envelope-manager` -> License: `MIT` -> SDK: **Docker** (Blank).
3. Copy your Space Git URL.
4. Run:
   ```bash
   git remote add hf https://huggingface.co/spaces/<YOUR-USERNAME>/envelope-manager
   git push -f hf main
   ```
5. Your app runs 24/7 at `https://<YOUR-USERNAME>-envelope-manager.hf.space`!
