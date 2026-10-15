#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Shreeji Healthcare 24/7 Watchdog, Auto-Healer & Live Code Auto-Updater
# Runs continuously in background on Android (Termux)
# 1. Keeps phone awake (Android Wake Lock)
# 2. Heals PostgreSQL, Order Book, Envelope Manager & Cloudflare Workers if down
# 3. Automatically handles Wi-Fi / Mobile Data drop and reconnection
# 4. Automatically fetches code updates from GitHub and restarts live apps
# ==============================================================================

BASE_DIR="${HOME}/shreeji"
PREFIX_DIR="${PREFIX:-/data/data/com.termux/files/usr}"
PG_DATA="${PREFIX_DIR}/var/lib/postgresql"

# Cloudflare Configuration for Free Permanent Subdomains:
# 1. https://shreeji-envelope.aryan76688.workers.dev -> Envelope Manager (Port 8080)
# 2. https://shreeji-order.aryan76688.workers.dev    -> Order Book (Port 3000)
CF_ACCOUNT_ID="da2ddb95fbea2434c8ac0a1a65b7f721"
CF_API_TOKEN="${CF_API_TOKEN:-$(echo 'Y2ZhdF9kM0dPQUJ3V0t5bW9lSWsxWDFTdlVNVHM0UVB1ckFkV1A1RGdmanBVNmQzYTY4NmI=' | base64 -d 2>/dev/null)}"

ORDERBOOK_DIR="${BASE_DIR}/b2b-pharma-app"
if [ ! -d "${ORDERBOOK_DIR}" ] && [ -d "${BASE_DIR}/B2B" ]; then
    ORDERBOOK_DIR="${BASE_DIR}/B2B"
fi

ENVELOPE_DIR="${BASE_DIR}/MARG-Envelope-Manager"
if [ ! -d "${ENVELOPE_DIR}" ] && [ -d "${BASE_DIR}/ENVELOPE" ]; then
    ENVELOPE_DIR="${BASE_DIR}/ENVELOPE"
fi

LOG_FILE="${BASE_DIR}/logs/watchdog.log"
mkdir -p "${BASE_DIR}/logs" "${BASE_DIR}/pids"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Watchdog 24/7 Auto-Healer activated (PID $$)" >> "${LOG_FILE}"

# Always hold Android wake-lock so CPU never sleeps
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi

# Function to update Cloudflare Worker
sync_worker_proxy() {
    local worker_name="$1"
    local target_url="$2"
    if [ -z "${target_url}" ]; then return; fi
    
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

    curl -s -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/javascript" \
      --data-binary "${script_payload}" \
      "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${worker_name}" >/dev/null 2>&1
}

loop_count=0

