import os
import io
import json
import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status, Response, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc, case

from database import engine, get_db, init_db, SessionLocal
from models import Party, SenderSettings, AppSettings, PrintJob, PrintCase, ImportJob, ImportErrorLog, User, Item
import barcode_generator
import excel_service
import pdf_service
import ai_service
import openai_service
import subprocess
import shutil
import threading
import time
import base64
import re
import csv
import urllib.request
import urllib.parse
import urllib.error
import auth as auth_module
from pathlib import Path
import math
import requests
from cache_manager import cache_mgr
import gdrive_service

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance in meters between two GPS coordinates using Haversine formula."""
    try:
        r = 6371000.0  # Earth's radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = math.sin(delta_phi / 2.0) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

        return round(r * c, 2)
    except Exception:
        return 0.0

# Load .env file
try:
    from dotenv import load_dotenv
    for ep in [Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env"]:
        if ep.exists():
            load_dotenv(ep)
except ImportError:
    pass

app = FastAPI(
    title="Envelope Print Manager API",
    description="Backend API for Envelope Print Manager",
    version="1.0.0"
)

# Enable GZIP compression (min 500 bytes) for 75-90% faster transfers across the web
app.add_middleware(GZipMiddleware, minimum_size=500)

# Enable CORS for frontend development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rclone Auto Cloud Backup Service & Scheduler
def ensure_rclone_config():
    """Ensures rclone.conf is available on disk, reading from RCLONE_CONFIG_BASE64 env var if needed."""
    conf_dir = os.path.expanduser("~/.config/rclone")
    conf_file = os.path.join(conf_dir, "rclone.conf")
    if not os.path.exists(conf_file) or os.path.getsize(conf_file) == 0:
        b64 = os.environ.get("RCLONE_CONFIG_BASE64", "").strip()
        if b64:
            try:
                decoded = base64.b64decode(b64).decode("utf-8")
                os.makedirs(conf_dir, exist_ok=True)
                with open(conf_file, "w", encoding="utf-8") as f:
                    f.write(decoded)
                print("[Rclone] Config successfully written from RCLONE_CONFIG_BASE64.")
            except Exception as e:
                print("[Rclone] Failed to decode RCLONE_CONFIG_BASE64:", e)

def find_rclone_bin():
    candidates = [
        shutil.which("rclone"),
        os.path.expanduser("~/.local/bin/rclone"),
        "/usr/local/bin/rclone",
        "/usr/bin/rclone",
        "/home/aryan/.local/bin/rclone"
    ]
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None

def _update_backup_status(db: Session, timestamp_dt: datetime.datetime, status_msg: str):
    try:
        app_set = db.query(AppSettings).first()
        if app_set:
            app_set.last_backup_time = timestamp_dt
            app_set.last_backup_status = status_msg
            db.commit()
    except Exception as ex:
        print("Failed to save backup status:", ex)

def perform_rclone_backup(db: Session, remote_name: str = "gdrive", backup_path: str = "MARG_Backups") -> Dict[str, Any]:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_file = os.path.join(base_dir, "envelope_manager.db")
    backups_dir = os.path.join(base_dir, "backups")
    os.makedirs(backups_dir, exist_ok=True)

    now_dt = datetime.datetime.now()
    now_display = now_dt.strftime("%d-%m-%Y %I:%M %p")
    timestamp = now_dt.strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(backups_dir, f"envelope_manager_{timestamp}.db")

    try:
        if os.path.exists(db_file):
            shutil.copy2(db_file, backup_file)
            shutil.copy2(db_file, os.path.join(backups_dir, "envelope_manager_latest.db"))
            status_msg = f"Local backup created ({os.path.basename(backup_file)})"
        else:
            status_msg = "Error: Local envelope_manager.db not found"
            _update_backup_status(db, now_dt, status_msg)
            return {"success": False, "message": status_msg}

        ensure_rclone_config()

        rclone_bin = find_rclone_bin()
        if not rclone_bin:
            status_msg += " (rclone executable not found; cloud sync skipped)"
            _update_backup_status(db, now_dt, status_msg)
            return {"success": True, "message": status_msg, "rclone": False}

        clean_remote = (remote_name or "gdrive").strip().rstrip(":")
        clean_path = (backup_path or "MARG_Backups").strip().lstrip("/")
        remote_target = f"{clean_remote}:{clean_path}"

        conf_file = os.path.expanduser("~/.config/rclone/rclone.conf")
        cmd = [rclone_bin]
        if os.path.exists(conf_file):
            cmd.extend(["--config", conf_file])
        cmd.extend(["copy", backups_dir, remote_target])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode == 0:
            status_msg = f"Success: Cloud synced to {remote_target} at {now_display}"
            _update_backup_status(db, now_dt, status_msg)
            return {"success": True, "message": status_msg, "rclone": True}
        else:
            err_snippet = (result.stderr or result.stdout or "Command returned non-zero exit code").strip()
            status_msg = f"Local saved, rclone error: {err_snippet[:150]}"
            _update_backup_status(db, now_dt, status_msg)
            return {"success": False, "message": status_msg, "rclone": True}

    except Exception as e:
        status_msg = f"Backup failed: {str(e)[:150]}"
        _update_backup_status(db, now_dt, status_msg)
        return {"success": False, "message": status_msg}

_BACKUP_SCHEDULER_RUNNING = False

def start_backup_scheduler():
    global _BACKUP_SCHEDULER_RUNNING
    if _BACKUP_SCHEDULER_RUNNING:
        return
    _BACKUP_SCHEDULER_RUNNING = True

    def _loop():
        last_triggered_date = None
        while True:
            try:
                time.sleep(30)
                now = datetime.datetime.now()
                current_time_str = now.strftime("%H:%M")
                today_str = now.strftime("%Y-%m-%d")

                db = SessionLocal()
                try:
                    app_set = db.query(AppSettings).first()
                    if app_set and getattr(app_set, "auto_backup_enabled", True):
                        target_time = getattr(app_set, "auto_backup_time", "20:00") or "20:00"
                        if current_time_str == target_time and last_triggered_date != today_str:
                            last_triggered_date = today_str
                            r_name = getattr(app_set, "rclone_remote_name", "gdrive") or "gdrive"
                            b_path = getattr(app_set, "rclone_backup_path", "MARG_Backups") or "MARG_Backups"
                            print(f"[AutoBackup] Scheduled backup triggering at {current_time_str} ({r_name}:{b_path})...")
                            perform_rclone_backup(db, remote_name=r_name, backup_path=b_path)
                finally:
                    db.close()
            except Exception as e:
                print("[AutoBackup] Scheduler tick exception:", e)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()

# Startup event to ensure database is created and seeded
@app.on_event("startup")
def startup_event():
    init_db()
    try:
        # Ensure sshd is running if running inside Termux
        if os.path.exists("/data/data/com.termux/files/usr/bin/sshd"):
            check_ssh = subprocess.run(["pgrep", "-f", "sshd"], stdout=subprocess.DEVNULL)
            if check_ssh.returncode != 0:
                subprocess.Popen(["/data/data/com.termux/files/usr/bin/sshd"])
    except Exception as e:
        print("Termux sshd check notice:", e)
    try:
        ai_service.start_background_translation_worker(SessionLocal)
    except Exception as e:
        print("Startup background translation notice:", e)
    try:
        start_backup_scheduler()
    except Exception as e:
        print("Startup backup scheduler notice:", e)
    try:
        start_google_sheets_auto_sync(SessionLocal)
    except Exception as e:
        print("Startup Google Sheets auto-sync notice:", e)

WEEKDAY_GUJARATI_MAP = {
    "MONDAY": "સોમવાર",
    "TUESDAY": "મંગળવાર",
    "WEDNESDAY": "બુધવાર",
    "THURSDAY": "ગુરુવાર",
    "FRIDAY": "શુક્રવાર",
    "SATURDAY": "શનિવાર",
    "SUNDAY": "રવિવાર",
    "MON": "સોમવાર",
    "TUE": "મંગળવાર",
    "WED": "બુધવાર",
    "THU": "ગુરુવાર",
    "FRI": "શુક્રવાર",
    "SAT": "શનિવાર",
    "SUN": "રવિવાર"
}

def translate_route_to_gujarati(route_name: Optional[str]) -> Optional[str]:
    if not route_name or not str(route_name).strip():
        return None
    r_raw = str(route_name).strip()
    r_upper = r_raw.upper()

    # 1. Exact weekday match
    if r_upper in WEEKDAY_GUJARATI_MAP:
        return WEEKDAY_GUJARATI_MAP[r_upper]

    # 2. Weekday prefix match like "Monday - Dehgam"
    for eng_day, gu_day in [
        ("MONDAY", "સોમવાર"),
        ("TUESDAY", "મંગળવાર"),
        ("WEDNESDAY", "બુધવાર"),
        ("THURSDAY", "ગુરુવાર"),
        ("FRIDAY", "શુક્રવાર"),
        ("SATURDAY", "શનિવાર"),
        ("SUNDAY", "રવિવાર"),
    ]:
        if r_upper.startswith(eng_day):
            remainder = r_upper[len(eng_day):].strip(" -:,/|")
            if remainder:
                try:
                    gu_rem = ai_service.fast_translate_phrase(remainder)
                    return f"{gu_day} - {gu_rem}" if gu_rem else gu_day
                except Exception:
                    return f"{gu_day} - {remainder}"
            return gu_day

    # 3. Custom route or city name (translate/transliterate)
    try:
        translated = ai_service.fast_translate_phrase(r_raw)
        return translated if translated else r_raw
    except Exception:
        return r_raw

# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

class PartyBase(BaseModel):
    party_name: str
    party_code: Optional[str] = None
    address: str
    address_line_2: Optional[str] = None
    address_line_3: Optional[str] = None
    city: str
    state: str
    mobile_no: Optional[str] = None
    landline: Optional[str] = None
    email: Optional[str] = None
    gst_no: Optional[str] = None
    notes: Optional[str] = None
    party_name_gu: Optional[str] = None
    address_gu: Optional[str] = None
    address_line_2_gu: Optional[str] = None
    address_line_3_gu: Optional[str] = None
    city_gu: Optional[str] = None
    state_gu: Optional[str] = None
    route: Optional[str] = None
    route_1: Optional[str] = None
    route_2: Optional[str] = None
    route_3: Optional[str] = None
    route_1_gu: Optional[str] = None
    route_2_gu: Optional[str] = None
    route_3_gu: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geofence_radius_meters: Optional[int] = 75
    geofence_set_at: Optional[datetime.datetime] = None
    is_active: bool = True

class PartyCreate(PartyBase):
    pass

class PartyUpdate(PartyBase):
    pass

class PartyGeofenceUpdateRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_meters: Optional[int] = 75

class BulkUnsetLocationRequest(BaseModel):
    party_ids: List[int]

class RouteUpdateItem(BaseModel):
    id: Optional[int] = None
    party_code: Optional[str] = None
    route_1: Optional[str] = None
    route_2: Optional[str] = None
    route_3: Optional[str] = None
    route_1_gu: Optional[str] = None
    route_2_gu: Optional[str] = None
    route_3_gu: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class BatchUpdateRoutesRequest(BaseModel):
    updates: List[RouteUpdateItem]

class SyncGoogleSheetRequest(BaseModel):
    sheet_url_or_id: str
    sheet_name: Optional[str] = None
    api_key: Optional[str] = None

class SenderSettingsSchema(BaseModel):
    business_name: str
    address: str
    city: str
    state: str
    mobile: str
    landline: Optional[str] = None
    email: Optional[str] = None
    gst_no: Optional[str] = None
    is_default: bool = True

class AppSettingsSchema(BaseModel):
    default_envelope_size: str = "A4"
    default_orientation: str = "Landscape"
    default_copies: int = 1
    default_printer: str = "Microsoft Print to PDF"
    margin_top_mm: float = 15.0
    margin_left_mm: float = 3.0
    margin_right_mm: float = 3.0
    margin_bottom_mm: float = 10.0
    scale_percent: int = 100
    envelopes_per_page: int = 2
    show_header: bool = True
    show_footer: bool = False
    show_barcode: bool = True
    show_case_number: bool = True
    show_weight: bool = True
    show_mobile: bool = True
    show_party_code: bool = True
    show_date: bool = False
    show_gst: bool = False
    show_pan: bool = False
    gemini_api_key: Optional[str] = ""
    default_language: str = "en"
    envelope_template_format: str = "attachment_pdf"
    iv_fluids_json: Optional[str] = None
    iv_volumes_json: Optional[str] = None
    google_sheets_api_key: Optional[str] = "AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg"
    google_sheet_id: Optional[str] = ""
    google_oauth_client_id: Optional[str] = "58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com"

class CaseWeightItem(BaseModel):
    case_number: int
    weight: float

class CreatePrintJobRequest(BaseModel):
    party_id: Optional[int] = None
    party_name: str
    party_code: Optional[str] = None
    address: str
    address_line_2: Optional[str] = None
    address_line_3: Optional[str] = None
    city: str
    state: str
    mobile_no: Optional[str] = None
    gst_no: Optional[str] = None
    parcel_type: str = "Medicine"
    total_cases: int = 1
    case_weights: List[float] = Field(default_factory=lambda: [1.0])
    envelope_size: str = "A4"
    orientation: str = "Landscape"
    printer_name: str = "Microsoft Print to PDF"
    envelopes_per_page: int = 2
    status: str = "Printed"
    sender: Optional[Dict[str, Any]] = None
    case_breakdown: Optional[List[Dict[str, Any]]] = None
    delivery_boy_name: Optional[str] = None
    driver_name: Optional[str] = None
    delivery_route: Optional[str] = None
    template_format: Optional[str] = "attachment_pdf"
    language: Optional[str] = "en"
    party_name_gu: Optional[str] = None
    address_gu: Optional[str] = None
    address_line_2_gu: Optional[str] = None
    address_line_3_gu: Optional[str] = None
    city_gu: Optional[str] = None
    allow_duplicate: bool = False
    is_reprint: bool = False
    job_id: Optional[int] = None
    bill_inside: bool = False
    created_by: Optional[str] = "Admin"
    client_uuid: Optional[str] = None

class BackupSettingsRequest(BaseModel):
    auto_backup_enabled: bool = True
    auto_backup_time: str = "20:00"
    rclone_remote_name: str = "gdrive"
    rclone_backup_path: str = "MARG_Backups"

class GDriveSettingsRequest(BaseModel):
    gdrive_webhook_url: Optional[str] = ""
    gdrive_api_key: Optional[str] = "SHREEJI_SECRET_KEY_2026"
    gdrive_backup_folder: Optional[str] = "Shreeji_Healthcare_Backups"
    gdrive_notify_email: Optional[str] = "shreejiseven@gmail.com"

class GDriveRestoreRequest(BaseModel):
    file_id: str

class SendGmailInvoiceRequest(BaseModel):
    to_email: Optional[str] = None
    party_id: Optional[int] = None
    party_name: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    amount: Optional[float] = None
    cases: Optional[int] = 1
    transport: Optional[str] = None
    notes: Optional[str] = None

class SendGmailDispatchSummaryRequest(BaseModel):
    to_email: Optional[str] = None
    limit: Optional[int] = 50

class SendGmailPartiesListRequest(BaseModel):
    to_email: Optional[str] = None

class BulkRouteRequest(BaseModel):
    party_ids: List[int]
    route: str

class BulkPrintJobsRequest(BaseModel):
    party_ids: List[int]
    case_breakdown: Optional[List[Dict[str, Any]]] = None
    total_cases: int = 1
    parcel_type: str = "Medicine"
    envelope_size: str = "A4"
    envelopes_per_page: int = 2
    delivery_boy_name: Optional[str] = None
    driver_name: Optional[str] = None
    delivery_route: Optional[str] = None
    template_format: Optional[str] = "attachment_pdf"
    language: Optional[str] = "en"

class UpdateDispatchJobsRequest(BaseModel):
    job_ids: List[int]
    delivery_boy_name: Optional[str] = None
    driver_name: Optional[str] = None
    delivery_route: Optional[str] = None
    status: Optional[str] = None

class PODRecordRequest(BaseModel):
    job_id: Optional[int] = None
    party_id: Optional[int] = None
    delivered_by: Optional[str] = None
    pod_signature: Optional[str] = None
    pod_photo: Optional[str] = None
    pod_notes: Optional[str] = None
    client_uuid: Optional[str] = None
    delivered_latitude: Optional[float] = None
    delivered_longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None
    pin_shop_geofence: Optional[bool] = False

class BatchPODSyncRequest(BaseModel):
    items: List[PODRecordRequest]

class BatchJobSyncRequest(BaseModel):
    jobs: List[CreatePrintJobRequest]

class BulkDeletePartiesRequest(BaseModel):
    party_ids: List[int]

class ExportSelectedPartiesRequest(BaseModel):
    party_ids: List[int]

class ValidateImportRequest(BaseModel):
    raw_rows: List[Dict[str, Any]]
    mapping: Dict[str, Optional[str]]

class ConfirmImportRequest(BaseModel):
    rows: List[Dict[str, Any]]
    skip_warnings: bool = False
    duplicate_action: str = "skip"  # "skip" (Vyapar default), "update", or "allow"
    filename: str = "import.xlsx"
    file_size: int = 0
    sheet_name: str = "Sheet1"

class AICleanAddressRequest(BaseModel):
    address: str
    city: Optional[str] = None
    state: Optional[str] = None

class AIOptimizeRoutesRequest(BaseModel):
    parties: List[Dict[str, Any]]

class AIParseSmartRequest(BaseModel):
    text: str

class AITestKeyRequest(BaseModel):
    api_key: Optional[str] = None

class OpenAITestKeyRequest(BaseModel):
    api_key: Optional[str] = None

class BigBrainUiControlRequest(BaseModel):
    party_data: Optional[Dict[str, Any]] = None
    template_format: str = "attachment_pdf"
    language: str = "en"
    envelopes_per_page: int = 2
    api_key: Optional[str] = None

class BigBrainInsightsRequest(BaseModel):
    stats_data: Optional[Dict[str, Any]] = None
    api_key: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    permissions: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    google_id: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "employee"
    permissions: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
class Token(BaseModel):
    access_token: str
    token_type: str

# ==========================================
# 1. DASHBOARD ENDPOINT
# ==========================================

@app.get("/api/dashboard")
def get_dashboard_stats(
    filter_period: str = Query("this_month", pattern="^(today|7_days|this_month|custom|all)$"),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total parties
    total_parties = db.query(Party).filter(Party.is_active == True).count()

    # Total envelopes printed (cases sum)
    total_envelopes = db.query(func.sum(PrintJob.total_cases)).filter(PrintJob.status == "Printed").scalar() or 0

    # Total cases
    total_cases = db.query(PrintCase).count()

    # Total print jobs
    total_jobs = db.query(PrintJob).count()

    # Today's prints
    todays_prints = db.query(func.sum(PrintJob.total_cases)).filter(
        PrintJob.created_at >= today_start,
        PrintJob.status == "Printed"
    ).scalar() or 0

    # Print Summary Breakdown
    printed_count = db.query(PrintJob).filter(PrintJob.status == "Printed").count()
    pending_count = db.query(PrintJob).filter(PrintJob.status == "Pending").count()
    failed_count = db.query(PrintJob).filter(PrintJob.status == "Failed").count()

    # Recent Activity (Last 10 jobs)
    recent_jobs = db.query(PrintJob).order_by(desc(PrintJob.created_at)).limit(8).all()
    recent_activity = []
    for j in recent_jobs:
        time_str = j.created_at.strftime("%I:%M %p") if j.created_at else ""
        date_str = j.created_at.strftime("%d %b") if j.created_at else ""
        recent_activity.append({
            "id": j.id,
            "job_number": j.job_number,
            "party_name": j.party_name_snap,
            "time": f"{date_str}, {time_str}",
            "action": f"Printed {j.total_cases} Case(s) ({j.parcel_type})",
            "status": j.status,
            "cases": j.total_cases,
            "weight": f"{j.total_weight:.2f} KG"
        })

    # Monthly / Daily Print Trend
    # Query last 7 days or months
    trend_labels = []
    trend_data = []
    for i in range(6, -1, -1):
        day_date = (now - datetime.timedelta(days=i)).date()
        day_start = datetime.datetime.combine(day_date, datetime.time.min)
        day_end = datetime.datetime.combine(day_date, datetime.time.max)
        day_cases = db.query(func.sum(PrintJob.total_cases)).filter(
            PrintJob.created_at >= day_start,
            PrintJob.created_at <= day_end
        ).scalar() or 0
        trend_labels.append(day_date.strftime("%a %d"))
        trend_data.append(int(day_cases))

    return {
        "metrics": {
            "total_parties": total_parties,
            "total_envelopes_printed": int(total_envelopes),
            "total_cases": total_cases,
            "print_jobs": total_jobs,
            "todays_prints": int(todays_prints)
        },
        "print_summary": {
            "printed": printed_count,
            "pending": pending_count,
            "failed": failed_count
        },
        "trend": {
            "labels": trend_labels,
            "data": trend_data
        },
        "recent_activity": recent_activity
    }

# ==========================================
# 2. PARTIES CRUD & AUTOCOMPLETE
# ==========================================

@app.get("/api/parties")
def list_parties(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=-1),
    search: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    status: str = "all",
    route: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cache_key = f"parties:list:{page}:{limit}:{search or ''}:{state or ''}:{city or ''}:{status}:{route or ''}"
    etag = cache_mgr.get_etag(cache_key)

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=15, stale-while-revalidate=30"})

    cached_data = cache_mgr.get(cache_key)
    if cached_data is not None:
        return JSONResponse(
            content=cached_data,
            headers={
                "ETag": etag,
                "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
                "X-Cache": "HIT"
            }
        )

    query = db.query(Party)

    if status == "active":
        query = query.filter(Party.is_active == True)
    elif status == "inactive":
        query = query.filter(Party.is_active == False)
    elif status in ["new_10_days", "new"]:
        ten_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=10)
        query = query.filter(Party.created_at >= ten_days_ago)

    if state:
        query = query.filter(Party.state.ilike(f"%{state.strip()}%"))
    if city:
        query = query.filter(Party.city.ilike(f"%{city.strip()}%"))
    if route and route.strip():
        rt = f"%{route.strip()}%"
        query = query.filter(
            or_(
                Party.route.ilike(rt),
                Party.route_1.ilike(rt),
                Party.route_2.ilike(rt),
                Party.route_3.ilike(rt),
                Party.route_1_gu.ilike(rt),
                Party.route_2_gu.ilike(rt),
                Party.route_3_gu.ilike(rt),
            )
        )

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Party.party_name.ilike(s),
                Party.party_code.ilike(s),
                Party.party_name_gu.ilike(s),
                Party.mobile_no.ilike(s),
                Party.city.ilike(s),
                Party.city_gu.ilike(s),
                Party.address.ilike(s),
                Party.route.ilike(s),
                Party.route_1.ilike(s),
                Party.route_2.ilike(s),
                Party.route_3.ilike(s),
                Party.route_1_gu.ilike(s),
                Party.route_2_gu.ilike(s),
                Party.route_3_gu.ilike(s),
            )
        )

    total = query.count()

    # Unique states and cities for filter dropdowns
    all_states = [s[0] for s in db.query(Party.state).distinct().filter(Party.state != None).all() if s[0]]
    all_cities = [c[0] for c in db.query(Party.city).distinct().filter(Party.city != None).all() if c[0]]

    query = query.order_by(Party.party_name.asc())

    if limit == -1:
        parties = query.all()
        pages = 1
    else:
        pages = (total + limit - 1) // limit if limit > 0 else 1
        parties = query.offset((page - 1) * limit).limit(limit).all()

    items = []
    for p in parties:
        items.append({
            "id": p.id,
            "party_name": p.party_name,
            "party_code": p.party_code,
            "address": p.address,
            "address_line_2": p.address_line_2,
            "address_line_3": p.address_line_3,
            "city": p.city,
            "state": p.state,
            "mobile_no": p.mobile_no,
            "landline": p.landline,
            "email": p.email,
            "gst_no": p.gst_no,
            "notes": p.notes,
            "party_name_gu": p.party_name_gu,
            "address_gu": p.address_gu,
            "address_line_2_gu": p.address_line_2_gu,
            "address_line_3_gu": p.address_line_3_gu,
            "city_gu": p.city_gu,
            "state_gu": p.state_gu,
            "route": p.route,
            "route_1": p.route_1,
            "route_2": p.route_2,
            "route_3": p.route_3,
            "route_1_gu": p.route_1_gu,
            "route_2_gu": p.route_2_gu,
            "route_3_gu": p.route_3_gu,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "geofence_radius_meters": p.geofence_radius_meters or 75,
            "geofence_set_at": p.geofence_set_at.isoformat() if p.geofence_set_at else None,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    res_data = {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "states": sorted(list(set(all_states))),
        "cities": sorted(list(set(all_cities)))
    }
    cache_mgr.set(cache_key, res_data, ttl_seconds=30.0)
    return JSONResponse(
        content=res_data,
        headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
            "X-Cache": "MISS"
        }
    )

@app.get("/api/parties/autocomplete")
def autocomplete_parties(
    q: str = Query("", min_length=1),
    mode: str = Query("contains", pattern="^(starts_with|contains)$"),
    db: Session = Depends(get_db)
):
    """
    Super fast instant search when typing even ONE letter (e.g. 'J').
    Supports Starts With or Contains matching.
    """
    clean_q = q.strip()
    if not clean_q:
        return []

    cache_key = f"parties:autocomplete:{mode}:{clean_q.lower()}"
    cached = cache_mgr.get(cache_key)
    if cached is not None:
        return cached

    pattern = f"{clean_q}%" if mode == "starts_with" else f"%{clean_q}%"

    results = db.query(Party).filter(
        Party.is_active == True,
        or_(
            Party.party_name.ilike(pattern),
            Party.party_name_gu.ilike(pattern),
            Party.party_code.ilike(pattern),
            Party.mobile_no.ilike(f"%{clean_q}%"),
            Party.city.ilike(pattern),
            Party.city_gu.ilike(pattern),
            Party.route.ilike(pattern),
            Party.route_1.ilike(pattern),
            Party.route_2.ilike(pattern),
            Party.route_3.ilike(pattern)
        )
    ).order_by(Party.party_name.asc()).limit(25).all()

    formatted = [
        {
            "id": p.id,
            "party_name": p.party_name,
            "party_code": p.party_code,
            "address": p.address,
            "address_line_2": p.address_line_2,
            "address_line_3": p.address_line_3,
            "city": p.city,
            "state": p.state,
            "mobile_no": p.mobile_no,
            "landline": p.landline,
            "email": p.email,
            "gst_no": p.gst_no,
            "notes": p.notes,
            "party_name_gu": p.party_name_gu,
            "address_gu": p.address_gu,
            "address_line_2_gu": p.address_line_2_gu,
            "address_line_3_gu": p.address_line_3_gu,
            "city_gu": p.city_gu,
            "state_gu": p.state_gu,
            "route": p.route,
            "route_1": p.route_1,
            "route_2": p.route_2,
            "route_3": p.route_3,
            "route_1_gu": p.route_1_gu,
            "route_2_gu": p.route_2_gu,
            "route_3_gu": p.route_3_gu
        }
        for p in results
    ]
    cache_mgr.set(cache_key, formatted, ttl_seconds=60.0)
    return formatted

# -------------------------------------------------------------
# Items / Products Catalog (Full Cases) Endpoints
# -------------------------------------------------------------
@app.get("/api/items")
def get_items(
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Item).filter(Item.is_active == True)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(term),
                Item.item_code.ilike(term),
                Item.company.ilike(term)
            )
        )
    total = query.count()
    items = query.order_by(Item.item_name.asc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": it.id,
                "item_code": it.item_code,
                "item_name": it.item_name,
                "unit": it.unit,
                "company": it.company,
                "mrp": it.mrp,
                "sales_price": it.sales_price,
                "cost_price": it.cost_price,
                "stock_qty": it.stock_qty,
                "rack_no": it.rack_no
            }
            for it in items
        ]
    }

@app.get("/api/items/search")
def search_items(
    q: str = Query("", min_length=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db)
):
    clean_q = q.strip()
    if not clean_q:
        return []
    
    term = f"%{clean_q}%"
    results = db.query(Item).filter(
        Item.is_active == True,
        or_(
            Item.item_name.ilike(term),
            Item.item_code.ilike(term),
            Item.company.ilike(term)
        )
    ).order_by(
        case((Item.item_name.ilike(f"{clean_q}%"), 1), else_=2),
        Item.item_name.asc()
    ).limit(limit).all()

    return [
        {
            "id": it.id,
            "item_code": it.item_code,
            "item_name": it.item_name,
            "unit": it.unit,
            "company": it.company,
            "mrp": it.mrp,
            "sales_price": it.sales_price,
            "stock_qty": it.stock_qty,
            "rack_no": it.rack_no
        }
        for it in results
    ]

@app.post("/api/items/import-excel")
async def import_items_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    import openpyxl, io
    content = await file.read()
    filename = file.filename or "stock.xlsx"
    
    items_dict = {}
    if filename.endswith(".csv"):
        import csv
        text = content.decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(text))
        for i, row in enumerate(reader):
            if i < 4 or len(row) < 3: continue
            code = (row[0] or "").strip()
            name = (row[1] or "").strip()
            if not name: continue
            unit = (row[2] or "").strip().upper()
            if unit in [".PCS", "0PCS", "1PCS", "PSC"]: unit = "PCS"
            stock = 0.0
            try: stock = float(row[3])
            except: pass
            cost_price = None
            try: cost_price = float(row[8]) if len(row) > 8 else None
            except: pass
            mrp = None
            try: mrp = float(row[10]) if len(row) > 10 else None
            except: pass
            sales_price = None
            try: sales_price = float(row[12]) if len(row) > 12 else None
            except: pass
            company = (row[13] or "").strip() if len(row) > 13 else ""
            rack_no = (row[22] or "").strip() if len(row) > 22 else ""
            key = (code, name)
            if key not in items_dict:
                items_dict[key] = {
                    "item_code": code, "item_name": name, "unit": unit, "company": company,
                    "mrp": mrp, "sales_price": sales_price, "cost_price": cost_price, "stock_qty": stock, "rack_no": rack_no
                }
            else:
                items_dict[key]["stock_qty"] += stock
                if mrp is not None: items_dict[key]["mrp"] = mrp
                if sales_price is not None: items_dict[key]["sales_price"] = sales_price
    else:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        sheet = wb.active
        for i, row in enumerate(sheet.iter_rows(values_only=True)):
            if i < 4 or len(row) < 3: continue
            code = str(row[0] or "").strip()
            name = str(row[1] or "").strip()
            if not name: continue
            unit = str(row[2] or "").strip().upper()
            if unit in [".PCS", "0PCS", "1PCS", "PSC"]: unit = "PCS"
            stock = 0.0
            try: stock = float(row[3]) if row[3] is not None else 0.0
            except: pass
            cost_price = None
            try: cost_price = float(row[8]) if row[8] is not None else None
            except: pass
            mrp = None
            try: mrp = float(row[10]) if row[10] is not None else None
            except: pass
            sales_price = None
            try: sales_price = float(row[12]) if row[12] is not None else None
            except: pass
            company = str(row[13] or "").strip() if len(row) > 13 else ""
            rack_no = str(row[22] or "").strip() if len(row) > 22 else ""
            key = (code, name)
            if key not in items_dict:
                items_dict[key] = {
                    "item_code": code, "item_name": name, "unit": unit, "company": company,
                    "mrp": mrp, "sales_price": sales_price, "cost_price": cost_price, "stock_qty": stock, "rack_no": rack_no
                }
            else:
                items_dict[key]["stock_qty"] += stock
                if mrp is not None: items_dict[key]["mrp"] = mrp
                if sales_price is not None: items_dict[key]["sales_price"] = sales_price

    imported_count = 0
    for it in items_dict.values():
        existing = db.query(Item).filter(Item.item_name == it["item_name"]).first()
        if existing:
            existing.item_code = it["item_code"]
            existing.unit = it["unit"]
            existing.company = it["company"]
            existing.mrp = it["mrp"]
            existing.sales_price = it["sales_price"]
            existing.cost_price = it["cost_price"]
            existing.stock_qty = it["stock_qty"]
            existing.rack_no = it["rack_no"]
        else:
            new_item = Item(
                item_code=it["item_code"],
                item_name=it["item_name"],
                unit=it["unit"],
                company=it["company"],
                mrp=it["mrp"],
                sales_price=it["sales_price"],
                cost_price=it["cost_price"],
                stock_qty=it["stock_qty"],
                rack_no=it["rack_no"]
            )
            db.add(new_item)
        imported_count += 1
    db.commit()
    return {"success": True, "count": imported_count, "message": f"Successfully imported {imported_count} items"}

@app.get("/api/parties/unprinted-today")
def get_unprinted_parties_today(
    unprinted_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # All party names printed today (normalized)
    printed_today_parties = set(
        (name or "").strip().upper() for (name,) in db.query(PrintJob.party_name_snap).filter(
            PrintJob.created_at >= today_start
        ).all()
        if name
    )

    query = db.query(Party).filter(Party.is_active == True).order_by(Party.party_name.asc())
    all_parties = query.all()

    results = []
    for p in all_parties:
        is_printed = (p.party_name or "").strip().upper() in printed_today_parties
        if unprinted_only and is_printed:
            continue
        results.append({
            "id": p.id,
            "party_name": p.party_name,
            "party_code": p.party_code,
            "address": p.address,
            "address_line_2": p.address_line_2,
            "address_line_3": p.address_line_3,
            "city": p.city,
            "state": p.state,
            "mobile_no": p.mobile_no,
            "gst_no": p.gst_no,
            "notes": p.notes,
            "party_name_gu": p.party_name_gu,
            "address_gu": p.address_gu,
            "address_line_2_gu": p.address_line_2_gu,
            "address_line_3_gu": p.address_line_3_gu,
            "city_gu": p.city_gu,
            "state_gu": p.state_gu,
            "route": p.route,
            "route_1": p.route_1,
            "route_2": p.route_2,
            "route_3": p.route_3,
            "route_1_gu": p.route_1_gu,
            "route_2_gu": p.route_2_gu,
            "route_3_gu": p.route_3_gu,
            "printed_today": is_printed
        })

    return {
        "items": results,
        "total": len(results),
        "total_unprinted": len([r for r in results if not r["printed_today"]]),
        "total_printed_today": len(printed_today_parties)
    }

def get_next_party_code(db: Session) -> str:
    """
    Generates the next sequential MARG party code: MARG000001, MARG000002, etc.
    Finds the maximum numeric suffix among all parties with codes starting with 'MARG',
    or uses max(Party.id).
    """
    max_num = 0
    codes = db.query(Party.party_code).filter(Party.party_code.like("MARG%")).all()
    for (code,) in codes:
        if code and code.startswith("MARG"):
            suffix = code[4:]
            if suffix.isdigit():
                val = int(suffix)
                if val > max_num:
                    max_num = val

    max_id = db.query(func.max(Party.id)).scalar() or 0
    next_num = max(max_num, max_id) + 1
    return f"MARG{next_num:06d}"

@app.get("/api/parties/next-code")
def get_party_next_code(db: Session = Depends(get_db)):
    """
    Returns the next auto-assignable party code (e.g. MARG001837).
    """
    cached = cache_mgr.get("parties:next_code")
    if cached is not None:
        return cached
    res = {"next_code": get_next_party_code(db)}
    cache_mgr.set("parties:next_code", res, ttl_seconds=30.0)
    return res

ORDER_BOOK_API_URL = os.environ.get("ORDER_BOOK_API_URL", "http://127.0.0.1:3000")
ORDER_BOOK_REMOTE_URL = os.environ.get("ORDER_BOOK_REMOTE_URL", "https://shreeji-order.aryan76688.workers.dev")
MARG_SYNC_SECRET = os.environ.get("MARG_SYNC_SECRET", "shreeji-marg-sync-secret-2026")

def sync_party_to_order_book(party: Party, action: str = "upsert"):
    """
    Asynchronously and non-blockingly notifies Shreeji Healthcare Order Book of party addition/update.
    """
    def _run():
        payload = {
            "partyCode": party.party_code,
            "partyName": party.party_name,
            "mobile": party.mobile_no or "",
            "email": party.email or "",
            "gstNumber": party.gst_no or "",
            "address": party.address or "",
            "addressLine1": party.address or "",
            "addressLine2": party.address_line_2 or "",
            "addressLine3": party.address_line_3 or "",
            "city": party.city or "",
            "state": party.state or "Gujarat",
            "landline": party.landline or "",
            "deliveryRoute": party.route_1 or party.route or "",
            "latitude": party.latitude,
            "longitude": party.longitude,
            "status": "active" if party.is_active else "inactive",
            "action": action
        }
        headers = {
            "Content-Type": "application/json",
            "X-Sync-Secret": MARG_SYNC_SECRET,
            "X-Sync-Source": "envelope"
        }
        for base in [ORDER_BOOK_API_URL, ORDER_BOOK_REMOTE_URL]:
            try:
                target = f"{base.rstrip('/')}/api/sync/parties"
                res = requests.post(target, json=payload, headers=headers, timeout=4)
                if res.status_code in (200, 201):
                    print(f"[OrderBook Sync] Synced party {party.party_code} to {target}")
                    return
            except Exception:
                pass
    threading.Thread(target=_run, daemon=True).start()

@app.post("/api/parties/sync-webhook")
def receive_party_sync(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Receives party creation/update from Shreeji Healthcare Order Book (B2B).
    Validates X-Sync-Secret.
    """
    secret = request.headers.get("x-sync-secret", "")
    if secret != MARG_SYNC_SECRET:
        raise HTTPException(status_code=401, detail="Invalid sync secret")

    party_code = (payload.get("partyCode") or payload.get("party_code") or "").strip().upper()
    party_name = (payload.get("partyName") or payload.get("party_name") or "").strip().upper()
    mobile = (payload.get("mobile") or payload.get("mobile_no") or "").strip()
    gst = (payload.get("gstNumber") or payload.get("gst_no") or "").strip().upper()
    city = (payload.get("city") or "").strip().upper() or "DAHEGAM"
    state = (payload.get("state") or "").strip().upper() or "GUJARAT"
    address = (payload.get("address") or payload.get("addressLine1") or "").strip().upper() or city
    address_2 = (payload.get("addressLine2") or "").strip().upper() or None
    address_3 = (payload.get("addressLine3") or "").strip().upper() or None
    route = (payload.get("deliveryRoute") or payload.get("route") or "").strip().upper() or None
    email = (payload.get("email") or "").strip() or None
    landline = (payload.get("landline") or "").strip() or None
    lat = payload.get("latitude")
    lng = payload.get("longitude")

    if not party_name:
        raise HTTPException(status_code=400, detail="partyName is required")

    # Match existing party by code > gst > mobile > name
    party = None
    if party_code:
        party = db.query(Party).filter(func.upper(Party.party_code) == party_code).first()
    if not party and gst:
        party = db.query(Party).filter(func.upper(Party.gst_no) == gst).first()
    if not party and mobile and len(mobile) >= 10:
        party = db.query(Party).filter(Party.mobile_no == mobile).first()
    if not party and party_name:
        party = db.query(Party).filter(func.upper(Party.party_name) == party_name).first()

    action = "updated"
    if party:
        party.party_name = party_name
        if party_code and not party.party_code:
            party.party_code = party_code
        if address:
            party.address = address
        if address_2:
            party.address_line_2 = address_2
        if address_3:
            party.address_line_3 = address_3
        if city:
            party.city = city
        if state:
            party.state = state
        if mobile:
            party.mobile_no = mobile
        if gst:
            party.gst_no = gst
        if email:
            party.email = email
        if landline:
            party.landline = landline
        if route:
            party.route = route
            party.route_1 = route
            party.route_1_gu = translate_route_to_gujarati(route)
        if lat is not None:
            try:
                party.latitude = float(lat)
            except Exception:
                pass
        if lng is not None:
            try:
                party.longitude = float(lng)
            except Exception:
                pass
        party.updated_at = datetime.datetime.utcnow()
    else:
        action = "created"
        code_to_use = party_code if party_code else get_next_party_code(db)
        r1_gu = translate_route_to_gujarati(route) if route else None
        lat_val = None
        lng_val = None
        if lat is not None:
            try:
                lat_val = float(lat)
            except Exception:
                pass
        if lng is not None:
            try:
                lng_val = float(lng)
            except Exception:
                pass

        party = Party(
            party_name=party_name,
            party_code=code_to_use,
            address=address,
            address_line_2=address_2,
            address_line_3=address_3,
            city=city,
            state=state,
            mobile_no=mobile or None,
            landline=landline,
            email=email,
            gst_no=gst or None,
            route=route,
            route_1=route,
            route_1_gu=r1_gu,
            latitude=lat_val,
            longitude=lng_val,
            is_active=True
        )
        db.add(party)

    db.commit()
    db.refresh(party)
    cache_mgr.bump_version()

    return {
        "success": True,
        "action": action,
        "party_id": party.id,
        "party_code": party.party_code,
        "party_name": party.party_name
    }

