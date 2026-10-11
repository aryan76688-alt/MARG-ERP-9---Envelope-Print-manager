#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# MARG ERP 9 Envelope Print Manager - Termux 24/7 Mobile Server Installer
# Turn your Android Phone into a 24/7 Web Server (Laptop Off, 100% Free Forever)
# ==============================================================================
set -e

echo "📱 [1/6] Preventing Android from putting server to sleep..."
termux-wake-lock 2>/dev/null || true

echo "📦 [2/6] Updating Termux packages and installing build tools..."
pkg update -y
pkg install -y python git clang make libffi libjpeg-turbo libpng pango cairo harfbuzz curl wget

echo "📦 [3/6] Installing Python packages for MARG Envelope Manager..."
pip install --upgrade pip setuptools wheel
pip install fastapi "uvicorn[standard]" pydantic sqlalchemy python-multipart openpyxl python-barcode pillow passlib bcrypt pyjwt python-jose requests

# Attempt weasyprint if pango/cairo headers are available
pip install weasyprint 2>/dev/null || echo "ℹ️ WeasyPrint note: Standard HTML/PDF printing will be used."

echo "🌐 [4/6] Installing Cloudflare Tunnel (cloudflared for ARM64 Android)..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "arm" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

curl -L -o "$PREFIX/bin/cloudflared" "$CLOUDFLARED_URL"
chmod +x "$PREFIX/bin/cloudflared"

echo "📂 [5/6] Fetching latest repository code..."
cd "$HOME"
if [ -d "MARG-ERP-9---Envelope-Print-manager" ]; then
  cd MARG-ERP-9---Envelope-Print-manager
  git pull origin main
else
  git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
  cd MARG-ERP-9---Envelope-Print-manager
fi

echo "🚀 [6/6] Generating 1-tap start script at ~/start-server.sh..."
cat << 'EOF' > "$HOME/start-server.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
cd "$HOME/MARG-ERP-9---Envelope-Print-manager/backend"

echo "======================================================"
echo "🚀 STARTING MARG ENVELOPE MANAGER MOBILE 24/7 SERVER"
echo "======================================================"

# Start backend server
python -m uvicorn main:app --host 0.0.0.0 --port 8080 &
SERVER_PID=$!

sleep 3
echo "📱 Local Phone Access: http://127.0.0.1:8080"
echo "🌐 Starting Cloudflare Public HTTPS Tunnel..."
echo "======================================================"
echo "⚡ Copy the public https://xxxx.trycloudflare.com link below:"
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
