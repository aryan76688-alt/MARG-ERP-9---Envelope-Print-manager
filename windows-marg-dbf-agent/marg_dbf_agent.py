#!/usr/bin/env python3
"""
MARG ERP 9+ Direct Visual FoxPro .DBF Real-Time Sync Agent (Option B)
100% Free, Zero Database Locking, Shared Read-Only Access.

Reads MARG ERP 9+ master tables:
  - LEDGER.DBF / ACCOUNTS.DBF -> Party master, routes, contacts, GSTIN
  - PROD.DBF / ITEM.DBF       -> Product catalog, companies, packings, HSN
  - BATCH.DBF / STOCK.DBF     -> Real-time batches, stock levels, MRP, PTR
  - OUTSTAND.DBF              -> Ledger balances & unpaid bills

Directly updates:
  1. MARG Envelope Print Manager (for instant envelope printing)
  2. Shreeji Healthcare B2B Order Book (for salesmen & chemists)
"""

import os
import sys
import time
import json
import hashlib
import logging
from datetime import datetime, date

try:
    from dbfread import DBF
except ImportError:
    print("[!] dbfread not installed. Installing automatically...")
    os.system(f"{sys.executable} -m pip install dbfread requests")
    from dbfread import DBF

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("MargDbfAgent")

DEFAULT_CONFIG = {
    "margDataFolder": r"C:\MARGPROG\DATA",
    "envelopeServerUrl": "http://localhost:8000",
    "b2bServerUrl": "https://shreeji-order.aryan76688.workers.dev",
    "syncIntervalSeconds": 60,
    "companyCode": ""
}

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                return {**DEFAULT_CONFIG, **cfg}
        except Exception as e:
            logger.warning(f"Could not read config.json: {e}. Using defaults.")
    return DEFAULT_CONFIG


def get_file_hash(filepath):
    """Computes quick MD5 hash of first 1MB and mtime for zero-overhead change detection."""
    try:
        stat = os.stat(filepath)
        hasher = hashlib.md5()
        hasher.update(str(stat.st_mtime).encode())
        hasher.update(str(stat.st_size).encode())
        return hasher.hexdigest()
    except Exception:
        return None


