#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Start Script (Termux)
# Starts: 1. PostgreSQL Database (Port 5432)
#         2. Shreeji Order Book (Next.js - Port 3000)
#         3. MARG Envelope Print Manager (FastAPI - Port 8080)
#         4. Cloudflare Custom Subdomain Tunnel (Permanent HTTPS Domains)
# ==============================================================================

# Terminal Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
BASE_DIR="${HOME}/shreeji"
PG_DATA="${PREFIX_DIR}/var/lib/postgresql"

# Cloudflare Named Tunnel Token for Permanent Custom Subdomains:
# 1. envelope.shreeji7.com -> http://localhost:8080
# 2. order.shreeji7.com    -> http://localhost:3000
CF_TUNNEL_TOKEN="eyJhIjoiZGEyZGRiOTVmYmVhMjQzNGM4YWMwYTFhNjViN2Y3MjEiLCJ0IjoiOTAwY2I1Y2EtOTY5ZC00MzAzLTk3ZWYtMDZmMjVjMTEzZDExIiwicyI6Ill6WTRObUV6T0RFdE56QmhNUzAwTmpCa0xXSXdPREV0WWpFMk16VmxOVE00TnpGbCJ9"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}     SHREEJI HEALTHCARE - 24/7 SERVER & CUSTOM SUBDOMAIN LAUNCHER             ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"

# 1. Acquire Android Wake Lock so services continue running when screen is off
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
    echo -e "${GREEN}[*] Android Wake-Lock acquired (Server will stay alive 24/7).${NC}"
fi

mkdir -p "${BASE_DIR}/logs"
mkdir -p "${BASE_DIR}/pids"

# 2. Start PostgreSQL Database
echo -e "\n${BLUE}[1/4] Checking PostgreSQL Database...${NC}"
if pg_isready -q 2>/dev/null; then
    echo -e "${GREEN}    [✓] PostgreSQL is already running on port 5432.${NC}"
else
    echo -e "    [*] Starting PostgreSQL database server..."
    pg_ctl -D "${PG_DATA}" -l "${BASE_DIR}/logs/postgres.log" start >/dev/null 2>&1
    sleep 2
    if pg_isready -q 2>/dev/null; then
        echo -e "${GREEN}    [✓] PostgreSQL started successfully on port 5432.${NC}"
    else
        echo -e "${YELLOW}    [!] Starting directly...${NC}"
        pg_ctl -D "${PG_DATA}" start >/dev/null 2>&1
    fi
fi

# 3. Start Shreeji Healthcare Order Book (Next.js - Port 3000)
echo -e "\n${BLUE}[2/4] Checking Shreeji Order Book (B2B)...${NC}"
ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ]; then
    if [ -d "${BASE_DIR}/B2B" ]; then
        ORDERBOOK_DIR="${BASE_DIR}/B2B"
    fi
fi

if [ -d "${ORDERBOOK_DIR}" ]; then
    if lsof -i :3000 >/dev/null 2>&1 || fuser 3000/tcp >/dev/null 2>&1; then
        echo -e "${GREEN}    [✓] Order Book is already active on port 3000.${NC}"
    else
        echo -e "    [*] Starting Order Book on port 3000..."
        cd "${ORDERBOOK_DIR}"
        export PORT=3000
        export NODE_ENV=production
        export ENVELOPE_MANAGER_API_URL="http://127.0.0.1:8080"
        
        if [ -d ".next" ]; then
            nohup npm run start > "${BASE_DIR}/logs/orderbook.log" 2>&1 &
        else
            nohup npm run dev > "${BASE_DIR}/logs/orderbook.log" 2>&1 &
        fi
        echo $! > "${BASE_DIR}/pids/orderbook.pid"
        sleep 2
        echo -e "${GREEN}    [✓] Order Book server launched (Port 3000).${NC}"
    fi
else
    echo -e "${RED}    [X] Order Book directory not found at ${ORDERBOOK_DIR}.${NC}"
fi

# 4. Start MARG Envelope Print Manager (FastAPI - Port 8080)
echo -e "\n${BLUE}[3/4] Checking MARG ERP Envelope Print Manager...${NC}"
ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ]; then
    if [ -d "${BASE_DIR}/ENVELOPE" ]; then
        ENVELOPE_DIR="${BASE_DIR}/ENVELOPE"
    fi
