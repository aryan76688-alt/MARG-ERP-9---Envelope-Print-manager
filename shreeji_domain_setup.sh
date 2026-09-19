#!/bin/bash
# ==============================================================================
# MARG ERP 9+ Envelope Print Manager - Custom Domain Setup: shreeji.in
# ==============================================================================
# This script sets up or connects shreeji.in to the Envelope Print Manager (port 8080).
#
# Supported Methods:
# 1. Cloudflare Named Tunnel (Recommended for permanent production domains)
# 2. Cloudflare Zero Trust Tunnel Token (One-line connection)
# 3. Quick Tunnel CNAME mapping (TryCloudflare endpoint)
# ==============================================================================

set -e

DOMAIN="shreeji.in"
PORT="8080"
CONFIG_FILE="/home/aryan/ENVELOPE/cloudflared_shreeji.yml"

echo "=================================================================="
echo "    MARG ERP 9+ ENVELOPE MANAGER - DOMAIN SETUP: ${DOMAIN}"
echo "=================================================================="
echo ""
echo "Choose an option:"
echo "1) Authenticate Cloudflare and create named tunnel for ${DOMAIN}"
echo "2) Connect with Cloudflare Tunnel Token (from Cloudflare Zero Trust Dashboard)"
echo "3) Display DNS CNAME settings for ${DOMAIN}"
echo "4) Test local service on port ${PORT}"
echo ""

read -p "Select option [1-4]: " OPTION

case $OPTION in
  1)
    echo "Starting Cloudflare login..."
    cloudflared tunnel login
    echo "Creating tunnel 'shreeji-envelope'..."
    cloudflared tunnel create shreeji-envelope || true
    echo "Routing DNS for ${DOMAIN}..."
    cloudflared tunnel route dns shreeji-envelope "${DOMAIN}" || true
    cloudflared tunnel route dns shreeji-envelope "envelope.${DOMAIN}" || true
    echo "Starting tunnel with config ${CONFIG_FILE}..."
    cloudflared tunnel --config "${CONFIG_FILE}" run shreeji-envelope
    ;;
  2)
    read -p "Enter your Cloudflare Tunnel Token: " CF_TOKEN
    if [ -n "$CF_TOKEN" ]; then
      echo "Starting Cloudflare tunnel with token..."
      cloudflared tunnel run --token "$CF_TOKEN"
    else
      echo "Error: Token cannot be empty."
    fi
    ;;
  3)
    echo ""
    echo "================ DNS CONFIGURATION FOR ${DOMAIN} ================"
    echo "In your Domain Registrar / DNS Provider (Cloudflare, GoDaddy, Hostinger):"
    echo ""
    echo "Type   | Name            | Target / Value"
    echo "-------+-----------------+----------------------------------------------------"
    echo "CNAME  | @ (or shreeji.in) | wants-condo-satellite-andrew.trycloudflare.com"
    echo "CNAME  | envelope        | wants-condo-satellite-andrew.trycloudflare.com"
    echo "CNAME  | www             | wants-condo-satellite-andrew.trycloudflare.com"
    echo "=================================================================="
    ;;
  4)
    echo "Testing local service on http://localhost:${PORT}..."
    curl -I "http://localhost:${PORT}/api/settings"
    echo "Service is responding correctly!"
    ;;
  *)
    echo "Invalid option."
    ;;
esac