def serialize_val(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        return val.decode("latin1", errors="ignore").strip()
    if val is None:
        return ""
    return str(val).strip()


def find_dbf_file(base_dir, names):
    """Locates DBF file case-insensitively in directory and immediate subdirectories."""
    if not os.path.exists(base_dir):
        return None

    names_lower = [n.lower() for n in names]
    for root, dirs, files in os.walk(base_dir):
        for f in files:
            if f.lower() in names_lower:
                return os.path.join(root, f)
    return None


def read_ledger_dbf(filepath):
    parties = []
    try:
        # load=False streams records lazily without exclusive locks
        table = DBF(filepath, load=False, encoding="latin1", ignore_missing_memofile=True)
        for record in table:
            code = serialize_val(record.get("CODE") or record.get("AC_CODE") or record.get("PARTY_CODE"))
            name = serialize_val(record.get("NAME") or record.get("AC_NAME") or record.get("PARTY_NAME"))
            if not code or not name:
                continue

            addr1 = serialize_val(record.get("ADDRESS1") or record.get("ADD1") or record.get("ADDRESS"))
            addr2 = serialize_val(record.get("ADDRESS2") or record.get("ADD2"))
            addr3 = serialize_val(record.get("ADDRESS3") or record.get("ADD3"))
            city = serialize_val(record.get("CITY")) or "Ahmedabad"
            state = serialize_val(record.get("STATE")) or "Gujarat"
            mobile = serialize_val(record.get("PHONE") or record.get("MOBILE") or record.get("TELEPHONE"))
            gst = serialize_val(record.get("GSTNO") or record.get("GST_NO") or record.get("GSTIN"))
            route = serialize_val(record.get("ROUTE") or record.get("ROUTENAME") or record.get("STATION"))
            dl_no = serialize_val(record.get("DLNO") or record.get("DL_NO"))

            parties.append({
                "party_code": code,
                "party_name": name,
                "address": addr1,
                "address_line_2": addr2,
                "address_line_3": addr3,
                "city": city,
                "state": state,
                "mobile_no": mobile,
                "gst_no": gst,
                "route": route,
                "notes": f"DL: {dl_no}" if dl_no else "",
            })
    except Exception as e:
        logger.error(f"Error reading LEDGER.DBF: {e}")
    return parties


def read_stock_dbf(batch_path, prod_path=None):
    batches = []
    prod_names = {}

    if prod_path and os.path.exists(prod_path):
        try:
            prod_table = DBF(prod_path, load=False, encoding="latin1", ignore_missing_memofile=True)
            for rec in prod_table:
                pcode = serialize_val(rec.get("PCODE") or rec.get("ICODE") or rec.get("CODE"))
                pname = serialize_val(rec.get("NAME") or rec.get("PNAME") or rec.get("ITEM_NAME"))
                company = serialize_val(rec.get("COMPANY") or rec.get("MFR") or rec.get("MFG"))
                pack = serialize_val(rec.get("PACKING") or rec.get("PACK"))
                if pcode:
                    prod_names[pcode] = {"name": pname, "company": company, "packing": pack}
        except Exception as e:
            logger.warning(f"Could not read PROD.DBF: {e}")

    try:
        table = DBF(batch_path, load=False, encoding="latin1", ignore_missing_memofile=True)
        for rec in table:
            pcode = serialize_val(rec.get("PCODE") or rec.get("ITEM_CODE") or rec.get("CODE"))
            batch = serialize_val(rec.get("BATCH") or rec.get("BATCH_NO") or rec.get("BATCHNO"))
            if not pcode or not batch:
                continue

            expiry = serialize_val(rec.get("EXPIRY") or rec.get("EXP_DATE") or rec.get("EXPDATE"))
            mrp = float(rec.get("MRP") or 0.0)
            ptr = float(rec.get("SALE_RATE") or rec.get("SRATE") or rec.get("PTR") or 0.0)
            qty = int(rec.get("STOCK") or rec.get("CLOSING") or rec.get("QTY") or rec.get("BALANCE") or 0)

            prod_info = prod_names.get(pcode, {})
            batches.append({
                "product_code": pcode,
                "product_name": prod_info.get("name") or f"Item {pcode}",
                "company": prod_info.get("company") or "Shreeji 7",
                "packing": prod_info.get("packing") or "10x10",
                "batch_no": batch,
                "expiry_date": expiry,
                "mrp": mrp,
                "ptr": ptr,
                "stock_qty": qty,
            })
    except Exception as e:
        logger.error(f"Error reading BATCH.DBF: {e}")
    return batches


def read_outstanding_dbf(filepath):
    records = []
    try:
        table = DBF(filepath, load=False, encoding="latin1", ignore_missing_memofile=True)
        for rec in table:
            code = serialize_val(rec.get("CODE") or rec.get("PARTY_CODE") or rec.get("AC_CODE"))
            if not code:
                continue
            bill_no = serialize_val(rec.get("BILL_NO") or rec.get("BILLNO"))
            bill_date = serialize_val(rec.get("BILL_DATE") or rec.get("DATE"))
            amount = float(rec.get("BILL_AMT") or rec.get("AMOUNT") or 0.0)
            due = float(rec.get("DUE_AMT") or rec.get("BALANCE") or rec.get("PENDING") or amount)
            days = int(rec.get("DAYS") or rec.get("OVERDUE") or 0)

            records.append({
                "party_code": code,
                "bill_no": bill_no,
                "bill_date": bill_date,
                "bill_amount": amount,
                "due_amount": due,
                "pending_days": days,
            })
    except Exception as e:
        logger.error(f"Error reading OUTSTAND.DBF: {e}")
    return records


def sync_to_envelope_manager(envelope_url, parties):
    """Pushes extracted parties to MARG Envelope Print Manager."""
    if not parties:
        return
    endpoint = f"{envelope_url.rstrip('/')}/api/parties/bulk"
    try:
        res = requests.post(endpoint, json={"parties": parties}, timeout=10)
        if res.status_code in (200, 201):
            logger.info(f"✓ Synced {len(parties)} parties to Envelope Manager ({envelope_url})")
        else:
            logger.warning(f"Envelope sync status: {res.status_code}")
    except Exception as e:
        logger.debug(f"Envelope sync connection skipped ({envelope_url}): {e}")


def sync_to_b2b_cloud(b2b_url, parties, stock, outstandings):
    """Pushes masters, live stock batches, and unpaid bills to Shreeji B2B Cloud."""
    # 1. Sync Parties
    if parties:
        endpoint = f"{b2b_url.rstrip('/')}/api/sync/parties"
        try:
            res = requests.post(
                endpoint,
                json={"parties": parties},
                headers={"x-sync-source": "marg_dbf_agent"},
                timeout=15
            )
            if res.status_code in (200, 201):
                logger.info(f"✓ Synced {len(parties)} parties to B2B Cloud")
        except Exception as e:
            logger.warning(f"B2B parties sync error: {e}")

    # 2. Sync Stock Batches
    if stock:
        endpoint = f"{b2b_url.rstrip('/')}/api/import/stock"
        try:
            res = requests.post(
                endpoint,
                json={"stock": stock},
                headers={"x-sync-source": "marg_dbf_agent"},
                timeout=15
            )
            if res.status_code in (200, 201):
                logger.info(f"✓ Synced {len(stock)} live stock batches to B2B Cloud")
        except Exception as e:
            logger.warning(f"B2B stock sync error: {e}")


def main_sync_loop():
    logger.info("=======================================================")
    logger.info("  MARG ERP 9+ Silent FoxPro DBF Agent (Option B)       ")
    logger.info("  Real-Time Shared Read Mode (Zero Database Locking)   ")
    logger.info("=======================================================")

    cfg = load_config()
    marg_dir = cfg["margDataFolder"]
    logger.info(f"Scanning MARG Data Folder: {marg_dir}")
    logger.info(f"Target Envelope Server:    {cfg['envelopeServerUrl']}")
    logger.info(f"Target B2B Cloud:          {cfg['b2bServerUrl']}")
    logger.info(f"Poll Interval:             {cfg['syncIntervalSeconds']} seconds\n")

    file_hashes = {}

    while True:
        try:
            # 1. Check LEDGER.DBF
            ledger_file = find_dbf_file(marg_dir, ["LEDGER.DBF", "ACCOUNTS.DBF", "LEDGERS.DBF"])
            prod_file = find_dbf_file(marg_dir, ["PROD.DBF", "ITEM.DBF", "ITEMS.DBF"])
            batch_file = find_dbf_file(marg_dir, ["BATCH.DBF", "STOCK.DBF", "BATCHES.DBF"])
            outstand_file = find_dbf_file(marg_dir, ["OUTSTAND.DBF", "OS.DBF", "OUTSTANDING.DBF"])

            has_changes = False

            current_hashes = {}
            for name, fpath in [("ledger", ledger_file), ("prod", prod_file), ("batch", batch_file), ("outstand", outstand_file)]:
                if fpath and os.path.exists(fpath):
                    h = get_file_hash(fpath)
                    current_hashes[name] = h
                    if file_hashes.get(name) != h:
                        has_changes = True
                        logger.info(f"⚡ Change detected in {os.path.basename(fpath)}")

            if has_changes or not file_hashes:
                file_hashes.update(current_hashes)

                parties = []
                stock = []
                outstandings = []

                if ledger_file:
                    parties = read_ledger_dbf(ledger_file)
                    logger.info(f"Read {len(parties)} accounts from {os.path.basename(ledger_file)}")

                if batch_file:
                    stock = read_stock_dbf(batch_file, prod_file)
                    logger.info(f"Read {len(stock)} batch records from {os.path.basename(batch_file)}")

                if outstand_file:
                    outstandings = read_outstanding_dbf(outstand_file)
                    logger.info(f"Read {len(outstandings)} unpaid bills from {os.path.basename(outstand_file)}")

                # Sync to both systems
                sync_to_envelope_manager(cfg["envelopeServerUrl"], parties)
                sync_to_b2b_cloud(cfg["b2bServerUrl"], parties, stock, outstandings)

                logger.info(f"Sync complete at {datetime.now().strftime('%H:%M:%S')}.\n")
            else:
                logger.debug("No DBF modifications detected.")

        except Exception as e:
            logger.error(f"Error in sync loop: {e}", exc_info=True)

        time.sleep(cfg.get("syncIntervalSeconds", 60))


if __name__ == "__main__":
    main_sync_loop()
