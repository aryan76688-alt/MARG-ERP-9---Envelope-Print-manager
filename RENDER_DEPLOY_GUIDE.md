# 🚀 Complete Step-by-Step Guide: Free 24/7 Cloud Hosting on Render.com
### MARG ERP 9+ – Envelope Print Manager

This guide walks you through deploying your application to **Render.com** on the **100% Free Plan** and binding your custom domain **`shreeji.in`** (or **`envelope.shreeji.in`**).

---

## 📋 Overview of What We Configured For You
1. **Unified Dockerfile**: Pre-configured to build the React frontend and run the Python FastAPI backend with WeasyPrint & Ghostscript.
2. **Dynamic Port Support**: Automatically binds to Render's dynamic `$PORT`.
3. **Pre-Seeded Database**: Your 2,339 parties and sender settings (`SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305`) are bundled in the repository so they are live immediately upon deployment.
4. **Render Blueprint (`render.yaml`)**: Pre-configured for 1-click zero-configuration deployment.

---

## 🛠️ Step 1: Push Code to GitHub

Render builds your app directly from your GitHub repository.

1. Go to [https://github.com/new](https://github.com/new) and create a new repository:
   - **Repository Name**: `marg-envelope` (or `shreeji-envelope`)
   - **Visibility**: Private or Public (your choice)
   - Do **NOT** initialize with README or .gitignore (we already have them).

2. In your terminal on this computer, run:
   ```bash
   cd /home/aryan/ENVELOPE
   git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/<REPO-NAME>.git
   git push -u origin main
   ```
   *(Replace `<YOUR-GITHUB-USERNAME>` and `<REPO-NAME>` with your GitHub details)*.

---

## 🌐 Step 2: Deploy on Render.com (100% Free)

1. Go to [https://dashboard.render.com](https://dashboard.render.com) (sign up with GitHub if you don't have an account).
2. Click the blue **New +** button in the top navigation bar.
3. Select **Web Service**.
4. Choose **Build and deploy from a Git repository** $\rightarrow$ Click **Next**.
5. Connect your GitHub account and select your repository (`marg-envelope`).
6. Configure the deployment settings:
   - **Name**: `shreeji-envelope` (or any name you like)
   - **Region**: **Singapore** (closest to India for lowest latency) or **Frankfurt**
   - **Branch**: `main`
   - **Runtime**: **Docker** *(Render will automatically detect our `Dockerfile`)*
   - **Instance Type**: **Free** ($0/month)
7. Scroll down to **Environment Variables** (Optional):
   - Key: `PORT`
   - Value: `8080`
8. Click **Create Web Service** at the bottom of the page.

Render will now build your container (takes ~3–5 minutes on initial build). Once finished, your service will say **Live** and give you a free URL:
`https://shreeji-envelope.onrender.com`

---

## 🏷️ Step 3: Connect Custom Domain `shreeji.in` or `envelope.shreeji.in`

Once your web service is Live on Render:

1. In your Render Dashboard, click your web service (`shreeji-envelope`).
2. In the left sidebar, click **Settings**.
3. Scroll down to the **Custom Domains** section and click **Add Custom Domain**.
4. Enter your custom domain:
   - **Option A (Subdomain - Recommended)**: `envelope.shreeji.in` (or `print.shreeji.in`)
   - **Option B (Root Domain)**: `shreeji.in`
5. Click **Save**.
6. Render will show you the exact DNS records to add.

---

## ⚙️ Step 4: Add DNS Records in GoDaddy

1. Log in to your [GoDaddy Account](https://dcc.godaddy.com/manage/domains).
2. Click **shreeji.in** $\rightarrow$ **DNS Management** (or Manage DNS).
3. Add the record specified by Render:

### If you chose `envelope.shreeji.in` (Subdomain):
| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **CNAME** | `envelope` | `shreeji-envelope.onrender.com` | `1/2 Hour` |

### If you chose `shreeji.in` (Root Domain):
| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `216.24.57.1` *(Render's IP shown on your dashboard)* | `1/2 Hour` |
| **CNAME** | `www` | `shreeji-envelope.onrender.com` | `1/2 Hour` |

4. Click **Save**.
5. Back in Render, click **Verify**.
6. Render will automatically issue and renew a free **Let's Encrypt SSL/TLS Certificate**.

Within 5–10 minutes, your custom domain `https://envelope.shreeji.in` will be live 24/7 worldwide!
