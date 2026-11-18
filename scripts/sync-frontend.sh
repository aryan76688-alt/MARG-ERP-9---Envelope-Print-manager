#!/usr/bin/env bash
# Build frontend and cleanly sync assets to backend/static/ and android/app/src/main/assets/
# Preserves backend/static/downloads/ (Android APK downloads).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/3] Building frontend (TypeScript + Vite)..."
cd "${ROOT_DIR}/frontend"
npm run build

echo "[2/3] Syncing frontend/dist -> backend/static/ (preserving downloads/)..."
mkdir -p "${ROOT_DIR}/backend/static/assets"
rm -rf "${ROOT_DIR}/backend/static/assets/"*
cp -r "${ROOT_DIR}/frontend/dist/assets/"* "${ROOT_DIR}/backend/static/assets/"
for item in "${ROOT_DIR}/frontend/dist/"*; do
    name="$(basename "$item")"
    if [ "$name" != "assets" ] && [ "$name" != "downloads" ]; then
        cp -rf "$item" "${ROOT_DIR}/backend/static/"
    fi
done

echo "[3/3] Syncing frontend/dist -> android/app/src/main/assets/..."
mkdir -p "${ROOT_DIR}/android/app/src/main/assets/assets"
rm -rf "${ROOT_DIR}/android/app/src/main/assets/assets/"*
cp -r "${ROOT_DIR}/frontend/dist/assets/"* "${ROOT_DIR}/android/app/src/main/assets/assets/"
for item in "${ROOT_DIR}/frontend/dist/"*; do
    name="$(basename "$item")"
    if [ "$name" != "assets" ] && [ "$name" != "downloads" ]; then
        cp -rf "$item" "${ROOT_DIR}/android/app/src/main/assets/"
    fi
done

echo "[✓] Frontend build synced cleanly to backend/static/ and android/app/src/main/assets/."