@app.post("/api/parties/sync-all-to-orderbook")
def sync_all_parties_to_orderbook(db: Session = Depends(get_db)):
    """
    Exports and synchronizes all existing Envelope Manager parties to Shreeji Healthcare Order Book.
    """
    parties = db.query(Party).all()
    total = len(parties)
    if total == 0:
        return {"success": True, "message": "No parties found to synchronize.", "total": 0, "synced": 0}

    chunk_size = 100
    synced_count = 0
    headers = {
        "Content-Type": "application/json",
        "X-Sync-Secret": MARG_SYNC_SECRET,
        "X-Sync-Source": "envelope"
    }

    for i in range(0, total, chunk_size):
        chunk = parties[i:i + chunk_size]
        payload = [
            {
                "partyCode": p.party_code,
                "partyName": p.party_name,
                "mobile": p.mobile_no or "",
                "email": p.email or "",
                "gstNumber": p.gst_no or "",
                "address": p.address or "",
                "addressLine1": p.address or "",
                "addressLine2": p.address_line_2 or "",
                "addressLine3": p.address_line_3 or "",
                "city": p.city or "DAHEGAM",
                "state": p.state or "Gujarat",
                "landline": p.landline or "",
                "deliveryRoute": p.route_1 or p.route or "",
                "latitude": p.latitude,
                "longitude": p.longitude,
                "status": "active" if p.is_active else "inactive"
            }
            for p in chunk
        ]

        sent = False
        for base in [ORDER_BOOK_API_URL, ORDER_BOOK_REMOTE_URL]:
            try:
                target = f"{base.rstrip('/')}/api/sync/parties/batch"
                res = requests.post(target, json=payload, headers=headers, timeout=12)
                if res.status_code in (200, 201):
                    sent = True
                    break
            except Exception:
                pass
        if sent:
            synced_count += len(chunk)

    return {
        "success": True,
        "message": f"Successfully synchronized {synced_count} of {total} parties to Order Book.",
        "total": total,
        "synced": synced_count
    }

@app.post("/api/parties", status_code=status.HTTP_201_CREATED)
def create_party(party_in: PartyCreate, request: Request, db: Session = Depends(get_db)):
    if not party_in.party_name.strip():
        raise HTTPException(status_code=400, detail="Party Name is required")
    if not party_in.address.strip():
        raise HTTPException(status_code=400, detail="Address is required")
    if not party_in.city.strip():
        raise HTTPException(status_code=400, detail="City is required")
    if not party_in.state.strip():
        raise HTTPException(status_code=400, detail="State is required")

    # Auto-assign or check code
    code_to_use = party_in.party_code.strip().upper() if party_in.party_code and party_in.party_code.strip() else None
    if not code_to_use:
        code_to_use = get_next_party_code(db)
    else:
        dup = db.query(Party).filter(func.upper(Party.party_code) == code_to_use).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Party Code '{code_to_use}' already exists")

    r1 = party_in.route_1.strip().upper() if party_in.route_1 else None
    r2 = party_in.route_2.strip().upper() if party_in.route_2 else None
    r3 = party_in.route_3.strip().upper() if party_in.route_3 else None
    r1_gu = party_in.route_1_gu.strip() if party_in.route_1_gu else translate_route_to_gujarati(r1)
    r2_gu = party_in.route_2_gu.strip() if party_in.route_2_gu else translate_route_to_gujarati(r2)
    r3_gu = party_in.route_3_gu.strip() if party_in.route_3_gu else translate_route_to_gujarati(r3)
    active_route = party_in.route.strip().upper() if party_in.route else (r1 or r2 or r3)

    party = Party(
        party_name=party_in.party_name.strip().upper(),
        party_code=code_to_use,
        address=party_in.address.strip().upper(),
        address_line_2=party_in.address_line_2.strip().upper() if party_in.address_line_2 else None,
        address_line_3=party_in.address_line_3.strip().upper() if party_in.address_line_3 else None,
        city=party_in.city.strip().upper(),
        state=party_in.state.strip().upper(),
        mobile_no=party_in.mobile_no.strip() if party_in.mobile_no else None,
        landline=party_in.landline.strip() if party_in.landline else None,
        email=party_in.email.strip() if party_in.email else None,
        gst_no=party_in.gst_no.strip().upper() if party_in.gst_no else None,
        notes=party_in.notes.strip() if party_in.notes else None,
        party_name_gu=ai_service.clean_gujarati_text(party_in.party_name_gu) if party_in.party_name_gu else None,
        address_gu=ai_service.clean_gujarati_text(party_in.address_gu) if party_in.address_gu else None,
        address_line_2_gu=ai_service.clean_gujarati_text(party_in.address_line_2_gu) if party_in.address_line_2_gu else None,
        address_line_3_gu=ai_service.clean_gujarati_text(party_in.address_line_3_gu) if party_in.address_line_3_gu else None,
        city_gu=ai_service.clean_gujarati_text(party_in.city_gu) if party_in.city_gu else None,
        state_gu=ai_service.clean_gujarati_text(party_in.state_gu) if party_in.state_gu else None,
        route=active_route,
        route_1=r1,
        route_2=r2,
        route_3=r3,
        route_1_gu=r1_gu,
        route_2_gu=r2_gu,
        route_3_gu=r3_gu,
        is_active=party_in.is_active
    )
    db.add(party)
    db.commit()
    db.refresh(party)

    # Invalidate cache
    cache_mgr.bump_version()

    # Outbound sync to Shreeji Healthcare Order Book
    if request.headers.get("x-sync-source") != "orderbook":
        sync_party_to_order_book(party, "create")

    return party

@app.get("/api/parties/routes")
def get_all_routes(db: Session = Depends(get_db)):
    """Returns sorted unique routes assigned across parties and print jobs."""
    cached = cache_mgr.get("parties:routes")
    if cached is not None:
        return cached

    party_routes = set()
    for col in [Party.route, Party.route_1, Party.route_2, Party.route_3]:
        for r in db.query(col).distinct().filter(col != None).all():
            if r[0] and r[0].strip():
                party_routes.add(r[0].strip())
    job_routes = [r[0].strip() for r in db.query(PrintJob.delivery_route).distinct().filter(PrintJob.delivery_route != None).all() if r[0] and r[0].strip()]
    res = sorted(list(party_routes.union(job_routes)))
    cache_mgr.set("parties:routes", res, ttl_seconds=300.0)
    return res

@app.post("/api/parties/bulk-route")
def bulk_assign_party_route(req: BulkRouteRequest, db: Session = Depends(get_db)):
    """Bulk assigns delivery route to multiple selected parties."""
    if not req.party_ids:
        raise HTTPException(status_code=400, detail="party_ids cannot be empty")
    route_clean = req.route.strip().upper()
    if not route_clean:
        raise HTTPException(status_code=400, detail="Route name cannot be empty")

    gu_route = translate_route_to_gujarati(route_clean)
    updated = db.query(Party).filter(Party.id.in_(req.party_ids)).update(
        {
            "route": route_clean,
            "route_1": route_clean,
            "route_1_gu": gu_route
        },
        synchronize_session=False
    )
    db.commit()
    cache_mgr.bump_version()
    return {"success": True, "updated_count": updated, "route": route_clean, "route_gu": gu_route}

@app.post("/api/parties/bulk-delete")
def bulk_delete_parties(req: BulkDeletePartiesRequest, db: Session = Depends(get_db)):
    """Deletes multiple selected parties in a single transaction."""
    if not req.party_ids:
        return {"deleted_count": 0, "message": "No party IDs provided"}

    deleted = db.query(Party).filter(Party.id.in_(req.party_ids)).delete(synchronize_session=False)
    db.commit()
    cache_mgr.bump_version()
    return {"deleted_count": deleted, "message": f"{deleted} parties deleted successfully"}

@app.post("/api/parties/delete-all")
@app.delete("/api/parties/all")
def delete_all_parties(db: Session = Depends(get_db)):
    """One-click deletion of all parties in the database."""
    total_count = db.query(Party).count()
    db.query(Party).delete(synchronize_session=False)
    db.commit()
    cache_mgr.bump_version()
    return {"deleted_count": total_count, "message": f"All {total_count} parties deleted successfully"}

@app.post("/api/parties/export-selected")
def export_selected_parties(req: ExportSelectedPartiesRequest, db: Session = Depends(get_db)):
    """Exports only the user-selected parties to an XLSX workbook."""
    if req.party_ids:
        parties = db.query(Party).filter(Party.id.in_(req.party_ids)).order_by(Party.party_name.asc()).all()
    else:
        parties = db.query(Party).order_by(Party.party_name.asc()).all()

    xlsx_bytes = excel_service.export_parties_to_excel(parties)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Selected_Parties_MARG.xlsx"'}
    )

@app.get("/api/parties/{party_id}")
def get_party(party_id: int, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return party

@app.put("/api/parties/{party_id}")
def update_party(party_id: int, party_in: PartyUpdate, request: Request, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    if not party_in.party_name.strip():
        raise HTTPException(status_code=400, detail="Party Name is required")

    party.party_name = party_in.party_name.strip().upper()
    party.party_code = party_in.party_code.strip().upper() if party_in.party_code else None
    party.address = party_in.address.strip().upper()
    party.address_line_2 = party_in.address_line_2.strip().upper() if party_in.address_line_2 else None
    party.address_line_3 = party_in.address_line_3.strip().upper() if party_in.address_line_3 else None
    party.city = party_in.city.strip().upper()
    party.state = party_in.state.strip().upper()
    party.mobile_no = party_in.mobile_no.strip() if party_in.mobile_no else None
    party.landline = party_in.landline.strip() if party_in.landline else None
    party.email = party_in.email.strip() if party_in.email else None
    party.gst_no = party_in.gst_no.strip().upper() if party_in.gst_no else None
    party.notes = party_in.notes.strip() if party_in.notes else None
    party.party_name_gu = ai_service.clean_gujarati_text(party_in.party_name_gu) if party_in.party_name_gu else None
    party.address_gu = ai_service.clean_gujarati_text(party_in.address_gu) if party_in.address_gu else None
    party.address_line_2_gu = ai_service.clean_gujarati_text(party_in.address_line_2_gu) if party_in.address_line_2_gu else None
    party.address_line_3_gu = ai_service.clean_gujarati_text(party_in.address_line_3_gu) if party_in.address_line_3_gu else None
    party.city_gu = ai_service.clean_gujarati_text(party_in.city_gu) if party_in.city_gu else None
    party.state_gu = ai_service.clean_gujarati_text(party_in.state_gu) if party_in.state_gu else None

    if party_in.route_1 is not None:
        party.route_1 = party_in.route_1.strip().upper() if party_in.route_1 else None
        party.route_1_gu = party_in.route_1_gu.strip() if party_in.route_1_gu else translate_route_to_gujarati(party.route_1)
    if party_in.route_2 is not None:
        party.route_2 = party_in.route_2.strip().upper() if party_in.route_2 else None
        party.route_2_gu = party_in.route_2_gu.strip() if party_in.route_2_gu else translate_route_to_gujarati(party.route_2)
    if party_in.route_3 is not None:
        party.route_3 = party_in.route_3.strip().upper() if party_in.route_3 else None
        party.route_3_gu = party_in.route_3_gu.strip() if party_in.route_3_gu else translate_route_to_gujarati(party.route_3)
    if party_in.route is not None and party_in.route.strip():
        party.route = party_in.route.strip().upper()
    else:
        party.route = party.route_1 or party.route_2 or party.route_3 or party.route

    party.is_active = party_in.is_active

    party.latitude = party_in.latitude
    party.longitude = party_in.longitude
    if party_in.geofence_radius_meters is not None:
        party.geofence_radius_meters = party_in.geofence_radius_meters
    if party_in.latitude is not None and party_in.longitude is not None and not party.geofence_set_at:
        party.geofence_set_at = datetime.datetime.now(datetime.timezone.utc)
    elif party_in.latitude is None or party_in.longitude is None:
        party.geofence_set_at = None

    db.commit()
    db.refresh(party)

    # Invalidate cache
    cache_mgr.bump_version()

    # Outbound sync to Shreeji Healthcare Order Book
    if request.headers.get("x-sync-source") != "orderbook":
        sync_party_to_order_book(party, "update")

    return party

@app.post("/api/parties/{party_id}/geofence")
def update_party_geofence(party_id: int, req: PartyGeofenceUpdateRequest, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    party.latitude = req.latitude
    party.longitude = req.longitude
    if req.radius_meters:
        party.geofence_radius_meters = req.radius_meters
    party.geofence_set_at = datetime.datetime.now(datetime.timezone.utc) if (req.latitude is not None and req.longitude is not None) else None
    db.commit()
    db.refresh(party)
    cache_mgr.bump_version()
    return {
        "success": True,
        "party_id": party.id,
        "party_name": party.party_name,
        "latitude": party.latitude,
        "longitude": party.longitude,
        "geofence_radius_meters": party.geofence_radius_meters,
        "geofence_set_at": party.geofence_set_at.isoformat() if party.geofence_set_at else None
    }

@app.post("/api/parties/{party_id}/unset-location")
@app.delete("/api/parties/{party_id}/geofence")
def unset_party_location(party_id: int, db: Session = Depends(get_db)):
    """Unsets/clears GPS coordinates for a single party."""
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    party.latitude = None
    party.longitude = None
    party.geofence_set_at = None
    db.commit()
    db.refresh(party)
    cache_mgr.bump_version()
    return {
        "success": True,
        "party_id": party.id,
        "party_name": party.party_name,
        "latitude": None,
        "longitude": None,
        "message": f"Successfully unset location for {party.party_name}"
    }

@app.post("/api/parties/bulk-unset-location")
def bulk_unset_party_location(req: BulkUnsetLocationRequest, db: Session = Depends(get_db)):
    """Bulk unsets/clears GPS coordinates for multiple selected parties."""
    if not req.party_ids:
        raise HTTPException(status_code=400, detail="No party IDs provided")
    updated_count = db.query(Party).filter(Party.id.in_(req.party_ids)).update(
        {Party.latitude: None, Party.longitude: None, Party.geofence_set_at: None},
        synchronize_session=False
    )
    db.commit()
    cache_mgr.bump_version()
    return {
        "success": True,
        "updated_count": updated_count,
        "party_ids": req.party_ids,
        "message": f"Successfully unset location for {updated_count} selected parties."
    }

@app.delete("/api/parties/{party_id}")
def delete_party(party_id: int, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    name = party.party_name
    db.delete(party)
    db.commit()
    cache_mgr.bump_version()
    return {"message": f"Party '{name}' deleted successfully"}

# -------------------------------------------------------------
# GOOGLE SHEETS ROUTE INTEGRATION & BATCH ROUTE EDITING
# -------------------------------------------------------------

@app.get("/api/routes/export-template")
def export_routes_template(db: Session = Depends(get_db)):
    """
    Exports a CSV template with columns:
    party_code, party_name, primary_route_1, secondary_route_2, third_route_3, latitude, longitude
    pre-filled with all parties for easy editing in Google Sheets.
    """
    parties = db.query(Party).filter(Party.is_active == True).order_by(Party.party_name.asc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["party_code", "party_name", "primary_route_1", "secondary_route_2", "third_route_3", "latitude", "longitude"])
    for p in parties:
        writer.writerow([
            p.party_code or "",
            p.party_name,
            p.route_1 or p.route or "",
            p.route_2 or "",
            p.route_3 or "",
            p.latitude if getattr(p, "latitude", None) is not None else "",
            p.longitude if getattr(p, "longitude", None) is not None else ""
        ])
    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="MARG_Party_Routes.csv"'}
    )

@app.post("/api/routes/batch-update")
def batch_update_routes(req: BatchUpdateRoutesRequest, db: Session = Depends(get_db)):
    """
    Allows direct inline route updates for multiple parties from the website table.
    """
    updated_count = 0
    for item in req.updates:
        party = None
        if item.id:
            party = db.query(Party).filter(Party.id == item.id).first()
        elif item.party_code:
            party = db.query(Party).filter(func.upper(Party.party_code) == item.party_code.strip().upper()).first()
        
        if not party:
            continue

        r1 = item.route_1.strip().upper() if item.route_1 else None
        r2 = item.route_2.strip().upper() if item.route_2 else None
        r3 = item.route_3.strip().upper() if item.route_3 else None

        r1_gu = item.route_1_gu.strip() if item.route_1_gu else translate_route_to_gujarati(r1)
        r2_gu = item.route_2_gu.strip() if item.route_2_gu else translate_route_to_gujarati(r2)
        r3_gu = item.route_3_gu.strip() if item.route_3_gu else translate_route_to_gujarati(r3)

        party.route_1 = r1
        party.route_2 = r2
        party.route_3 = r3
        party.route_1_gu = r1_gu
        party.route_2_gu = r2_gu
        party.route_3_gu = r3_gu
        party.route = r1 or r2 or r3 or party.route

        if item.latitude is not None:
            party.latitude = item.latitude
            party.geofence_set_at = datetime.datetime.utcnow()
        if item.longitude is not None:
            party.longitude = item.longitude
            party.geofence_set_at = datetime.datetime.utcnow()

        updated_count += 1

    db.commit()
    return {"success": True, "updated_count": updated_count, "message": f"Successfully updated routes for {updated_count} parties."}

# -------------------------------------------------------------
# Google Maps Real Road Directions (Routes API v2 computeRoutes)
# -------------------------------------------------------------
class LocationPoint(BaseModel):
    lat: float
    lng: float
    place_id: Optional[str] = None
    name: Optional[str] = None

class ComputeRouteRequest(BaseModel):
    origin: LocationPoint
    destination: LocationPoint
    intermediates: Optional[List[LocationPoint]] = []
    travel_mode: Optional[str] = "DRIVING" # "DRIVING", "WALKING", "BICYCLING", "TWO_WHEELER"

def _decode_google_polyline(encoded: str) -> List[Dict[str, float]]:
    """Decodes Google encoded polyline string into an array of {lat, lng} road points."""
    points = []
    index = 0
    length = len(encoded)
    lat = 0
    lng = 0
    while index < length:
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng
        points.append({"lat": round(lat / 1e5, 6), "lng": round(lng / 1e5, 6)})
    return points

@app.post("/api/routes/compute-route")
def compute_road_route(req: ComputeRouteRequest):
    """
    Computes a real road-following route using Google Maps Routes API (Directions v2 computeRoutes).
    Returns real road geometry points, distance in meters & km, duration in seconds & minutes,
    and turn-by-turn navigation instructions. Never returns a straight line.
    """
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    if line.startswith("GOOGLE_MAPS_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
                        break
    if not api_key:
        api_key = "AIzaSyCqJ08p5J1pYJQvJqrkV5_8AIl6pP8CfXA"

    travel_mode_map = {
        "DRIVING": "DRIVE",
        "WALKING": "WALK",
        "BICYCLING": "BICYCLE",
        "TWO_WHEELER": "TWO_WHEELER"
    }
    mode = travel_mode_map.get(req.travel_mode.upper(), "DRIVE")

    origin_obj = {}
    if req.origin.place_id:
        origin_obj["placeId"] = req.origin.place_id
    else:
        origin_obj["location"] = {"latLng": {"latitude": req.origin.lat, "longitude": req.origin.lng}}

    dest_obj = {}
    if req.destination.place_id:
        dest_obj["placeId"] = req.destination.place_id
    else:
        dest_obj["location"] = {"latLng": {"latitude": req.destination.lat, "longitude": req.destination.lng}}

    payload = {
        "origin": origin_obj,
        "destination": dest_obj,
        "travelMode": mode
    }
    # Note: Google Routes API only allows routingPreference for DRIVE and TWO_WHEELER
    if mode in ("DRIVE", "TWO_WHEELER"):
        payload["routingPreference"] = "TRAFFIC_UNAWARE"

    if req.intermediates:
        intermediates_list = []
        for p in req.intermediates:
            if p.place_id:
                intermediates_list.append({"placeId": p.place_id})
            else:
                intermediates_list.append({"location": {"latLng": {"latitude": p.lat, "longitude": p.lng}}})
        if intermediates_list:
            payload["intermediates"] = intermediates_list

    routes_url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.legs.distanceMeters,routes.legs.duration,routes.viewport"
    }

    try:
        resp = requests.post(routes_url, headers=headers, json=payload, timeout=12)
        if resp.status_code != 200:
            err_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            err_msg = err_data.get("error", {}).get("message") or f"Google Routes API HTTP {resp.status_code}"
            raise HTTPException(status_code=resp.status_code, detail=f"Routing Error: {err_msg}")

        data = resp.json()
        routes = data.get("routes", [])
        if not routes:
            raise HTTPException(status_code=404, detail="No real road route found between the specified locations.")

        route = routes[0]
        encoded_poly = route.get("polyline", {}).get("encodedPolyline", "")
        path_points = _decode_google_polyline(encoded_poly) if encoded_poly else []

        raw_dur = route.get("duration", "0s").rstrip("s")
        try:
            duration_seconds = int(raw_dur)
        except Exception:
            duration_seconds = 0

        distance_meters = int(route.get("distanceMeters", 0))

        legs_output = []
        all_steps = []
        for leg in route.get("legs", []):
            leg_steps = []
            for step in leg.get("steps", []):
                s_dist = int(step.get("distanceMeters", 0))
                s_dur = int(step.get("staticDuration", "0s").rstrip("s") or 0)
                instr = step.get("navigationInstruction", {})
                instr_text = instr.get("instructions", "")
                maneuver = instr.get("maneuver", "STRAIGHT")
                step_poly = step.get("polyline", {}).get("encodedPolyline", "")
                step_points = _decode_google_polyline(step_poly) if step_poly else []

                step_data = {
                    "distance_meters": s_dist,
                    "duration_seconds": s_dur,
                    "instruction": instr_text or f"Continue for {s_dist}m",
                    "maneuver": maneuver,
                    "start_location": step.get("startLocation", {}).get("latLng", {}),
                    "end_location": step.get("endLocation", {}).get("latLng", {}),
                    "path": step_points
                }
                leg_steps.append(step_data)
                all_steps.append(step_data)

            legs_output.append({
                "distance_meters": int(leg.get("distanceMeters", 0)),
                "duration_seconds": int(leg.get("duration", "0s").rstrip("s") or 0),
                "steps": leg_steps
            })

        return {
            "success": True,
            "travel_mode": req.travel_mode,
            "distance_meters": distance_meters,
            "distance_km": round(distance_meters / 1000.0, 2),
            "duration_seconds": duration_seconds,
            "duration_minutes": round(duration_seconds / 60.0, 1),
            "viewport": route.get("viewport"),
            "path": path_points,
            "path_count": len(path_points),
            "legs": legs_output,
            "steps": all_steps
        }
    except HTTPException:
        raise
    except requests.exceptions.RequestException as req_err:
        raise HTTPException(status_code=502, detail=f"Failed to connect to Google Routes API: {str(req_err)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing road route: {str(e)}")

@app.post("/api/routes/sync-google-sheet")
def sync_google_sheet_routes(req: SyncGoogleSheetRequest, db: Session = Depends(get_db)):
    """
    Fetches route mappings from a Google Sheet using Google Sheets API v4.
    Matches columns: party_code, party_name, primary_route_1, secondary_route_2, third_route_3.
    Auto-translates English route names to Gujarati and updates the database.
    """
    raw_sheet = req.sheet_url_or_id.strip().strip("'\"<> ")
    if not raw_sheet:
        raise HTTPException(status_code=400, detail="Please enter your Google Sheet URL or Spreadsheet ID.")

    # Extract Spreadsheet ID
    match = re.search(r"/spreadsheets/(?:u/\d+/)?d/([a-zA-Z0-9-_]+)", raw_sheet)
    if match and match.group(1) != "e":
        spreadsheet_id = match.group(1)
    else:
        id_match = re.search(r"([a-zA-Z0-9-_]{20,})", raw_sheet)
        spreadsheet_id = id_match.group(1) if id_match else raw_sheet

    # Determine API key
    api_key = req.api_key.strip() if req.api_key and req.api_key.strip() else None
    if not api_key:
        app_set = db.query(AppSettings).first()
        api_key = getattr(app_set, "google_sheets_api_key", "") if app_set else ""
    if not api_key:
        api_key = "AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg"

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MARG-Envelope-Manager/1.0"}
    values = []

    # 1. Attempt Fetch via Google Sheets API v4
    try:
        sheet_title = req.sheet_name.strip() if req.sheet_name and req.sheet_name.strip() else None
        if not sheet_title:
            meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}?fields=sheets.properties.title&key={api_key}"
            req_meta = urllib.request.Request(meta_url, headers=headers)
            with urllib.request.urlopen(req_meta, timeout=12) as resp:
                meta_json = json.loads(resp.read().decode("utf-8"))
                sheets_list = meta_json.get("sheets", [])
                sheet_title = sheets_list[0].get("properties", {}).get("title", "Sheet1") if sheets_list else "Sheet1"

        range_q = urllib.parse.quote(f"{sheet_title}!A1:Z")
        values_url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range_q}?key={api_key}"
        req_val = urllib.request.Request(values_url, headers=headers)
        with urllib.request.urlopen(req_val, timeout=15) as resp:
            val_json = json.loads(resp.read().decode("utf-8"))
        values = val_json.get("values", [])
    except Exception as api_err:
        # 2. Resilient Fallback: Direct Google Sheets CSV Export / GViz
        csv_fetched = False
        try:
            csv_urls = [
                f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv",
                f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv"
            ]
            for c_url in csv_urls:
                try:
                    req_csv = urllib.request.Request(c_url, headers=headers)
                    with urllib.request.urlopen(req_csv, timeout=15) as resp:
                        csv_text = resp.read().decode("utf-8")
                        csv_rows = list(csv.reader(io.StringIO(csv_text)))
                        if csv_rows and len(csv_rows) > 0:
                            values = csv_rows
                            csv_fetched = True
                            break
                except Exception:
                    continue
        except Exception:
            pass

        if not csv_fetched:
            # Check the original error
            if isinstance(api_err, urllib.error.HTTPError):
                if api_err.code == 404:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Google Sheets Error (HTTP 404): Spreadsheet not found or link is private. "
                            "How to fix: 1. Paste your actual Google Sheet URL. "
                            "2. In Google Sheets, click the blue 'Share' button (top-right) and change General Access from 'Restricted' to 'Anyone with the link can view'."
                        )
                    )
                elif api_err.code == 403:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Google Sheets Error (HTTP 403): Access denied. "
                            "Please open your Google Sheet, click the blue 'Share' button (top-right), and change General Access from 'Restricted' to 'Anyone with the link can view'."
                        )
                    )
                else:
                    raise HTTPException(status_code=400, detail=f"Google Sheets error (HTTP {api_err.code}): {api_err.reason}")
            else:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Could not connect to Google Sheet. "
                        "Please verify your Google Sheet URL and ensure it is shared as 'Anyone with the link can view', or use the 'Direct Route Editor' tab to edit routes directly."
                    )
                )

    result = process_route_matrix(values, db, spreadsheet_id=spreadsheet_id, sheet_title=sheet_title or "Google Sheet")

    # Persist sheet ID in settings for future quick sync
    app_set = db.query(AppSettings).first()
    if app_set:
        app_set.google_sheet_id = spreadsheet_id
        if req.api_key and req.api_key.strip():
            app_set.google_sheets_api_key = req.api_key.strip()
    db.commit()

    return result

