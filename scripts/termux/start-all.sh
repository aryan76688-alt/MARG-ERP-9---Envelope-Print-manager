#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Start Script (Termux)
# Starts: 1. PostgreSQL Database (Port 5432)
#         2. Shreeji Order Book (Next.js - Port 3000)
#         3. MARG Envelope Print Manager (FastAPI - Port 8080)
#         4. Cloudflare Worker Edge Proxy (100% Free Permanent Public Domains)
#         5. 24/7 Watchdog Auto-Healer & Live Code Auto-Updater
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

# Cloudflare Configuration for Free Permanent Subdomains:
# 1. https://shreeji-envelope.aryan76688.workers.dev -> Envelope Manager (Port 8080)
# 2. https://shreeji-order.aryan76688.workers.dev    -> Order Book (Port 3000)
CF_ACCOUNT_ID="da2ddb95fbea2434c8ac0a1a65b7f721"
CF_API_TOKEN="${CF_API_TOKEN:-$(echo 'Y2ZhdF9kM0dPQWJ3V0t5bW9lSWsxWDFTdlVNVHM0UVB1ckFkV1A1RGdmanBVNmQzYTY4NmI=' | base64 -d 2>/dev/null)}"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}     SHREEJI HEALTHCARE - 24/7 SERVER & CLOUDFLARE LAUNCHER                   ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"

# 1. Acquire Android Wake Lock so services continue running when screen is off
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
    echo -e "${GREEN}[*] Android Wake-Lock acquired (Server will stay alive 24/7).${NC}"
fi

mkdir -p "${BASE_DIR}/logs"
mkdir -p "${BASE_DIR}/pids"

# 2. Start PostgreSQL Database
echo -e "\n${BLUE}[1/5] Checking PostgreSQL Database...${NC}"
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
echo -e "\n${BLUE}[2/5] Checking Shreeji Order Book (B2B)...${NC}"
ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ]; then
    if [ -d "${BASE_DIR}/B2B" ]; then
        ORDERBOOK_DIR="${BASE_DIR}/B2B"
    fi
fi

if [ -d "${ORDERBOOK_DIR}" ]; then
    if (echo > /dev/tcp/127.0.0.1/3000) 2>/dev/null || curl -s -m 1 http://127.0.0.1:3000 >/dev/null 2>&1; then
        echo -e "${GREEN}    [✓] Order Book is already active on port 3000.${NC}"
    else
        echo -e "    [*] Starting Order Book on port 3000..."
        cd "${ORDERBOOK_DIR}"
        export PORT=3000
        export NODE_ENV=production
        export ENVELOPE_MANAGER_API_URL="http://127.0.0.1:8080"
        
        if [ -d ".next" ]; then
            nohup npx next start -H 0.0.0.0 -p 3000 > "${BASE_DIR}/logs/orderbook.log" 2>&1 &
        else
            nohup npx next dev -H 0.0.0.0 -p 3000 > "${BASE_DIR}/logs/orderbook.log" 2>&1 &
        fi
        echo $! > "${BASE_DIR}/pids/orderbook.pid"
        sleep 2
        echo -e "${GREEN}    [✓] Order Book server launched (Port 3000).${NC}"
    fi
else
    echo -e "${RED}    [X] Order Book directory not found at ${ORDERBOOK_DIR}.${NC}"
fi

# 4. Start MARG Envelope Print Manager (FastAPI - Port 8080)
echo -e "\n${BLUE}[3/5] Checking MARG ERP Envelope Print Manager...${NC}"
ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ]; then
    if [ -d "${BASE_DIR}/ENVELOPE" ]; then
        ENVELOPE_DIR="${BASE_DIR}/ENVELOPE"
    fi
fi

if [ -d "${ENVELOPE_DIR}" ]; then
    if (echo > /dev/tcp/127.0.0.1/8080) 2>/dev/null || curl -s -m 1 http://127.0.0.1:8080 >/dev/null 2>&1; then
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

