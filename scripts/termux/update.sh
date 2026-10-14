#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Update Script (Termux)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

BASE_DIR="${HOME}/shreeji"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}           UPDATING SHREEJI HEALTHCARE APPLICATIONS (TERMUX)                  ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"

# 1. Update MARG Envelope Manager
echo -e "\n${BLUE}[1/2] Updating MARG Envelope Manager...${NC}"
ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ] && [ -d "${BASE_DIR}/ENVELOPE" ]; then
    ENVELOPE_DIR="${BASE_DIR}/ENVELOPE"
fi
if [ -d "${ENVELOPE_DIR}" ]; then
    cd "${ENVELOPE_DIR}"
    git pull origin main || true
    echo -e "${GREEN}    [✓] Envelope Manager updated.${NC}"
fi

# 2. Update Order Book
echo -e "\n${BLUE}[2/2] Updating Shreeji Order Book...${NC}"
ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ] && [ -d "${BASE_DIR}/B2B" ]; then
    ORDERBOOK_DIR="${BASE_DIR}/B2B"
fi
if [ -d "${ORDERBOOK_DIR}" ]; then
    cd "${ORDERBOOK_DIR}"
    git pull origin main || true
    # Run any new database migrations
    npm run db:migrate || true
    echo -e "${GREEN}    [✓] Order Book updated.${NC}"
fi

echo -e "\n${YELLOW}[*] Restarting services with latest changes...${NC}"
bash "${BASE_DIR}/stop-all.sh"
sleep 2
bash "${BASE_DIR}/start-all.sh"
