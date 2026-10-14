#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Stop Script (Termux)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
BASE_DIR="${HOME}/shreeji"
PG_DATA="${PREFIX_DIR}/var/lib/postgresql"

echo -e "${YELLOW}${BOLD}==============================================================================${NC}"
echo -e "${YELLOW}${BOLD}             STOPPING ALL SHREEJI HEALTHCARE SERVICES...                     ${NC}"
echo -e "${YELLOW}${BOLD}==============================================================================${NC}"

# 1. Stop Envelope Manager (FastAPI - Port 8080)
echo -e "\n${BLUE}[1/3] Stopping MARG Envelope Print Manager (Port 8080)...${NC}"
if [ -f "${BASE_DIR}/pids/envelope.pid" ]; then
    PID=$(cat "${BASE_DIR}/pids/envelope.pid" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        sleep 1
    fi
    rm -f "${BASE_DIR}/pids/envelope.pid"
fi
pkill -f "uvicorn main:app.*8080" 2>/dev/null || true
echo -e "${GREEN}    [✓] Envelope Print Manager stopped.${NC}"

# 2. Stop Order Book (Next.js - Port 3000)
echo -e "\n${BLUE}[2/3] Stopping Shreeji Order Book (Port 3000)...${NC}"
if [ -f "${BASE_DIR}/pids/orderbook.pid" ]; then
    PID=$(cat "${BASE_DIR}/pids/orderbook.pid" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null
        sleep 1
    fi
    rm -f "${BASE_DIR}/pids/orderbook.pid"
fi
pkill -f "next.*(dev|start)" 2>/dev/null || true
pkill -f "node.*next" 2>/dev/null || true
echo -e "${GREEN}    [✓] Order Book stopped.${NC}"

# 3. Stop PostgreSQL Database
echo -e "\n${BLUE}[3/3] Stopping PostgreSQL Database...${NC}"
if pg_isready -q 2>/dev/null; then
    pg_ctl -D "${PG_DATA}" stop -m fast >/dev/null 2>&1
    sleep 1
fi
echo -e "${GREEN}    [✓] PostgreSQL server stopped.${NC}"

# 4. Release Android Wake Lock
if command -v termux-wake-unlock >/dev/null 2>&1; then
    termux-wake-unlock
    echo -e "${GREEN}[*] Android Wake-Lock released.${NC}"
fi

echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}             ALL SERVICES SUCCESSFULLY STOPPED                               ${NC}"
echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"