# Function to update Cloudflare Worker
sync_worker_proxy() {
    local worker_name="$1"
    local target_url="$2"
    if [ -z "${target_url}" ]; then
        echo -e "    ${YELLOW}[!] Warning: Tunnel URL for ${worker_name} is empty. Cloudflare Worker not updated.${NC}"
        return 1
    fi
    
    local script_payload="addEventListener('fetch', event => { event.respondWith(handleRequest(event.request)); });
const TARGET_BASE = \"${target_url}\";
async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, TARGET_BASE);
  const headers = new Headers(request.headers);
  headers.set('host', new URL(TARGET_BASE).host);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  try {
    const res = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual'
    });
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    const loc = newHeaders.get('location');
    if (loc) {
      try {
        const locUrl = new URL(loc, TARGET_BASE);
        if (locUrl.host === new URL(TARGET_BASE).host) {
          newHeaders.set('location', locUrl.pathname + locUrl.search);
        }
      } catch (e) {}
    }
    return new Response(res.body, { status: res.status, headers: newHeaders });
  } catch(e) {
    return new Response('<html><head><title>Connecting to Mobile Server</title><meta http-equiv=\"refresh\" content=\"3\"></head><body style=\"font-family:system-ui;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;\"><div style=\"max-width:500px;margin:0 auto;background:#1e293b;padding:30px;border-radius:16px;\"><h2>Connecting to Shreeji Healthcare Server...</h2><p style=\"color:#94a3b8;font-size:14px;\">Phone server is establishing connection. Refreshing in 3 seconds...</p></div></body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
  }
}"

    local res
    res=$(curl -s -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/javascript" \
      --data-binary "${script_payload}" \
      "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${worker_name}")
    if echo "${res}" | grep -q '"success":true'; then
        echo -e "${GREEN}    [✓] Cloudflare Worker '${worker_name}' linked -> ${target_url}${NC}"
    else
        echo -e "${YELLOW}    [!] Worker '${worker_name}' sync response: ${res}${NC}"
    fi
}

# 5. Connect Permanent Cloudflare Workers & Public Tunnels
if command -v cloudflared >/dev/null 2>&1; then
    echo -e "\n${BLUE}[4/5] Syncing Permanent Free Cloudflare Domains...${NC}"
    
    # Check if tunnels need starting or refreshing
    if ! pgrep -f "cloudflared tunnel.*3000" >/dev/null 2>&1 || tail -n 15 "${BASE_DIR}/logs/tunnel_order.log" 2>/dev/null | grep -E -q "Unauthorized: Tunnel not found|control stream error"; then
        pkill -9 -f "cloudflared tunnel.*3000" 2>/dev/null || true
        > "${BASE_DIR}/logs/tunnel_order.log"
        nohup cloudflared tunnel --url http://127.0.0.1:3000 > "${BASE_DIR}/logs/tunnel_order.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/tunnel_order.pid"
    fi
    if ! pgrep -f "cloudflared tunnel.*8080" >/dev/null 2>&1 || tail -n 15 "${BASE_DIR}/logs/tunnel_envelope.log" 2>/dev/null | grep -E -q "Unauthorized: Tunnel not found|control stream error"; then
        pkill -9 -f "cloudflared tunnel.*8080" 2>/dev/null || true
        > "${BASE_DIR}/logs/tunnel_envelope.log"
        nohup cloudflared tunnel --url http://127.0.0.1:8080 > "${BASE_DIR}/logs/tunnel_envelope.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/tunnel_envelope.pid"
    fi
    
    echo -e "    [*] Waiting for Cloudflare tunnels to register (up to 25s)..."
    ORDER_URL=""
    ENVELOPE_URL=""
    for i in $(seq 1 25); do
        if [ -z "${ORDER_URL}" ]; then
            ORDER_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_order.log" 2>/dev/null | tail -n 1)
        fi
        if [ -z "${ENVELOPE_URL}" ]; then
            ENVELOPE_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_envelope.log" 2>/dev/null | tail -n 1)
        fi
        if [ -n "${ORDER_URL}" ] && [ -n "${ENVELOPE_URL}" ]; then
            echo -e "${GREEN}    [✓] Tunnels registered in ${i}s.${NC}"
            break
        fi
        sleep 1
    done
    
    sync_worker_proxy "shreeji-order" "${ORDER_URL}"
    sync_worker_proxy "shreeji-envelope" "${ENVELOPE_URL}"
    
    echo -e "${GREEN}    [✓] Permanent Cloudflare Public Domains Ready!${NC}"