def process_route_matrix(values: List[List[Any]], db: Session, spreadsheet_id: Optional[str] = None, sheet_title: str = "Routes"):
    if not values or len(values) < 2:
        return {
            "success": True,
            "spreadsheet_id": spreadsheet_id,
            "sheet_title": sheet_title,
            "total_rows": 0,
            "updated_count": 0,
            "errors": [],
            "errors_count": 0,
            "not_found": [],
            "not_found_count": 0,
            "message": "File / Sheet is empty or contains no data rows."
        }

    # 1. Detect column indices from header
    header = values[0]
    code_idx = None
    name_idx = None
    r1_idx = None
    r2_idx = None
    r3_idx = None
    lat_idx = None
    lng_idx = None
    addr1_idx = None
    addr2_idx = None
    addr3_idx = None
    city_idx = None
    state_idx = None
    mobile_idx = None
    gst_idx = None

    for idx, col in enumerate(header):
        norm = re.sub(r"[^a-z0-9]", "", str(col).lower())
        if norm in ["partycode", "code", "pcode", "customercode", "id"]:
            code_idx = idx
        elif norm in ["partyname", "name", "customername", "party", "chemistname"]:
            name_idx = idx
        elif norm in ["primaryroute1", "primaryroute", "route1", "r1", "routeone", "firstroute", "route", "deliveryroute"]:
            r1_idx = idx
        elif norm in ["secondaryroute2", "secondaryroute", "route2", "r2", "routetwo", "secondroute"]:
            r2_idx = idx
        elif norm in ["thirdroute3", "thirdroute", "route3", "r3", "routethree"]:
            r3_idx = idx
        elif norm in ["latitude", "lat", "geolat", "gpslat", "latdeg", "latitudedeg"]:
            lat_idx = idx
        elif norm in ["longitude", "long", "lng", "lon", "geolong", "gpslong", "longdeg", "lngdeg", "longitudedeg"]:
            lng_idx = idx
        elif norm in ["addressline1", "address1", "add1", "address"]:
            addr1_idx = idx
        elif norm in ["addressline2", "address2", "add2"]:
            addr2_idx = idx
        elif norm in ["addressline3", "address3", "add3"]:
            addr3_idx = idx
        elif norm in ["city", "station", "town"]:
            city_idx = idx
        elif norm in ["state"]:
            state_idx = idx
        elif norm in ["mobileno", "mobile", "phone", "contact"]:
            mobile_idx = idx
        elif norm in ["gstno", "gst", "gstnumber"]:
            gst_idx = idx

    # Positional fallback ONLY if no known columns were recognized by name
    has_named_cols = any(x is not None for x in [code_idx, name_idx, r1_idx, lat_idx, lng_idx, addr1_idx])
    if not has_named_cols:
        if len(header) >= 1:
            code_idx = 0
        if len(header) >= 2:
            name_idx = 1
        if len(header) >= 3:
            r1_idx = 2
        if len(header) >= 4:
            r2_idx = 3
        if len(header) >= 5:
            r3_idx = 4

    updated_count = 0
    gps_updated_count = 0
    errors = []
    data_rows = values[1:]

    # Pre-index all database parties into memory for super-fast O(1) matching
    all_parties = db.query(Party).all()
    parties_by_norm_name = {}
    parties_by_code = {}
    for p in all_parties:
        if p.party_name:
            n_name = re.sub(r"\s+", " ", p.party_name.strip().upper())
            parties_by_norm_name[n_name] = p
        if p.party_code:
            parties_by_code[p.party_code.strip().upper()] = p

    for r_idx, row in enumerate(data_rows):
        if not row or not any(str(c).strip() for c in row):
            continue

        raw_code = str(row[code_idx]).strip() if code_idx is not None and code_idx < len(row) else ""
        raw_name = str(row[name_idx]).strip() if name_idx is not None and name_idx < len(row) else ""
        raw_r1 = str(row[r1_idx]).strip() if r1_idx is not None and r1_idx < len(row) else ""
        raw_r2 = str(row[r2_idx]).strip() if r2_idx is not None and r2_idx < len(row) else ""
        raw_r3 = str(row[r3_idx]).strip() if r3_idx is not None and r3_idx < len(row) else ""
        raw_lat = str(row[lat_idx]).strip() if lat_idx is not None and lat_idx < len(row) else ""
        raw_lng = str(row[lng_idx]).strip() if lng_idx is not None and lng_idx < len(row) else ""
        raw_addr1 = str(row[addr1_idx]).strip() if addr1_idx is not None and addr1_idx < len(row) else ""
        raw_addr2 = str(row[addr2_idx]).strip() if addr2_idx is not None and addr2_idx < len(row) else ""
        raw_addr3 = str(row[addr3_idx]).strip() if addr3_idx is not None and addr3_idx < len(row) else ""
        raw_city = str(row[city_idx]).strip() if city_idx is not None and city_idx < len(row) else ""

        norm_name = re.sub(r"\s+", " ", raw_name.strip().upper()) if raw_name else ""
        norm_code = raw_code.strip().upper() if raw_code else ""

        # Match party: first by normalized name, then by code, then substring
        party = None
        if norm_name and norm_name in parties_by_norm_name:
            party = parties_by_norm_name[norm_name]
        elif norm_code and norm_code in parties_by_code:
            party = parties_by_code[norm_code]
        elif norm_name:
            for k, p in parties_by_norm_name.items():
                if norm_name and (norm_name in k or k in norm_name):
                    party = p
                    break

        if not party:
            errors.append({
                "row": r_idx + 2,
                "party_code": raw_code or "-",
                "party_name": raw_name or "-",
                "route_1": raw_r1 or "-",
                "route_2": raw_r2 or "-",
                "route_3": raw_r3 or "-",
                "reason": f"Party '{raw_name or raw_code}' not found in database"
            })
            continue

        # If sheet supplies a MARG party code, align party code to the sheet!
        if norm_code and norm_code.startswith("MARG"):
            party.party_code = norm_code

        # Set routes safely without corrupting with address lines
        if r1_idx is not None:
            p_r1 = raw_r1.upper() if raw_r1 else None
            party.route_1 = p_r1
            party.route_1_gu = translate_route_to_gujarati(p_r1)
            if p_r1:
                party.route = p_r1
        if r2_idx is not None:
            p_r2 = raw_r2.upper() if raw_r2 else None
            party.route_2 = p_r2
            party.route_2_gu = translate_route_to_gujarati(p_r2)
        if r3_idx is not None:
            p_r3 = raw_r3.upper() if raw_r3 else None
            party.route_3 = p_r3
            party.route_3_gu = translate_route_to_gujarati(p_r3)

        # Update address lines if provided
        if raw_addr1:
            party.address = raw_addr1
        if raw_addr2:
            party.address_line_2 = raw_addr2
        if raw_addr3:
            party.address_line_3 = raw_addr3
        if raw_city:
            party.city = raw_city

        # Update GPS coordinates if present in spreadsheet
        if raw_lat:
            try:
                parsed_lat = float(raw_lat)
                if -90 <= parsed_lat <= 90:
                    party.latitude = parsed_lat
                    party.geofence_set_at = datetime.datetime.utcnow()
                    gps_updated_count += 1
            except (ValueError, TypeError):
                pass

        if raw_lng:
            try:
                parsed_lng = float(raw_lng)
                if -180 <= parsed_lng <= 180:
                    party.longitude = parsed_lng
                    party.geofence_set_at = datetime.datetime.utcnow()
            except (ValueError, TypeError):
                pass

        updated_count += 1

    db.commit()

    # Cross-sync to PostgreSQL (B2B Order Book) if accessible
    try:
        import psycopg2
        pg_conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/shreeji_healthcare", connect_timeout=3)
        pg_cur = pg_conn.cursor()
        for p in all_parties:
            if p.latitude is not None and p.longitude is not None:
                pg_cur.execute(
                    """UPDATE parties 
                       SET latitude = %s, longitude = %s, delivery_route = COALESCE(%s, delivery_route), updated_at = NOW()
                       WHERE UPPER(party_code) = %s OR UPPER(party_name) = %s""",
                    (p.latitude, p.longitude, p.route_1 or p.route, (p.party_code or "").upper(), (p.party_name or "").upper())
                )
        pg_conn.commit()
        pg_conn.close()
    except Exception as pg_err:
        print("Notice: PostgreSQL background sync in process_route_matrix:", pg_err)

    return {
        "success": True,
        "spreadsheet_id": spreadsheet_id,
        "sheet_title": sheet_title,
        "total_rows": len(data_rows),
        "updated_count": updated_count,
        "gps_updated_count": gps_updated_count,
        "errors": errors,
        "errors_count": len(errors),
        "not_found": [f"{e['party_code']} - {e['party_name']}" for e in errors[:50]],
        "not_found_count": len(errors),
        "message": f"Successfully updated {updated_count} parties ({gps_updated_count} with GPS coordinates)." + (f" ({len(errors)} unmatched rows)" if errors else "")
    }

def start_google_sheets_auto_sync(session_factory):
    """
    Background worker that runs continuously in a daemon thread.
    Periodically checks Google Sheet and auto-syncs route updates to the database
    whenever anyone edits or updates the sheet.
    """
    def _loop():
        # Wait 5 seconds after startup before initial sync
        time.sleep(5)
        while True:
            try:
                db = session_factory()
                try:
                    app_set = db.query(AppSettings).first()
                    if app_set and getattr(app_set, "auto_sync_google_sheet", True):
                        sheet_id = getattr(app_set, "google_sheet_id", None) or "1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg"
                        api_key = getattr(app_set, "google_sheets_api_key", None) or "AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg"
                        if sheet_id and sheet_id.strip():
                            clean_id = sheet_id.strip()
                            if "spreadsheets/d/" in clean_id:
                                try:
                                    clean_id = clean_id.split("spreadsheets/d/")[1].split("/")[0]
                                except Exception:
                                    pass

                            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MARG-Envelope-Manager/1.0"}
                            values = []
                            sheet_title = "Sheet1"

                            # 1. API
                            if api_key:
                                try:
                                    meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{clean_id}?fields=sheets.properties.title&key={api_key}"
                                    req_meta = urllib.request.Request(meta_url, headers=headers)
                                    with urllib.request.urlopen(req_meta, timeout=12) as resp:
                                        meta_json = json.loads(resp.read().decode("utf-8"))
                                        s_list = meta_json.get("sheets", [])
                                        sheet_title = s_list[0].get("properties", {}).get("title", "Sheet1") if s_list else "Sheet1"
                                    range_q = urllib.parse.quote(f"{sheet_title}!A1:Z")
                                    v_url = f"https://sheets.googleapis.com/v4/spreadsheets/{clean_id}/values/{range_q}?key={api_key}"
                                    req_val = urllib.request.Request(v_url, headers=headers)
                                    with urllib.request.urlopen(req_val, timeout=15) as resp:
                                        val_json = json.loads(resp.read().decode("utf-8"))
                                        values = val_json.get("values", [])
                                except Exception:
                                    pass

                            # 2. Public CSV fallback
                            if not values:
                                for c_url in [
                                    f"https://docs.google.com/spreadsheets/d/{clean_id}/export?format=csv",
                                    f"https://docs.google.com/spreadsheets/d/{clean_id}/gviz/tq?tqx=out:csv"
                                ]:
                                    try:
                                        req_csv = urllib.request.Request(c_url, headers=headers)
                                        with urllib.request.urlopen(req_csv, timeout=15) as resp:
                                            csv_text = resp.read().decode("utf-8", errors="replace")
                                            csv_rows = list(csv.reader(io.StringIO(csv_text)))
                                            if csv_rows and len(csv_rows) >= 2:
                                                values = csv_rows
                                                break
                                    except Exception:
                                        continue

                            if values and len(values) >= 2:
                                res = process_route_matrix(values, db, spreadsheet_id=clean_id, sheet_title=sheet_title)
                                if res.get("success"):
                                    app_set.last_google_sheet_sync_time = datetime.datetime.utcnow()
                                    app_set.last_google_sheet_sync_status = f"Success: updated {res.get('updated_count')} parties"
                                    db.commit()
                                    print(f"[AutoSync GoogleSheet] Background auto-synced {res.get('updated_count')} parties from {clean_id}")
                finally:
                    db.close()
            except Exception as e:
                print("[AutoSync GoogleSheet] Auto-sync loop notice:", e)

            # Sleep 180 seconds (3 minutes) before next check
            time.sleep(180)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()

@app.get("/api/routes/auto-sync-status")
def get_auto_sync_status(db: Session = Depends(get_db)):
    app_set = db.query(AppSettings).first()
    return {
        "auto_sync_enabled": getattr(app_set, "auto_sync_google_sheet", True),
        "sheet_id": getattr(app_set, "google_sheet_id", "1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg"),
        "last_sync_time": getattr(app_set, "last_google_sheet_sync_time", None),
        "last_sync_status": getattr(app_set, "last_google_sheet_sync_status", None),
        "interval_seconds": 180
    }

@app.post("/api/routes/upload-file")
async def upload_routes_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an Excel (.xlsx/.xls) or CSV file directly to sync party routes (like myBillBook)."""
    filename = file.filename or "upload.csv"
    content = await file.read()
    values = []

    if filename.lower().endswith(".csv") or not filename.lower().endswith((".xlsx", ".xls")):
        try:
            text = content.decode("utf-8", errors="replace")
            reader = csv.reader(io.StringIO(text))
            values = list(reader)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read CSV file: {str(e)}")
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(values_only=True):
                values.append([str(c or "").strip() for c in row])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    return process_route_matrix(values, db, sheet_title=filename)

class ErrorReportRequest(BaseModel):
    errors: List[Dict[str, Any]]

@app.post("/api/routes/export-error-report")
def export_route_error_report(req: ErrorReportRequest):
    """Download a CSV error report for unmatched or failed route sync rows."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Row Number", "Party Code", "Party Name", "Primary Route 1", "Secondary Route 2", "Third Route 3", "Error Reason"])
    for e in req.errors:
        writer.writerow([
            e.get("row", ""),
            e.get("party_code", ""),
            e.get("party_name", ""),
            e.get("route_1", ""),
            e.get("route_2", ""),
            e.get("route_3", ""),
            e.get("reason", "")
        ])
    output.seek(0)
    return Response(
        content=output.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="Route_Sync_Error_Report.csv"'}
    )

# ==========================================
# n8n WEBHOOK & REAL-TIME SHEETS AUTOMATION
# ==========================================

@app.get("/api/webhooks/n8n/info")
def get_n8n_webhook_info():
    """Returns documentation, supported fields, and sample payload for n8n Google Sheets automation."""
    return {
        "status": "online",
        "service": "MARG Envelope Manager n8n Webhook Hub",
        "webhook_url": "/api/webhooks/n8n/sheets-update",
        "method": "POST",
        "description": "Receives real-time Google Sheets edits or row additions via n8n. Instantly updates party GPS coordinates, routes, and contact details.",
        "supported_fields": {
            "required": ["party_name or party_code"],
            "gps_coordinates": ["latitude (e.g. 23.1685)", "longitude (e.g. 72.8126)"],
            "routes": ["primary_route_1", "secondary_route_2", "third_route_3"],
            "address_fields": ["address", "address_line_2", "address_line_3", "city", "state"],
            "contact_fields": ["mobile_no", "landline", "email", "gst_no", "notes"]
        },
        "sample_payload": {
            "party_name": "JODHPUR MEDICOSE",
            "party_code": "P0001",
            "primary_route_1": "RAJASTHAN ROUTE",
            "secondary_route_2": "CITY MAIN ROUTE",
            "third_route_3": "",
            "latitude": 26.2389,
            "longitude": 73.0243,
            "address": "SHREE MOHANGADH, NEAR STN ROAD",
            "city": "JODHPUR",
            "state": "RAJASTHAN",
            "mobile_no": "9829012345"
        }
    }

@app.get("/api/webhooks/n8n/workflow-template")
def get_n8n_workflow_template():
    """Returns the ready-to-import n8n workflow JSON structure for Google Sheets real-time trigger."""
    n8n_json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "n8n-google-sheets-auto-sync.json")
    if os.path.exists(n8n_json_path):
        try:
            with open(n8n_json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # Fallback inline workflow template
    return {
        "name": "MARG Envelope Manager - Google Sheets Real-Time Sync",
        "nodes": [
            {
                "parameters": {
                    "pollTimes": { "item": [{ "mode": "everyMinute" }] },
                    "documentId": { "__rl": True, "value": "SPREADSHEET_ID_HERE", "mode": "id" },
                    "sheetName": { "__rl": True, "value": "Routes", "mode": "name" },
                    "event": "rowAddedOrUpdated"
                },
                "id": "1",
                "name": "Google Sheets Trigger",
                "type": "n8n-nodes-base.googleSheetsTrigger",
                "typeVersion": 1,
                "position": [250, 300]
            },
            {
                "parameters": {
                    "method": "POST",
                    "url": "https://shreeji-envelope.aryan76688.workers.dev/api/webhooks/n8n/sheets-update",
                    "sendBody": True,
                    "contentType": "json",
                    "body": "={{ $json }}"
                },
                "id": "2",
                "name": "HTTP Request (MARG Webhook)",
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 4.2,
                "position": [500, 300]
            }
        ],
        "connections": {
            "Google Sheets Trigger": {
                "main": [[{ "node": "HTTP Request (MARG Webhook)", "type": "main", "index": 0 }]]
            }
        }
    }

@app.post("/api/webhooks/n8n/sheets-update")
@app.post("/api/webhooks/n8n/parties")
async def n8n_sheets_webhook_update(request: Request, db: Session = Depends(get_db)):
    """
    Real-time webhook receiver for n8n and Google Sheets integrations.
    Whenever any row is edited or created in Google Sheets, n8n sends a POST request here
    to immediately update party GPS coordinates (Latitude & Longitude), routes, and party details.
    """
    try:
        raw_body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {str(e)}")

    # Normalize input: support single object, list of objects, or wrapped under 'rows', 'data', or 'items'
    items = []
    if isinstance(raw_body, list):
        items = raw_body
    elif isinstance(raw_body, dict):
        if "rows" in raw_body and isinstance(raw_body["rows"], list):
            items = raw_body["rows"]
        elif "data" in raw_body and isinstance(raw_body["data"], list):
            items = raw_body["data"]
        elif "items" in raw_body and isinstance(raw_body["items"], list):
            items = raw_body["items"]
        else:
            items = [raw_body]
    else:
        raise HTTPException(status_code=400, detail="Expected JSON object or array of objects")

    updated_count = 0
    created_count = 0
    results = []

    for item in items:
        if not isinstance(item, dict):
            continue

        # Flexible key normalization: allow 'Party Name', 'party_name', 'PartyName', 'LATITUDE', 'lat', etc.
        norm_map = {}
        for k, v in item.items():
            clean_k = re.sub(r"[^a-z0-9]", "", str(k).lower())
            norm_map[clean_k] = v

        def get_field(*keys):
            for key in keys:
                ck = re.sub(r"[^a-z0-9]", "", key.lower())
                if ck in norm_map and norm_map[ck] is not None:
                    s_val = str(norm_map[ck]).strip()
                    if s_val != "":
                        return s_val
            return None

        p_name = get_field("party_name", "partyname", "party", "name", "customername", "ledgername")
        p_code = get_field("party_code", "partycode", "code", "pcode", "id", "customercode")

        if not p_name and not p_code:
            continue

        p_r1 = get_field("primary_route_1", "route_1", "primaryroute1", "route1", "r1", "route", "deliveryroute")
        p_r2 = get_field("secondary_route_2", "route_2", "secondaryroute2", "route2", "r2")
        p_r3 = get_field("third_route_3", "route_3", "thirdroute3", "route3", "r3")

        p_lat_raw = get_field("latitude", "lat", "geolat", "gpslat", "latitude_deg", "lat_deg", "latitudedeg")
        p_lng_raw = get_field("longitude", "long", "lng", "lon", "geolong", "gpslong", "longitude_deg", "long_deg", "lng_deg", "longitudedeg")

        p_addr = get_field("address", "address_1", "addressline1", "addr1")
        p_addr2 = get_field("address_line_2", "addressline2", "addr2")
        p_addr3 = get_field("address_line_3", "addressline3", "addr3")
        p_city = get_field("city", "town", "station")
        p_state = get_field("state", "province")
        p_mob = get_field("mobile_no", "mobile", "phone", "contact")
        p_land = get_field("landline", "phone2", "officephone")
        p_email = get_field("email", "mail")
        p_gst = get_field("gst_no", "gst", "gstin")
        p_notes = get_field("notes", "remarks", "comment")

        # Parse Lat / Lng
        p_lat = None
        p_lng = None
        if p_lat_raw:
            try:
                v = float(p_lat_raw)
                if -90 <= v <= 90:
                    p_lat = v
            except (ValueError, TypeError):
                pass

        if p_lng_raw:
            try:
                v = float(p_lng_raw)
                if -180 <= v <= 180:
                    p_lng = v
            except (ValueError, TypeError):
                pass

        # Match party in database
        party = None
        if p_code:
            party = db.query(Party).filter(func.upper(Party.party_code) == p_code.upper()).first()
        if not party and p_name:
            party = db.query(Party).filter(func.upper(Party.party_name) == p_name.upper()).first()
        if not party and p_name:
            party = db.query(Party).filter(Party.party_name.ilike(f"%{p_name}%")).first()

        if party:
            # Update existing party
            if p_name: party.party_name = p_name
            if p_code and (not party.party_code or p_code.upper().startswith("MARG")):
                party.party_code = p_code.upper()
            if p_addr: party.address = p_addr
            if p_addr2 is not None: party.address_line_2 = p_addr2
            if p_addr3 is not None: party.address_line_3 = p_addr3
            if p_city: party.city = p_city
            if p_state: party.state = p_state
            if p_mob is not None: party.mobile_no = p_mob
            if p_land is not None: party.landline = p_land
            if p_email is not None: party.email = p_email
            if p_gst is not None: party.gst_no = p_gst
            if p_notes is not None: party.notes = p_notes

            # Routes
            if p_r1 is not None:
                party.route_1 = p_r1.upper() if p_r1 else None
                party.route_1_gu = translate_route_to_gujarati(p_r1.upper() if p_r1 else None)
            if p_r2 is not None:
                party.route_2 = p_r2.upper() if p_r2 else None
                party.route_2_gu = translate_route_to_gujarati(p_r2.upper() if p_r2 else None)
            if p_r3 is not None:
                party.route_3 = p_r3.upper() if p_r3 else None
                party.route_3_gu = translate_route_to_gujarati(p_r3.upper() if p_r3 else None)
            if p_r1 or p_r2 or p_r3:
                party.route = party.route_1 or party.route_2 or party.route_3

            # GPS Coordinates
            if p_lat is not None:
                party.latitude = p_lat
                party.geofence_set_at = datetime.datetime.utcnow()
            if p_lng is not None:
                party.longitude = p_lng
                party.geofence_set_at = datetime.datetime.utcnow()

            updated_count += 1
            results.append({
                "id": party.id,
                "party_name": party.party_name,
                "party_code": party.party_code,
                "latitude": party.latitude,
                "longitude": party.longitude,
                "route": party.route_1 or party.route,
                "status": "updated"
            })
        else:
            # Create new party if party_name is present
            if not p_name:
                continue

            new_code = p_code.upper() if p_code else get_next_party_code(db)
            r1_val = p_r1.upper() if p_r1 else None
            r2_val = p_r2.upper() if p_r2 else None
            r3_val = p_r3.upper() if p_r3 else None

            party = Party(
                party_name=p_name,
                party_code=new_code,
                address=p_addr or "DAHEGAM",
                address_line_2=p_addr2,
                address_line_3=p_addr3,
                city=p_city or "DAHEGAM",
                state=p_state or "GUJARAT",
                mobile_no=p_mob,
                landline=p_land,
                email=p_email,
                gst_no=p_gst,
                notes=p_notes,
                route_1=r1_val,
                route_2=r2_val,
                route_3=r3_val,
                route_1_gu=translate_route_to_gujarati(r1_val),
                route_2_gu=translate_route_to_gujarati(r2_val),
                route_3_gu=translate_route_to_gujarati(r3_val),
                route=r1_val or r2_val or r3_val,
                latitude=p_lat,
                longitude=p_lng,
                geofence_set_at=datetime.datetime.utcnow() if (p_lat is not None or p_lng is not None) else None,
                is_active=True
            )
            db.add(party)
            db.flush()
            created_count += 1
            results.append({
                "id": party.id,
                "party_name": party.party_name,
                "party_code": party.party_code,
                "latitude": party.latitude,
                "longitude": party.longitude,
                "route": party.route_1 or party.route,
                "status": "created"
            })

    db.commit()

    return {
        "success": True,
        "message": f"Processed {len(items)} row(s): {updated_count} updated, {created_count} created",
        "updated_count": updated_count,
        "created_count": created_count,
        "parties": results
    }

# ==========================================
# 3. EXCEL IMPORT & VALIDATION
# ==========================================

@app.get("/api/import/sample-template")
def download_sample_template():
    """Generates and downloads a clean, pre-formatted MARG ERP Excel template."""
    xlsx_bytes = excel_service.generate_sample_excel_template()
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="MARG_Party_Import_Template.xlsx"'}
    )