fi

if [ -d "${ENVELOPE_DIR}" ]; then
    if lsof -i :8080 >/dev/null 2>&1 || fuser 8080/tcp >/dev/null 2>&1; then
        echo -e "${GREEN}    [✓] Envelope Print Manager is already active on port 8080.${NC}"
    else
        echo -e "    [*] Starting Envelope Print Manager on port 8080..."
        cd "${ENVELOPE_DIR}"
        
        PYTHON_BIN="python3"
        if [ -f "${BASE_DIR}/venv/bin/python" ]; then
            PYTHON_BIN="${BASE_DIR}/venv/bin/python"
        elif [ -f "${ENVELOPE_DIR}/venv/bin/python" ]; then
            PYTHON_BIN="${ENVELOPE_DIR}/venv/bin/python"
        fi
        
        export ORDER_BOOK_API_URL="http://127.0.0.1:3000"
        nohup "${PYTHON_BIN}" -m uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir backend > "${BASE_DIR}/logs/envelope.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/envelope.pid"
        sleep 2
        echo -e "${GREEN}    [✓] Envelope Print Manager launched (Port 8080).${NC}"
    fi
else
    echo -e "${RED}    [X] Envelope Manager directory not found at ${ENVELOPE_DIR}.${NC}"
fi

# 5. Connect Permanent Cloudflare Custom Subdomain Tunnel
if command -v cloudflared >/dev/null 2>&1; then
    echo -e "\n${BLUE}[4/4] Activating Permanent Cloudflare Custom Subdomains...${NC}"
    
    # Check if tunnel is already connected
    if pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
        echo -e "${GREEN}    [✓] Cloudflare Tunnel is already connected.${NC}"
    else
        nohup cloudflared tunnel run --token "${CF_TUNNEL_TOKEN}" > "${BASE_DIR}/logs/tunnel.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/tunnel.pid"
        sleep 3
        echo -e "${GREEN}    [✓] Connected to Cloudflare Edge Network!${NC}"
    fi
else
    echo -e "\n${YELLOW}[!] cloudflared is not installed. To enable public subdomains, run: pkg install cloudflared -y${NC}"
fi

# 6. Detect Device Local Wi-Fi IP
WIFI_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1)
if [ -z "${WIFI_IP}" ]; then
    WIFI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "${WIFI_IP}" ]; then
    WIFI_IP="<PHONE_WIFI_IP>"
fi

echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}    🎉 YOUR OWN SERVER IS LIVE WITH PERMANENT CUSTOM SUBDOMAINS!              ${NC}"
echo -e "${GREEN}${BOLD}==============================================================================${NC}"

echo -e "\n${CYAN}${BOLD}🌐 1. PERMANENT PUBLIC WEB SUBDOMAINS (Never Changes - Access Anywhere):${NC}"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  ${GREEN}${BOLD}https://envelope.shreeji7.com${NC}"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     ${GREEN}${BOLD}https://order.shreeji7.com${NC}"

echo -e "\n${YELLOW}${BOLD}🏠 2. LOCAL WI-FI ACCESS (Superfast for Office PC / Laptop):${NC}"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  ${YELLOW}http://${WIFI_IP}:8080${NC}"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     ${YELLOW}http://${WIFI_IP}:3000${NC}"

echo -e "\n${BOLD}📱 3. ON THIS PHONE (Mobile Browser):${NC}"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  http://localhost:8080"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     http://localhost:3000"

echo -e "\n${BOLD}⚡ ZERO MONTHLY COST & 100% INDEPENDENT:${NC}"
echo -e "   • No Railway subscription needed."
echo -e "   • High performance database & cross-app sync running locally 24/7."

echo -e "\n${BOLD}🛠️ QUICK COMMANDS:${NC}"
echo -e "   • Check status & URLs: ${CYAN}status${NC} (or bash ~/shreeji/status.sh)"
echo -e "   • Stop all servers:    ${CYAN}stop${NC}   (or bash ~/shreeji/stop-all.sh)"
echo -e "   • Update latest code:  ${CYAN}update${NC} (or bash ~/shreeji/update.sh)"
echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"
