#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# MARG ERP 9 Envelope Print Manager - Termux 24/7 Mobile Server Installer
# Turn your Android Phone into a 24/7 Web Server (Laptop Off, 100% Free Forever)
# ==============================================================================
set -e

echo "📱 [1/5] Preventing Android from putting server to sleep..."
termux-wake-lock 2>/dev/null || true

echo "📦 [2/5] Updating Termux packages and installing Python & Git..."
pkg update -y || apt update -y || true
pkg install -y python git curl wget || apt install -y python git curl wget

# Install pre-compiled pillow for Android if available to avoid C compile errors
pkg install -y python-pillow 2>/dev/null || pip install pillow || true

echo "📦 [3/5] Installing Python backend packages..."
pip install --upgrade pip
pip install fastapi "uvicorn[standard]" pydantic sqlalchemy python-multipart openpyxl passlib bcrypt pyjwt python-jose requests

echo "🌐 [4/5] Installing Cloudflare Tunnel (cloudflared for Android)..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "arm" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

curl -L -o "$PREFIX/bin/cloudflared" "$CLOUDFLARED_URL"
chmod +x "$PREFIX/bin/cloudflared"

echo "📂 [5/5] Fetching latest repository code..."
cd "$HOME"
if [ -d "MARG-ERP-9---Envelope-Print-manager" ]; then
  cd MARG-ERP-9---Envelope-Print-manager
  git pull origin main
else
  git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
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