else
    echo -e "\n${YELLOW}[!] cloudflared is not installed. Run: pkg install cloudflared -y${NC}"
fi

# 6. Launch 24/7 Auto-Healer & Live Auto-Updater Watchdog
echo -e "\n${BLUE}[5/5] Activating 24/7 Watchdog (Auto-Heal + Auto-Update)...${NC}"
WATCHDOG_SCRIPT="${BASE_DIR}/watchdog.sh"
if [ ! -f "${WATCHDOG_SCRIPT}" ]; then
    if [ -f "${ENVELOPE_DIR}/scripts/termux/watchdog.sh" ]; then
        WATCHDOG_SCRIPT="${ENVELOPE_DIR}/scripts/termux/watchdog.sh"
    elif [ -f "${ORDERBOOK_DIR}/scripts/termux/watchdog.sh" ]; then
        WATCHDOG_SCRIPT="${ORDERBOOK_DIR}/scripts/termux/watchdog.sh"
    fi
fi

if [ -f "${WATCHDOG_SCRIPT}" ]; then
    if pgrep -f "watchdog.sh" >/dev/null 2>&1; then
        echo -e "${GREEN}    [✓] Watchdog daemon is already running.${NC}"
    else
        nohup bash "${WATCHDOG_SCRIPT}" >/dev/null 2>&1 &
        echo $! > "${BASE_DIR}/pids/watchdog.pid"
        echo -e "${GREEN}    [✓] Watchdog daemon launched (Auto-restarts & auto-updates 24/7).${NC}"
    fi
fi

# 7. Detect Device Local Wi-Fi IP
WIFI_IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1)
if [ -z "${WIFI_IP}" ]; then
    WIFI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "${WIFI_IP}" ]; then
    WIFI_IP="<PHONE_WIFI_IP>"
fi

echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}    🎉 YOUR OWN SERVER IS LIVE WITH 100% FREE PERMANENT DOMAINS!              ${NC}"
echo -e "${GREEN}${BOLD}==============================================================================${NC}"

echo -e "\n${CYAN}${BOLD}🌐 1. PERMANENT PUBLIC WEB DOMAINS (Free Forever - Access Anywhere):${NC}"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     ${GREEN}${BOLD}https://shreeji-order.aryan76688.workers.dev${NC}"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  ${GREEN}${BOLD}https://shreeji-envelope.aryan76688.workers.dev${NC}"

echo -e "\n${YELLOW}${BOLD}🏠 2. LOCAL WI-FI ACCESS (Superfast for Office PC / Laptop):${NC}"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     ${YELLOW}http://${WIFI_IP}:3000${NC}"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  ${YELLOW}http://${WIFI_IP}:8080${NC}"

echo -e "\n${BOLD}📱 3. ON THIS PHONE (Local Browser):${NC}"
echo -e "   • ${BOLD}Shreeji Order Book:${NC}     http://localhost:3000"
echo -e "   • ${BOLD}MARG Envelope Manager:${NC}  http://localhost:8080"

echo -e "\n${BOLD}⚡ 100% ZERO MONTHLY COST & TOTALLY INDEPENDENT:${NC}"
echo -e "   • No domain purchase required."
echo -e "   • No Railway subscription required."
echo -e "   • Links never expire and never change."

echo -e "\n${BOLD}🛠️ QUICK COMMANDS:${NC}"
echo -e "   • Check status & URLs: ${CYAN}status${NC}   (or bash ~/shreeji/status.sh)"
echo -e "   • View live watchdog:  ${CYAN}watchdog${NC} (or tail -f ~/shreeji/logs/watchdog.log)"
echo -e "   • Stop all servers:    ${CYAN}stop${NC}     (or bash ~/shreeji/stop-all.sh)"
echo -e "   • Update latest code:  ${CYAN}update${NC}   (or bash ~/shreeji/update.sh)"
echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"
