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

echo "📦 [3/5] Updating Termux packages and installing Python & Git..."
apt-get clean 2>/dev/null || true
apt-get update -y --fix-missing || pkg update -y || true
apt-get install -y --fix-missing python git curl wget || pkg install -y python git curl wget

# Pre-compiled pillow for Android if available to avoid C compile errors
pkg install -y python-pillow 2>/dev/null || true

echo "📦 [4/5] Installing Python backend packages..."
pip install --upgrade pip --no-warn-script-location 2>/dev/null || true
# Install pure-Python ASGI server and essential backend dependencies
pip install --no-cache-dir fastapi uvicorn pydantic sqlalchemy python-multipart openpyxl passlib pyjwt python-jose requests
# Optional compiled packages (non-fatal if skipped)
pip install --no-cache-dir pillow bcrypt 2>/dev/null || true

echo "🌐 [5/5] Installing Cloudflare Tunnel (cloudflared for Android)..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "arm" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

curl -fsSL -o "$PREFIX/bin/cloudflared" "$CLOUDFLARED_URL" || wget -qO "$PREFIX/bin/cloudflared" "$CLOUDFLARED_URL"
chmod +x "$PREFIX/bin/cloudflared"

echo "📂 Fetching latest repository code..."
cd "$HOME"
if [ -d "MARG-ERP-9---Envelope-Print-manager/.git" ]; then
  cd MARG-ERP-9---Envelope-Print-manager
  git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
else
  rm -rf "MARG-ERP-9---Envelope-Print-manager" 2>/dev/null || true
  git clone --depth 1 https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
  cd MARG-ERP-9---Envelope-Print-manager
fi

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
echo ""
echo "📱 Local Phone Access: http://127.0.0.1:8080"
echo "🌐 Starting Public HTTPS Tunnel via Cloudflare..."
echo "======================================================"
echo "⚡ Open the public https://xxxx.trycloudflare.com link below:"
echo "======================================================"

cloudflared tunnel --url http://localhost:8080
kill $SERVER_PID 2>/dev/null || true
EOF

chmod +x "$HOME/start-server.sh"

echo ""
echo "======================================================================"
echo "🎉 INSTALLATION COMPLETE! YOUR PHONE IS NOW A 24/7 WEB SERVER"
echo "======================================================================"
echo "To start your server anytime, simply run:"
echo "  ~/start-server.sh"
echo ""
echo "⚠️ IMPORTANT ANDROID SETTINGS (To keep it running 24/7 when screen is locked):"
echo "  1. Long-press the Termux App icon -> App Info"
echo "  2. Go to 'Battery' -> Select 'Unrestricted' (Don't optimize battery)"
echo "  3. Lock Termux in recent apps so Android never kills it."
echo "======================================================================"
