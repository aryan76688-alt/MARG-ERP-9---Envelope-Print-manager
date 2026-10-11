#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# MARG ERP 9 Envelope Print Manager - Termux (Android Mobile) 24/7 Server Setup
# ==============================================================================
set -e

echo "📱 [1/6] Preventing Android from sleeping CPU..."
termux-wake-lock 2>/dev/null || true

echo "🔄 [2/6] Updating Termux packages..."
pkg update -y && pkg upgrade -y
pkg install -y proot-distro git curl jq

echo "🐧 [3/6] Setting up Ubuntu on Android..."
if ! proot-distro list | grep -q "ubuntu.*installed"; then
  proot-distro install ubuntu
fi

echo "📦 [4/6] Installing dependencies and MARG server inside Ubuntu..."
proot-distro login ubuntu -- bash -c '
set -e
echo "Updating Ubuntu..."
apt update -y && apt install -y python3 python3-pip python3-venv git curl \
  libpango-1.0-0 libharfbuzz0b libpangocairo-1.0-0 libffi-dev \
  fonts-noto-core fonts-indic libpq-dev build-essential

mkdir -p /opt
cd /opt
if [ -d "MARG-ERP-9---Envelope-Print-manager" ]; then
  cd MARG-ERP-9---Envelope-Print-manager
  git pull origin main
else
  git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git
  cd MARG-ERP-9---Envelope-Print-manager
fi

echo "Setting up Python virtual environment..."
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r backend/requirements.txt

echo "Setup completed successfully inside Ubuntu."
'

echo "🌐 [5/6] Installing Cloudflare Tunnel on Termux for Public URL..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
else
  CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
fi

if [ ! -f "$PREFIX/bin/cloudflared" ]; then
  curl -L "$CLOUDFLARED_URL" -o "$PREFIX/bin/cloudflared"
  chmod +x "$PREFIX/bin/cloudflared"
fi

echo ""
echo "========================================================================"
echo "🎉 MOBILE SERVER READY!"
echo "========================================================================"
echo "To START the server on your mobile:"
echo "1. Run the server:"
echo "   proot-distro login ubuntu -- bash -c 'cd /opt/MARG-ERP-9---Envelope-Print-manager && ./venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8080'"
echo ""
echo "2. Open a 2nd Termux session and run the Cloudflare tunnel:"
echo "   cloudflared tunnel --url http://localhost:8080"
echo "========================================================================"
