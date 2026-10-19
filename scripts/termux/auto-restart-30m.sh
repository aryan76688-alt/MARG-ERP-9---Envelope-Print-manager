#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare - 30-Minute Graceful Server Recycle
# Recycles Node.js and Python web servers every 30 minutes to keep RAM lightweight,
# prevent Android OS memory kills, and ensure fast performance WITHOUT ANY DATA LOSS.
# PostgreSQL on port 5432 is kept running continuously and checkpointed to disk.
# ==============================================================================

BASE_DIR="${HOME}/shreeji"
LOG_FILE="${BASE_DIR}/logs/auto-restart.log"
mkdir -p "${BASE_DIR}/logs" "${BASE_DIR}/pids"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [30-MIN AUTO-RESTART] Starting safe server recycling..." >> "${LOG_FILE}"

# 1. Flush database transactions to disk so ZERO data is lost
if command -v psql >/dev/null 2>&1; then
    psql -U postgres -d shreeji_healthcare -c "CHECKPOINT;" >> "${LOG_FILE}" 2>&1 || true
fi
sync

# 2. Gracefully restart web processes
if [ -f "${BASE_DIR}/pids/orderbook.pid" ]; then
    kill -15 $(cat "${BASE_DIR}/pids/orderbook.pid") 2>/dev/null || true
fi
if [ -f "${BASE_DIR}/pids/envelope.pid" ]; then
    kill -15 $(cat "${BASE_DIR}/pids/envelope.pid") 2>/dev/null || true
fi

sleep 2

# Force kill any stuck leftover node/uvicorn instances on ports 3000 & 8080
pkill -9 -f "next start.*3000" 2>/dev/null || true
pkill -9 -f "uvicorn.*8080" 2>/dev/null || true

# 3. Relaunch services
ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ] && [ -d "${BASE_DIR}/B2B" ]; then
    ORDERBOOK_DIR="${BASE_DIR}/B2B"
fi

ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ] && [ -d "${BASE_DIR}/ENVELOPE" ]; then
    ENVELOPE_DIR="${BASE_DIR}/ENVELOPE"
fi

if [ -d "${ORDERBOOK_DIR}" ]; then
    cd "${ORDERBOOK_DIR}"
    export PORT=3000
    export NODE_ENV=production
    export NODE_OPTIONS="--max-old-space-size=2048"
    export ENVELOPE_MANAGER_API_URL="http://127.0.0.1:8080"
    NEXT_BIN="./node_modules/.bin/next"
    if [ ! -x "${NEXT_BIN}" ]; then
        NEXT_BIN="npx next"
    fi
    if [ -f ".next/BUILD_ID" ]; then
        nohup ${NEXT_BIN} start -H 0.0.0.0 -p 3000 >> "${BASE_DIR}/logs/orderbook.log" 2>&1 &
    else
        if [ -d ".next" ] && [ ! -f ".next/BUILD_ID" ]; then
            rm -rf .next
        fi
        nohup ${NEXT_BIN} dev -H 0.0.0.0 -p 3000 >> "${BASE_DIR}/logs/orderbook.log" 2>&1 &
    fi
    echo $! > "${BASE_DIR}/pids/orderbook.pid"
fi

if [ -d "${ENVELOPE_DIR}" ]; then
    cd "${ENVELOPE_DIR}"
    PYTHON_BIN="python3"
    if [ -f "${BASE_DIR}/venv/bin/python" ]; then
        PYTHON_BIN="${BASE_DIR}/venv/bin/python"
    elif [ -f "${ENVELOPE_DIR}/venv/bin/python" ]; then
        PYTHON_BIN="${ENVELOPE_DIR}/venv/bin/python"
    fi
    export ORDER_BOOK_API_URL="http://127.0.0.1:3000"
    nohup "${PYTHON_BIN}" -m uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir backend >> "${BASE_DIR}/logs/envelope.log" 2>&1 &
    echo $! > "${BASE_DIR}/pids/envelope.pid"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [30-MIN AUTO-RESTART] Safe recycling complete. Servers running fresh with 0 data loss." >> "${LOG_FILE}"
