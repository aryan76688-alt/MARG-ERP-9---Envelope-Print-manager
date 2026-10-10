#!/usr/bin/env bash
# ==============================================================================
# MARG ERP 9 Envelope Print Manager - Oracle Cloud Always Free 24/7 Auto Deploy
# ==============================================================================
set -e

echo "🚀 [1/5] Updating system packages and installing Docker..."
sudo apt update -y
sudo apt install -y docker.io docker-compose git curl iptables-persistent netfilter-persistent

echo "🐳 [2/5] Enabling and starting Docker service..."
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "🛡️ [3/5] Configuring Oracle Cloud local firewall for ports 80, 443, 8080..."
# Oracle Cloud Ubuntu images include strict iptables rules by default
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT 2>/dev/null || sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo "📦 [4/5] Fetching latest repository code..."
APP_DIR="/opt/marg-envelope-manager"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull origin main
else
  sudo git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "🏗️ [5/5] Building and running Docker container (Auto-restart 24/7)..."
sudo docker stop marg-app 2>/dev/null || true
sudo docker rm marg-app 2>/dev/null || true
sudo docker build -t marg-envelope-manager .
sudo docker run -d \
  --name marg-app \
  --restart always \
  -p 80:8080 \
  -p 8080:8080 \
  -e PORT=8080 \
  -v /opt/marg-data:/app/backend/data \
  marg-envelope-manager

SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "YOUR_SERVER_IP")

echo ""
echo "======================================================================"
echo "🎉 DEPLOYMENT COMPLETE! YOUR APP IS RUNNING 24/7 ON ORACLE CLOUD"
echo "======================================================================"
echo "📍 Direct Server IP URL: http://${SERVER_IP}"
echo ""
echo "🌐 TO BIND YOUR SUBDOMAIN (e.g. envelope.shreeji7.com):"
echo "   Add an 'A' record in your DNS settings:"
echo "   - Type:  A"
echo "   - Host:  envelope"
echo "   - Value: ${SERVER_IP}"
echo "======================================================================"
