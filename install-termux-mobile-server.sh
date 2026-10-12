#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# MARG ERP 9 Envelope Print Manager - Termux 24/7 Mobile Server Installer
# Turn your Android Phone into a 24/7 Web Server (Laptop Off, 100% Free Forever)
# ==============================================================================
echo "📱 [1/5] Preventing Android from putting server to sleep..."
termux-wake-lock 2>/dev/null || true

echo "🌐 [2/5] Configuring fast official Cloudflare CDN mirror & IPv4 tuning..."
mkdir -p "$PREFIX/etc/apt/apt.conf.d"
cat << 'EOF' > "$PREFIX/etc/apt/apt.conf.d/99network-tune"
Acquire::ForceIPv4 "true";
Acquire::Retries "5";
Acquire::http::Timeout "30";
EOF

# Direct apt sources to the official high-speed Cloudflare CDN mirror (prevents unreachable foreign university mirrors)
mkdir -p "$PREFIX/etc/apt"
echo "deb https://packages-cf.termux.dev/apt/termux-main stable main" > "$PREFIX/etc/apt/sources.list"

echo "📦 [3/5] Updating Termux packages and repairing OpenSSL/cURL libraries..."
apt-get clean 2>/dev/null || true
apt-get update -y --fix-missing || true
apt-get full-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" --fix-missing || true
# Ensure all essential tools are present
apt-get install -y --fix-missing openssl ca-certificates libcurl curl git python python-pip openssh wget || true

# Pre-compiled pillow for Android if available to avoid C compile errors
pkg install -y python-pillow 2>/dev/null || true

echo "📦 [4/5] Installing Python backend packages (FastAPI & Android wheels)..."
pip install --upgrade pip --no-warn-script-location 2>/dev/null || true
# Install pre-compiled pydantic-core wheel for Android Termux Python 3.14
pip install --no-cache-dir --extra-index-url https://eutalix.github.io/android-pydantic-core/ pydantic-core pydantic || true
# Install pure-Python ASGI server and essential backend dependencies
pip install --no-cache-dir fastapi uvicorn sqlalchemy python-multipart openpyxl passlib pyjwt python-jose requests

echo "📂 [5/5] Fetching latest repository code..."
cd "$HOME"
rm -rf "MARG-ERP-9---Envelope-Print-manager" 2>/dev/null || true
git clone --depth 1 https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
cd MARG-ERP-9---Envelope-Print-manager

echo "🚀 Generating 1-tap start script at ~/start-server.sh..."
cat << 'EOF' > "$HOME/start-server.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
cd "$HOME/MARG-ERP-9---Envelope-Print-manager/backend"

echo "======================================================"
echo "🚀 STARTING MARG ENVELOPE MANAGER MOBILE 24/7 SERVER"
echo "======================================================"

python -m uvicorn main:app --host 0.0.0.0 --port 8080 &
SERVER_PID=$!

sleep 3
WIFI_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || true)
echo ""
echo "📱 Local Phone Access: http://127.0.0.1:8080"
if [ -n "$WIFI_IP" ]; then
  echo "📶 Same Wi-Fi Access:  http://$WIFI_IP:8080 (Laptop / Other Phones)"
fi
echo "🌐 Starting Public HTTPS Tunnel via SSH (100% Free Forever)..."
echo "======================================================"
echo "⚡ Your Free Public 24/7 Website Link will appear below:"
echo "======================================================"

# Start tunnel using native SSH (zero account needed, zero DNS bugs on Android)
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:8080 nokey@localhost.run || \
ssh -o StrictHostKeyChecking=no -p 443 -R0:localhost:8080 qr@a.pinggy.io

kill $SERVER_PID 2>/dev/null || true
EOF

chmod +x "$HOME/start-server.sh"

cat << 'EOF' > "$HOME/start-cloudflare-tunnel.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
cd "$HOME/MARG-ERP-9---Envelope-Print-manager/backend"

echo "======================================================"
echo "🚀 STARTING MARG MOBILE SERVER VIA CLOUDFLARE TUNNEL"
echo "======================================================"

python -m uvicorn main:app --host 0.0.0.0 --port 8080 &
SERVER_PID=$!

sleep 3
echo "🌐 Connecting to Cloudflare Zero Trust Tunnel (remote)..."
cloudflared tunnel run --token eyJhIjoiZGEyZGRiOTVmYmVhMjQzNGM4YWMwYTFhNjViN2Y3MjEiLCJ0IjoiOTAwY2I1Y2EtOTY5ZC00MzAzLTk3ZWYtMDZmMjVjMTEzZDExIiwicyI6Ill6WTRObUV6T0RFdE56QmhNUzAwTmpCa0xXSXdPREV0WWpFMk16VmxOVE00TnpGbCJ9 --protocol http2 --edge-ip-version 4

kill $SERVER_PID 2>/dev/null || true
EOF

chmod +x "$HOME/start-cloudflare-tunnel.sh"

# Add aliases to ~/.bashrc for easy 1-word startup
if ! grep -q "start-server.sh" "$HOME/.bashrc" 2>/dev/null; then
  echo "alias server='$HOME/start-server.sh'" >> "$HOME/.bashrc"
  echo "alias cftunnel='$HOME/start-cloudflare-tunnel.sh'" >> "$HOME/.bashrc"
fi

echo ""
echo "======================================================================"
echo "🎉 INSTALLATION COMPLETE! YOUR PHONE IS NOW A 24/7 WEB SERVER"
echo "======================================================================"
echo "To start your server anytime, simply type:"
echo "  server"
echo "  (or ~/start-server.sh)"
echo ""
echo "⚠️ IMPORTANT ANDROID SETTINGS (To keep it running 24/7 when screen is locked):"
echo "  1. Long-press the Termux App icon -> App Info"
echo "  2. Go to 'Battery' -> Select 'Unrestricted' (Don't optimize battery)"
echo "  3. Lock Termux in recent apps so Android never kills it."
echo "======================================================================"
