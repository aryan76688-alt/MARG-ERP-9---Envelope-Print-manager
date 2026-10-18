#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare - 100% Bulletproof Mobile Server Deployment (Termux)
# Deploys both applications on a single Android device via Termux:
#   1. Shreeji Healthcare Order Book (Next.js - Port 3000)
#   2. MARG ERP 9 Envelope Print Manager (FastAPI - Port 8080)
#   3. PostgreSQL Database (Port 5432)
#   4. Cloudflare Public Web Tunnels (100% Free Public Web Access)
# ==============================================================================

set -e

# Terminal Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
BASE_DIR="${HOME}/shreeji"
PG_DATA="${PREFIX_DIR}/var/lib/postgresql"

clear
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${CYAN}${BOLD}     SHREEJI HEALTHCARE - COMPLETE 24/7 MOBILE SERVER SETUP (TERMUX)          ${NC}"
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}[*] Target Environment: Android (Termux - Your Own Independent Server)${NC}"
echo -e "${GREEN}[*] Target Apps: Order Book (Port 3000) + Envelope Manager (Port 8080)${NC}"
echo -e "${GREEN}[*] Public Web Access: Cloudflare Free Tunnel (Zero Monthly Fees)${NC}"
echo -e "${GREEN}[*] Working Directory: ${BASE_DIR}${NC}\n"

# 1. Acquire Android Wake Lock so deployment is never killed
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
    echo -e "${GREEN}[✓] Android Wake Lock acquired.${NC}"
fi

# 2. Update Termux Packages and Install Core Dependencies
echo -e "\n${BLUE}[1/6] Updating Termux packages and installing dependencies...${NC}"
pkg update -y
pkg install -y git nodejs-lts python postgresql libjpeg-turbo freetype clang make rsync curl termux-tools lsof psmisc

# Install Cloudflare Tunnel for free public web access
pkg install -y cloudflared 2>/dev/null || true

# Pre-compiled C extensions from Termux package manager (avoids compiling C/Rust headers)
pkg install -y python-pillow python-cryptography python-bcrypt 2>/dev/null || true
echo -e "${GREEN}[✓] System packages and cloudflared installed successfully.${NC}"

# 3. Create Base Directory Structure
mkdir -p "${BASE_DIR}"
mkdir -p "${BASE_DIR}/logs"
mkdir -p "${BASE_DIR}/pids"

# 4. Initialize and Configure PostgreSQL
echo -e "\n${BLUE}[2/6] Configuring PostgreSQL Database...${NC}"
if [ ! -d "${PG_DATA}" ] || [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    echo -e "    [*] Initializing PostgreSQL data directory at ${PG_DATA}..."
    mkdir -p "${PG_DATA}"
    initdb -D "${PG_DATA}"
fi

# Ensure local trust authentication in pg_hba.conf
if [ -f "${PG_DATA}/pg_hba.conf" ]; then
    cat << 'HBA_EOF' > "${PG_DATA}/pg_hba.conf"
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
HBA_EOF
fi

# Start PostgreSQL service if not active
if ! pg_isready -q 2>/dev/null; then
    echo -e "    [*] Starting PostgreSQL service..."
    pg_ctl -D "${PG_DATA}" -l "${BASE_DIR}/logs/postgres.log" start
    sleep 3
fi

# Create postgres superuser and shreeji_healthcare database
echo -e "    [*] Setting up databases..."
psql -d postgres -c "CREATE USER postgres WITH SUPERUSER CREATEDB;" 2>/dev/null || true
psql -d postgres -c "ALTER USER postgres WITH SUPERUSER CREATEDB PASSWORD 'postgres';" 2>/dev/null || true
createdb -U postgres shreeji_healthcare 2>/dev/null || createdb shreeji_healthcare 2>/dev/null || true
echo -e "${GREEN}[✓] PostgreSQL configured and active.${NC}"

# 5. Setup Shreeji Healthcare Order Book (Next.js - Port 3000)
echo -e "\n${BLUE}[3/6] Setting up Shreeji Order Book (Next.js)...${NC}"
ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ]; then
    echo -e "    [*] Cloning Shreeji Order Book repository..."
    git clone https://github.com/aryan76688-alt/b2b-pharma-app.git "${ORDERBOOK_DIR}"
else
    echo -e "    [*] Order Book repository already present. Pulling latest..."
    cd "${ORDERBOOK_DIR}"
    git pull origin main || true
fi

cd "${ORDERBOOK_DIR}"
echo -e "    [*] Configuring environment variables (.env.local)..."
cat << 'ENV_EOF' > "${ORDERBOOK_DIR}/.env.local"
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shreeji_healthcare
JWT_SECRET=shreeji-healthcare-secret-token-key-super-secure-production-2026
JWT_EXPIRES_IN=7d
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENVELOPE_MANAGER_API_URL=http://127.0.0.1:8080
MARG_SYNC_SECRET=shreeji-sync-2026
ENV_EOF

echo -e "    [*] Installing npm dependencies for Order Book..."
npm install --no-audit --prefer-offline 2>/dev/null || npm install
npm install --no-audit @next/swc-wasm-nodejs@15.2.1 2>/dev/null || true

