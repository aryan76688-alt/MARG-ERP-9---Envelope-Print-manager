#!/usr/bin/env python3
"""
Shreeji Healthcare - Bulk Party Migration & Sync Utility
Migrates all 1,836+ parties from MARG Envelope Manager (SQLite)
to Shreeji Healthcare Order Book (PostgreSQL / Next.js API).
Can be run anytime on Termux or Desktop.
"""

import sys
import os
import sqlite3
import json
import requests

def main():
    print("=" * 70)
    print("  SHREEJI HEALTHCARE: ENVELOPE -> ORDER BOOK BULK PARTY SYNC")
    print("=" * 70)

    # 1. Locate envelope_manager.db
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "..", "backend", "envelope_manager.db"),
        os.path.expanduser("~/shreeji/MARG-Envelope-Manager/backend/envelope_manager.db"),
        os.path.expanduser("~/shreeji/ENVELOPE/backend/envelope_manager.db"),
        "/home/aryan/ENVELOPE/backend/envelope_manager.db",
        "envelope_manager.db"
    ]

    db_path = None
    for p in possible_paths:
        if os.path.exists(p):
            db_path = os.path.abspath(p)
            break

    if not db_path:
        print("[!] ERROR: envelope_manager.db could not be found.")
        sys.exit(1)

    print(f"[*] Found SQLite Database: {db_path}")

    # 2. Extract parties
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT 
            party_code, party_name, address, city, state, mobile_no, landline,
            email, gst_no, address_line_2, address_line_3, route, route_1,
            latitude, longitude, is_active
        FROM parties
        ORDER BY id ASC
    """)
    rows = c.fetchall()
    total_parties = len(rows)
    print(f"[*] Total Parties Extracted from Envelope Manager: {total_parties}")

    if total_parties == 0:
        print("[!] No parties to sync.")
        return

    # 3. Form batches
    batch_size = 100
    batches = []
    current_batch = []

    for r in rows:
        party_data = {
            "partyCode": r["party_code"],
            "partyName": r["party_name"],
            "mobile": r["mobile_no"] or "",
            "landline": r["landline"] or "",
            "email": r["email"] or "",
            "gstNumber": r["gst_no"] or "",
            "address": r["address"] or "",
            "addressLine1": r["address"] or "",
            "addressLine2": r["address_line_2"] or "",
            "addressLine3": r["address_line_3"] or "",
            "city": r["city"] or "DAHEGAM",
            "state": r["state"] or "Gujarat",
            "deliveryRoute": r["route_1"] or r["route"] or "",
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "status": "active" if r["is_active"] else "inactive"
        }
        current_batch.append(party_data)
        if len(current_batch) >= batch_size:
            batches.append(current_batch)
            current_batch = []

    if current_batch:
        batches.append(current_batch)

    # 4. Target endpoints
    endpoints = [
        "http://127.0.0.1:3000/api/sync/parties/batch",
        "https://shreeji-order.aryan76688.workers.dev/api/sync/parties/batch"
    ]

    secret = os.environ.get("MARG_SYNC_SECRET", "shreeji-sync-2026")
    headers = {
        "Content-Type": "application/json",
        "X-Sync-Secret": secret,
        "X-Sync-Source": "envelope_bulk_migration"
    }

    synced_total = 0
    print("\n[*] Synchronizing parties to Order Book database...")

    for idx, batch in enumerate(batches, 1):
        success = False
        last_error = ""

        for endpoint in endpoints:
            try:
                res = requests.post(endpoint, json=batch, headers=headers, timeout=15)
                if res.status_code in (200, 201):
                    success = True
                    synced_total += len(batch)
                    print(f"    [✓] Batch {idx}/{len(batches)} ({len(batch)} parties) -> {endpoint.split('/')[2]}")
                    break
                else:
                    last_error = f"HTTP {res.status_code}: {res.text[:100]}"
            except Exception as e:
                last_error = str(e)

        if not success:
            print(f"    [X] Batch {idx}/{len(batches)} failed: {last_error}")

    print("\n" + "=" * 70)
    print(f"  SYNC COMPLETE: {synced_total} / {total_parties} Parties Successfully Synced!")
    print("=" * 70)

if __name__ == "__main__":
    main()
