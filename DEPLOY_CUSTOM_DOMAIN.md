# Deployment & Custom Domain Guide
### MARG ERP 9+ – Envelope Print Manager

This guide covers how to deploy the application and map your custom domain (e.g. `envelope.yourdomain.com` or `yourdomain.com`) with automatic HTTPS/SSL.

---

## 🚀 Option 1: Cloudflare Tunnel (Recommended — Free, Zero Port-Forwarding, Keeps Local DB)

Since `cloudflared` is already installed on your system, you can connect your custom domain directly to your local application running on port `8080`.

### Advantages:
- **100% Free & No Public IP Needed**
- **Automatic SSL/TLS** certificate managed by Cloudflare
- **No Port-Forwarding** required on your router
- **Database Privacy**: Your 2,339+ party records and Excel imports stay stored locally on your machine.

### Step-by-Step Setup:

1. **Authenticate Cloudflare CLI**:
   Run the following in your terminal:
   ```bash
   cloudflared tunnel login
   ```
   A URL will appear. Open it in your browser, log in to your free Cloudflare account, and select the domain you want to link.

2. **Create a Named Tunnel**:
   ```bash
   cloudflared tunnel create marg-envelope
   ```
   *(This creates a tunnel ID and generates a credentials JSON file in `~/.cloudflared/`)*.

3. **Configure the Tunnel**:
   Create or edit `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <YOUR-TUNNEL-UUID>
   credentials-file: /home/aryan/.cloudflared/<YOUR-TUNNEL-UUID>.json

   ingress:
     - hostname: print.yourdomain.com    # <-- Replace with your custom domain or subdomain
       service: http://localhost:8080
     - service: http_status:404
   ```

4. **Route your Custom Domain DNS**:
   ```bash
   cloudflared tunnel route dns marg-envelope print.yourdomain.com
   ```
   Cloudflare will automatically add the `CNAME` record to your DNS zone.

5. **Run the Tunnel as a Persistent System Service**:
   ```bash
   cloudflared tunnel run marg-envelope
   ```
   *(To install as a background daemon on boot: `sudo cloudflared service install`)*.

Your website is now live worldwide at `https://print.yourdomain.com`!

---

## ☁️ Option 2: Render.com Cloud Hosting (100% Free Cloud Host + Custom Domain)

If you want the website running 24/7 in the cloud without keeping your local PC powered on:

### Steps:
1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "MARG ERP Envelope Manager production build"
   git remote add origin https://github.com/<your-username>/marg-envelope.git
   git push -u origin main
   ```
2. **Create Web Service on Render**:
   - Go to [render.com](https://render.com) and click **New + $\rightarrow$ Web Service**.
   - Connect your GitHub repository.
   - Choose **Docker** as the runtime (it will automatically use the root `Dockerfile`).
   - Set Environment Variable: `PORT=8080`.
   - Click **Create Web Service**.
3. **Attach Custom Domain**:
   - In your Render service dashboard, click **Settings $\rightarrow$ Custom Domains**.
   - Enter your domain (e.g. `envelope.yourdomain.com`).
   - Copy the `CNAME` target provided by Render (e.g. `marg-envelope.onrender.com`).
   - In your domain registrar (GoDaddy, Namecheap, Hostinger), add the `CNAME` record:
     - **Host / Name**: `envelope` (or `@` for root)
     - **Value / Target**: `marg-envelope.onrender.com`
   - Render will verify the DNS and issue a free SSL certificate within 2–5 minutes.

---

## 🐳 Option 3: Docker on any Linux VPS (DigitalOcean / AWS / Linode / Hetzner)

A complete production `Dockerfile` and `docker-compose.yml` are already configured in the repository.

1. **Build and Run**:
   ```bash
   cd /home/aryan/ENVELOPE
   docker compose up -d --build
   ```
2. **Point your Domain**:
   - In your domain registrar, add an **`A` record**:
     - **Name**: `@` (or subdomain e.g. `envelope`)
     - **Value**: Your VPS Public IP address.
3. **Setup Nginx / Reverse Proxy with Free SSL (Certbot)**:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

---

## 🌐 Current Running Status on Local / Tailscale Network:
- **Local Application URL**: `http://localhost:8080`
- **Tailscale Network URL**: `http://100.69.194.11:8080`
- **Tailscale Funnel Public URL**: `https://aryan.tailfc14cd.ts.net/`