@app.post("/api/import/excel")
async def upload_and_analyze_excel(file: UploadFile = File(...)):
    """
    Parses uploaded .xlsx or .xls file safely without executing formulas.
    Auto-detects column headers matching MARG ERP aliases.
    """
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum 15MB limit")

    try:
        headers, rows, sheet_name, total_rows = excel_service.read_excel_file(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")

    detected_mapping = excel_service.detect_column_mappings(headers)

    return {
        "filename": file.filename,
        "file_size": len(content),
        "sheet_name": sheet_name,
        "total_rows": total_rows,
        "headers": headers,
        "detected_mapping": detected_mapping,
        "sample_rows": rows[:5],
        "all_rows": rows
    }

@app.post("/api/import/validate")
def validate_excel_mapping(req: ValidateImportRequest, db: Session = Depends(get_db)):
    """
    Validates rows using chosen column mappings and detects duplicates in DB.
    """
    existing_parties = db.query(Party.party_name, Party.party_code).all()
    existing_names = {p[0].strip().upper() for p in existing_parties if p[0]}
    existing_codes = {p[1].strip().upper() for p in existing_parties if p[1]}

    validation = excel_service.validate_imported_rows(
        req.raw_rows,
        req.mapping,
        existing_names,
        existing_codes
    )
    return validation

@app.post("/api/import/confirm")
def confirm_import(req: ConfirmImportRequest, db: Session = Depends(get_db)):
    """
    Commits valid party rows to database. Saves ImportJob history.
    Supports Vyapar-style duplicate handling: 'skip' (default), 'update', or 'allow'.
    """
    imported_count = 0
    skipped_count = 0
    updated_count = 0
    duplicate_count = 0
    error_count = 0
    skipped_parties = []
    updated_parties = []

    duplicate_action = getattr(req, "duplicate_action", "skip") or ("skip" if req.skip_warnings else "skip")

    existing_parties = db.query(Party.party_name, Party.party_code).all()
    existing_names = {p[0].strip().upper() for p in existing_parties if p[0]}
    existing_codes = {p[1].strip().upper() for p in existing_parties if p[1]}

    import_job = ImportJob(
        filename=req.filename,
        file_size=req.file_size,
        sheet_name=req.sheet_name,
        total_rows=len(req.rows),
        status="Completed"
    )
    db.add(import_job)
    db.flush()

    for idx, r in enumerate(req.rows, start=1):
        name = (r.get("party_name") or "").strip().upper()
        if not name:
            error_count += 1
            err = ImportErrorLog(
                import_job_id=import_job.id,
                row_index=idx,
                party_name="UNKNOWN",
                party_code=None,
                error_reason="Missing Party Name"
            )
            db.add(err)
            continue

        code = (r.get("party_code") or "").strip().upper() if r.get("party_code") else None
        route = (r.get("route") or "").strip().upper() or None
        addr = (r.get("address") or "").strip().upper()
        addr2 = (r.get("address_line_2") or "").strip().upper() or None
        addr3 = (r.get("address_line_3") or "").strip().upper() or None
        city = (r.get("city") or "DAHEGAM").strip().upper()
        state = (r.get("state") or "GUJARAT").strip().upper()
        mob = (r.get("mobile_no") or "").strip() or None
        land = (r.get("landline") or "").strip() or None
        email = (r.get("email") or "").strip() or None
        gst = (r.get("gst_no") or "").strip().upper() or None
        notes = (r.get("notes") or "").strip() or None

        # GPS Coordinates (Latitude & Longitude)
        lat = None
        lng = None
        raw_lat = r.get("latitude")
        raw_lng = r.get("longitude")
        if raw_lat is not None and str(raw_lat).strip() != "":
            try:
                v = float(str(raw_lat).strip())
                if -90 <= v <= 90:
                    lat = v
            except (ValueError, TypeError):
                pass
        if raw_lng is not None and str(raw_lng).strip() != "":
            try:
                v = float(str(raw_lng).strip())
                if -180 <= v <= 180:
                    lng = v
            except (ValueError, TypeError):
                pass

        # Smart address fallback if addr (line 1) is empty
        if not addr:
            if addr2:
                addr = addr2
                addr2 = addr3
                addr3 = None
            elif addr3:
                addr = addr3
                addr3 = None
            elif city:
                addr = city
            else:
                addr = "DAHEGAM"

        # Check duplicate
        is_duplicate = (name in existing_names) or (code is not None and code in existing_codes)

        if is_duplicate:
            duplicate_count += 1
            if duplicate_action == "skip":
                # Vyapar App default: skip already existing parties so no duplicate is created
                skipped_count += 1
                skipped_parties.append({
                    "row_index": idx,
                    "party_name": name,
                    "party_code": code or "—",
                    "reason": "Already exists in ledger"
                })
                continue
            elif duplicate_action == "update":
                # Vyapar App update mode: overwrite existing party's address & phone
                existing_party = None
                if code:
                    existing_party = db.query(Party).filter(func.upper(Party.party_code) == code).first()
                if not existing_party:
                    existing_party = db.query(Party).filter(func.upper(Party.party_name) == name).first()
                if existing_party:
                    existing_party.address = addr
                    existing_party.address_line_2 = addr2
                    existing_party.address_line_3 = addr3
                    existing_party.city = city
                    existing_party.state = state
                    existing_party.party_name_gu = None
                    existing_party.address_gu = None
                    existing_party.address_line_2_gu = None
                    existing_party.address_line_3_gu = None
                    existing_party.city_gu = None
                    existing_party.state_gu = None
                    if route: existing_party.route = route
                    if mob: existing_party.mobile_no = mob
                    if land: existing_party.landline = land
                    if email: existing_party.email = email
                    if gst: existing_party.gst_no = gst
                    if notes: existing_party.notes = notes
                    if lat is not None: existing_party.latitude = lat
                    if lng is not None: existing_party.longitude = lng
                    if lat is not None or lng is not None:
                        existing_party.geofence_set_at = datetime.datetime.utcnow()
                    updated_count += 1
                    updated_parties.append({
                        "party_name": name,
                        "party_code": code or "—",
                        "status": "Updated"
                    })
                    continue

        if not code:
            code = get_next_party_code(db)

        new_party = Party(
            party_name=name,
            party_code=code,
            route=route,
            address=addr,
            address_line_2=addr2,
            address_line_3=addr3,
            city=city,
            state=state,
            mobile_no=mob,
            landline=land,
            email=email,
            gst_no=gst,
            notes=notes,
            latitude=lat,
            longitude=lng,
            geofence_set_at=datetime.datetime.utcnow() if (lat is not None or lng is not None) else None,
            is_active=True
        )
        db.add(new_party)
        existing_names.add(name)
        if code:
            existing_codes.add(code)
        imported_count += 1

    import_job.imported_rows = imported_count
    import_job.skipped_rows = skipped_count
    import_job.duplicate_rows = duplicate_count
    import_job.error_rows = error_count

    db.commit()

    # Automatically trigger Google background translation for all newly imported parties
    try:
        ai_service.start_background_translation_worker(SessionLocal, force=False)
    except Exception as e:
        print("Excel import translation trigger notice:", e)

    return {
        "imported": imported_count,
        "skipped": skipped_count,
        "updated": updated_count,
        "duplicates": duplicate_count,
        "errors": error_count,
        "skipped_parties": skipped_parties,
        "updated_parties": updated_parties,
        "import_job_id": import_job.id,
        "translation_started": True,
        "message": f"Successfully imported {imported_count} parties. Gujarati translation is running in the background."
    }

@app.get("/api/import/history")
def get_import_history(db: Session = Depends(get_db)):
    jobs = db.query(ImportJob).order_by(desc(ImportJob.created_at)).limit(20).all()
    return [
        {
            "id": j.id,
            "filename": j.filename,
            "total_rows": j.total_rows,
            "imported_rows": j.imported_rows,
            "skipped_rows": j.skipped_rows,
            "duplicate_rows": j.duplicate_rows,
            "error_rows": j.error_rows,
            "status": j.status,
            "created_at": j.created_at.strftime("%d-%m-%Y %H:%M") if j.created_at else ""
        }
        for j in jobs
    ]

# ==========================================
# 4. PRINT JOBS & REPRINT
# ==========================================

def get_next_job_number(db: Session) -> str:
    """
    Returns the next strictly unique, non-colliding job number formatted as MRG-{year}-{seq:06d}.
    Guarantees zero collision by inspecting all existing jobs, session objects, and checking uniqueness.
    """
    current_year = datetime.datetime.now().year
    prefix = f"MRG-{current_year}-"

    existing_jobs = db.query(PrintJob.job_number).filter(PrintJob.job_number.like(f"{prefix}%")).all()
    max_seq = 0
    for (j_num,) in existing_jobs:
        if j_num and j_num.startswith(prefix):
            suffix = j_num[len(prefix):]
            if suffix.isdigit():
                val = int(suffix)
                if val > max_seq:
                    max_seq = val

    for obj in db.new:
        if isinstance(obj, PrintJob) and obj.job_number and obj.job_number.startswith(prefix):
            suffix = obj.job_number[len(prefix):]
            if suffix.isdigit():
                val = int(suffix)
                if val > max_seq:
                    max_seq = val

    candidate_seq = max_seq + 1
    while True:
        candidate_num = f"{prefix}{candidate_seq:06d}"
        exists_in_db = db.query(PrintJob.id).filter(PrintJob.job_number == candidate_num).first() is not None
        exists_in_session = any(isinstance(obj, PrintJob) and obj.job_number == candidate_num for obj in db.new)
        if not exists_in_db and not exists_in_session:
            return candidate_num
        candidate_seq += 1

def _execute_update_print_job(job: PrintJob, req: CreatePrintJobRequest, db: Session):
    """
    Executes in-place print job update, replacing associated cases and ensuring
    only ONE unified record appears in Print History and Dispatch Summary.
    """
    case_breakdown_json = None
    if req.case_breakdown:
        case_breakdown_json = json.dumps(req.case_breakdown)
        valid_sum = sum(int(item.get("qty", 0)) for item in req.case_breakdown if int(item.get("qty", 0)) > 0)
        req.total_cases = valid_sum

    if req.total_cases == 0:
        weights = [0.0]
        total_weight = 0.0
    else:
        weights = req.case_weights
        if len(weights) < req.total_cases:
            last_w = weights[-1] if weights else 1.0
            weights.extend([last_w] * (req.total_cases - len(weights)))
        elif len(weights) > req.total_cases:
            weights = weights[:req.total_cases]
        total_weight = sum(weights)

    active_driver = (req.driver_name or req.delivery_boy_name or "").strip() or None

    try:
        job.total_cases = req.total_cases
        job.total_weight = total_weight
        job.case_breakdown_json = case_breakdown_json
        job.delivery_boy_name = active_driver
        job.driver_name = active_driver
        job.delivery_route = req.delivery_route
        if req.party_name:
            job.party_name_snap = req.party_name.strip().upper()
        if req.party_code:
            job.party_code_snap = req.party_code.strip().upper()
        if req.address:
            job.party_address_snap = req.address.strip().upper()
        if req.address_line_2:
            job.party_address_line_2_snap = req.address_line_2.strip().upper()
        if req.address_line_3:
            job.party_address_line_3_snap = req.address_line_3.strip().upper()
        if req.city:
            job.party_city_snap = req.city.strip().upper()
        if req.state:
            job.party_state_snap = req.state.strip().upper()
        if req.mobile_no:
            job.party_mobile_snap = req.mobile_no.strip()
        if req.gst_no:
            job.party_gst_snap = req.gst_no.strip().upper()
        job.language = req.language or job.language or "en"
        job.template_format = req.template_format or job.template_format or "attachment_pdf"
        job.bill_inside = getattr(req, "bill_inside", False)
        job.status = "Printed"
        job.updated_at = datetime.datetime.now(datetime.timezone.utc)

        # Clear previous print cases to avoid duplicate entries in dispatch summary
        db.query(PrintCase).filter(PrintCase.print_job_id == job.id).delete()

        cases_resp = []
        if req.total_cases == 0:
            barcode_val = f"{job.job_number}-C0"
            pcase = PrintCase(
                print_job_id=job.id,
                case_number=0,
                case_total=0,
                weight=0.0,
                barcode_value=barcode_val,
                status="Printed"
            )
            db.add(pcase)
            cases_resp.append({
                "case_number": 0,
                "case_total": 0,
                "weight": 0.0,
                "barcode_value": barcode_val
            })
        else:
            for idx, w in enumerate(weights, start=1):
                barcode_val = f"{job.job_number}-C{idx}"
                pcase = PrintCase(
                    print_job_id=job.id,
                    case_number=idx,
                    case_total=req.total_cases,
                    weight=w,
                    barcode_value=barcode_val,
                    status="Printed"
                )
                db.add(pcase)
                cases_resp.append({
                    "case_number": idx,
                    "case_total": req.total_cases,
                    "weight": w,
                    "barcode_value": barcode_val
                })

        db.commit()
        db.refresh(job)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update print job: {str(e)}")

    return {
        "id": job.id,
        "job_number": job.job_number,
        "party_name": job.party_name_snap,
        "total_cases": job.total_cases,
        "total_weight": job.total_weight,
        "envelope_size": job.envelope_size,
        "printer_name": job.printer_name,
        "status": job.status,
        "case_breakdown": req.case_breakdown,
        "delivery_boy_name": job.delivery_boy_name,
        "delivery_route": job.delivery_route,
        "language": job.language,
        "template_format": job.template_format,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if getattr(job, "updated_at", None) else None,
        "cases": cases_resp
    }

@app.post("/api/print-jobs", status_code=status.HTTP_201_CREATED)
def create_print_job(req: CreatePrintJobRequest, db: Session = Depends(get_db)):
    """
    Creates a print job transaction: validates party, sender, generates cases,
    assigns unique barcodes (e.g. MRG-2026-000001-C1), calculates total weight,
    and saves immutable snapshots.
    If party was already printed/saved today or if job_id is provided, updates in-place
    so that only ONE unified record exists in Print History and Dispatch Summary.
    """
    if not req.party_name.strip():
        raise HTTPException(status_code=400, detail="Party Name is required")
    if not req.address.strip():
        raise HTTPException(status_code=400, detail="Address is required")
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City is required")
    if not req.state.strip():
        raise HTTPException(status_code=400, detail="State is required")
    if req.total_cases < 0:
        raise HTTPException(status_code=400, detail="Number of cases cannot be negative")

    # Idempotent offline sync check by client_uuid
    if req.client_uuid:
        existing_by_uuid = db.query(PrintJob).filter(PrintJob.client_uuid == req.client_uuid).first()
        if existing_by_uuid:
            return {
                "id": existing_by_uuid.id,
                "job_number": existing_by_uuid.job_number,
                "status": existing_by_uuid.status,
                "total_cases": existing_by_uuid.total_cases,
                "created_at": existing_by_uuid.created_at.isoformat(),
                "cases": [
                    {
                        "case_number": c.case_number,
                        "case_total": c.case_total,
                        "weight": c.weight,
                        "barcode_value": c.barcode_value
                    } for c in existing_by_uuid.cases
                ]
            }

    # 1-Time/Day Lock enforcement & In-Place Update on single party print
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    norm_name = req.party_name.strip().upper()

    target_existing_job = None
    if req.job_id:
        target_existing_job = db.query(PrintJob).filter(PrintJob.id == req.job_id).first()

    if not target_existing_job:
        target_existing_job = db.query(PrintJob).filter(
            PrintJob.created_at >= today_start,
            func.upper(PrintJob.party_name_snap) == norm_name,
            PrintJob.status.in_(["Printed", "Saved"])
        ).order_by(PrintJob.created_at.desc(), PrintJob.id.desc()).first()

    if target_existing_job:
        if getattr(req, "allow_duplicate", False) or getattr(req, "is_reprint", False):
            # In-place update for reprint / edit: ensures it appears strictly ONCE in History and Dispatch Summary
            return _execute_update_print_job(target_existing_job, req, db)
        else:
            action_verb = "printed" if target_existing_job.status == "Printed" else "saved"
            raise HTTPException(
                status_code=409,
                detail=f"Party '{norm_name}' has already been {action_verb} today (#{target_existing_job.job_number}). 1-Time/Day Lock is active to prevent duplicate dispatches. Please use Print History to reprint or update."
            )

    # Fetch default sender settings if not provided
    sender_settings = db.query(SenderSettings).first()
    s_name = (req.sender.get("business_name") if req.sender else None) or (sender_settings.business_name if sender_settings else "SHREEJI 7")
    s_addr = (req.sender.get("address") if req.sender else None) or (sender_settings.address if sender_settings else "DAHEGAM")
    s_city = (req.sender.get("city") if req.sender else None) or (sender_settings.city if sender_settings else "DAHEGAM")
    s_state = (req.sender.get("state") if req.sender else None) or (sender_settings.state if sender_settings else "GUJARAT")
    s_mobile = (req.sender.get("mobile") if req.sender else None) or (sender_settings.mobile if sender_settings else "9924544283")

    job_number = get_next_job_number(db)

    # Check if case_breakdown was provided
    case_breakdown_json = None
    if req.case_breakdown:
        case_breakdown_json = json.dumps(req.case_breakdown)
        valid_sum = sum(int(item.get("qty", 0)) for item in req.case_breakdown if int(item.get("qty", 0)) > 0)
        req.total_cases = valid_sum

    # Prepare case weights
    if req.total_cases == 0:
        weights = [0.0]
        total_weight = 0.0
    else:
        weights = req.case_weights
        if len(weights) < req.total_cases:
            last_w = weights[-1] if weights else 1.0
            weights.extend([last_w] * (req.total_cases - len(weights)))
        elif len(weights) > req.total_cases:
            weights = weights[:req.total_cases]
        total_weight = sum(weights)

    active_driver = (req.driver_name or req.delivery_boy_name or "").strip() or None

    try:
        job = PrintJob(
            job_number=job_number,
            party_id=req.party_id,
            party_name_snap=req.party_name.strip().upper(),
            party_code_snap=req.party_code.strip().upper() if req.party_code else None,
            party_address_snap=req.address.strip().upper(),
            party_address_line_2_snap=req.address_line_2.strip().upper() if req.address_line_2 else None,
            party_address_line_3_snap=req.address_line_3.strip().upper() if req.address_line_3 else None,
            party_city_snap=req.city.strip().upper(),
            party_state_snap=req.state.strip().upper(),
            party_mobile_snap=req.mobile_no.strip() if req.mobile_no else None,
            party_gst_snap=req.gst_no.strip().upper() if req.gst_no else None,
            sender_name_snap=s_name.strip().upper(),
            sender_address_snap=s_addr.strip().upper(),
            sender_city_snap=s_city.strip().upper(),
            sender_state_snap=s_state.strip().upper(),
            sender_mobile_snap=s_mobile.strip(),
            parcel_type=req.parcel_type,
            total_cases=req.total_cases,
            total_weight=total_weight,
            envelope_size=req.envelope_size,
            orientation=req.orientation,
            printer_name=req.printer_name,
            envelopes_per_page=req.envelopes_per_page,
            status=req.status,
            case_breakdown_json=case_breakdown_json,
            delivery_boy_name=active_driver,
            driver_name=active_driver,
            delivery_route=req.delivery_route,
            delivery_status="Pending",
            client_uuid=req.client_uuid,
            language=req.language or "en",
            template_format=req.template_format or "attachment_pdf",
            bill_inside=getattr(req, "bill_inside", False),
            created_by=(req.created_by.strip() if req.created_by else None) or "Admin",
            created_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(job)
        db.flush()

        if req.party_id and (req.party_name_gu or req.address_gu):
            party_rec = db.query(Party).filter(Party.id == req.party_id).first()
            if party_rec:
                if req.party_name_gu: party_rec.party_name_gu = ai_service.clean_gujarati_text(req.party_name_gu)
                if req.address_gu: party_rec.address_gu = ai_service.clean_gujarati_text(req.address_gu)
                if req.address_line_2_gu: party_rec.address_line_2_gu = ai_service.clean_gujarati_text(req.address_line_2_gu)
                if req.address_line_3_gu: party_rec.address_line_3_gu = ai_service.clean_gujarati_text(req.address_line_3_gu)
                if req.city_gu: party_rec.city_gu = ai_service.clean_gujarati_text(req.city_gu)
                if req.state_gu: party_rec.state_gu = ai_service.clean_gujarati_text(req.state_gu)

        cases_resp = []
        if req.total_cases == 0:
            barcode_val = f"{job_number}-C0"
            pcase = PrintCase(
                print_job_id=job.id,
                case_number=0,
                case_total=0,
                weight=0.0,
                barcode_value=barcode_val,
                status="Printed"
            )
            db.add(pcase)
            cases_resp.append({
                "case_number": 0,
                "case_total": 0,
                "weight": 0.0,
                "barcode_value": barcode_val
            })
        else:
            for idx, w in enumerate(weights, start=1):
                barcode_val = f"{job_number}-C{idx}"
                pcase = PrintCase(
                    print_job_id=job.id,
                    case_number=idx,
                    case_total=req.total_cases,
                    weight=w,
                    barcode_value=barcode_val,
                    status="Printed"
                )
                db.add(pcase)
                cases_resp.append({
                    "case_number": idx,
                    "case_total": req.total_cases,
                    "weight": w,
                    "barcode_value": barcode_val
                })

        db.commit()
        db.refresh(job)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create print job: {str(e)}")

    return {
        "id": job.id,
        "job_number": job.job_number,
        "party_name": job.party_name_snap,
        "total_cases": job.total_cases,
        "total_weight": job.total_weight,
        "envelope_size": job.envelope_size,
        "printer_name": job.printer_name,
        "status": job.status,
        "case_breakdown": req.case_breakdown,
        "delivery_boy_name": job.delivery_boy_name,
        "delivery_route": job.delivery_route,
        "language": job.language,
        "template_format": job.template_format,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "cases": cases_resp
    }

@app.post("/api/print-jobs/bulk", status_code=status.HTTP_201_CREATED)
def create_bulk_print_jobs(req: BulkPrintJobsRequest, db: Session = Depends(get_db)):
    """
    Bulk prints envelopes for all selected parties.
    Enables one-click daily printing for all parties.
    Supports English & Gujarati language and template selection.
    """
    if not req.party_ids:
        raise HTTPException(status_code=400, detail="party_ids list cannot be empty")

    parties = db.query(Party).filter(Party.id.in_(req.party_ids), Party.is_active == True).all()
    if not parties:
        raise HTTPException(status_code=404, detail="No active parties found for provided IDs")

    sender_settings = db.query(SenderSettings).first()
    s_name = sender_settings.business_name if sender_settings else "SHREEJI 7"
    s_addr = sender_settings.address if sender_settings else "DAHEGAM"
    s_city = sender_settings.city if sender_settings else "DAHEGAM"
    s_state = sender_settings.state if sender_settings else "GUJARAT"
    s_mobile = sender_settings.mobile if sender_settings else "9924544283"

    breakdown_json = json.dumps(req.case_breakdown) if req.case_breakdown else None

    # Calculate cases count
    cases_count = req.total_cases
    if req.case_breakdown:
        valid_sum = sum(int(b.get("qty", 0)) for b in req.case_breakdown if int(b.get("qty", 0)) > 0)
        cases_count = valid_sum

    app_settings = db.query(AppSettings).first()
    gemini_key = app_settings.gemini_api_key if app_settings else None

    created_jobs = []
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        for p in parties:
            # If printing in Gujarati and party not yet translated, auto-translate using Gemini
            if req.language == "gu" and not p.party_name_gu:
                try:
                    tr = ai_service.translate_party_to_gujarati(
                        p.party_name, p.address, p.city, p.state,
                        address_line_2=p.address_line_2, address_line_3=p.address_line_3,
                        api_key=gemini_key
                    )
                    p.party_name_gu = tr.get("party_name_gu")
                    p.address_gu = tr.get("address_gu")
                    p.address_line_2_gu = tr.get("address_line_2_gu")
                    p.address_line_3_gu = tr.get("address_line_3_gu")
                    p.city_gu = tr.get("city_gu")
                    p.state_gu = tr.get("state_gu")
                except Exception as e:
                    print("Bulk auto-translate error for party:", p.party_name, e)

            job_number = get_next_job_number(db)
            job = PrintJob(
                job_number=job_number,
                party_id=p.id,
                party_name_snap=p.party_name.strip().upper(),
                party_code_snap=p.party_code.strip().upper() if p.party_code else None,
                party_address_snap=p.address.strip().upper(),
                party_address_line_2_snap=p.address_line_2.strip().upper() if p.address_line_2 else None,
                party_address_line_3_snap=p.address_line_3.strip().upper() if p.address_line_3 else None,
                party_city_snap=p.city.strip().upper(),
                party_state_snap=p.state.strip().upper(),
                party_mobile_snap=p.mobile_no.strip() if p.mobile_no else None,
                party_gst_snap=p.gst_no.strip().upper() if p.gst_no else None,
                sender_name_snap=s_name.strip().upper(),
                sender_address_snap=s_addr.strip().upper(),
                sender_city_snap=s_city.strip().upper(),
                sender_state_snap=s_state.strip().upper(),
                sender_mobile_snap=s_mobile.strip(),
                parcel_type=req.parcel_type,
                total_cases=cases_count,
                total_weight=float(cases_count),
                envelope_size=req.envelope_size,
                orientation="Landscape",
                printer_name="Microsoft Print to PDF",
                envelopes_per_page=req.envelopes_per_page,
                status="Printed",
                case_breakdown_json=breakdown_json,
                delivery_boy_name=req.delivery_boy_name,
                delivery_route=req.delivery_route,
                language=req.language or "en",
                template_format=req.template_format or "attachment_pdf",
                created_at=now
            )
            db.add(job)
            db.flush()

            if cases_count == 0:
                pcase = PrintCase(
                    print_job_id=job.id,
                    case_number=0,
                    case_total=0,
                    weight=0.0,
                    barcode_value=f"{job_number}-C0",
                    status="Printed"
                )
                db.add(pcase)
            else:
                for idx in range(1, cases_count + 1):
                    pcase = PrintCase(
                        print_job_id=job.id,
                        case_number=idx,
                        case_total=cases_count,
                        weight=1.0,
                        barcode_value=f"{job_number}-C{idx}",
                        status="Printed"
                    )
                    db.add(pcase)

            created_jobs.append(job.id)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create bulk print jobs: {str(e)}")
    return {
        "success": True,
        "created_count": len(created_jobs),
        "job_ids": created_jobs
    }

@app.post("/api/print-jobs/import")
async def import_print_history(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Imports historical print jobs from .xlsx, .xls, .csv, or .json file into the database.
    """
    try:
        contents = await file.read()
        filename = (file.filename or "").lower()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        sender = db.query(SenderSettings).first()
        sender_name = sender.business_name if sender else "SHREEJI 7"
        sender_address = sender.address if sender else "DAHEGAM"
        sender_city = sender.city if sender else "DAHEGAM"
        sender_state = sender.state if sender else "GUJARAT"
        sender_mobile = sender.mobile if sender else "9924544283"

        imported_count = 0
        skipped_count = 0
        now = datetime.datetime.utcnow()

        # 1. Parse JSON files
        if filename.endswith(".json") or contents.strip().startswith(b"{") or contents.strip().startswith(b"["):
            try:
                data = json.loads(contents.decode("utf-8", errors="ignore"))
            except Exception:
                data = None

            if data:
                raw_jobs = []
                if isinstance(data, list):
                    raw_jobs = data
                elif isinstance(data, dict):
                    raw_jobs = data.get("jobs") or data.get("print_jobs") or data.get("items") or []

                for item in raw_jobs:
                    if not isinstance(item, dict):
                        continue
                    job_num = item.get("job_number") or item.get("job_no") or item.get("jobNumber")
                    if not job_num:
                        job_num = f"MRG-IMP-{int(time.time())}-{imported_count + 1:04d}"

                    existing = db.query(PrintJob).filter(PrintJob.job_number == job_num).first()
                    if existing:
                        skipped_count += 1
                        continue

                    party_name = item.get("party_name_snap") or item.get("party_name") or item.get("partyName") or "Unknown Party"
                    party_code = item.get("party_code_snap") or item.get("party_code") or item.get("partyCode")

                    party_match = None
                    if party_code:
                        party_match = db.query(Party).filter(Party.party_code == party_code).first()
                    if not party_match and party_name:
                        party_match = db.query(Party).filter(Party.party_name.ilike(party_name.strip())).first()

                    created_at = None
                    dt_val = item.get("created_at") or item.get("date")
                    if dt_val:
                        try:
                            if isinstance(dt_val, str):
                                created_at = datetime.datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
                        except Exception:
                            created_at = now
                    if not created_at:
                        created_at = now

                    total_cases = int(item.get("total_cases") or item.get("cases") or 1)
                    if total_cases <= 0:
                        total_cases = 1

                    total_weight = float(item.get("total_weight") or item.get("weight") or 0.0)

                    new_job = PrintJob(
                        job_number=job_num,
                        party_id=party_match.id if party_match else None,
                        party_name_snap=party_match.party_name if party_match else party_name,
                        party_code_snap=party_match.party_code if party_match else party_code,
                        party_address_snap=party_match.address if (party_match and party_match.address) else (item.get("party_address_snap") or "DAHEGAM"),
                        party_address_line_2_snap=getattr(party_match, "address_line_2", None) if party_match else None,
                        party_address_line_3_snap=getattr(party_match, "address_line_3", None) if party_match else None,
                        party_city_snap=party_match.city if (party_match and party_match.city) else (item.get("party_city_snap") or "DAHEGAM"),
                        party_state_snap=party_match.state if (party_match and party_match.state) else (item.get("party_state_snap") or "GUJARAT"),
                        party_mobile_snap=party_match.mobile_no if party_match else item.get("party_mobile_snap"),
                        party_gst_snap=party_match.gst_no if party_match else item.get("party_gst_snap"),
                        sender_name_snap=sender_name,
                        sender_address_snap=sender_address,
                        sender_city_snap=sender_city,
                        sender_state_snap=sender_state,
                        sender_mobile_snap=sender_mobile,
                        parcel_type=item.get("parcel_type") or "Medicine",
                        total_cases=total_cases,
                        total_weight=total_weight,
                        envelope_size=item.get("envelope_size") or "A4",
                        orientation=item.get("orientation") or "Landscape",
                        printer_name=item.get("printer_name") or "Default System Printer",
                        status=item.get("status") or "Printed",
                        created_by=item.get("created_by") or "Imported",
                        driver_name=item.get("driver_name") or item.get("delivery_boy_name"),
                        delivery_status=item.get("delivery_status") or "Pending",
                        delivered_by=item.get("delivered_by"),
                        created_at=created_at
                    )
                    db.add(new_job)
                    db.flush()

                    for c in range(1, total_cases + 1):
                        pcase = PrintCase(
                            print_job_id=new_job.id,
                            case_number=c,
                            case_total=total_cases,
                            barcode_value=f"{new_job.job_number}-C{c}",
                            status=new_job.status or "Printed",
                            weight=round(total_weight / total_cases, 2) if total_cases > 0 and total_weight else 0.0,
                            created_at=new_job.created_at
                        )
                        db.add(pcase)

                    imported_count += 1

                db.commit()
                return {
                    "success": True,
                    "imported": imported_count,
                    "skipped": skipped_count,
                    "message": f"Successfully imported {imported_count} print jobs ({skipped_count} skipped duplicates)."
                }

        # 2. Parse Tabular files (Excel .xlsx, .xls, .csv)
        rows, _ = excel_service._load_raw_table(contents)
        if not rows or len(rows) < 2:
            raise HTTPException(status_code=400, detail="No data rows found in uploaded spreadsheet.")

        raw_headers = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
        
        def find_col_idx(patterns):
            for i, h in enumerate(raw_headers):
                for p in patterns:
                    if p in h:
                        return i
            return -1

        job_idx = find_col_idx(["job no", "job_number", "job #", "job"])
        date_idx = find_col_idx(["date", "time", "created"])
        user_idx = find_col_idx(["created by", "creator", "user"])
        party_idx = find_col_idx(["party name", "party", "customer", "chemist"])
        type_idx = find_col_idx(["parcel type", "type", "parcel"])
        cases_idx = find_col_idx(["cases", "case", "box", "total cases"])
        weight_idx = find_col_idx(["weight", "kg"])
        size_idx = find_col_idx(["size", "envelope size"])
        printer_idx = find_col_idx(["printer"])
        status_idx = find_col_idx(["status"])
        driver_idx = find_col_idx(["driver", "delivery boy"])

        for row_idx, r in enumerate(rows[1:], start=2):
            if not r or all(c in (None, "") for c in r):
                continue

            def get_val(idx, default=""):
                if idx >= 0 and idx < len(r) and r[idx] not in (None, ""):
                    return str(r[idx]).strip()
                return default

            job_num = get_val(job_idx)
            party_name = get_val(party_idx)

            if not job_num and not party_name:
                continue

            if not job_num:
                job_num = f"MRG-IMP-{int(time.time())}-{imported_count + 1:04d}"

            existing = db.query(PrintJob).filter(PrintJob.job_number == job_num).first()
            if existing:
                skipped_count += 1
                continue

            if not party_name:
                party_name = "Party " + job_num

            # Match party in database
            party_match = db.query(Party).filter(Party.party_name.ilike(party_name)).first()

            date_str = get_val(date_idx)
            created_at = now
            if date_str:
                for fmt in ["%d-%m-%Y %H:%M", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"]:
                    try:
                        created_at = datetime.datetime.strptime(date_str, fmt)
                        break
                    except Exception:
                        pass

            try:
                cases_val = int(re.sub(r"[^\d]", "", get_val(cases_idx, "1")) or "1")
            except Exception:
                cases_val = 1
            if cases_val <= 0:
                cases_val = 1

            try:
                wt_str = get_val(weight_idx, "0.0")
                wt_val = float(re.sub(r"[^\d\.]", "", wt_str) or "0.0")
            except Exception:
                wt_val = 0.0

            parcel_type = get_val(type_idx, "Medicine")
            size_val = get_val(size_idx, "A4")
            printer_val = get_val(printer_idx, "Default System Printer")
            status_val = get_val(status_idx, "Printed")
            creator_val = get_val(user_idx, "Imported")
            driver_val = get_val(driver_idx, "") or None

            new_job = PrintJob(
                job_number=job_num,
                party_id=party_match.id if party_match else None,
                party_name_snap=party_match.party_name if party_match else party_name,
                party_code_snap=party_match.party_code if party_match else None,
                party_address_snap=party_match.address if (party_match and party_match.address) else "DAHEGAM",
                party_address_line_2_snap=getattr(party_match, "address_line_2", None) if party_match else None,
                party_address_line_3_snap=getattr(party_match, "address_line_3", None) if party_match else None,
                party_city_snap=party_match.city if (party_match and party_match.city) else "DAHEGAM",
                party_state_snap=party_match.state if (party_match and party_match.state) else "GUJARAT",
                party_mobile_snap=party_match.mobile_no if party_match else None,
                party_gst_snap=party_match.gst_no if party_match else None,
                sender_name_snap=sender_name,
                sender_address_snap=sender_address,
                sender_city_snap=sender_city,
                sender_state_snap=sender_state,
                sender_mobile_snap=sender_mobile,
                parcel_type=parcel_type,
                total_cases=cases_val,
                total_weight=wt_val,
                envelope_size=size_val,
                orientation="Landscape",
                printer_name=printer_val,
                status=status_val,
                created_by=creator_val,
                driver_name=driver_val,
                delivery_status="Delivered" if status_val == "Delivered" else "Pending",
                created_at=created_at
            )
            db.add(new_job)
            db.flush()

            for c in range(1, cases_val + 1):
                pcase = PrintCase(
                    print_job_id=new_job.id,
                    case_number=c,
                    case_total=cases_val,
                    barcode_value=f"{new_job.job_number}-C{c}",
                    status=new_job.status or "Printed",
                    weight=round(wt_val / cases_val, 2) if cases_val > 0 and wt_val else 0.0,
                    created_at=new_job.created_at
                )
                db.add(pcase)

            imported_count += 1

        db.commit()
        return {
            "success": True,
            "imported": imported_count,
            "skipped": skipped_count,
            "message": f"Successfully imported {imported_count} print jobs ({skipped_count} skipped duplicates)."
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to import print jobs: {str(e)}")

@app.get("/api/print-jobs")
def list_print_jobs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=-1),
    search: Optional[str] = None,
    status: Optional[str] = None,
    parcel_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    unique_per_day: bool = Query(True),
    db: Session = Depends(get_db)
):
    query = db.query(PrintJob)

    if status and status != "all":
        query = query.filter(PrintJob.status.ilike(status))
    if parcel_type and parcel_type != "all":
        query = query.filter(PrintJob.parcel_type.ilike(parcel_type))

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                PrintJob.job_number.ilike(s),
                PrintJob.party_name_snap.ilike(s),
                PrintJob.party_code_snap.ilike(s),
                PrintJob.party_city_snap.ilike(s)
            )
        )

    if date_from:
        try:
            df = datetime.datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(PrintJob.created_at >= df)
        except Exception:
            pass

    if date_to:
        try:
            dt = datetime.datetime.strptime(date_to, "%Y-%m-%d") + datetime.timedelta(days=1)
            query = query.filter(PrintJob.created_at < dt)
        except Exception:
            pass

    query = query.order_by(desc(PrintJob.created_at), desc(PrintJob.id))

    if unique_per_day:
        all_raw = query.all()
        all_matches = sorted(
            all_raw,
            key=lambda x: (getattr(x, "updated_at", None) or x.created_at or datetime.datetime.min, x.id),
            reverse=True
        )
        seen = set()
        deduped = []
        for j in all_matches:
            day_str = j.created_at.strftime("%Y-%m-%d") if j.created_at else ""
            key = (j.party_id if j.party_id else (j.party_name_snap or "").strip().upper(), day_str)
            if key not in seen:
                seen.add(key)
                deduped.append(j)
        total = len(deduped)
        if limit == -1:
            jobs = deduped
            pages = 1
        else:
            pages = (total + limit - 1) // limit if limit > 0 else 1
            jobs = deduped[(page - 1) * limit : page * limit]
    else:
        total = query.count()
        if limit == -1:
            jobs = query.all()
            pages = 1
        else:
            pages = (total + limit - 1) // limit if limit > 0 else 1
            jobs = query.offset((page - 1) * limit).limit(limit).all()

    items = []
    for j in jobs:
        items.append({
            "id": j.id,
            "job_number": j.job_number,
            "party_id": j.party_id,
            "party_name": j.party_name_snap,
            "party_code": j.party_code_snap,
            "address": j.party_address_snap,
            "address_line_2": j.party_address_line_2_snap,
            "address_line_3": j.party_address_line_3_snap,
            "city": j.party_city_snap,
            "state": j.party_state_snap,
            "mobile": j.party_mobile_snap,
            "parcel_type": j.parcel_type,
            "total_cases": j.total_cases,
            "total_weight": j.total_weight,
            "envelope_size": j.envelope_size,
            "printer_name": j.printer_name,
            "status": j.status,
            "party_name_gu": j.party.party_name_gu if j.party else None,
            "address_gu": j.party.address_gu if j.party else None,
            "address_line_2_gu": j.party.address_line_2_gu if j.party else None,
            "address_line_3_gu": j.party.address_line_3_gu if j.party else None,
            "city_gu": j.party.city_gu if j.party else None,
            "state_gu": j.party.state_gu if j.party else None,
            "template_format": getattr(j, "template_format", "attachment_pdf") or "attachment_pdf",
            "language": getattr(j, "language", "en") or "en",
            "delivery_boy_name": getattr(j, "delivery_boy_name", None),
            "driver_name": getattr(j, "driver_name", None) or getattr(j, "delivery_boy_name", None),
            "delivery_route": getattr(j, "delivery_route", None),
            "delivery_status": getattr(j, "delivery_status", "Pending") or "Pending",
            "delivered_by": getattr(j, "delivered_by", None),
            "delivered_at": j.delivered_at.isoformat() if getattr(j, "delivered_at", None) else None,
            "case_breakdown_json": getattr(j, "case_breakdown_json", None),
            "created_by": getattr(j, "created_by", "Admin") or "Admin",
            "created_at": j.created_at.strftime("%d-%m-%Y %I:%M %p") if j.created_at else "",
            "created_at_iso": j.created_at.isoformat() if j.created_at else "",
            "cases_count": len(j.cases)
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages
    }

@app.get("/api/print-jobs/{job_id}")
def get_print_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print Job not found")

    cases = [
        {
            "id": c.id,
            "case_number": c.case_number,
            "case_total": c.case_total,
            "weight": c.weight,
            "barcode_value": c.barcode_value,
            "status": c.status
        }
        for c in job.cases
    ]

    return {
        "id": job.id,
        "job_number": job.job_number,
        "party_id": job.party_id,
        "party_name": job.party_name_snap,
        "party_code": job.party_code_snap,
        "address": job.party_address_snap,
        "address_line_2": getattr(job, "party_address_line_2_snap", "") or "",
        "address_line_3": getattr(job, "party_address_line_3_snap", "") or "",
        "city": job.party_city_snap,
        "state": job.party_state_snap,
        "mobile": job.party_mobile_snap,
        "gst_no": job.party_gst_snap,
        "sender": {
            "business_name": job.sender_name_snap,
            "address": job.sender_address_snap,
            "city": job.sender_city_snap,
            "state": job.sender_state_snap,
            "mobile": job.sender_mobile_snap
        },
        "parcel_type": job.parcel_type,
        "total_cases": job.total_cases,
        "total_weight": job.total_weight,
        "envelope_size": job.envelope_size,
        "orientation": job.orientation,
        "printer_name": job.printer_name,
        "envelopes_per_page": job.envelopes_per_page,
        "status": job.status,
        "party_name_gu": job.party.party_name_gu if job.party else None,
        "address_gu": job.party.address_gu if job.party else None,
        "address_line_2_gu": job.party.address_line_2_gu if job.party else None,
        "address_line_3_gu": job.party.address_line_3_gu if job.party else None,
        "city_gu": job.party.city_gu if job.party else None,
        "state_gu": job.party.state_gu if job.party else None,
        "template_format": getattr(job, "template_format", "attachment_pdf") or "attachment_pdf",
        "language": getattr(job, "language", "en") or "en",
        "delivery_boy_name": getattr(job, "delivery_boy_name", None),
        "delivery_route": getattr(job, "delivery_route", None),
        "case_breakdown_json": getattr(job, "case_breakdown_json", None),
        "created_by": getattr(job, "created_by", "Admin") or "Admin",
        "created_at": job.created_at.strftime("%d-%m-%Y %I:%M %p") if job.created_at else "",
        "cases": cases
    }

@app.get("/api/print-jobs/{job_id}/pdf")
@app.get("/api/print-jobs/{job_id}/download")
def download_print_job_pdf(
    job_id: int,
    auto_print: bool = Query(False),
    language: Optional[str] = Query(None),
    template_format: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Directly streams the vector PDF for any existing print job as an attachment.
    Can be used via direct link, curl, window.open, or standard download buttons.
    """
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print Job not found")

    sender_settings = db.query(SenderSettings).first()
    app_settings = db.query(AppSettings).first()

    sender_dict = {
        "business_name": sender_settings.business_name if sender_settings else "SHREEJI 7",
        "address": sender_settings.address if sender_settings else "DAHEGAM",
        "city": sender_settings.city if sender_settings else "DAHEGAM",
        "state": sender_settings.state if sender_settings else "GUJARAT",
        "mobile": sender_settings.mobile if sender_settings else "9924544283",
        "email": sender_settings.email if sender_settings else "SHREEJISEVEN@GMAIL.COM"
    }

    settings_dict = {
        "envelopes_per_page": getattr(job, "envelopes_per_page", None) or (app_settings.envelopes_per_page if app_settings else 2),
        "envelope_size": getattr(job, "envelope_size", None) or (app_settings.default_envelope_size if app_settings else "A4"),
        "margin_top_mm": app_settings.margin_top_mm if app_settings else 15.0,
        "margin_bottom_mm": app_settings.margin_bottom_mm if app_settings else 10.0,
        "margin_left_mm": app_settings.margin_left_mm if app_settings else 3.0,
        "margin_right_mm": app_settings.margin_right_mm if app_settings else 3.0,
        "scale_percent": app_settings.scale_percent if app_settings else 100,
        "show_barcode": app_settings.show_barcode if app_settings else False,
        "show_case_number": app_settings.show_case_number if app_settings else True,
        "show_weight": app_settings.show_weight if app_settings else False,
        "show_mobile": app_settings.show_mobile if app_settings else True,
        "show_party_code": app_settings.show_party_code if app_settings else True
    }

    b_items = None
    if job.case_breakdown_json:
        try:
            b_items = json.loads(job.case_breakdown_json)
        except Exception:
            b_items = None

    job_data = {
        "job_number": job.job_number,
        "party_name_snap": job.party_name_snap,
        "party_code_snap": job.party_code_snap,
        "party_address_snap": job.party_address_snap,
        "party_address_line_2_snap": getattr(job, "party_address_line_2_snap", "") or "",
        "party_address_line_3_snap": getattr(job, "party_address_line_3_snap", "") or "",
        "party_city_snap": job.party_city_snap,
        "party_state_snap": job.party_state_snap,
        "party_mobile_snap": job.party_mobile_snap,
        "party_gst_snap": job.party_gst_snap,
        "party_notes_snap": getattr(job.party, "notes", "") if job.party else "",
        "party_name_gu": getattr(job.party, "party_name_gu", None) if job.party else None,
        "address_gu": getattr(job.party, "address_gu", None) if job.party else None,
        "address_line_2_gu": getattr(job.party, "address_line_2_gu", None) if job.party else None,
        "address_line_3_gu": getattr(job.party, "address_line_3_gu", None) if job.party else None,
        "city_gu": getattr(job.party, "city_gu", None) if job.party else None,
        "state_gu": getattr(job.party, "state_gu", None) if job.party else None,
        "parcel_type": job.parcel_type,
        "total_cases": job.total_cases,
        "case_breakdown": b_items
    }

    cases_data = [
        {
            "case_number": c.case_number,
            "case_total": c.case_total,
            "weight": c.weight,
            "barcode_value": c.barcode_value
        }
        for c in job.cases
    ]

    active_format = template_format or getattr(job, "template_format", None) or (app_settings.envelope_template_format if app_settings else "attachment_pdf")
    active_lang = language or getattr(job, "language", None) or (app_settings.default_language if app_settings else "en")

    try:
        pdf_bytes = pdf_service.generate_envelopes_pdf(
            job_data, cases_data, sender_dict, settings_dict,
            template_format=active_format, language=active_lang,
            auto_print=bool(auto_print)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    filename = f"MARG_Envelope_{job.job_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@app.post("/api/print-jobs/{job_id}/reprint")
def reprint_job(job_id: int, db: Session = Depends(get_db)):
    """Loads original job configuration for reprint in Print Envelope screen."""
    return get_print_job(job_id, db)

@app.put("/api/print-jobs/{job_id}")
def update_print_job(job_id: int, req: CreatePrintJobRequest, db: Session = Depends(get_db)):
    """
    Updates an existing print job in-place for reprint/case edits,
    ensuring it appears strictly only once in Print History and Dispatch Summary.
    Replaces associated PrintCases without generating duplicate job records.
    """
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Print job with ID {job_id} not found")

    return _execute_update_print_job(job, req, db)


@app.delete("/api/print-jobs/{job_id}")
def delete_print_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")
    db.delete(job)
    db.commit()
    return {"message": f"Print job '{job.job_number}' deleted successfully"}

# ==========================================
# 5. SETTINGS (SENDER & APP CONFIG)
# ==========================================

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    sender = db.query(SenderSettings).first()
    if not sender:
        sender = SenderSettings()
        db.add(sender)
        db.commit()
        db.refresh(sender)

    app_set = db.query(AppSettings).first()
    if not app_set:
        app_set = AppSettings()
        db.add(app_set)
        db.commit()
        db.refresh(app_set)

    return {
        "sender": {
            "business_name": sender.business_name,
            "address": sender.address,
            "city": sender.city,
            "state": sender.state,
            "mobile": sender.mobile,
            "landline": sender.landline,
            "email": sender.email,
            "gst_no": sender.gst_no
        },
        "app": {
            "default_envelope_size": app_set.default_envelope_size,
            "default_orientation": app_set.default_orientation,
            "default_copies": app_set.default_copies,
            "default_printer": app_set.default_printer,
            "margin_top_mm": app_set.margin_top_mm,
            "margin_left_mm": app_set.margin_left_mm,
            "margin_right_mm": app_set.margin_right_mm,
            "margin_bottom_mm": app_set.margin_bottom_mm,
            "scale_percent": app_set.scale_percent,
            "envelopes_per_page": app_set.envelopes_per_page,
            "show_header": app_set.show_header,
            "show_footer": app_set.show_footer,
            "show_barcode": app_set.show_barcode,
            "show_case_number": app_set.show_case_number,
            "show_weight": app_set.show_weight,
            "show_mobile": app_set.show_mobile,
            "show_party_code": app_set.show_party_code,
            "show_date": app_set.show_date,
            "show_gst": app_set.show_gst,
            "show_pan": app_set.show_pan,
            "gemini_api_key": app_set.gemini_api_key or os.environ.get("GEMINI_API_KEY", ""),
            "openai_api_key": getattr(app_set, "openai_api_key", "") or os.environ.get("OPENAI_API_KEY", ""),
            "default_language": getattr(app_set, "default_language", "en") or "en",
            "envelope_template_format": getattr(app_set, "envelope_template_format", "attachment_pdf") or "attachment_pdf",
            "iv_fluids_json": getattr(app_set, "iv_fluids_json", None) or '["NS", "RL", "DNS", "METRO"]',
            "iv_volumes_json": getattr(app_set, "iv_volumes_json", None) or '["100ML", "250ML", "500ML", "1LTR"]',
            "google_sheets_api_key": getattr(app_set, "google_sheets_api_key", None) or "AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg",
            "google_sheet_id": getattr(app_set, "google_sheet_id", None) or ""
        }
    }

@app.put("/api/settings")
def update_settings(payload: Dict[str, Any], db: Session = Depends(get_db)):
    if "sender" in payload:
        s_data = payload["sender"]
        sender = db.query(SenderSettings).first()
        if not sender:
            sender = SenderSettings()
            db.add(sender)
        sender.business_name = (s_data.get("business_name") or "SHREEJI 7").strip().upper()
        sender.address = (s_data.get("address") or "DAHEGAM").strip().upper()
        sender.city = (s_data.get("city") or "DAHEGAM").strip().upper()
        sender.state = (s_data.get("state") or "GUJARAT").strip().upper()
        sender.mobile = (s_data.get("mobile") or "9924544283").strip()
        sender.landline = s_data.get("landline")
        sender.email = s_data.get("email")
        sender.gst_no = s_data.get("gst_no")

    if "app" in payload:
        a_data = payload["app"]
        app_set = db.query(AppSettings).first()
        if not app_set:
            app_set = AppSettings()
            db.add(app_set)
        app_set.default_envelope_size = a_data.get("default_envelope_size", app_set.default_envelope_size)
        app_set.default_orientation = a_data.get("default_orientation", app_set.default_orientation)
        app_set.default_copies = int(a_data.get("default_copies", app_set.default_copies))
        app_set.default_printer = a_data.get("default_printer", app_set.default_printer)
        app_set.margin_top_mm = float(a_data.get("margin_top_mm", app_set.margin_top_mm))
        app_set.margin_left_mm = float(a_data.get("margin_left_mm", app_set.margin_left_mm))
        app_set.margin_right_mm = float(a_data.get("margin_right_mm", app_set.margin_right_mm))
        app_set.margin_bottom_mm = float(a_data.get("margin_bottom_mm", app_set.margin_bottom_mm))
        app_set.scale_percent = int(a_data.get("scale_percent", app_set.scale_percent))
        app_set.envelopes_per_page = int(a_data.get("envelopes_per_page", app_set.envelopes_per_page))
        app_set.show_header = bool(a_data.get("show_header", app_set.show_header))
        app_set.show_footer = bool(a_data.get("show_footer", app_set.show_footer))
        app_set.show_barcode = bool(a_data.get("show_barcode", app_set.show_barcode))
        app_set.show_case_number = bool(a_data.get("show_case_number", app_set.show_case_number))
        app_set.show_weight = bool(a_data.get("show_weight", app_set.show_weight))
        app_set.show_mobile = bool(a_data.get("show_mobile", app_set.show_mobile))
        app_set.show_party_code = bool(a_data.get("show_party_code", app_set.show_party_code))
        app_set.show_date = bool(a_data.get("show_date", app_set.show_date))
        app_set.show_gst = bool(a_data.get("show_gst", app_set.show_gst))
        app_set.show_pan = bool(a_data.get("show_pan", app_set.show_pan))
        if "gemini_api_key" in a_data:
            app_set.gemini_api_key = a_data["gemini_api_key"].strip()
        if "openai_api_key" in a_data:
            app_set.openai_api_key = a_data["openai_api_key"].strip()
        if "default_language" in a_data:
            app_set.default_language = a_data["default_language"].strip()
        if "envelope_template_format" in a_data:
            app_set.envelope_template_format = a_data["envelope_template_format"].strip()
        if "iv_fluids_json" in a_data:
            app_set.iv_fluids_json = str(a_data["iv_fluids_json"]).strip()
        if "iv_volumes_json" in a_data:
            app_set.iv_volumes_json = str(a_data["iv_volumes_json"]).strip()
        if "google_sheets_api_key" in a_data:
            app_set.google_sheets_api_key = str(a_data["google_sheets_api_key"]).strip()
        if "google_sheet_id" in a_data:
            app_set.google_sheet_id = str(a_data["google_sheet_id"]).strip()

    db.commit()
    return {"message": "Settings updated successfully"}

# ==========================================
# 6. PDF GENERATION & DOWNLOAD
# ==========================================

class GeneratePDFRequest(BaseModel):
    job_id: Optional[int] = None
    job_ids: Optional[List[int]] = None
    party_ids: Optional[List[int]] = None
    case_breakdown: Optional[List[Dict[str, Any]]] = None
    party_name: Optional[str] = None
    party_code: Optional[str] = None
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    address_line_3: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    mobile_no: Optional[str] = None
    gst_no: Optional[str] = None
    parcel_type: str = "Medicine"
    total_cases: int = 1
    case_weights: List[float] = Field(default_factory=lambda: [1.0])
    sender: Optional[Dict[str, Any]] = None
    envelopes_per_page: int = 2
    envelope_size: str = "A4"
    margin_top_mm: Optional[float] = None
    margin_bottom_mm: Optional[float] = None
    margin_left_mm: Optional[float] = None
    margin_right_mm: Optional[float] = None
    scale_percent: Optional[int] = None
    template_format: Optional[str] = "attachment_pdf"
    language: Optional[str] = "en"
    party_name_gu: Optional[str] = None
    address_gu: Optional[str] = None
    address_line_2_gu: Optional[str] = None
    address_line_3_gu: Optional[str] = None
    city_gu: Optional[str] = None
    state_gu: Optional[str] = None
    bill_inside: Optional[bool] = False
    auto_print: Optional[bool] = False

@app.post("/api/pdf/generate")
def generate_pdf(req: GeneratePDFRequest, db: Session = Depends(get_db)):
    """
    Generates high-precision vector PDF matching the exact MARG Courier Envelope layout.
    Supports either existing job_id, bulk job_ids, or dynamic live envelope parameters.
    """
    sender_settings = db.query(SenderSettings).first()
    app_settings = db.query(AppSettings).first()

    sender_dict = {
        "business_name": (req.sender.get("business_name") if req.sender else None) or (sender_settings.business_name if sender_settings else "SHREEJI 7"),
        "address": (req.sender.get("address") if req.sender else None) or (sender_settings.address if sender_settings else "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305"),
        "city": (req.sender.get("city") if req.sender else None) or (sender_settings.city if sender_settings else "DEHGAM"),
        "state": (req.sender.get("state") if req.sender else None) or (sender_settings.state if sender_settings else "GUJARAT"),
        "mobile": (req.sender.get("mobile") if req.sender else None) or (sender_settings.mobile if sender_settings else "+91 99245 44283"),
        "email": (req.sender.get("email") if req.sender else None) or (sender_settings.email if sender_settings else "SHREEJISEVEN@GMAIL.COM")
    }

    margin_top = req.margin_top_mm if req.margin_top_mm is not None else (app_settings.margin_top_mm if app_settings else 15.0)
    margin_bottom = req.margin_bottom_mm if req.margin_bottom_mm is not None else (app_settings.margin_bottom_mm if app_settings else 10.0)
    margin_left = req.margin_left_mm if req.margin_left_mm is not None else (app_settings.margin_left_mm if app_settings else 3.0)
    margin_right = req.margin_right_mm if req.margin_right_mm is not None else (app_settings.margin_right_mm if app_settings else 3.0)

    settings_dict = {
        "envelopes_per_page": req.envelopes_per_page or (app_settings.envelopes_per_page if app_settings else 2),
        "envelope_size": req.envelope_size or (app_settings.default_envelope_size if app_settings else "A4"),
        "margin_top_mm": margin_top,
        "margin_bottom_mm": margin_bottom,
        "margin_left_mm": margin_left,
        "margin_right_mm": margin_right,
        "scale_percent": req.scale_percent if req.scale_percent is not None else (app_settings.scale_percent if app_settings else 100),
        "show_barcode": app_settings.show_barcode if app_settings else False,
        "show_case_number": app_settings.show_case_number if app_settings else True,
        "show_weight": app_settings.show_weight if app_settings else False,
        "show_mobile": app_settings.show_mobile if app_settings else True,
        "show_party_code": app_settings.show_party_code if app_settings else True
    }

    active_format = req.template_format or (app_settings.envelope_template_format if app_settings else "attachment_pdf")
    active_lang = req.language or (app_settings.default_language if app_settings else "en")

    # Case 1: Bulk job IDs
    if req.job_ids:
        jobs = db.query(PrintJob).filter(PrintJob.id.in_(req.job_ids)).all()
        jobs_cases_list = []
        for job in jobs:
            b_items = None
            if job.case_breakdown_json:
                try:
                    b_items = json.loads(job.case_breakdown_json)
                except Exception:
                    b_items = None
            j_data = {
                "job_number": job.job_number,
                "party_name_snap": job.party_name_snap,
                "party_code_snap": job.party_code_snap,
                "party_address_snap": job.party_address_snap,
                "party_address_line_2_snap": getattr(job, "party_address_line_2_snap", "") or "",
                "party_address_line_3_snap": getattr(job, "party_address_line_3_snap", "") or "",
                "party_city_snap": job.party_city_snap,
                "party_state_snap": job.party_state_snap,
                "party_mobile_snap": job.party_mobile_snap,
                "party_gst_snap": job.party_gst_snap,
                "party_notes_snap": getattr(job.party, "notes", "") if job.party else "",
                "party_name_gu": getattr(job.party, "party_name_gu", None) if job.party else None,
                "address_gu": getattr(job.party, "address_gu", None) if job.party else None,
                "address_line_2_gu": getattr(job.party, "address_line_2_gu", None) if job.party else None,
                "address_line_3_gu": getattr(job.party, "address_line_3_gu", None) if job.party else None,
                "city_gu": getattr(job.party, "city_gu", None) if job.party else None,
                "state_gu": getattr(job.party, "state_gu", None) if job.party else None,
                "parcel_type": job.parcel_type,
                "total_cases": job.total_cases,
                "case_breakdown": b_items,
                "bill_inside": getattr(job, "bill_inside", False)
            }
            for c in job.cases:
                c_data = {
                    "case_number": c.case_number,
                    "case_total": c.case_total,
                    "weight": c.weight,
                    "barcode_value": c.barcode_value
                }
                jobs_cases_list.append({"job": j_data, "case": c_data})

        try:
            pdf_bytes = pdf_service.generate_bulk_envelopes_pdf(
                jobs_cases_list, sender_dict, settings_dict,
                template_format=active_format, language=active_lang,
                auto_print=bool(req.auto_print)
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

        filename = f"MARG_Envelopes_Bulk_{len(req.job_ids)}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    # Case 1B: Bulk Party IDs (Address Only - 0 Cases, No History, No Lock)
    if req.party_ids:
        parties = db.query(Party).filter(Party.id.in_(req.party_ids)).all()
        party_map = {p.id: p for p in parties}
        ordered_parties = [party_map[pid] for pid in req.party_ids if pid in party_map]

        jobs_cases_list = []
        for party in ordered_parties:
            temp_job_number = f"ADDR-{party.id}"
            j_data = {
                "job_number": temp_job_number,
                "party_name_snap": party.party_name,
                "party_code_snap": party.party_code or "",
                "party_address_snap": party.address,
                "party_address_line_2_snap": party.address_line_2 or "",
                "party_address_line_3_snap": party.address_line_3 or "",
                "party_city_snap": party.city,
                "party_state_snap": party.state,
                "party_mobile_snap": party.mobile_no or "",
                "party_gst_snap": party.gst_no or "",
                "party_notes_snap": party.notes or "",
                "party_name_gu": party.party_name_gu,
                "address_gu": party.address_gu,
                "address_line_2_gu": party.address_line_2_gu,
                "address_line_3_gu": party.address_line_3_gu,
                "city_gu": party.city_gu,
                "state_gu": party.state_gu,
                "parcel_type": "Address",
                "total_cases": 0,
                "case_breakdown": None
            }
            c_data = {
                "case_number": 0,
                "case_total": 0,
                "weight": 0.0,
                "barcode_value": f"{temp_job_number}-C0"
            }
            jobs_cases_list.append({"job": j_data, "case": c_data})

        try:
            pdf_bytes = pdf_service.generate_bulk_envelopes_pdf(
                jobs_cases_list, sender_dict, settings_dict,
                template_format=active_format, language=active_lang,
                auto_print=bool(req.auto_print)
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

        filename = f"MARG_Envelopes_Addresses_{len(req.party_ids)}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    # Case 2: Single existing job ID
    if req.job_id:
        job = db.query(PrintJob).filter(PrintJob.id == req.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        b_items = None
        if job.case_breakdown_json:
            try:
                b_items = json.loads(job.case_breakdown_json)
            except Exception:
                b_items = None

        job_data = {
            "job_number": job.job_number,
            "party_name_snap": job.party_name_snap,
            "party_code_snap": job.party_code_snap,
            "party_address_snap": job.party_address_snap,
            "party_address_line_2_snap": getattr(job, "party_address_line_2_snap", "") or "",
            "party_address_line_3_snap": getattr(job, "party_address_line_3_snap", "") or "",
            "party_city_snap": job.party_city_snap,
            "party_state_snap": job.party_state_snap,
            "party_mobile_snap": job.party_mobile_snap,
            "party_gst_snap": job.party_gst_snap,
            "party_notes_snap": getattr(job.party, "notes", "") if job.party else "",
            "party_name_gu": getattr(job.party, "party_name_gu", None) if job.party else None,
            "address_gu": getattr(job.party, "address_gu", None) if job.party else None,
            "address_line_2_gu": getattr(job.party, "address_line_2_gu", None) if job.party else None,
            "address_line_3_gu": getattr(job.party, "address_line_3_gu", None) if job.party else None,
            "city_gu": getattr(job.party, "city_gu", None) if job.party else None,
            "state_gu": getattr(job.party, "state_gu", None) if job.party else None,
            "parcel_type": job.parcel_type,
            "total_cases": job.total_cases,
            "case_breakdown": b_items,
            "bill_inside": getattr(job, "bill_inside", False) or bool(req.bill_inside)
        }
        cases_data = [
            {
                "case_number": c.case_number,
                "case_total": c.case_total,
                "weight": c.weight,
                "barcode_value": c.barcode_value
            }
            for c in job.cases
        ]
        job_number = job.job_number
        j_format = getattr(job, "template_format", None) or active_format
        j_lang = getattr(job, "language", None) or active_lang
        try:
            pdf_bytes = pdf_service.generate_envelopes_pdf(
                job_data, cases_data, sender_dict, settings_dict,
                template_format=j_format, language=j_lang,
                auto_print=bool(req.auto_print)
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
    else:
        # Dynamic preview generation
        temp_job_number = f"MRG-{datetime.datetime.now().year}-PREVIEW"
        job_data = {
            "job_number": temp_job_number,
            "party_name_snap": req.party_name or "JODHPUR MEDICOSE",
            "party_code_snap": req.party_code or "P0001",
            "party_address_snap": req.address or "SHREE MOHANGADH , JAISALMER",
            "party_address_line_2_snap": req.address_line_2 or "",
            "party_address_line_3_snap": req.address_line_3 or "",
            "party_city_snap": req.city or "JAISALMER",
            "party_state_snap": req.state or "RAJASTHAN",
            "party_mobile_snap": req.mobile_no or "+91 8963003012",
            "party_gst_snap": req.gst_no or "",
            "party_notes_snap": "",
            "party_name_gu": req.party_name_gu,
            "address_gu": req.address_gu,
            "address_line_2_gu": req.address_line_2_gu,
            "address_line_3_gu": req.address_line_3_gu,
            "city_gu": req.city_gu,
            "state_gu": req.state_gu,
            "parcel_type": req.parcel_type,
            "total_cases": req.total_cases,
            "case_breakdown": req.case_breakdown,
            "bill_inside": bool(req.bill_inside)
        }
        cases_data = []
        if req.total_cases == 0:
            cases_data.append({
                "case_number": 0,
                "case_total": 0,
                "weight": 0.0,
                "barcode_value": f"{temp_job_number}-C0"
            })
        else:
            weights = req.case_weights
            if len(weights) < req.total_cases:
                last_w = weights[-1] if weights else 1.0
                weights.extend([last_w] * (req.total_cases - len(weights)))
            elif len(weights) > req.total_cases:
                weights = weights[:req.total_cases]

            for idx, w in enumerate(weights, start=1):
                cases_data.append({
                    "case_number": idx,
                    "case_total": req.total_cases,
                    "weight": w,
                    "barcode_value": f"{temp_job_number}-C{idx}"
                })
        job_number = temp_job_number

        try:
            pdf_bytes = pdf_service.generate_envelopes_pdf(
                job_data, cases_data, sender_dict, settings_dict,
                template_format=active_format, language=active_lang,
                auto_print=bool(req.auto_print)
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    filename = f"MARG_Envelope_{job_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# ==========================================
# 6B. DISPATCH SUMMARY FOR DELIVERY BOY
# ==========================================

@app.get("/api/dispatch-summary")
def get_dispatch_summary(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    delivery_boy: Optional[str] = Query(None),
    route: Optional[str] = Query(None),
    job_ids: Optional[str] = Query(None),
    language: Optional[str] = Query("en"),
    db: Session = Depends(get_db)
):
    if not date:
        date_obj = datetime.datetime.now(datetime.timezone.utc).date()
    else:
        try:
            date_obj = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            date_obj = datetime.datetime.now(datetime.timezone.utc).date()

    start_dt = datetime.datetime.combine(date_obj, datetime.time.min)
    end_dt = datetime.datetime.combine(date_obj, datetime.time.max)

    query = db.query(PrintJob).filter(
        PrintJob.created_at >= start_dt,
        PrintJob.created_at <= end_dt
    )
    if job_ids:
        id_list = [int(x.strip()) for x in job_ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(PrintJob.id.in_(id_list))
    if delivery_boy:
        query = query.filter(PrintJob.delivery_boy_name == delivery_boy)
    if route:
        query = query.filter(PrintJob.delivery_route == route)
    jobs = query.order_by(PrintJob.created_at.asc(), PrintJob.id.asc()).all()

    # Deduplicate: if an envelope was updated/reprinted or printed multiple times,
    # show it strictly only once for that party on this date.
    seen_parties: Dict[Any, PrintJob] = {}
    for j in jobs:
        party_key = j.party_id if j.party_id else (j.party_name_snap or "").strip().upper()
        if party_key not in seen_parties:
            seen_parties[party_key] = j
        else:
            prev_j = seen_parties[party_key]
            j_ts = getattr(j, "updated_at", None) or j.created_at
            prev_ts = getattr(prev_j, "updated_at", None) or prev_j.created_at
            if (j_ts and prev_ts and j_ts >= prev_ts) or (j.id > prev_j.id):
                seen_parties[party_key] = j

    deduped_jobs = list(seen_parties.values())

    total_packages = 0
    breakdown_totals: Dict[str, int] = {}
    distinct_drivers = set()
    distinct_routes = set()

    dispatches = []
    for j in deduped_jobs:
        total_packages += (j.total_cases or 1)
        if j.delivery_boy_name:
            distinct_drivers.add(j.delivery_boy_name)
        if j.delivery_route:
            distinct_routes.add(j.delivery_route)

        b_items = []
        if j.case_breakdown_json:
            try:
                b_items = json.loads(j.case_breakdown_json)
            except Exception:
                b_items = []

        if b_items and isinstance(b_items, list):
            for item in b_items:
                if isinstance(item, dict):
                    qty = int(item.get("qty", 0))
                    if qty <= 0:
                        continue
                    label = f"{item.get('type', 'CASE')} {item.get('volume', '')}".strip()
                    breakdown_totals[label] = breakdown_totals.get(label, 0) + qty
        else:
            label = "Standard Case"
            breakdown_totals[label] = breakdown_totals.get(label, 0) + (j.total_cases or 1)

        party_name_gu = None
        city_gu = None
        address_gu = None
        if j.party:
            party_name_gu = j.party.party_name_gu
            city_gu = j.party.city_gu
            address_gu = j.party.address_gu
        if not party_name_gu and j.party_name_snap:
            party_name_gu = ai_service.fast_translate_phrase(j.party_name_snap)
        if not city_gu and j.party_city_snap:
            city_gu = ai_service.fast_translate_phrase(j.party_city_snap)

        dispatches.append({
            "id": j.id,
            "job_number": j.job_number,
            "party_id": j.party_id,
            "party_name": j.party_name_snap,
            "party_name_gu": party_name_gu,
            "party_code": j.party_code_snap,
            "city": j.party_city_snap,
            "city_gu": city_gu,
            "address_gu": address_gu,
            "state": j.party_state_snap,
            "mobile": j.party_mobile_snap,
            "total_cases": j.total_cases,
            "case_breakdown": b_items,
            "delivery_boy_name": j.delivery_boy_name or j.driver_name,
            "driver_name": j.driver_name or j.delivery_boy_name,
            "delivery_route": j.delivery_route,
            "status": j.status,
            "delivery_status": j.delivery_status or "Pending",
            "delivered_by": j.delivered_by or (j.driver_name if j.delivery_status == "Delivered" else None),
            "delivered_at": j.delivered_at.isoformat() if j.delivered_at else None,
            "pod_notes": j.pod_notes,
            "created_at": j.created_at.isoformat() if j.created_at else None
        })

    delivered_cases = sum(d["total_cases"] for d in dispatches if d["delivery_status"] == "Delivered")
    delivered_parties = sum(1 for d in dispatches if d["delivery_status"] == "Delivered")
    pending_cases = sum(d["total_cases"] for d in dispatches if d["delivery_status"] != "Delivered")
    pending_parties = sum(1 for d in dispatches if d["delivery_status"] != "Delivered")

    return {
        "date": date_obj.isoformat(),
        "total_parties": len(dispatches),
        "total_packages": total_packages,
        "delivered_parties": delivered_parties,
        "delivered_cases": delivered_cases,
        "pending_parties": pending_parties,
        "pending_cases": pending_cases,
        "breakdown_totals": breakdown_totals,
        "available_delivery_boys": sorted(list(distinct_drivers)),
        "available_routes": sorted(list(distinct_routes)),
        "dispatches": dispatches
    }

@app.post("/api/dispatch-summary/update-job")
def update_dispatch_jobs(req: UpdateDispatchJobsRequest, db: Session = Depends(get_db)):
    if not req.job_ids:
        raise HTTPException(status_code=400, detail="job_ids cannot be empty")

    jobs = db.query(PrintJob).filter(PrintJob.id.in_(req.job_ids)).all()
    driver_val = req.driver_name if req.driver_name is not None else req.delivery_boy_name
    for j in jobs:
        if driver_val is not None:
            j.delivery_boy_name = driver_val
            j.driver_name = driver_val
        if req.delivery_route is not None:
            j.delivery_route = req.delivery_route
        if req.status is not None:
            j.status = req.status

    db.commit()
    return {"success": True, "updated_count": len(jobs)}

# ---------------------------------------------------------------------------
# Driver Mode & Proof of Delivery (POD) Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/driver/jobs")
def get_driver_jobs(
    date: Optional[str] = Query(None),
    driver: Optional[str] = Query(None),
    route: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    if not date:
        date_obj = datetime.datetime.now(datetime.timezone.utc).date()
    else:
        try:
            date_obj = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            date_obj = datetime.datetime.now(datetime.timezone.utc).date()

    start_dt = datetime.datetime.combine(date_obj, datetime.time.min)
    end_dt = datetime.datetime.combine(date_obj, datetime.time.max)

    query = db.query(PrintJob).filter(
        PrintJob.created_at >= start_dt,
        PrintJob.created_at <= end_dt
    )

    if driver and driver.strip() and driver.strip().lower() != "all":
        driver_term = driver.strip()
        query = query.filter(
            or_(
                PrintJob.driver_name.ilike(driver_term),
                PrintJob.delivery_boy_name.ilike(driver_term)
            )
        )

    if route and route.strip() and route.strip().lower() != "all":
        query = query.filter(PrintJob.delivery_route.ilike(route.strip()))

    if status and status.strip() and status.strip().lower() != "all":
        query = query.filter(PrintJob.delivery_status.ilike(status.strip()))

    jobs = query.order_by(PrintJob.id.asc()).all()

    items = []
    for j in jobs:
        b_items = []
        if j.case_breakdown_json:
            try:
                b_items = json.loads(j.case_breakdown_json)
            except Exception:
                b_items = []

        items.append({
            "id": j.id,
            "job_number": j.job_number,
            "party_id": j.party_id,
            "party_name": j.party_name_snap,
            "party_name_gu": j.party.party_name_gu if j.party and j.party.party_name_gu else None,
            "address": j.party_address_snap,
            "address_line_2": j.party_address_line_2_snap,
            "address_line_3": j.party_address_line_3_snap,
            "city": j.party_city_snap,
            "state": j.party_state_snap,
            "mobile": j.party_mobile_snap,
            "total_cases": j.total_cases,
            "case_breakdown": b_items,
            "driver_name": j.driver_name or j.delivery_boy_name,
            "delivery_route": j.delivery_route,
            "delivery_status": j.delivery_status or "Pending",
            "delivered_by": j.delivered_by or (j.driver_name if j.delivery_status == "Delivered" else None),
            "pod_signature": j.pod_signature,
            "pod_photo": j.pod_photo,
            "pod_notes": j.pod_notes,
            "delivered_at": j.delivered_at.isoformat() if j.delivered_at else None,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "latitude": j.party.latitude if j.party else None,
            "longitude": j.party.longitude if j.party else None,
            "geofence_radius_meters": (j.party.geofence_radius_meters if j.party else None) or 75,
            "delivered_latitude": j.delivered_latitude,
            "delivered_longitude": j.delivered_longitude,
            "distance_from_geofence_meters": j.distance_from_geofence_meters,
            "geofence_verified": j.geofence_verified,
        })

    return {
        "date": date_obj.isoformat(),
        "total_stops": len(items),
        "delivered_count": sum(1 for x in items if x["delivery_status"] == "Delivered"),
        "pending_count": sum(1 for x in items if x["delivery_status"] != "Delivered"),
        "stops": items
    }

@app.post("/api/driver/pod")
def submit_proof_of_delivery(req: PODRecordRequest, db: Session = Depends(get_db)):
    job = None
    if req.job_id:
        job = db.query(PrintJob).filter(PrintJob.id == req.job_id).first()

    party = None
    if req.party_id:
        party = db.query(Party).filter(Party.id == req.party_id).first()

    if not job and not party and req.job_id:
        party = db.query(Party).filter(Party.id == req.job_id).first()
        if party:
            job = db.query(PrintJob).filter(PrintJob.party_id == party.id).order_by(PrintJob.id.desc()).first()

    if not job and not party:
        raise HTTPException(status_code=404, detail="Print job or party not found")

    if job:
        job.delivery_status = "Delivered"
        job.delivered_at = datetime.datetime.now(datetime.timezone.utc)
        job.delivered_by = req.delivered_by or job.driver_name or "Driver"
        if req.pod_signature:
            job.pod_signature = req.pod_signature
        if req.pod_photo:
            job.pod_photo = req.pod_photo
        if req.pod_notes:
            job.pod_notes = req.pod_notes
        if not party and job.party:
            party = job.party

    # Geofence location validation & 1-tap pinning
    dist = None
    geofence_verified = None
    if req.delivered_latitude is not None and req.delivered_longitude is not None:
        if job:
            job.delivered_latitude = req.delivered_latitude
            job.delivered_longitude = req.delivered_longitude

        if party:
            # If auto-pinning requested or if pharmacy has no coordinates yet
            if req.pin_shop_geofence or (party.latitude is None and party.longitude is None):
                party.latitude = req.delivered_latitude
                party.longitude = req.delivered_longitude
                if not party.geofence_radius_meters:
                    party.geofence_radius_meters = 75
                party.geofence_set_at = datetime.datetime.now(datetime.timezone.utc)

            # Calculate Haversine distance
            if party.latitude is not None and party.longitude is not None:
                dist = calculate_haversine_distance(
                    req.delivered_latitude, req.delivered_longitude,
                    party.latitude, party.longitude
                )
                allowed_radius = party.geofence_radius_meters or 75
                geofence_verified = (dist <= allowed_radius)
                if job:
                    job.distance_from_geofence_meters = dist
                    job.geofence_verified = geofence_verified

    db.commit()
    if job:
        db.refresh(job)
    if party:
        db.refresh(party)

    return {
        "success": True,
        "job_id": job.id if job else None,
        "party_id": party.id if party else None,
        "party_name": party.party_name if party else (job.party_name if job else None),
        "delivery_status": "Delivered",
        "delivered_by": req.delivered_by or (job.delivered_by if job else "Driver"),
        "delivered_at": job.delivered_at.isoformat() if (job and job.delivered_at) else datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "delivered_latitude": req.delivered_latitude,
        "delivered_longitude": req.delivered_longitude,
        "distance_from_geofence_meters": dist if dist is not None else (job.distance_from_geofence_meters if job else None),
        "geofence_verified": geofence_verified if geofence_verified is not None else (job.geofence_verified if job else None),
        "geofence_pinned": bool(req.pin_shop_geofence)
    }

@app.post("/api/driver/pod/sync")
def sync_batch_pod(req: BatchPODSyncRequest, db: Session = Depends(get_db)):
    updated_ids = []
    now = datetime.datetime.now(datetime.timezone.utc)
    for item in req.items:
        job = None
        if item.client_uuid:
            job = db.query(PrintJob).filter(PrintJob.client_uuid == item.client_uuid).first()
        if not job and item.job_id:
            job = db.query(PrintJob).filter(PrintJob.id == item.job_id).first()
        if job:
            job.delivery_status = "Delivered"
            job.delivered_at = now
            job.delivered_by = item.delivered_by or job.driver_name or "Driver"
            if item.pod_signature: job.pod_signature = item.pod_signature
            if item.pod_photo: job.pod_photo = item.pod_photo
            if item.pod_notes: job.pod_notes = item.pod_notes

            if item.delivered_latitude is not None and item.delivered_longitude is not None:
                job.delivered_latitude = item.delivered_latitude
                job.delivered_longitude = item.delivered_longitude
                party = job.party
                if party:
                    if item.pin_shop_geofence or (party.latitude is None and party.longitude is None):
                        party.latitude = item.delivered_latitude
                        party.longitude = item.delivered_longitude
                        if not party.geofence_radius_meters:
                            party.geofence_radius_meters = 75
                        party.geofence_set_at = now
                    if party.latitude is not None and party.longitude is not None:
                        dist = calculate_haversine_distance(
                            item.delivered_latitude, item.delivered_longitude,
                            party.latitude, party.longitude
                        )
                        job.distance_from_geofence_meters = dist
                        job.geofence_verified = (dist <= (party.geofence_radius_meters or 75))

            updated_ids.append(job.id)

    db.commit()
    return {
        "success": True,
        "synced_count": len(updated_ids),
        "job_ids": updated_ids
    }

@app.post("/api/sync/jobs")
def sync_offline_jobs(req: BatchJobSyncRequest, db: Session = Depends(get_db)):
    synced_jobs = []
    for job_req in req.jobs:
        try:
            res = create_print_job(job_req, db)
            synced_jobs.append(res)
        except Exception as e:
            print(f"Error syncing offline job {job_req.party_name}: {e}")
    return {
        "success": True,
        "synced_count": len(synced_jobs),
        "jobs": synced_jobs
    }

@app.get("/api/driver/list")
def get_driver_list(db: Session = Depends(get_db)):
    driver_rows = db.query(PrintJob.driver_name).filter(PrintJob.driver_name.isnot(None)).distinct().all()
    legacy_rows = db.query(PrintJob.delivery_boy_name).filter(PrintJob.delivery_boy_name.isnot(None)).distinct().all()
    all_drivers = set()
    for (d,) in driver_rows:
        if d and d.strip(): all_drivers.add(d.strip())
    for (d,) in legacy_rows:
        if d and d.strip(): all_drivers.add(d.strip())
    return {
        "drivers": sorted(list(all_drivers))
    }

@app.get("/api/dispatch-summary/pdf")
def get_dispatch_summary_pdf(
    date: Optional[str] = Query(None),
    delivery_boy: Optional[str] = Query(None),
    route: Optional[str] = Query(None),
    job_ids: Optional[str] = Query(None),
    auto_print: bool = Query(False),
    language: Optional[str] = Query("en"),
    db: Session = Depends(get_db)
):
    if not date:
        date_obj = datetime.datetime.now(datetime.timezone.utc).date()
    else:
        try:
            date_obj = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            date_obj = datetime.datetime.now(datetime.timezone.utc).date()

    start_dt = datetime.datetime.combine(date_obj, datetime.time.min)
    end_dt = datetime.datetime.combine(date_obj, datetime.time.max)

    query = db.query(PrintJob).filter(
        PrintJob.created_at >= start_dt,
        PrintJob.created_at <= end_dt
    )
    if job_ids:
        id_list = [int(x.strip()) for x in job_ids.split(",") if x.strip().isdigit()]
        if id_list:
            query = query.filter(PrintJob.id.in_(id_list))
    if delivery_boy:
        query = query.filter(PrintJob.delivery_boy_name == delivery_boy)
    if route:
        query = query.filter(PrintJob.delivery_route == route)
    jobs = query.order_by(PrintJob.created_at.asc(), PrintJob.id.asc()).all()

    # Deduplicate: if an envelope was updated/reprinted, show it strictly once
    seen_parties: Dict[Any, PrintJob] = {}
    for j in jobs:
        party_key = j.party_id if j.party_id else (j.party_name_snap or "").strip().upper()
        if party_key not in seen_parties:
            seen_parties[party_key] = j
        else:
            prev_j = seen_parties[party_key]
            j_ts = getattr(j, "updated_at", None) or j.created_at
            prev_ts = getattr(prev_j, "updated_at", None) or prev_j.created_at
            if (j_ts and prev_ts and j_ts >= prev_ts) or (j.id > prev_j.id):
                seen_parties[party_key] = j

    dispatches = []
    for j in seen_parties.values():
        party_name_gu = None
        city_gu = None
        if j.party:
            party_name_gu = j.party.party_name_gu
            city_gu = j.party.city_gu
        if not party_name_gu and j.party_name_snap:
            party_name_gu = ai_service.fast_translate_phrase(j.party_name_snap)
        if not city_gu and j.party_city_snap:
            city_gu = ai_service.fast_translate_phrase(j.party_city_snap)

        dispatches.append({
            "party_name": j.party_name_snap,
            "party_name_gu": party_name_gu,
            "city": j.party_city_snap,
            "city_gu": city_gu,
            "mobile": j.party_mobile_snap,
            "total_cases": j.total_cases,
            "case_breakdown": j.case_breakdown_json,
            "delivery_status": j.delivery_status or "Pending",
            "delivered_by": j.delivered_by or (j.driver_name if j.delivery_status == "Delivered" else None),
            "delivered_at": j.delivered_at.strftime("%d-%m %I:%M %p") if j.delivered_at else None
        })

    sender_settings = db.query(SenderSettings).first()
    sender_dict = {
        "business_name": sender_settings.business_name if sender_settings else "SHREEJI 7",
        "address": sender_settings.address if sender_settings else "SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305",
        "mobile": sender_settings.mobile if sender_settings else "+91 99245 44283"
    }

    date_formatted = date_obj.strftime("%d-%m-%Y")
    pdf_bytes = pdf_service.generate_dispatch_summary_pdf(
        date_str=date_formatted,
        delivery_boy=delivery_boy or "",
        route=route or "",
        dispatches=dispatches,
        sender_data=sender_dict,
        auto_print=auto_print,
        language=language or "en"
    )

    filename = f"Dispatch_Summary_{date_formatted}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# ==========================================
# 7. EXCEL EXPORTS (PARTIES & PRINT HISTORY)
# ==========================================

@app.get("/api/export/parties.xlsx")
def export_parties_xlsx(db: Session = Depends(get_db)):
    parties = db.query(Party).order_by(Party.party_name.asc()).all()
    xlsx_bytes = excel_service.export_parties_to_excel(parties)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="MARG_Parties_List.xlsx"'}
    )

@app.get("/api/export/history.xlsx")
def export_history_xlsx(db: Session = Depends(get_db)):
    jobs = db.query(PrintJob).order_by(desc(PrintJob.created_at)).all()
    xlsx_bytes = excel_service.export_print_history_to_excel(jobs)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="MARG_Envelope_Print_History.xlsx"'}
    )

# ==========================================
# 8. DATABASE BACKUP & RESTORE
# ==========================================

@app.get("/api/backup/export")
def export_database_backup(db: Session = Depends(get_db)):
    parties = db.query(Party).all()
    sender = db.query(SenderSettings).first()
    app_set = db.query(AppSettings).first()
    jobs = db.query(PrintJob).all()

    backup = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "app": "Envelope Print Manager",
        "parties": [
            {
                "party_name": p.party_name,
                "party_code": p.party_code,
                "address": p.address,
                "address_line_2": getattr(p, "address_line_2", None),
                "address_line_3": getattr(p, "address_line_3", None),
                "city": p.city,
                "state": p.state,
                "party_name_gu": getattr(p, "party_name_gu", None),
                "address_gu": getattr(p, "address_gu", None),
                "address_line_2_gu": getattr(p, "address_line_2_gu", None),
                "address_line_3_gu": getattr(p, "address_line_3_gu", None),
                "city_gu": getattr(p, "city_gu", None),
                "state_gu": getattr(p, "state_gu", None),
                "mobile_no": p.mobile_no,
                "landline": p.landline,
                "email": p.email,
                "gst_no": p.gst_no,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "drug_licenses": p.drug_licenses,
                "geofence_radius_meters": getattr(p, "geofence_radius_meters", 75),
                "route": getattr(p, "route", None),
                "notes": p.notes,
                "is_active": p.is_active
            }
            for p in parties
        ],
        "sender": {
            "business_name": sender.business_name if sender else "SHREEJI 7",
            "address": sender.address if sender else "DAHEGAM",
            "city": sender.city if sender else "DAHEGAM",
            "state": sender.state if sender else "GUJARAT",
            "mobile": sender.mobile if sender else "9924544283",
            "landline": sender.landline if sender else None,
            "email": sender.email if sender else None,
            "gst_no": sender.gst_no if sender else None
        },
        "app_settings": {
            "default_envelope_size": app_set.default_envelope_size if app_set else "A4",
            "default_orientation": app_set.default_orientation if app_set else "Landscape",
            "default_copies": app_set.default_copies if app_set else 1,
            "default_printer": app_set.default_printer if app_set else "Microsoft Print to PDF",
            "margin_top_mm": app_set.margin_top_mm if app_set else 15.0,
            "margin_left_mm": app_set.margin_left_mm if app_set else 3.0,
            "margin_right_mm": app_set.margin_right_mm if app_set else 3.0,
            "margin_bottom_mm": app_set.margin_bottom_mm if app_set else 10.0,
            "scale_percent": app_set.scale_percent if app_set else 100,
            "envelopes_per_page": app_set.envelopes_per_page if app_set else 2,
            "show_header": app_set.show_header if app_set else True,
            "show_barcode": app_set.show_barcode if app_set else True,
            "show_case_number": app_set.show_case_number if app_set else True,
            "show_weight": app_set.show_weight if app_set else True,
            "show_mobile": app_set.show_mobile if app_set else True,
            "show_party_code": app_set.show_party_code if app_set else True
        }
    }
    return JSONResponse(
        content=backup,
        headers={"Content-Disposition": 'attachment; filename="MARG_Envelope_Backup.json"'}
    )

@app.get("/api/database/info")
def get_database_info(db: Session = Depends(get_db)):
    """Returns database size, file stats, and record counts for export/import UI."""
    try:
        from database import DB_PATH, is_sqlite
        file_size_bytes = 0
        file_size_formatted = "0 KB"
        last_modified = None
        if is_sqlite and os.path.exists(DB_PATH):
            file_size_bytes = os.path.getsize(DB_PATH)
            wal_path = f"{DB_PATH}-wal"
            if os.path.exists(wal_path):
                file_size_bytes += os.path.getsize(wal_path)
            
            if file_size_bytes > 1024 * 1024:
                file_size_formatted = f"{file_size_bytes / (1024 * 1024):.2f} MB"
            else:
                file_size_formatted = f"{file_size_bytes / 1024:.1f} KB"
            last_modified = datetime.datetime.fromtimestamp(os.path.getmtime(DB_PATH)).isoformat()
        
        parties_count = db.query(Party).count()
        jobs_count = db.query(PrintJob).count()
        users_count = db.query(User).count()
        
        return {
            "type": "SQLite" if is_sqlite else "PostgreSQL",
            "file_name": os.path.basename(DB_PATH) if is_sqlite else "PostgreSQL Database",
            "file_size_bytes": file_size_bytes,
            "file_size_formatted": file_size_formatted,
            "last_modified": last_modified,
            "parties_count": parties_count,
            "jobs_count": jobs_count,
            "users_count": users_count,
            "download_sqlite_url": "/api/backup/download-sqlite",
            "export_json_url": "/api/backup/export"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/database/export")
def export_database_alias(db: Session = Depends(get_db)):
    """Alias for downloading the full raw binary SQLite database."""
    return download_sqlite_database(db)

@app.post("/api/database/import")
async def import_database_file_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Smart import endpoint accepting either binary SQLite (.db) or JSON backup."""
    try:
        from database import DB_PATH, is_sqlite
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Check if binary SQLite file
        if content.startswith(b"SQLite format 3\x00"):
            if not is_sqlite:
                raise HTTPException(status_code=400, detail="Binary database restore only supported on SQLite")
            db.close()
            backup_path = f"{DB_PATH}.bak"
            if os.path.exists(DB_PATH):
                shutil.copy2(DB_PATH, backup_path)
            with open(DB_PATH, "wb") as f:
                f.write(content)
            return {
                "status": "success",
                "format": "sqlite",
                "message": "Full SQLite database restored successfully! All tables, parties, and records synchronized."
            }
        
        # Try parsing as JSON backup
        try:
            text_str = content.decode("utf-8")
            data = json.loads(text_str)
            if isinstance(data, dict) and ("parties" in data or "sender" in data or "app_settings" in data):
                import_database_backup(data, db)
                parties_num = len(data.get("parties", []))
                return {
                    "status": "success",
                    "format": "json",
                    "message": f"Full database JSON backup restored successfully! Processed {parties_num} parties."
                }
            else:
                raise ValueError("JSON file missing recognized backup schema keys.")
        except Exception as json_err:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Please upload a valid SQLite (.db) database file or a JSON backup file. Details: {str(json_err)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backup/download-sqlite")
def download_sqlite_database(db: Session = Depends(get_db)):
    """Flushes SQLite WAL to disk and streams the full raw binary database file."""
    try:
        from database import DB_PATH, is_sqlite
        if not is_sqlite or not os.path.exists(DB_PATH):
            raise HTTPException(status_code=400, detail="Binary database download only supported on SQLite")
        try:
            db.execute(text("PRAGMA wal_checkpoint(FULL);"))
            db.commit()
        except Exception:
            pass
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        return FileResponse(
            path=DB_PATH,
            filename=f"envelope_manager_{timestamp}.db",
            media_type="application/x-sqlite3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backup/restore-sqlite")
async def restore_sqlite_database(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Restores database from an uploaded SQLite .db file."""
    try:
        from database import DB_PATH, is_sqlite
        if not is_sqlite:
            raise HTTPException(status_code=400, detail="Binary database restore only supported on SQLite")
        content = await file.read()
        if len(content) < 16 or not content.startswith(b"SQLite format 3\x00"):
            raise HTTPException(status_code=400, detail="Invalid SQLite database binary file")
        db.close()
        backup_path = f"{DB_PATH}.bak"
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, backup_path)
        with open(DB_PATH, "wb") as f:
            f.write(content)
        return {"status": "success", "message": "Database restored successfully. Server reloaded."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backup/parties.json")
def export_parties_full_backup(db: Session = Depends(get_db)):
    """Exports full chemist parties master data with exact GPS latitude and longitude coordinates."""
    parties = db.query(Party).order_by(Party.party_name.asc()).all()
    payload = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_parties": len(parties),
        "parties": [
            {
                "id": p.id,
                "party_name": p.party_name,
                "party_code": p.party_code,
                "address": p.address,
                "address_line_2": getattr(p, "address_line_2", None),
                "address_line_3": getattr(p, "address_line_3", None),
                "city": p.city,
                "state": p.state,
                "mobile_no": p.mobile_no,
                "landline": p.landline,
                "email": p.email,
                "gst_no": p.gst_no,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "geofence_radius_meters": getattr(p, "geofence_radius_meters", 75),
                "drug_licenses": p.drug_licenses,
                "party_name_gu": getattr(p, "party_name_gu", None),
                "address_gu": getattr(p, "address_gu", None),
                "route": getattr(p, "route", None),
                "notes": p.notes,
                "is_active": p.is_active
            }
            for p in parties
        ]
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="Shreeji_Parties_Full_Location_Backup.json"'}
    )

@app.post("/api/backup/import")
def import_database_backup(backup_data: Dict[str, Any], db: Session = Depends(get_db)):
    if "parties" in backup_data:
        imported_count = 0
        updated_count = 0
        existing_names = {p[0].upper() for p in db.query(Party.party_name).all()}
        for p in backup_data["parties"]:
            name = p.get("party_name", "").strip().upper()
            if not name:
                continue
            
            lat_val = None
            if p.get("latitude") is not None and str(p.get("latitude")).strip() != "":
                try: lat_val = float(p.get("latitude"))
                except (ValueError, TypeError): lat_val = None

            lng_val = None
            if p.get("longitude") is not None and str(p.get("longitude")).strip() != "":
                try: lng_val = float(p.get("longitude"))
                except (ValueError, TypeError): lng_val = None

            licenses_val = p.get("drug_licenses")
            if isinstance(licenses_val, list):
                licenses_val = json.dumps(licenses_val)

            if name not in existing_names:
                new_p = Party(
                    party_name=name,
                    party_code=p.get("party_code"),
                    address=p.get("address", "").strip().upper(),
                    address_line_2=p.get("address_line_2", "").strip().upper() if p.get("address_line_2") else None,
                    address_line_3=p.get("address_line_3", "").strip().upper() if p.get("address_line_3") else None,
                    city=p.get("city", "DAHEGAM").strip().upper(),
                    state=p.get("state", "GUJARAT").strip().upper(),
                    party_name_gu=p.get("party_name_gu"),
                    address_gu=p.get("address_gu"),
                    address_line_2_gu=p.get("address_line_2_gu"),
                    address_line_3_gu=p.get("address_line_3_gu"),
                    city_gu=p.get("city_gu"),
                    state_gu=p.get("state_gu"),
                    mobile_no=p.get("mobile_no"),
                    landline=p.get("landline"),
                    email=p.get("email"),
                    gst_no=p.get("gst_no"),
                    latitude=lat_val,
                    longitude=lng_val,
                    drug_licenses=licenses_val,
                    geofence_radius_meters=int(p.get("geofence_radius_meters") or 75),
                    route=p.get("route"),
                    notes=p.get("notes"),
                    is_active=p.get("is_active", True)
                )
                db.add(new_p)
                existing_names.add(name)
                imported_count += 1
            else:
                # Update existing party location coordinates if missing
                existing_p = db.query(Party).filter(func.upper(Party.party_name) == name).first()
                if existing_p:
                    if existing_p.latitude is None and lat_val is not None:
                        existing_p.latitude = lat_val
                        updated_count += 1
                    if existing_p.longitude is None and lng_val is not None:
                        existing_p.longitude = lng_val
                    if not existing_p.drug_licenses and licenses_val:
                        existing_p.drug_licenses = licenses_val
        db.commit()

    if "sender" in backup_data:
        s_data = backup_data["sender"]
        sender = db.query(SenderSettings).first()
        if not sender:
            sender = SenderSettings()
            db.add(sender)
        sender.business_name = s_data.get("business_name", "SHREEJI 7")
        sender.address = s_data.get("address", "DAHEGAM")
        sender.city = s_data.get("city", "DAHEGAM")
        sender.state = s_data.get("state", "GUJARAT")
        sender.mobile = s_data.get("mobile", "9924544283")
        sender.landline = s_data.get("landline")
        sender.email = s_data.get("email")
        sender.gst_no = s_data.get("gst_no")
        db.commit()

@app.get("/api/backup/settings")
def get_backup_settings(db: Session = Depends(get_db)):
    app_set = db.query(AppSettings).first()
    sender = db.query(SenderSettings).first()
    g_email = (sender.email if sender and sender.email else "shreejiseven@gmail.com") or "shreejiseven@gmail.com"
    return {
        "auto_backup_enabled": getattr(app_set, "auto_backup_enabled", True) if app_set else True,
        "auto_backup_time": getattr(app_set, "auto_backup_time", "20:00") or "20:00",
        "rclone_remote_name": getattr(app_set, "rclone_remote_name", "gdrive") or "gdrive",
        "rclone_backup_path": getattr(app_set, "rclone_backup_path", "MARG_Backups") or "MARG_Backups",
        "last_backup_time": app_set.last_backup_time.strftime("%d-%m-%Y %I:%M %p") if app_set and app_set.last_backup_time else None,
        "last_backup_status": getattr(app_set, "last_backup_status", None) if app_set else None,
        "google_account": g_email
    }

@app.put("/api/backup/settings")
def update_backup_settings(
    req: BackupSettingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    if not app_set:
        app_set = AppSettings()
        db.add(app_set)
    app_set.auto_backup_enabled = bool(req.auto_backup_enabled)
    app_set.auto_backup_time = req.auto_backup_time.strip() or "20:00"
    app_set.rclone_remote_name = req.rclone_remote_name.strip() or "gdrive"
    app_set.rclone_backup_path = req.rclone_backup_path.strip() or "MARG_Backups"
    db.commit()
    return {"message": "Backup settings updated successfully"}

@app.post("/api/backup/run")
def trigger_backup_now(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    remote_name = getattr(app_set, "rclone_remote_name", "gdrive") or "gdrive"
    backup_path = getattr(app_set, "rclone_backup_path", "MARG_Backups") or "MARG_Backups"
    result = perform_rclone_backup(db, remote_name=remote_name, backup_path=backup_path)
    return result

# ==========================================
# 8B. GOOGLE DRIVE & GMAIL WEBHOOK API (OPTION 1)
# 100% Free, Zero OAuth2, Super Admin / Admin / Owner Only
# ==========================================

@app.get("/api/gdrive/settings")
def get_gdrive_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    return {
        "gdrive_webhook_url": getattr(app_set, "gdrive_webhook_url", "") or "",
        "gdrive_api_key": getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026") or "SHREEJI_SECRET_KEY_2026",
        "gdrive_backup_folder": getattr(app_set, "gdrive_backup_folder", "Shreeji_Healthcare_Backups") or "Shreeji_Healthcare_Backups",
        "gdrive_notify_email": getattr(app_set, "gdrive_notify_email", "shreejiseven@gmail.com") or "shreejiseven@gmail.com",
        "last_backup_time": app_set.last_backup_time.strftime("%d-%m-%Y %I:%M %p") if app_set and app_set.last_backup_time else None,
        "last_backup_status": getattr(app_set, "last_backup_status", None) if app_set else None
    }

@app.put("/api/gdrive/settings")
def update_gdrive_settings(
    req: GDriveSettingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    if not app_set:
        app_set = AppSettings()
        db.add(app_set)
    app_set.gdrive_webhook_url = (req.gdrive_webhook_url or "").strip()
    app_set.gdrive_api_key = (req.gdrive_api_key or "").strip()
    app_set.gdrive_backup_folder = (req.gdrive_backup_folder or "Shreeji_Healthcare_Backups").strip()
    app_set.gdrive_notify_email = (req.gdrive_notify_email or "shreejiseven@gmail.com").strip()
    db.commit()
    return {"message": "Google Drive & Gmail webhook settings saved successfully"}

@app.post("/api/gdrive/test")
def test_gdrive_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured. Please paste your deployed Web App URL in settings.")
    res = gdrive_service.test_connection(webhook_url, api_key)
    return res

@app.post("/api/gdrive/backup/run")
def trigger_gdrive_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    folder_name = getattr(app_set, "gdrive_backup_folder", "Shreeji_Healthcare_Backups") or "Shreeji_Healthcare_Backups"
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured in Settings.")

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    filename, zip_bytes = gdrive_service.create_envelope_backup_archive(db, base_dir=base_dir)

    upload_res = gdrive_service.upload_backup(
        webhook_url=webhook_url,
        api_key=api_key,
        filename=filename,
        content_bytes=zip_bytes,
        mime_type="application/zip",
        folder_name=folder_name
    )

    now = datetime.datetime.now()
    if app_set:
        app_set.last_backup_time = now
        if upload_res.get("success"):
            app_set.last_backup_status = f"Success: {filename} uploaded to GDrive"
        else:
            app_set.last_backup_status = f"Failed: {upload_res.get('error', 'Unknown error')}"
        db.commit()

    return {
        "success": upload_res.get("success", False),
        "filename": filename,
        "size_kb": round(len(zip_bytes) / 1024, 2),
        "gdrive_response": upload_res
    }

@app.get("/api/gdrive/backups")
def list_gdrive_backups(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    folder_name = getattr(app_set, "gdrive_backup_folder", "Shreeji_Healthcare_Backups") or "Shreeji_Healthcare_Backups"
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured in Settings.")

    res = gdrive_service.list_backups(webhook_url, api_key, folder_name=folder_name)
    return res

@app.post("/api/gdrive/restore")
def restore_gdrive_backup(
    req: GDriveRestoreRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured.")

    dl_res = gdrive_service.download_backup(webhook_url, api_key, req.file_id)
    if not dl_res.get("success") or not dl_res.get("raw_bytes"):
        raise HTTPException(status_code=400, detail=f"Failed to download backup from Google Drive: {dl_res.get('error')}")

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    restore_res = gdrive_service.restore_envelope_backup(db, dl_res["raw_bytes"], base_dir=base_dir)
    return restore_res

@app.post("/api/gmail/send-invoice")
def send_gmail_invoice(
    req: SendGmailInvoiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    sender = db.query(SenderSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured in Settings.")

    party = None
    if req.party_id:
        party = db.query(Party).filter(Party.id == req.party_id).first()
    elif req.party_name:
        party = db.query(Party).filter(Party.name.ilike(req.party_name.strip())).first()

    to_addr = req.to_email or (party.email if party and party.email else None) or getattr(app_set, "gdrive_notify_email", "shreejiseven@gmail.com")
    if not to_addr:
        to_addr = "shreejiseven@gmail.com"

    company_name = sender.company_name if sender else "SHREEJI HEALTHCARE"
    subject = f"Invoice / Dispatch Details: {req.invoice_no or 'Dispatch'} - {req.party_name or (party.name if party else 'Valued Client')}"
    
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: #2563eb; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">{company_name}</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Dispatch & Invoice Notification</p>
      </div>
      <div style="padding: 24px; color: #1e293b;">
        <p>Dear <strong>{req.party_name or (party.name if party else 'Valued Customer')}</strong>,</p>
        <p>Your consignment / invoice details are provided below:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Party Name</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.party_name or (party.name if party else '-')}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Invoice No.</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.invoice_no or 'N/A'}</td></tr>
          <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Invoice Date</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.invoice_date or datetime.date.today().strftime('%d/%m/%Y')}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Cases / Boxes</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.cases or 1}</td></tr>
          <tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Transport / Courier</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.transport or 'Direct Transport'}</td></tr>
          {f'<tr style="background: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Notes</td><td style="padding: 10px; border: 1px solid #e2e8f0;">{req.notes}</td></tr>' if req.notes else ''}
        </table>
        {f'<p style="font-size: 13px; color: #64748b;">Delivery Address: {party.address}, {party.city}, {party.state} - {party.pincode or ""}</p>' if party else ''}
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
          Sent automatically via Shreeji Healthcare Dispatch System.
        </div>
      </div>
    </div>
    """

    res = gdrive_service.send_email(
        webhook_url=webhook_url,
        api_key=api_key,
        to_email=to_addr,
        subject=subject,
        body_html=html
    )
    return res

@app.post("/api/gmail/send-dispatch-summary")
def send_gmail_dispatch_summary(
    req: SendGmailDispatchSummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    sender = db.query(SenderSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured in Settings.")

    to_addr = req.to_email or getattr(app_set, "gdrive_notify_email", "shreejiseven@gmail.com")
    jobs_raw = db.query(PrintJob).order_by(PrintJob.created_at.desc(), PrintJob.id.desc()).limit(req.limit or 100).all()
    seen_parties = set()
    jobs = []
    for j in jobs_raw:
        party_key = j.party_id if j.party_id else (j.party_name_snap or "").strip().upper()
        day_str = j.created_at.strftime("%Y-%m-%d") if j.created_at else ""
        if (party_key, day_str) not in seen_parties:
            seen_parties.add((party_key, day_str))
            jobs.append(j)

    company_name = sender.company_name if sender else "SHREEJI HEALTHCARE"
    subject = f"Dispatch Summary Report ({len(jobs)} items) - {datetime.date.today().strftime('%d/%m/%Y')}"

    rows_html = ""
    for j in jobs:
        created_str = j.created_at.strftime("%d/%m %I:%M %p") if j.created_at else "-"
        rows_html += f"""
        <tr>
          <td style="padding: 8px; border: 1px solid #e2e8f0; font-size: 12px;">{created_str}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; font-size: 13px;">{j.party_name}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0; font-size: 12px;">{j.city or '-'}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-size: 12px;">{j.total_cases or 1}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0; font-size: 12px;">{j.transport or '-'}</td>
        </tr>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 750px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 20px;">
        <h2 style="margin: 0;">{company_name} - Dispatch Summary</h2>
        <p style="margin: 5px 0 0 0; font-size: 13px; color: #94a3b8;">Generated on {datetime.datetime.now().strftime('%d/%m/%Y %I:%M %p')} | Total Records: {len(jobs)}</p>
      </div>
      <div style="padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left; font-size: 12px; color: #475569;">
              <th style="padding: 8px; border: 1px solid #e2e8f0;">Date/Time</th>
              <th style="padding: 8px; border: 1px solid #e2e8f0;">Party Name</th>
              <th style="padding: 8px; border: 1px solid #e2e8f0;">City</th>
              <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">Cases</th>
              <th style="padding: 8px; border: 1px solid #e2e8f0;">Transport</th>
            </tr>
          </thead>
          <tbody>
            {rows_html}
          </tbody>
        </table>
      </div>
    </div>
    """

    res = gdrive_service.send_email(
        webhook_url=webhook_url,
        api_key=api_key,
        to_email=to_addr,
        subject=subject,
        body_html=html
    )
    return res

@app.post("/api/gmail/send-parties-list")
def send_gmail_parties_list(
    req: SendGmailPartiesListRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    app_set = db.query(AppSettings).first()
    sender = db.query(SenderSettings).first()
    webhook_url = getattr(app_set, "gdrive_webhook_url", "")
    api_key = getattr(app_set, "gdrive_api_key", "SHREEJI_SECRET_KEY_2026")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Google Apps Script Webhook URL is not configured in Settings.")

    to_addr = req.to_email or getattr(app_set, "gdrive_notify_email", "shreejiseven@gmail.com")
    parties = db.query(Party).filter(Party.is_active == True).order_by(Party.name.asc()).all()

    company_name = sender.company_name if sender else "SHREEJI HEALTHCARE"
    subject = f"Master Parties Directory ({len(parties)} Parties) - {company_name}"

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(["ID", "Party Name", "City", "State", "Phone", "Mobile", "Email", "GST No", "DL No"])
    for p in parties:
        writer.writerow([p.id, p.name, p.city or "", p.state or "", p.phone or "", p.mobile or "", p.email or "", p.gst_no or "", p.dl_no or ""])

    csv_bytes = csv_buffer.getvalue().encode("utf-8")

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: #16a34a; color: #ffffff; padding: 20px;">
        <h2 style="margin: 0;">{company_name} - Parties Directory</h2>
        <p style="margin: 5px 0 0 0; font-size: 13px;">Full active client list attached as CSV ({len(parties)} accounts)</p>
      </div>
      <div style="padding: 24px; color: #1e293b;">
        <p>Dear Management,</p>
        <p>Please find attached the latest active parties directory containing <strong>{len(parties)}</strong> parties.</p>
        <p>You can open the attached CSV file in Microsoft Excel or Google Sheets.</p>
      </div>
    </div>
    """

    res = gdrive_service.send_email(
        webhook_url=webhook_url,
        api_key=api_key,
        to_email=to_addr,
        subject=subject,
        body_html=html,
        attachments=[{
            "filename": f"Parties_List_{datetime.date.today().strftime('%Y%m%d')}.csv",
            "content_bytes": csv_bytes,
            "mimeType": "text/csv"
        }]
    )
    return res

# ==========================================
# 9. GEMINI AI TRANSLATION & SMART PARSER
# ==========================================

class TranslatePartyRequest(BaseModel):
    party_id: Optional[int] = None
    party_name: str
    address: str
    address_line_2: Optional[str] = None
    address_line_3: Optional[str] = None
    city: str
    state: str
    save_to_party: bool = True

class ParseMargTextRequest(BaseModel):
    raw_text: str

class BatchTranslatePartiesRequest(BaseModel):
    party_ids: List[int]

@app.post("/api/ai/test")
def test_gemini_connection(payload: Optional[Dict[str, Any]] = None, db: Session = Depends(get_db)):
    """Tests connection to Google Gemini API using stored or custom API key."""
    key = None
    if payload and payload.get("api_key"):
        key = payload["api_key"].strip()
    else:
        app_set = db.query(AppSettings).first()
        if app_set and app_set.gemini_api_key:
            key = app_set.gemini_api_key.strip()
    return ai_service.test_connection(api_key=key)

@app.post("/api/ai/translate-party")
def translate_party_to_gujarati(req: TranslatePartyRequest, db: Session = Depends(get_db)):
    """Translates party name and address details from English to Gujarati using Gemini."""
    app_set = db.query(AppSettings).first()
    key = app_set.gemini_api_key if app_set else None

    # Check if party exists and already has translation
    if req.party_id:
        p = db.query(Party).filter(Party.id == req.party_id).first()
        if p and p.party_name_gu and not req.save_to_party:
            return {
                "party_name_gu": p.party_name_gu,
                "address_gu": p.address_gu or "",
                "address_line_2_gu": p.address_line_2_gu or "",
                "address_line_3_gu": p.address_line_3_gu or "",
                "city_gu": p.city_gu or "",
                "state_gu": p.state_gu or ""
            }

    tr = ai_service.translate_party_to_gujarati(
        party_name=req.party_name,
        address=req.address,
        city=req.city,
        state=req.state,
        address_line_2=req.address_line_2,
        address_line_3=req.address_line_3,
        api_key=key
    )

    if req.party_id and req.save_to_party:
        p = db.query(Party).filter(Party.id == req.party_id).first()
        if p:
            p.party_name_gu = tr.get("party_name_gu")
            p.address_gu = tr.get("address_gu")
            p.address_line_2_gu = tr.get("address_line_2_gu")
            p.address_line_3_gu = tr.get("address_line_3_gu")
            p.city_gu = tr.get("city_gu")
            p.state_gu = tr.get("state_gu")
            db.commit()

    return tr

@app.post("/api/ai/parse-text")
def parse_unstructured_marg_text(req: ParseMargTextRequest, db: Session = Depends(get_db)):
    """Intelligently parses unstructured MARG invoice / party clipboard text into structured fields."""
    if not req.raw_text or not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    app_set = db.query(AppSettings).first()
    key = app_set.gemini_api_key if app_set else None
    try:
        data = ai_service.parse_unstructured_marg_data(req.raw_text, api_key=key)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/batch-translate")
def batch_translate_parties(req: BatchTranslatePartiesRequest, db: Session = Depends(get_db)):
    """Batch translates multiple parties to Gujarati for bulk printing rapidly."""
    app_set = db.query(AppSettings).first()
    key = app_set.gemini_api_key if app_set else None
    parties = db.query(Party).filter(Party.id.in_(req.party_ids)).all()

    parties_dicts = [
        {
            "id": p.id,
            "party_name": p.party_name,
            "address": p.address,
            "address_line_2": p.address_line_2,
            "address_line_3": p.address_line_3,
            "city": p.city,
            "state": p.state,
            "party_name_gu": p.party_name_gu,
            "address_gu": p.address_gu
        }
        for p in parties
    ]

    translations = ai_service.batch_translate_parties_fast(parties_dicts, api_key=key)

    for p in parties:
        tr = translations.get(p.id)
        if tr:
            if not p.party_name_gu and tr.get("party_name_gu"):
                p.party_name_gu = tr.get("party_name_gu")
            if not p.address_gu and tr.get("address_gu"):
                p.address_gu = tr.get("address_gu")
            if tr.get("address_line_2_gu"):
                p.address_line_2_gu = tr.get("address_line_2_gu")
            if tr.get("address_line_3_gu"):
                p.address_line_3_gu = tr.get("address_line_3_gu")
            if not p.city_gu and tr.get("city_gu"):
                p.city_gu = tr.get("city_gu")
            if not p.state_gu and tr.get("state_gu"):
                p.state_gu = tr.get("state_gu")

    db.commit()
    return {"success": True, "translations": translations}

@app.post("/api/ai/translate-background")
@app.post("/api/parties-translate/start")
@app.post("/api/parties/translate-all")
def trigger_background_translation(force: bool = False):
    """Starts background Google translation for untranslated parties (or all if force=True) without requiring an API key."""
    started = ai_service.start_background_translation_worker(SessionLocal, force=force)
    return {
        "success": True,
        "started": started,
        "message": f"Background translation {'(full force re-translate)' if force else ''} started with Google Translator (no API required)" if started else "Background translation is already active"
    }

@app.get("/api/ai/translate-status")
@app.get("/api/parties-translate/status")
@app.get("/api/parties/translate-status")
def get_translation_status():
    """Gets current status of background Google translation."""
    return ai_service.get_background_translation_status()

@app.get("/api/ai/brain-status")
def get_ai_brain_status(db: Session = Depends(get_db)):
    """Returns Dual AI Brain core status: Big Brain (OpenAI) + Small Brains (Gemini multi-key pool)."""
    gemini_status = ai_service.get_brain_status()
    openai_status = openai_service.get_brain_status()
    return {
        "status": "active",
        "architecture": "dual_brain",
        "big_brain": {
            "role": "Master UI Design, PDF Print Layout Control, Dashboard Intelligence, Assistant Chat",
            "provider": "OpenAI ChatGPT",
            **openai_status
        },
        "small_brains": {
            "role": "High-Speed Batch Gujarati Translations, Address Parsing, Data Support",
            "provider": "Google Gemini (Multi-Key Pool)",
            **gemini_status
        }
    }

@app.post("/api/ai/openai/test")
@app.post("/api/ai/big-brain/test")
def test_openai_key(req: Optional[OpenAITestKeyRequest] = None, db: Session = Depends(get_db)):
    """Tests connectivity to OpenAI Big Brain API."""
    key = None
    if req and req.api_key:
        key = req.api_key.strip()
    else:
        app_set = db.query(AppSettings).first()
        if app_set and getattr(app_set, "openai_api_key", None):
            key = app_set.openai_api_key.strip()
    return openai_service.test_connection(api_key=key)

@app.post("/api/ai/big-brain/ui-control")
def big_brain_ui_control(req: BigBrainUiControlRequest, db: Session = Depends(get_db)):
    """OpenAI Big Brain analyzes print layout & recipient data to recommend optimal font scaling, margins, and template layout."""
    app_set = db.query(AppSettings).first()
    key = req.api_key or (getattr(app_set, "openai_api_key", None) if app_set else None)
    party_dict = req.party_data or {}
    res = openai_service.analyze_ui_layout_control(
        party_data=party_dict,
        template_format=req.template_format,
        language=req.language,
        envelopes_per_page=req.envelopes_per_page,
        api_key=key
    )
    return {"success": True, "ui_control": res}

@app.post("/api/ai/big-brain/dashboard-insights")
def big_brain_dashboard_insights(req: BigBrainInsightsRequest, db: Session = Depends(get_db)):
    """OpenAI Big Brain synthesizes executive dashboard logistics intelligence and route suggestions."""
    app_set = db.query(AppSettings).first()
    key = req.api_key or (getattr(app_set, "openai_api_key", None) if app_set else None)
    stats_dict = req.stats_data or {}
    res = openai_service.generate_dashboard_intelligence(
        stats_data=stats_dict,
        api_key=key
    )
    return {"success": True, "insights": res}

from fastapi.security import OAuth2PasswordRequestForm

@app.post("/api/auth/login", response_model=Token)
async def login(request: Request, db: Session = Depends(get_db)):
    username = ""
    password = ""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                username = (body.get("username") or "").strip()
                password = body.get("password") or ""
        except Exception:
            pass

    if not username and not password:
        try:
            form = await request.form()
            username = (form.get("username") or "").strip()
            password = form.get("password") or ""
        except Exception:
            pass

    raw_user = username.strip() if username else ""
    user = db.query(User).filter(func.lower(User.username) == func.lower(raw_user)).first()
    
    # Auto-seed or sync standard role accounts
    if raw_user.lower() == "owner" and password == "Aryan@2007":
        if not user:
            user = User(
                username="owner",
                password_hash=auth_module.get_password_hash("Aryan@2007"),
                role="super_admin",
                permissions='["create_job", "save_job"]',
                full_name="Owner"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash("Aryan@2007")
            user.role = "super_admin"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() == "driver" and password in ["driver123", "Aryan@2007"]:
        if not user:
            user = User(
                username="driver",
                password_hash=auth_module.get_password_hash("driver123"),
                role="driver",
                permissions='["create_job"]',
                full_name="Driver"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash("driver123")
            user.role = "driver"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() == "employee" and password in ["employee123", "Aryan@2007"]:
        if not user:
            user = User(
                username="employee",
                password_hash=auth_module.get_password_hash("employee123"),
                role="employee",
                permissions='["create_job"]',
                full_name="Staff"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash("employee123")
            user.role = "employee"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() in ["shreeji7", "aryan007", "aryan180607"] and password == "Aryan@2007":
        if not user:
            user = User(
                username="Aryan180607" if raw_user.lower() == "aryan180607" else raw_user,
                password_hash=auth_module.get_password_hash("Aryan@2007"),
                role="super_admin",
                permissions='["create_job", "save_job", "manage_users", "view_reports", "admin", "device_controls"]',
                full_name="Aryan Darji" if raw_user.lower() == "aryan180607" else ("Super Admin" if raw_user.lower() == "shreeji7" else "Admin")
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash("Aryan@2007")
            user.role = "super_admin"
            user.full_name = "Aryan Darji"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() in ["tushar@9263", "tushar9263"] and password in ["Shreeji@9263", "Aryan@2007"]:
        if not user:
            user = User(
                username="Tushar@9263",
                password_hash=auth_module.get_password_hash(password),
                role="owner",
                permissions='["create_job", "save_job", "manage_users", "view_reports", "admin"]',
                full_name="Tushar Patel"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash(password)
            user.role = "owner"
            user.full_name = "Tushar Patel"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() == "dinesh0001" and password in ["driver123", "Aryan@2007"]:
        if not user:
            user = User(
                username="dinesh0001",
                password_hash=auth_module.get_password_hash(password),
                role="driver",
                permissions='["create_job"]',
                full_name="Dinesh (Driver)"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash(password)
            user.role = "driver"
        db.commit()
        db.refresh(user)
    elif raw_user.lower() == "ramesh" and password in ["Password123!", "Aryan@2007", "1234"]:
        if not user:
            user = User(
                username="ramesh",
                password_hash=auth_module.get_password_hash(password),
                role="employee",
                permissions='["create_job"]',
                full_name="Ramesh Kumar"
            )
            db.add(user)
        else:
            user.password_hash = auth_module.get_password_hash(password)
            user.role = "employee"
        db.commit()
        db.refresh(user)

    if not user or not auth_module.verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    access_token_expires = datetime.timedelta(minutes=auth_module.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_module.create_access_token(
        data={"sub": user.username, "role": user.role, "permissions": user.permissions}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# -------------------------------------------------------------
# App Version & Auto-Update Endpoint
# -------------------------------------------------------------
@app.get("/api/app/version")
def get_app_version():
    return {
        "version": "2.4.0",
        "version_code": 240,
        "app_name": "MARG Envelope Manager",
        "apk_url": "/downloads/EnvelopeManager.apk",
        "release_notes": "SQLite WAL-flushed binary backup, 30-min auto restart watchdog, Scoped Storage all-files access, and resilient automatic APK installer.",
        "min_supported_version": 200,
        "published_at": datetime.datetime.now().isoformat()
    }

# -------------------------------------------------------------
# System Server Status, Auto-Update & Process Management
# -------------------------------------------------------------
import socket

def _get_system_base_dir() -> str:
    home_dir = os.path.expanduser("~")
    return os.path.join(home_dir, "shreeji")

@app.get("/api/system/server-status")
def get_system_server_status():
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_dir = _get_system_base_dir()
    auto_update_flag = os.path.join(base_dir, ".auto_update_disabled")
    
    # 1. Local Git Info
    try:
        current_commit = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=repo_dir, timeout=3).decode().strip()
        commit_date = subprocess.check_output(['git', 'log', '-1', '--format=%cd', '--date=relative'], cwd=repo_dir, timeout=3).decode().strip()
        commit_message = subprocess.check_output(['git', 'log', '-1', '--pretty=%s'], cwd=repo_dir, timeout=3).decode().strip()
    except Exception as e:
        current_commit, commit_date, commit_message = "unknown", "", str(e)

    # 2. Remote Git Info from GitHub
    try:
        ls_out = subprocess.check_output(['git', 'ls-remote', 'origin', 'refs/heads/main'], cwd=repo_dir, timeout=5).decode().strip()
        remote_commit = ls_out.split()[0][:7] if ls_out else current_commit
    except Exception:
        remote_commit = current_commit

    update_available = (current_commit != remote_commit) and (remote_commit != "unknown")

    # 3. Watchdog Process Status
    watchdog_running = False
    try:
        pg_out = subprocess.check_output(['pgrep', '-f', 'watchdog.sh']).decode().strip()
        watchdog_running = bool(pg_out)
    except Exception:
        watchdog_running = False

    # 4. Port Health Checks
    def _is_port_open(port: int) -> bool:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                return True
        except Exception:
            return False

    is_termux = os.path.exists("/data/data/com.termux") or "com.termux" in os.environ.get("PREFIX", "")

    return {
        "status": "healthy",
        "current_commit": current_commit,
        "commit_date": commit_date,
        "commit_message": commit_message,
        "remote_commit": remote_commit,
        "update_available": update_available,
        "auto_update_enabled": not os.path.exists(auto_update_flag),
        "watchdog_running": watchdog_running,
        "is_termux": is_termux,
        "ports": {
            "8080_envelope": _is_port_open(8080),
            "3000_orderbook": _is_port_open(3000),
            "5432_postgres": _is_port_open(5432),
        },
        "server_time": datetime.datetime.now().isoformat()
    }

@app.post("/api/system/toggle-auto-update")
def toggle_auto_update(payload: dict = Body(...)):
    enabled = payload.get("enabled", True)
    base_dir = _get_system_base_dir()
    os.makedirs(base_dir, exist_ok=True)
    auto_update_flag = os.path.join(base_dir, ".auto_update_disabled")
    
    if enabled:
        if os.path.exists(auto_update_flag):
            try:
                os.remove(auto_update_flag)
            except Exception:
                pass
        return {"success": True, "auto_update_enabled": True, "message": "Automatic updates every 2 minutes are now ENABLED."}
    else:
        try:
            with open(auto_update_flag, "w") as f:
                f.write(datetime.datetime.now().isoformat())
        except Exception:
            pass
        return {"success": True, "auto_update_enabled": False, "message": "Automatic updates paused. Updates will only happen when manually triggered."}

@app.post("/api/system/server-update")
def trigger_server_update():
    base_dir = _get_system_base_dir()
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    update_script = os.path.join(base_dir, "update.sh")
    repo_script = os.path.join(repo_dir, "scripts", "termux", "update.sh")

    if os.path.exists(update_script):
        cmd = f"bash {update_script}"
    elif os.path.exists(repo_script):
        cmd = f"bash {repo_script}"
    else:
        cmd = f"cd {repo_dir} && git fetch origin main && git reset --hard origin/main"

    try:
        subprocess.Popen(f"nohup {cmd} > /tmp/server_update.log 2>&1 &", shell=True, start_new_session=True)
        return {
            "success": True,
            "message": "Server update initiated in background! Pulling latest GitHub code and restarting services.",
            "estimated_restart_seconds": 8
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start update: {str(e)}")

@app.post("/api/system/server-restart")
def trigger_server_restart():
    base_dir = _get_system_base_dir()
    restart_script = os.path.join(base_dir, "restart-all.sh")
    if os.path.exists(restart_script):
        cmd = f"bash {restart_script}"
    else:
        cmd = "pkill -f 'uvicorn.*main:app'"

    try:
        subprocess.Popen(f"nohup {cmd} > /tmp/server_restart.log 2>&1 &", shell=True, start_new_session=True)
        return {
            "success": True,
            "message": "Server restart initiated. Back online in ~5 seconds.",
            "estimated_restart_seconds": 5
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger restart: {str(e)}")

# -------------------------------------------------------------
# Component 4: User-Wise Local Storage & Folder Management
# -------------------------------------------------------------
STORAGE_ROOT = os.environ.get("STORAGE_ROOT", os.path.expanduser("~/storage"))
os.makedirs(STORAGE_ROOT, exist_ok=True)
os.makedirs(os.path.join(STORAGE_ROOT, "users"), exist_ok=True)

def _format_bytes(bytes_count: int) -> str:
    if bytes_count <= 0:
        return "0 B"
    val = float(bytes_count)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if val < 1024.0:
            return f"{val:.1f} {unit}"
        val /= 1024.0
    return f"{val:.1f} PB"

def _get_user_storage_path(user: User, requested_path: str = "") -> str:
    clean_subpath = (requested_path or "").strip().lstrip("/\\")
    
    # If super_admin, they can access anything under STORAGE_ROOT
    if user.role == "super_admin":
        full_path = os.path.abspath(os.path.join(STORAGE_ROOT, clean_subpath))
    else:
        # Sandboxed to users/{user.username}
        user_root = os.path.abspath(os.path.join(STORAGE_ROOT, "users", user.username))
        os.makedirs(user_root, exist_ok=True)
        
        user_prefix = f"users/{user.username}"
        if clean_subpath == user_prefix:
            full_path = user_root
        elif clean_subpath.startswith(user_prefix + "/"):
            rel = clean_subpath[len(user_prefix) + 1:]
            full_path = os.path.abspath(os.path.join(user_root, rel))
        else:
            full_path = os.path.abspath(os.path.join(user_root, clean_subpath))

        if not full_path.startswith(user_root):
            raise HTTPException(status_code=403, detail="Access denied: Sandboxed to your personal storage")

    if not full_path.startswith(os.path.abspath(STORAGE_ROOT)):
        raise HTTPException(status_code=400, detail="Invalid path or directory traversal detected")
    return full_path

@app.get("/api/storage/users-summary")
def get_users_storage_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_user)
):
    users_dir = os.path.join(STORAGE_ROOT, "users")
    os.makedirs(users_dir, exist_ok=True)
    
    # Disk usage of host/phone
    try:
        du = shutil.disk_usage(STORAGE_ROOT)
        host_disk = {
            "total_bytes": du.total,
            "used_bytes": du.used,
            "free_bytes": du.free,
            "total_formatted": _format_bytes(du.total),
            "free_formatted": _format_bytes(du.free),
            "used_formatted": _format_bytes(du.used),
            "percent_used": round((du.used / du.total) * 100, 1) if du.total > 0 else 0
        }
    except Exception:
        host_disk = {
            "total_bytes": 0, "used_bytes": 0, "free_bytes": 0,
            "total_formatted": "N/A", "free_formatted": "N/A", "used_formatted": "N/A",
            "percent_used": 0
        }

    # If user is not super_admin, return only current user's summary
    if current_user.role != "super_admin":
        users_list = [current_user]
    else:
        users_list = db.query(User).filter(User.is_active == True).all()

    summary_list = []
    total_app_bytes = 0

    for u in users_list:
        u_folder = os.path.join(users_dir, u.username)
        os.makedirs(u_folder, exist_ok=True)
        
        file_count = 0
        dir_count = 0
        total_size = 0
        latest_mtime = None

        try:
            for root, dirs, files in os.walk(u_folder):
                dir_count += len(dirs)
                for f in files:
                    file_count += 1
                    fp = os.path.join(root, f)
                    try:
                        st = os.stat(fp)
                        total_size += st.st_size
                        if latest_mtime is None or st.st_mtime > latest_mtime:
                            latest_mtime = st.st_mtime
                    except Exception:
                        pass
        except Exception:
            pass

        total_app_bytes += total_size
        rel_path = f"users/{u.username}"

        summary_list.append({
            "user_id": u.id,
            "username": u.username,
            "full_name": u.full_name or u.username,
            "role": u.role,
            "avatar_url": u.avatar_url,
            "path": rel_path,
            "file_count": file_count,
            "dir_count": dir_count,
            "size_bytes": total_size,
            "size_formatted": _format_bytes(total_size),
            "latest_modified": datetime.datetime.fromtimestamp(latest_mtime).isoformat() if latest_mtime else None,
            "is_current_user": u.id == current_user.id
        })

    summary_list.sort(key=lambda x: (x["role"] != "super_admin", -x["size_bytes"], x["full_name"].lower()))

    return {
        "host_disk": host_disk,
        "total_app_bytes": total_app_bytes,
        "total_app_size_formatted": _format_bytes(total_app_bytes),
        "total_users": len(summary_list),
        "current_user_role": current_user.role,
        "is_super_admin": current_user.role == "super_admin",
        "current_username": current_user.username,
        "users": summary_list
    }

@app.get("/api/storage/list")
def list_storage_contents(
    path: str = "",
    current_user: User = Depends(auth_module.get_current_user)
):
    target = _get_user_storage_path(current_user, path)
    if not os.path.exists(target):
        return {"items": [], "current_path": path, "error": "Directory does not exist"}
    if not os.path.isdir(target):
        raise HTTPException(status_code=400, detail="Target path is not a directory")

    items = []
    try:
        for entry in os.scandir(target):
            try:
                stat = entry.stat()
                rel_path = os.path.relpath(entry.path, STORAGE_ROOT)
                items.append({
                    "name": entry.name,
                    "path": rel_path.replace("\\", "/"),
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size if entry.is_file() else 0,
                    "size_formatted": _format_bytes(stat.st_size) if entry.is_file() else "Folder",
                    "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
            except Exception:
                continue
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan directory: {str(e)}")

    # Sort directories first, then alphabetically
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    rel_current = os.path.relpath(target, STORAGE_ROOT).replace("\\", "/")
    if rel_current == ".":
        rel_current = ""

    return {
        "current_path": rel_current,
        "items": items,
        "root": STORAGE_ROOT,
        "is_super_admin": current_user.role == "super_admin",
        "current_username": current_user.username
    }

class MkdirPayload(BaseModel):
    path: str = ""
    folder_name: str

@app.post("/api/storage/mkdir")
def make_storage_folder(
    payload: MkdirPayload,
    current_user: User = Depends(auth_module.get_current_user)
):
    folder_name = payload.folder_name.strip()
    if not folder_name or "/" in folder_name or "\\" in folder_name or ".." in folder_name:
        raise HTTPException(status_code=400, detail="Invalid folder name")

    parent = _get_user_storage_path(current_user, payload.path)
    new_dir = os.path.join(parent, folder_name)
    try:
        os.makedirs(new_dir, exist_ok=True)
        return {
            "success": True,
            "message": f"Folder '{folder_name}' created successfully",
            "path": os.path.relpath(new_dir, STORAGE_ROOT).replace("\\", "/")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {str(e)}")

@app.post("/api/storage/upload")
async def upload_storage_file(
    path: str = Form(""),
    file: UploadFile = File(...),
    current_user: User = Depends(auth_module.get_current_user)
):
    parent = _get_user_storage_path(current_user, path)
    os.makedirs(parent, exist_ok=True)
    filename = os.path.basename(file.filename)
    dest_path = os.path.join(parent, filename)
    try:
        contents = await file.read()
        with open(dest_path, "wb") as f:
            f.write(contents)
        return {
            "success": True,
            "message": f"File '{filename}' uploaded successfully",
            "size": len(contents),
            "size_formatted": _format_bytes(len(contents)),
            "path": os.path.relpath(dest_path, STORAGE_ROOT).replace("\\", "/")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

@app.delete("/api/storage/item")
def delete_storage_item(
    path: str,
    current_user: User = Depends(auth_module.get_current_user)
):
    target = _get_user_storage_path(current_user, path)
    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="File or folder not found")
    if target == os.path.abspath(STORAGE_ROOT) or target == os.path.abspath(os.path.join(STORAGE_ROOT, "users")):
        raise HTTPException(status_code=400, detail="Cannot delete root storage directory")

    try:
        if os.path.isdir(target):
            shutil.rmtree(target)
        else:
            os.remove(target)
        return {"success": True, "message": "Item deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete item: {str(e)}")

@app.get("/api/storage/download")
def download_storage_file(
    path: str,
    current_user: User = Depends(auth_module.get_current_user)
):
    target = _get_user_storage_path(current_user, path)
    if not os.path.exists(target) or not os.path.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=os.path.basename(target))

# -------------------------------------------------------------
# Component 5: Emergency Voice & Video WebRTC Direct Calling
# -------------------------------------------------------------
ACTIVE_EMERGENCY_CALLS = {}

class InitiateCallPayload(BaseModel):
    mode: str = "video" # "video" or "voice"
    target_user: Optional[str] = "all"
    sdp_offer: str
    caller_name: Optional[str] = "Admin Dispatch"

class AnswerCallPayload(BaseModel):
    session_id: str
    sdp_answer: str
    receiver_name: Optional[str] = "Staff"

class CandidatePayload(BaseModel):
    session_id: str
    sender: str # "caller" or "receiver"
    candidate: dict

@app.post("/api/emergency-call/initiate")
def initiate_emergency_call(
    payload: InitiateCallPayload,
    current_user: User = Depends(auth_module.get_current_active_admin)
):
    session_id = f"call_{int(datetime.datetime.now().timestamp() * 1000)}"
    ACTIVE_EMERGENCY_CALLS[session_id] = {
        "session_id": session_id,
        "caller_id": current_user.id,
        "caller_name": payload.caller_name or current_user.full_name or current_user.username,
        "caller_role": current_user.role,
        "mode": payload.mode,
        "target_user": payload.target_user or "all",
        "sdp_offer": payload.sdp_offer,
        "sdp_answer": None,
        "caller_candidates": [],
        "receiver_candidates": [],
        "status": "ringing",
        "created_at": datetime.datetime.now().isoformat(),
        "active": True
    }
    return {
        "success": True,
        "session_id": session_id,
        "status": "ringing"
    }

@app.get("/api/emergency-call/poll")
def poll_emergency_call(target: str = "all"):
    # Clean up calls older than 5 minutes
    now = datetime.datetime.now()
    expired = [
        sid for sid, call in ACTIVE_EMERGENCY_CALLS.items()
        if (now - datetime.datetime.fromisoformat(call["created_at"])).total_seconds() > 300
    ]
    for sid in expired:
        ACTIVE_EMERGENCY_CALLS.pop(sid, None)

    for sid, call in ACTIVE_EMERGENCY_CALLS.items():
        if call.get("active") and call.get("status") in ["ringing", "connected"]:
            if call.get("target_user") in ["all", target]:
                return {
                    "has_call": True,
                    "call": call
                }

    return {"has_call": False}

@app.post("/api/emergency-call/answer")
def answer_emergency_call(payload: AnswerCallPayload):
    call = ACTIVE_EMERGENCY_CALLS.get(payload.session_id)
    if not call or not call.get("active"):
        raise HTTPException(status_code=404, detail="Active call session not found")

    call["sdp_answer"] = payload.sdp_answer
    call["receiver_name"] = payload.receiver_name
    call["status"] = "connected"
    return {"success": True, "status": "connected"}

@app.post("/api/emergency-call/candidate")
def post_call_candidate(payload: CandidatePayload):
    call = ACTIVE_EMERGENCY_CALLS.get(payload.session_id)
    if not call or not call.get("active"):
        raise HTTPException(status_code=404, detail="Call not found")

    if payload.sender == "caller":
        call.setdefault("caller_candidates", []).append(payload.candidate)
    else:
        call.setdefault("receiver_candidates", []).append(payload.candidate)

    return {"success": True}

@app.get("/api/emergency-call/status")
def get_call_status(session_id: str):
    call = ACTIVE_EMERGENCY_CALLS.get(session_id)
    if not call:
        return {"active": False, "status": "ended"}
    return call

@app.post("/api/emergency-call/end")
def end_emergency_call(payload: dict):
    session_id = payload.get("session_id")
    if session_id and session_id in ACTIVE_EMERGENCY_CALLS:
        ACTIVE_EMERGENCY_CALLS[session_id]["active"] = False
        ACTIVE_EMERGENCY_CALLS[session_id]["status"] = "ended"
        return {"success": True, "message": "Call ended"}
    return {"success": False, "message": "Call not found"}


@app.get("/api/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(auth_module.get_current_user)):
    return current_user

@app.get("/api/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(auth_module.get_current_active_admin)):
    return db.query(User).all()

@app.post("/api/users", response_model=UserResponse)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(auth_module.get_current_active_admin)):
    existing_user = db.query(User).filter(User.username == user_in.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    new_user = User(
        username=user_in.username,
        password_hash=auth_module.get_password_hash(user_in.password),
        role=user_in.role,
        permissions=user_in.permissions,
        full_name=user_in.full_name,
        email=user_in.email,
        avatar_url=user_in.avatar_url
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_in: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(auth_module.get_current_active_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_in.password:
        user.password_hash = auth_module.get_password_hash(user_in.password)
    if user_in.role is not None:
        user.role = user_in.role
    if user_in.permissions is not None:
        user.permissions = user_in.permissions
    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.email is not None:
        user.email = user_in.email
    if user_in.avatar_url is not None:
        user.avatar_url = user_in.avatar_url
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
        
    db.commit()
    db.refresh(user)
    return user

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(auth_module.get_current_active_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
    db.delete(user)
    db.commit()
    return {"success": True, "message": "User deleted successfully"}

@app.post("/api/ai/parse-smart")
def parse_smart_text(req: AIParseSmartRequest):
    """Parses messy unstructured invoice/bill text into structured party and envelope fields."""
    try:
        res = ai_service.parse_unstructured_marg_data(req.text)
        return {"success": True, "data": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/clean-address")
def clean_address(req: AICleanAddressRequest):
    """Cleans and standardizes an address into Line 1, 2, 3, City, State without PIN."""
    res = ai_service.clean_party_address_ai(req.address, req.city, req.state)
    return {"success": True, "data": res}

@app.post("/api/ai/optimize-routes")
def optimize_routes(req: AIOptimizeRoutesRequest):
    """Clusters and groups party deliveries into optimal dispatch routes."""
    res = ai_service.optimize_delivery_routes_ai(req.parties)
    return {"success": True, "data": res}

@app.post("/api/ai/test-key")
def test_gemini_key(req: AITestKeyRequest):
    """Tests connectivity to Google Gemini API using provided or default key pool."""
    res = ai_service.test_connection(req.api_key)
    return res

# -------------------------------------------------------------------------
# Component 6: Super Admin Exclusive Hardware & Device Controls
# -------------------------------------------------------------------------
class DeviceControlUpdatePayload(BaseModel):
    user_id: int
    storage_access: Optional[bool] = True
    storage_quota_mb: Optional[int] = 1024
    camera_access: Optional[bool] = True
    camera_mode: Optional[str] = "rear_and_front"
    mic_access: Optional[bool] = True
    mic_mode: Optional[str] = "emergency_only"
    remote_locked: Optional[bool] = False
    tracking_enabled: Optional[bool] = True

@app.get("/api/admin/device-controls")
def get_admin_device_controls(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_user)
):
    """Returns hardware permissions for all users. STRICT: Super Admin Aryan Darji only."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Only Super Admin Aryan Darji (Aryan180607) has permission to manage device hardware, storage, camera, and microphone controls. Owner access is strictly forbidden."
        )

    users = db.query(User).all()
    devices = []
    for u in users:
        dc = {
            "storage_access": True,
            "storage_quota_mb": 1024,
            "storage_used_mb": 42.5,
            "camera_access": True,
            "camera_mode": "rear_and_front",
            "mic_access": True,
            "mic_mode": "emergency_only",
            "remote_locked": False,
            "tracking_enabled": True
        }
        if u.device_controls_json:
            try:
                parsed = json.loads(u.device_controls_json)
                dc.update(parsed)
            except Exception:
                pass

        devices.append({
            "userId": u.id,
            "fullName": u.full_name or u.username,
            "username": u.username,
            "role": u.role,
            "email": u.email or "",
            "mobile": "9924544283" if u.username == "Aryan180607" else ("9876543210" if u.username == "Tushar9263" else "9876500000"),
            "userStatus": "active" if u.is_active else "inactive",
            "deviceName": "Android Field Mobile",
            "deviceModel": "Redmi / Samsung Galaxy",
            "osVersion": "Android 14",
            "appVersion": "1.2.0 Standalone APK",
            "storageAccess": dc.get("storage_access", True),
            "storageQuotaMb": dc.get("storage_quota_mb", 1024),
            "storageUsedMb": dc.get("storage_used_mb", 42.5),
            "cameraAccess": dc.get("camera_access", True),
            "cameraMode": dc.get("camera_mode", "rear_and_front"),
            "micAccess": dc.get("mic_access", True),
            "micMode": dc.get("mic_mode", "emergency_only"),
            "remoteLocked": dc.get("remote_locked", False),
            "trackingEnabled": dc.get("tracking_enabled", True),
            "lastSyncedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })

    return {
        "success": True,
        "authorizedSuperAdmin": "Aryan Darji (Aryan180607)",
        "totalDevices": len(devices),
        "devices": devices
    }

@app.post("/api/admin/device-controls")
def update_admin_device_controls(
    payload: DeviceControlUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_module.get_current_user)
):
    """Updates hardware permissions for a user. STRICT: Super Admin Aryan Darji only."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Only Super Admin Aryan Darji (Aryan180607) has permission to manage device hardware, storage, camera, and microphone controls. Owner access is strictly forbidden."
        )

    u = db.query(User).filter(User.id == payload.user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    dc = {
        "storage_access": payload.storage_access,
        "storage_quota_mb": payload.storage_quota_mb,
        "camera_access": payload.camera_access,
        "camera_mode": payload.camera_mode,
        "mic_access": payload.mic_access,
        "mic_mode": payload.mic_mode,
        "remote_locked": payload.remote_locked,
        "tracking_enabled": payload.tracking_enabled,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "updated_by": current_user.username
    }
    u.device_controls_json = json.dumps(dc)
    db.commit()

    return {
        "success": True,
        "message": f"Hardware permissions updated for {u.full_name or u.username}",
        "device": dc
    }

@app.get("/api/download/apk")
@app.get("/downloads/EnvelopeManager.apk")
def download_android_apk():
    """Serves the standalone Android APK installer."""
    apk_paths = [
        os.path.join(os.path.dirname(__file__), "static", "downloads", "EnvelopeManager.apk"),
        os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "downloads", "EnvelopeManager.apk"),
        os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "downloads", "EnvelopeManager.apk"),
        os.path.join(os.path.dirname(__file__), "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    ]
    for p in apk_paths:
        if os.path.exists(p):
            return FileResponse(
                path=p,
                filename="Shreeji_Envelope_Manager.apk",
                media_type="application/vnd.android.package-archive"
            )
    raise HTTPException(status_code=404, detail="APK build not found")


# --- Real-time User & Driver GPS Tracking (Only visible to Admin & Super Admin) ---
live_user_locations: Dict[str, Dict[str, Any]] = {}

class LiveLocationPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    battery: Optional[int] = None
    speed: Optional[float] = None

@app.post("/api/users/live-location")
def update_user_live_location(
    req: LiveLocationPayload, 
    current_user: User = Depends(auth_module.get_current_user)
):
    """Updates user's real-time GPS location."""
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    live_user_locations[current_user.username] = {
        "username": current_user.username,
        "full_name": current_user.full_name or current_user.username,
        "role": current_user.role,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "accuracy": req.accuracy,
        "battery": req.battery,
        "speed": req.speed,
        "updated_at": now_dt.isoformat(),
        "timestamp": now_dt.timestamp()
    }
    return {"success": True, "username": current_user.username}

@app.get("/api/users/live-locations")
def get_users_live_locations(
    current_user: User = Depends(auth_module.get_current_user)
):
    """Returns active user locations. Strictly limited: only super_admin and admin can access."""
    user_role = (current_user.role or "").lower()
    if user_role not in ["super_admin", "admin"]:
        # Regular users and employees are forbidden from seeing other user locations
        return []

    now_sec = datetime.datetime.now(datetime.timezone.utc).timestamp()
    # Filter only locations received within the last 30 minutes
    active_list = []
    for uname, loc in list(live_user_locations.items()):
        if now_sec - loc.get("timestamp", 0) <= 1800:
            active_list.append(loc)
        else:
            live_user_locations.pop(uname, None)

    return active_list


# Custom static file server with immutable caching for fingerprinted assets
class CachedStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs) -> Response:
        resp = super().file_response(*args, **kwargs)
        path = args[0] if args else kwargs.get("full_path", "")
        # Fingerprinted Vite assets in /assets/ can be permanently cached by the browser
        if "assets" in str(path):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            resp.headers["Cache-Control"] = "no-cache"
        return resp

# Mount built React frontend if dist or backend/static exists
dist_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
static_dir = os.path.join(os.path.dirname(__file__), "static")

if os.path.exists(dist_dir) and os.path.exists(os.path.join(dist_dir, "index.html")):
    app.mount("/", CachedStaticFiles(directory=dist_dir, html=True), name="static")
elif os.path.exists(static_dir) and os.path.exists(os.path.join(static_dir, "index.html")):
    app.mount("/", CachedStaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
