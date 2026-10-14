#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Status Check (Termux)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

BASE_DIR="${HOME}/shreeji"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}     SHREEJI HEALTHCARE - LIVE MOBILE SERVER STATUS (TERMUX)                  ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"

# 1. PostgreSQL Status
echo -e "\n${BOLD}[1] PostgreSQL Database (Port 5432):${NC}"
if pg_isready -q 2>/dev/null; then
    echo -e "    Status:   ${GREEN}🟢 ONLINE / RUNNING${NC}"
    echo -e "    Database: shreeji_healthcare (localhost:5432)"
else
    echo -e "    Status:   ${RED}🔴 OFFLINE / STOPPED${NC}"
fi

# 2. Shreeji Order Book Status
echo -e "\n${BOLD}[2] Shreeji Order Book (Next.js - Port 3000):${NC}"
if lsof -i :3000 >/dev/null 2>&1 || fuser 3000/tcp >/dev/null 2>&1; then
    PID=$(cat "${BASE_DIR}/pids/orderbook.pid" 2>/dev/null || echo "Active")
    echo -e "    Status:   ${GREEN}🟢 ONLINE / RUNNING${NC} (PID: ${PID})"
    echo -e "    Local:    ${CYAN}http://localhost:3000${NC}"
else
    echo -e "    Status:   ${RED}🔴 OFFLINE / STOPPED${NC}"
fi

# 3. MARG Envelope Print Manager Status
echo -e "\n${BOLD}[3] MARG ERP Envelope Print Manager (FastAPI - Port 8080):${NC}"
if lsof -i :8080 >/dev/null 2>&1 || fuser 8080/tcp >/dev/null 2>&1; then
    PID=$(cat "${BASE_DIR}/pids/envelope.pid" 2>/dev/null || echo "Active")
    echo -e "    Status:   ${GREEN}🟢 ONLINE / RUNNING${NC} (PID: ${PID})"
    echo -e "    Local:    ${CYAN}http://localhost:8080${NC}"
else
    echo -e "    Status:   ${RED}🔴 OFFLINE / STOPPED${NC}"
fi

# 4. Public Web Tunnels Status
echo -e "\n${BOLD}[4] Public Web Tunnels (Cloudflare Free):${NC}"
ENVELOPE_PUBLIC_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_envelope.log" 2>/dev/null | tail -n 1)
ORDERBOOK_PUBLIC_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_orderbook.log" 2>/dev/null | tail -n 1)

if pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    echo -e "    Status:   ${GREEN}🟢 ONLINE (Accessible worldwide)${NC}"
    if [ -n "${ENVELOPE_PUBLIC_URL}" ]; then
        echo -e "    • Envelope Manager URL: ${GREEN}${BOLD}${ENVELOPE_PUBLIC_URL}${NC}"
    fi
    if [ -n "${ORDERBOOK_PUBLIC_URL}" ]; then
        echo -e "    • Order Book URL:       ${GREEN}${BOLD}${ORDERBOOK_PUBLIC_URL}${NC}"
    fi
else
    echo -e "    Status:   ${RED}🔴 OFFLINE (Tunnels not running)${NC}"
fi

# 5. Local Wi-Fi IP
WIFI_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1)
if [ -z "${WIFI_IP}" ]; then
    WIFI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -n "${WIFI_IP}" ]; then
    echo -e "\n${BOLD}📡 Office Wi-Fi Access (for PC & other phones):${NC}"
    echo -e "    • Envelope Manager: ${YELLOW}http://${WIFI_IP}:8080${NC}"
    echo -e "    • Order Book:       ${YELLOW}http://${WIFI_IP}:3000${NC}"
fi

echo -e "\n${CYAN}${BOLD}==============================================================================${NC}\n"