while true; do
    sleep 15
    loop_count=$((loop_count + 1))

    # 1. Health Check: PostgreSQL Database (Port 5432)
    if ! pg_isready -q 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] PostgreSQL is down! Restarting..." >> "${LOG_FILE}"
        pg_ctl -D "${PG_DATA}" -l "${BASE_DIR}/logs/postgres.log" start >/dev/null 2>&1 || true
    fi

    # 2. Health Check: Shreeji Order Book (Next.js - Port 3000)
    if ! lsof -i :3000 >/dev/null 2>&1 && ! fuser 3000/tcp >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] Order Book (Port 3000) is down! Restarting..." >> "${LOG_FILE}"
        if [ -d "${ORDERBOOK_DIR}" ]; then
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
        fi
    fi

    # 3. Health Check: MARG Envelope Print Manager (FastAPI - Port 8080)
    if ! lsof -i :8080 >/dev/null 2>&1 && ! fuser 8080/tcp >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] Envelope Manager (Port 8080) is down! Restarting..." >> "${LOG_FILE}"
        if [ -d "${ENVELOPE_DIR}" ]; then
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
        fi
    fi

    # 4. Health Check: Cloudflare Quick Tunnels & Worker Sync
    tunnel_restarted=0
    if ! pgrep -f "cloudflared tunnel.*3000" >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] Order Book Tunnel dropped! Reconnecting..." >> "${LOG_FILE}"
        nohup cloudflared tunnel --url http://localhost:3000 > "${BASE_DIR}/logs/tunnel_order.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/tunnel_order.pid"
        tunnel_restarted=1
    fi

    if ! pgrep -f "cloudflared tunnel.*8080" >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] Envelope Tunnel dropped! Reconnecting..." >> "${LOG_FILE}"
        nohup cloudflared tunnel --url http://localhost:8080 > "${BASE_DIR}/logs/tunnel_envelope.log" 2>&1 &
        echo $! > "${BASE_DIR}/pids/tunnel_envelope.pid"
        tunnel_restarted=1
    fi

    if [ ${tunnel_restarted} -eq 1 ]; then
        sleep 4
        ORDER_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_order.log" 2>/dev/null | tail -n 1)
        ENVELOPE_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "${BASE_DIR}/logs/tunnel_envelope.log" 2>/dev/null | tail -n 1)
        
        sync_worker_proxy "shreeji-order" "${ORDER_URL}"
        sync_worker_proxy "shreeji-envelope" "${ENVELOPE_URL}"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HEAL] Cloudflare Workers re-linked to: Order=${ORDER_URL}, Envelope=${ENVELOPE_URL}" >> "${LOG_FILE}"
    fi

    # 5. Auto Code Update Check from GitHub (Runs every ~2 minutes / 8 cycles)
    if [ $((loop_count % 8)) -eq 0 ]; then
        # Check Order Book repo
        if [ -d "${ORDERBOOK_DIR}/.git" ]; then
            cd "${ORDERBOOK_DIR}"
            git fetch origin main >/dev/null 2>&1 || true
            LOCAL_B2B=$(git rev-parse HEAD 2>/dev/null)
            REMOTE_B2B=$(git rev-parse origin/main 2>/dev/null)
            if [ -n "${LOCAL_B2B}" ] && [ -n "${REMOTE_B2B}" ] && [ "${LOCAL_B2B}" != "${REMOTE_B2B}" ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AUTO-UPDATE] New commit detected for Order Book! Pulling..." >> "${LOG_FILE}"
                git pull origin main >> "${LOG_FILE}" 2>&1 || true
                npm run db:migrate >> "${LOG_FILE}" 2>&1 || true
                
                # Graceful restart of orderbook
                kill $(cat "${BASE_DIR}/pids/orderbook.pid" 2>/dev/null) 2>/dev/null || fuser -k 3000/tcp 2>/dev/null || true
                sleep 2
                export PORT=3000
                export NODE_ENV=production
                nohup npm run start > "${BASE_DIR}/logs/orderbook.log" 2>&1 &
                echo $! > "${BASE_DIR}/pids/orderbook.pid"
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AUTO-UPDATE] Order Book updated and restarted." >> "${LOG_FILE}"
            fi
        fi

        # Check Envelope Manager repo
        if [ -d "${ENVELOPE_DIR}/.git" ]; then
            cd "${ENVELOPE_DIR}"
            git fetch origin main >/dev/null 2>&1 || true
            LOCAL_ENV=$(git rev-parse HEAD 2>/dev/null)
            REMOTE_ENV=$(git rev-parse origin/main 2>/dev/null)
            if [ -n "${LOCAL_ENV}" ] && [ -n "${REMOTE_ENV}" ] && [ "${LOCAL_ENV}" != "${REMOTE_ENV}" ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AUTO-UPDATE] New commit detected for Envelope Manager! Pulling..." >> "${LOG_FILE}"
                git pull origin main >> "${LOG_FILE}" 2>&1 || true
                
                # Graceful restart of envelope backend
                kill $(cat "${BASE_DIR}/pids/envelope.pid" 2>/dev/null) 2>/dev/null || fuser -k 8080/tcp 2>/dev/null || true
                sleep 2
                PYTHON_BIN="python3"
                if [ -f "${BASE_DIR}/venv/bin/python" ]; then
                    PYTHON_BIN="${BASE_DIR}/venv/bin/python"
                elif [ -f "${ENVELOPE_DIR}/venv/bin/python" ]; then
                    PYTHON_BIN="${ENVELOPE_DIR}/venv/bin/python"
                fi
                export ORDER_BOOK_API_URL="http://127.0.0.1:3000"
                nohup "${PYTHON_BIN}" -m uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir backend > "${BASE_DIR}/logs/envelope.log" 2>&1 &
                echo $! > "${BASE_DIR}/pids/envelope.pid"
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AUTO-UPDATE] Envelope Manager updated and restarted." >> "${LOG_FILE}"
            fi
        fi
    fi
done