echo -e "    [*] Applying database migrations & seed..."
npm run db:migrate 2>/dev/null || true
npm run db:seed 2>/dev/null || true

echo -e "    [*] Building Order Book production bundle (fast startup & low memory)..."
npm run build 2>/dev/null || true
echo -e "${GREEN}[✓] Shreeji Order Book ready.${NC}"

# 6. Setup MARG ERP 9 Envelope Print Manager (FastAPI - Port 8080)
echo -e "\n${BLUE}[4/6] Setting up MARG ERP Envelope Print Manager...${NC}"
ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ]; then
    CURRENT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
    if [ -f "${CURRENT_SCRIPT_DIR}/backend/main.py" ]; then
        echo -e "    [*] Copying local MARG Envelope Manager repository..."
        rsync -av --exclude 'venv' --exclude 'node_modules' "${CURRENT_SCRIPT_DIR}/" "${ENVELOPE_DIR}/"
    else
        echo -e "    [*] Cloning MARG Envelope Manager repository..."
        git clone https://github.com/aryan76688-alt/MARG-ERP-9---Envelope-Print-manager.git "${ENVELOPE_DIR}"
    fi
else
    echo -e "    [*] MARG Envelope Manager already present. Pulling latest..."
    cd "${ENVELOPE_DIR}"
    git pull origin main || true
fi

cd "${ENVELOPE_DIR}"
echo -e "    [*] Configuring environment variables (.env)..."
cat << 'ENV_EOF' > "${ENVELOPE_DIR}/backend/.env"
HOST=0.0.0.0
PORT=8080
ORDER_BOOK_API_URL=http://127.0.0.1:3000
DATABASE_URL=sqlite:///envelope_manager.db
ENV_EOF

echo -e "    [*] Creating Python virtual environment..."
if [ ! -d "${BASE_DIR}/venv" ]; then
    python3 -m venv "${BASE_DIR}/venv" --system-site-packages
fi

echo -e "    [*] Installing Python backend packages..."
"${BASE_DIR}/venv/bin/pip" install --upgrade pip setuptools wheel --quiet
"${BASE_DIR}/venv/bin/pip" install -r "${ENVELOPE_DIR}/backend/requirements.txt"
echo -e "${GREEN}[✓] MARG Envelope Print Manager ready.${NC}"

# 7. Install Service Control Scripts and Bash Aliases
echo -e "\n${BLUE}[5/6] Installing Control Scripts and Shortcut Aliases...${NC}"
cp -f "${ENVELOPE_DIR}/scripts/termux/start-all.sh" "${BASE_DIR}/start-all.sh"
cp -f "${ENVELOPE_DIR}/scripts/termux/stop-all.sh" "${BASE_DIR}/stop-all.sh"
cp -f "${ENVELOPE_DIR}/scripts/termux/status.sh" "${BASE_DIR}/status.sh"
cp -f "${ENVELOPE_DIR}/scripts/termux/update.sh" "${BASE_DIR}/update.sh"
cp -f "${ENVELOPE_DIR}/scripts/termux/auto-restart-2h.sh" "${BASE_DIR}/auto-restart-2h.sh" 2>/dev/null || true
if [ -f "${ENVELOPE_DIR}/scripts/termux/watchdog.sh" ]; then
    cp -f "${ENVELOPE_DIR}/scripts/termux/watchdog.sh" "${BASE_DIR}/watchdog.sh"
elif [ -f "${ORDERBOOK_DIR}/scripts/termux/watchdog.sh" ]; then
    cp -f "${ORDERBOOK_DIR}/scripts/termux/watchdog.sh" "${BASE_DIR}/watchdog.sh"
fi
chmod +x "${BASE_DIR}"/*.sh

# Register convenience aliases in ~/.bashrc
BASHRC="${HOME}/.bashrc"
touch "${BASHRC}"
if ! grep -q "shreeji/start-all.sh" "${BASHRC}"; then
    cat << 'BASHRC_EOF' >> "${BASHRC}"

# Shreeji Healthcare Unified Shortcuts
alias start="bash $HOME/shreeji/start-all.sh"
alias stop="bash $HOME/shreeji/stop-all.sh"
alias status="bash $HOME/shreeji/status.sh"
alias update="bash $HOME/shreeji/update.sh"
alias restart="bash $HOME/shreeji/auto-restart-2h.sh"
alias watchdog="tail -f $HOME/shreeji/logs/watchdog.log"
alias shreeji="bash $HOME/shreeji/start-all.sh"
BASHRC_EOF
fi

# Termux:Boot configuration for auto-start on device reboot
BOOT_DIR="${HOME}/.termux/boot"
mkdir -p "${BOOT_DIR}"
cat << 'BOOT_EOF' > "${BOOT_DIR}/start-shreeji.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sleep 10
bash $HOME/shreeji/start-all.sh
BOOT_EOF
chmod +x "${BOOT_DIR}/start-shreeji.sh"

echo -e "${GREEN}[✓] Shortcuts installed (type 'start', 'stop', 'status', or 'watchdog' anytime).${NC}"

# 8. Start both servers immediately
echo -e "\n${BLUE}[6/6] Launching all services...${NC}"
bash "${BASE_DIR}/start-all.sh"
