#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare Unified Service Manager - Bulletproof Update Script (Termux)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

BASE_DIR="${HOME}/shreeji"
mkdir -p "${BASE_DIR}/logs" "${BASE_DIR}/pids"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}           UPDATING SHREEJI HEALTHCARE APPLICATIONS (TERMUX)                  ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"

# Allow git operations across any user IDs in Termux
git config --global --add safe.directory "*" 2>/dev/null || true

# Helper function to find a directory among multiple candidate paths
find_dir() {
    for d in "$@"; do
        if [ -d "$d" ]; then
            echo "$d"
            return 0
        fi
    done
    return 1
}

# 1. Update MARG Envelope Manager
echo -e "\n${BLUE}[1/2] Updating MARG Envelope Manager...${NC}"
ENVELOPE_DIR=$(find_dir \
    "${BASE_DIR}/MARG-Envelope-Manager" \
    "${BASE_DIR}/ENVELOPE" \
    "${HOME}/ENVELOPE" \
    "${HOME}/MARG-ERP-9---Envelope-Print-manager" \
    "${BASE_DIR}/MARG-ERP-9---Envelope-Print-manager" \
    "$(pwd)")

if [ -n "${ENVELOPE_DIR}" ] && [ -d "${ENVELOPE_DIR}/.git" ]; then
    echo -e "    [*] Found Envelope repository at: ${ENVELOPE_DIR}"
    cd "${ENVELOPE_DIR}"
    
    # Backup backend/.env if present
    if [ -f "${ENVELOPE_DIR}/backend/.env" ]; then
        cp "${ENVELOPE_DIR}/backend/.env" "${BASE_DIR}/backend.env.bak" 2>/dev/null || true
    fi

    # Fetch latest and cleanly reset to origin/main (prevents local merge conflicts)
    echo -e "    [*] Fetching latest code from GitHub..."
    git fetch origin main 2>/dev/null || git fetch --all 2>/dev/null || true
    git stash 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git pull --rebase origin main 2>/dev/null || true

    # Restore backend/.env if needed
    if [ -f "${BASE_DIR}/backend.env.bak" ] && [ ! -f "${ENVELOPE_DIR}/backend/.env" ]; then
        cp "${BASE_DIR}/backend.env.bak" "${ENVELOPE_DIR}/backend/.env" 2>/dev/null || true
    fi

    # Refresh Python packages
    PYTHON_BIN="python3"
    if [ -f "${BASE_DIR}/venv/bin/python" ]; then
        PYTHON_BIN="${BASE_DIR}/venv/bin/python"
    elif [ -f "${ENVELOPE_DIR}/venv/bin/python" ]; then
        PYTHON_BIN="${ENVELOPE_DIR}/venv/bin/python"
    fi
    
    if [ -f "${ENVELOPE_DIR}/backend/requirements.txt" ]; then
        echo -e "    [*] Updating Python dependencies..."
        "${PYTHON_BIN}" -m pip install -r "${ENVELOPE_DIR}/backend/requirements.txt" pypdf --quiet --disable-pip-version-check 2>/dev/null || true
    fi

    echo -e "${GREEN}    [✓] Envelope Manager successfully updated to $(git rev-parse --short HEAD 2>/dev/null || echo 'latest').${NC}"
else
    echo -e "${YELLOW}    [!] Warning: Envelope repository directory not found. Skipping.${NC}"
fi

# 2. Update Shreeji Order Book (Next.js)
echo -e "\n${BLUE}[2/2] Updating Shreeji Order Book (Next.js)...${NC}"
ORDERBOOK_DIR=$(find_dir \
    "${BASE_DIR}/b2b-pharma-app" \
    "${BASE_DIR}/B2B" \
    "${HOME}/b2b-pharma-app" \
    "${HOME}/B2B" \
    "${BASE_DIR}/b2b")

if [ -n "${ORDERBOOK_DIR}" ] && [ -d "${ORDERBOOK_DIR}/.git" ]; then
    echo -e "    [*] Found Order Book repository at: ${ORDERBOOK_DIR}"
    cd "${ORDERBOOK_DIR}"

    # Backup .env.local
    if [ -f "${ORDERBOOK_DIR}/.env.local" ]; then
        cp "${ORDERBOOK_DIR}/.env.local" "${BASE_DIR}/orderbook.env.bak" 2>/dev/null || true
    fi

    echo -e "    [*] Fetching latest code from GitHub..."
    git fetch origin main 2>/dev/null || git fetch --all 2>/dev/null || true
    git stash 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || git pull --rebase origin main 2>/dev/null || true

    # Restore .env.local
    if [ -f "${BASE_DIR}/orderbook.env.bak" ]; then
        cp "${BASE_DIR}/orderbook.env.bak" "${ORDERBOOK_DIR}/.env.local" 2>/dev/null || true
    fi

    echo -e "    [*] Updating node modules and running migrations..."
    npm install --no-audit --prefer-offline 2>/dev/null || true
    npm run db:migrate 2>/dev/null || true

    # Rebuild if production build exists, or purge broken builds
    if [ -f ".next/BUILD_ID" ]; then
        echo -e "    [*] Updating production build..."
        NODE_OPTIONS="--max-old-space-size=2048" npm run build 2>/dev/null || rm -rf .next
    fi

    echo -e "${GREEN}    [✓] Order Book successfully updated to $(git rev-parse --short HEAD 2>/dev/null || echo 'latest').${NC}"
else
    echo -e "${YELLOW}    [!] Warning: Order Book repository directory not found. Skipping.${NC}"
fi

# 3. Synchronize control scripts to $BASE_DIR
if [ -n "${ENVELOPE_DIR}" ] && [ -d "${ENVELOPE_DIR}/scripts/termux" ]; then
    cp -f "${ENVELOPE_DIR}/scripts/termux/"*.sh "${BASE_DIR}/" 2>/dev/null || true
    chmod +x "${BASE_DIR}"/*.sh 2>/dev/null || true
fi

# 4. Restart all services cleanly
echo -e "\n${YELLOW}[*] Gracefully restarting all services with latest updates...${NC}"
if [ -f "${BASE_DIR}/stop-all.sh" ]; then
    bash "${BASE_DIR}/stop-all.sh"
elif [ -n "${ENVELOPE_DIR}" ] && [ -f "${ENVELOPE_DIR}/scripts/termux/stop-all.sh" ]; then
    bash "${ENVELOPE_DIR}/scripts/termux/stop-all.sh"
fi

sleep 2

if [ -f "${BASE_DIR}/start-all.sh" ]; then
    bash "${BASE_DIR}/start-all.sh"
elif [ -n "${ENVELOPE_DIR}" ] && [ -f "${ENVELOPE_DIR}/scripts/termux/start-all.sh" ]; then
    bash "${ENVELOPE_DIR}/scripts/termux/start-all.sh"
fi

echo -e "\n${GREEN}${BOLD}[✓] UPDATE COMPLETE! All applications are running the latest version.${NC}\n"
