import os
import io
import json
import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc

from database import engine, get_db, init_db, SessionLocal
from models import Party, SenderSettings, AppSettings, PrintJob, PrintCase, ImportJob, ImportErrorLog, User
import barcode_generator
import excel_service
import pdf_service
import ai_service
from pathlib import Path

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

# Enable CORS for frontend development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event to ensure database is created and seeded
@app.on_event("startup")
def startup_event():
    init_db()

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
    is_active: bool = True

class PartyCreate(PartyBase):
    pass

class PartyUpdate(PartyBase):
    pass

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
    delivery_route: Optional[str] = None
    template_format: Optional[str] = "attachment_pdf"
    language: Optional[str] = "en"
    party_name_gu: Optional[str] = None
    address_gu: Optional[str] = None
    address_line_2_gu: Optional[str] = None
    address_line_3_gu: Optional[str] = None
    city_gu: Optional[str] = None
    state_gu: Optional[str] = None
    allow_duplicate: bool = False

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
    delivery_route: Optional[str] = None
    template_format: Optional[str] = "attachment_pdf"
    language: Optional[str] = "en"

class UpdateDispatchJobsRequest(BaseModel):
    job_ids: List[int]
    delivery_boy_name: Optional[str] = None
    delivery_route: Optional[str] = None
    status: Optional[str] = None

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
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=-1),
    search: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    status: str = "all",
    db: Session = Depends(get_db)
):
    query = db.query(Party)

    if status == "active":
        query = query.filter(Party.is_active == True)
    elif status == "inactive":
        query = query.filter(Party.is_active == False)

    if state:
        query = query.filter(Party.state.ilike(f"%{state.strip()}%"))
    if city:
        query = query.filter(Party.city.ilike(f"%{city.strip()}%"))

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Party.party_name.ilike(s),
                Party.party_code.ilike(s),
                Party.mobile_no.ilike(s),
                Party.city.ilike(s),
                Party.address.ilike(s)
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
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "states": sorted(list(set(all_states))),
        "cities": sorted(list(set(all_cities)))
    }

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

    pattern = f"{clean_q}%" if mode == "starts_with" else f"%{clean_q}%"

    results = db.query(Party).filter(
        Party.is_active == True,
        or_(
            Party.party_name.ilike(pattern),
            Party.party_code.ilike(pattern),
            Party.mobile_no.ilike(f"%{clean_q}%"),
            Party.city.ilike(pattern)
        )
    ).order_by(Party.party_name.asc()).limit(20).all()

    return [
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
            "route": p.route
        }
        for p in results
    ]

@app.get("/api/parties/unprinted-today")
def get_unprinted_parties_today(
    unprinted_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # All party names printed today
    printed_today_parties = set(
        name for (name,) in db.query(PrintJob.party_name_snap).filter(
            PrintJob.created_at >= today_start
        ).all()
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
            "printed_today": is_printed
        })

    return {
        "items": results,
        "total": len(results),
        "total_unprinted": len([r for r in results if not r["printed_today"]]),
        "total_printed_today": len(printed_today_parties)
    }

@app.post("/api/parties", status_code=status.HTTP_201_CREATED)
def create_party(party_in: PartyCreate, db: Session = Depends(get_db)):
    if not party_in.party_name.strip():
        raise HTTPException(status_code=400, detail="Party Name is required")
    if not party_in.address.strip():
        raise HTTPException(status_code=400, detail="Address is required")
    if not party_in.city.strip():
        raise HTTPException(status_code=400, detail="City is required")
    if not party_in.state.strip():
        raise HTTPException(status_code=400, detail="State is required")

    # Check for duplicate code
    if party_in.party_code:
        dup = db.query(Party).filter(func.upper(Party.party_code) == party_in.party_code.strip().upper()).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Party Code '{party_in.party_code}' already exists")

    party = Party(
        party_name=party_in.party_name.strip().upper(),
        party_code=party_in.party_code.strip().upper() if party_in.party_code else None,
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
        party_name_gu=party_in.party_name_gu,
        address_gu=party_in.address_gu,
        address_line_2_gu=party_in.address_line_2_gu,
        address_line_3_gu=party_in.address_line_3_gu,
        city_gu=party_in.city_gu,
        state_gu=party_in.state_gu,
        route=party_in.route.strip().upper() if party_in.route else None,
        is_active=party_in.is_active
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party

@app.get("/api/parties/routes")
def get_all_routes(db: Session = Depends(get_db)):
    """Returns sorted unique routes assigned across parties and print jobs."""
    party_routes = [r[0].strip() for r in db.query(Party.route).distinct().filter(Party.route != None).all() if r[0] and r[0].strip()]
    job_routes = [r[0].strip() for r in db.query(PrintJob.delivery_route).distinct().filter(PrintJob.delivery_route != None).all() if r[0] and r[0].strip()]
    return sorted(list(set(party_routes + job_routes)))

@app.post("/api/parties/bulk-route")
def bulk_assign_party_route(req: BulkRouteRequest, db: Session = Depends(get_db)):
    """Bulk assigns delivery route to multiple selected parties."""
    if not req.party_ids:
        raise HTTPException(status_code=400, detail="party_ids cannot be empty")
    route_clean = req.route.strip().upper()
    if not route_clean:
        raise HTTPException(status_code=400, detail="Route name cannot be empty")

    updated = db.query(Party).filter(Party.id.in_(req.party_ids)).update(
        {"route": route_clean},
        synchronize_session=False
    )
    db.commit()
    return {"success": True, "updated_count": updated, "route": route_clean}

@app.post("/api/parties/bulk-delete")
def bulk_delete_parties(req: BulkDeletePartiesRequest, db: Session = Depends(get_db)):
    """Deletes multiple selected parties in a single transaction."""
    if not req.party_ids:
        return {"deleted_count": 0, "message": "No party IDs provided"}
    
    deleted = db.query(Party).filter(Party.id.in_(req.party_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted_count": deleted, "message": f"{deleted} parties deleted successfully"}

@app.post("/api/parties/delete-all")
@app.delete("/api/parties/all")
def delete_all_parties(db: Session = Depends(get_db)):
    """One-click deletion of all parties in the database."""
    total_count = db.query(Party).count()
    db.query(Party).delete(synchronize_session=False)
    db.commit()
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
def update_party(party_id: int, party_in: PartyUpdate, db: Session = Depends(get_db)):
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
    party.party_name_gu = party_in.party_name_gu
    party.address_gu = party_in.address_gu
    party.address_line_2_gu = party_in.address_line_2_gu
    party.address_line_3_gu = party_in.address_line_3_gu
    party.city_gu = party_in.city_gu
    party.state_gu = party_in.state_gu
    party.route = party_in.route.strip().upper() if party_in.route else None
    party.is_active = party_in.is_active

    db.commit()
    db.refresh(party)
    return party

@app.delete("/api/parties/{party_id}")
def delete_party(party_id: int, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    db.delete(party)
    db.commit()
    return {"message": f"Party '{party.party_name}' deleted successfully"}

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
        code = (r.get("party_code") or "").strip().upper() if r.get("party_code") else None
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

        if not name or not addr:
            error_count += 1
            err = ImportErrorLog(
                import_job_id=import_job.id,
                row_index=idx,
                party_name=name,
                party_code=code,
                error_reason="Missing required Party Name or Address"
            )
            db.add(err)
            continue

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
                    if mob: existing_party.mobile_no = mob
                    if land: existing_party.landline = land
                    if email: existing_party.email = email
                    if gst: existing_party.gst_no = gst
                    if notes: existing_party.notes = notes
                    updated_count += 1
                    updated_parties.append({
                        "party_name": name,
                        "party_code": code or "—",
                        "status": "Updated"
                    })
                    continue

        new_party = Party(
            party_name=name,
            party_code=code,
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

    return {
        "imported": imported_count,
        "skipped": skipped_count,
        "updated": updated_count,
        "duplicates": duplicate_count,
        "errors": error_count,
        "skipped_parties": skipped_parties,
        "updated_parties": updated_parties,
        "import_job_id": import_job.id
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
    current_year = datetime.datetime.now().year
    prefix = f"MRG-{current_year}-"
    last_job = db.query(PrintJob).filter(PrintJob.job_number.like(f"{prefix}%")).order_by(desc(PrintJob.id)).first()
    if last_job and last_job.job_number:
        try:
            last_seq = int(last_job.job_number.split("-")[-1])
            new_seq = last_seq + 1
        except Exception:
            new_seq = db.query(PrintJob).count() + 1
    else:
        new_seq = 1
    return f"{prefix}{new_seq:06d}"

@app.post("/api/print-jobs", status_code=status.HTTP_201_CREATED)
def create_print_job(req: CreatePrintJobRequest, db: Session = Depends(get_db)):
    """
    Creates a print job transaction: validates party, sender, generates cases,
    assigns unique barcodes (e.g. MRG-2026-000001-C1), calculates total weight,
    and saves immutable snapshots.
    """
    if not req.party_name.strip():
        raise HTTPException(status_code=400, detail="Party Name is required")
    if not req.address.strip():
        raise HTTPException(status_code=400, detail="Address is required")
    if not req.city.strip():
        raise HTTPException(status_code=400, detail="City is required")
    if not req.state.strip():
        raise HTTPException(status_code=400, detail="State is required")
    if req.total_cases < 1:
        raise HTTPException(status_code=400, detail="Number of cases must be at least 1")

    # 1-Time/Day Lock enforcement on single party print
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    norm_name = req.party_name.strip().upper()

    if not getattr(req, "allow_duplicate", False):
        already_printed = db.query(PrintJob).filter(
            PrintJob.created_at >= today_start,
            func.upper(PrintJob.party_name_snap) == norm_name,
            PrintJob.status == "Printed"
        ).first()
        if already_printed:
            raise HTTPException(
                status_code=409,
                detail=f"Party '{norm_name}' has already been printed today (#{already_printed.job_number}). 1-Time/Day Lock is active to prevent duplicate dispatches. Please use Print History to reprint or edit."
            )

    # Fetch default sender settings if not provided
    sender_settings = db.query(SenderSettings).first()
    s_name = (req.sender.get("business_name") if req.sender else None) or (sender_settings.business_name if sender_settings else "SHREEJI 7")
    s_addr = (req.sender.get("address") if req.sender else None) or (sender_settings.address if sender_settings else "DAHEGAM")
    s_city = (req.sender.get("city") if req.sender else None) or (sender_settings.city if sender_settings else "DAHEGAM")
    s_state = (req.sender.get("state") if req.sender else None) or (sender_settings.state if sender_settings else "GUJARAT")
    s_mobile = (req.sender.get("mobile") if req.sender else None) or (sender_settings.mobile if sender_settings else "9924544283")

    job_number = get_next_job_number(db)

    # Prepare case weights
    weights = req.case_weights
    if len(weights) < req.total_cases:
        last_w = weights[-1] if weights else 1.0
        weights.extend([last_w] * (req.total_cases - len(weights)))
    elif len(weights) > req.total_cases:
        weights = weights[:req.total_cases]

    total_weight = sum(weights)

    # Check if case_breakdown was provided
    case_breakdown_json = None
    if req.case_breakdown:
        case_breakdown_json = json.dumps(req.case_breakdown)
        valid_sum = sum(int(item.get("qty", 0)) for item in req.case_breakdown if int(item.get("qty", 0)) > 0)
        if valid_sum > 0:
            req.total_cases = valid_sum

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
        delivery_boy_name=req.delivery_boy_name,
        delivery_route=req.delivery_route,
        language=req.language or "en",
        template_format=req.template_format or "attachment_pdf",
        created_at=datetime.datetime.now(datetime.timezone.utc)
    )
    db.add(job)
    db.flush()

    if req.party_id and (req.party_name_gu or req.address_gu):
        party_rec = db.query(Party).filter(Party.id == req.party_id).first()
        if party_rec:
            if req.party_name_gu: party_rec.party_name_gu = req.party_name_gu
            if req.address_gu: party_rec.address_gu = req.address_gu
            if req.city_gu: party_rec.city_gu = req.city_gu
            if req.state_gu: party_rec.state_gu = req.state_gu

    cases_resp = []
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
        if valid_sum > 0:
            cases_count = valid_sum

    app_settings = db.query(AppSettings).first()
    gemini_key = app_settings.gemini_api_key if app_settings else None

    created_jobs = []
    now = datetime.datetime.now(datetime.timezone.utc)
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
    return {
        "success": True,
        "created_count": len(created_jobs),
        "job_ids": created_jobs
    }

@app.get("/api/print-jobs")
def list_print_jobs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=-1),
    search: Optional[str] = None,
    status: Optional[str] = None,
    parcel_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    unique_per_day: bool = Query(False),
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

    query = query.order_by(desc(PrintJob.created_at))

    if unique_per_day:
        all_matches = query.all()
        seen = set()
        deduped = []
        for j in all_matches:
            day_str = j.created_at.strftime("%Y-%m-%d") if j.created_at else ""
            key = (j.party_id or j.party_name_snap, day_str)
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
            "created_at": j.created_at.strftime("%d-%m-%Y %I:%M %p") if j.created_at else "",
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
        "created_at": job.created_at.strftime("%d-%m-%Y %I:%M %p") if job.created_at else "",
        "cases": cases
    }

@app.post("/api/print-jobs/{job_id}/reprint")
def reprint_job(job_id: int, db: Session = Depends(get_db)):
    """Loads original job configuration for reprint in Print Envelope screen."""
    return get_print_job(job_id, db)

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
            "default_language": getattr(app_set, "default_language", "en") or "en",
            "envelope_template_format": getattr(app_set, "envelope_template_format", "attachment_pdf") or "attachment_pdf"
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
        if "default_language" in a_data:
            app_set.default_language = a_data["default_language"].strip()
        if "envelope_template_format" in a_data:
            app_set.envelope_template_format = a_data["envelope_template_format"].strip()

    db.commit()
    return {"message": "Settings updated successfully"}

# ==========================================
# 6. PDF GENERATION & DOWNLOAD
# ==========================================

class GeneratePDFRequest(BaseModel):
    job_id: Optional[int] = None
    job_ids: Optional[List[int]] = None
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
    city_gu: Optional[str] = None
    state_gu: Optional[str] = None

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
                "city_gu": getattr(job.party, "city_gu", None) if job.party else None,
                "state_gu": getattr(job.party, "state_gu", None) if job.party else None,
                "parcel_type": job.parcel_type,
                "total_cases": job.total_cases,
                "case_breakdown": b_items
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
                template_format=active_format, language=active_lang
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
        job_number = job.job_number
        j_format = getattr(job, "template_format", None) or active_format
        j_lang = getattr(job, "language", None) or active_lang
        try:
            pdf_bytes = pdf_service.generate_envelopes_pdf(
                job_data, cases_data, sender_dict, settings_dict,
                template_format=j_format, language=j_lang
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
            "city_gu": req.city_gu,
            "state_gu": req.state_gu,
            "parcel_type": req.parcel_type,
            "total_cases": req.total_cases,
            "case_breakdown": req.case_breakdown
        }
        cases_data = []
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
                template_format=active_format, language=active_lang
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

    jobs = query.order_by(PrintJob.created_at.asc()).all()

    total_packages = 0
    breakdown_totals: Dict[str, int] = {}
    distinct_drivers = set()
    distinct_routes = set()

    dispatches = []
    for j in jobs:
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

        dispatches.append({
            "id": j.id,
            "job_number": j.job_number,
            "party_id": j.party_id,
            "party_name": j.party_name_snap,
            "party_code": j.party_code_snap,
            "city": j.party_city_snap,
            "state": j.party_state_snap,
            "mobile": j.party_mobile_snap,
            "total_cases": j.total_cases,
            "case_breakdown": b_items,
            "delivery_boy_name": j.delivery_boy_name,
            "delivery_route": j.delivery_route,
            "status": j.status,
            "created_at": j.created_at.isoformat() if j.created_at else None
        })

    return {
        "date": date_obj.isoformat(),
        "total_parties": len(dispatches),
        "total_packages": total_packages,
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
    for j in jobs:
        if req.delivery_boy_name is not None:
            j.delivery_boy_name = req.delivery_boy_name
        if req.delivery_route is not None:
            j.delivery_route = req.delivery_route
        if req.status is not None:
            j.status = req.status

    db.commit()
    return {"success": True, "updated_count": len(jobs)}

@app.get("/api/dispatch-summary/pdf")
def get_dispatch_summary_pdf(
    date: Optional[str] = Query(None),
    delivery_boy: Optional[str] = Query(None),
    route: Optional[str] = Query(None),
    job_ids: Optional[str] = Query(None),
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

    jobs = query.order_by(PrintJob.created_at.asc()).all()

    dispatches = [
        {
            "party_name": j.party_name_snap,
            "city": j.party_city_snap,
            "mobile": j.party_mobile_snap,
            "total_cases": j.total_cases,
            "case_breakdown": j.case_breakdown_json
        }
        for j in jobs
    ]

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
        sender_data=sender_dict
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
                "city": p.city,
                "state": p.state,
                "mobile_no": p.mobile_no,
                "landline": p.landline,
                "email": p.email,
                "gst_no": p.gst_no,
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

@app.post("/api/backup/import")
def import_database_backup(backup_data: Dict[str, Any], db: Session = Depends(get_db)):
    if "parties" in backup_data:
        imported_count = 0
        existing_names = {p[0].upper() for p in db.query(Party.party_name).all()}
        for p in backup_data["parties"]:
            name = p.get("party_name", "").strip().upper()
            if not name:
                continue
            if name not in existing_names:
                new_p = Party(
                    party_name=name,
                    party_code=p.get("party_code"),
                    address=p.get("address", "").strip().upper(),
                    city=p.get("city", "DAHEGAM").strip().upper(),
                    state=p.get("state", "GUJARAT").strip().upper(),
                    mobile_no=p.get("mobile_no"),
                    landline=p.get("landline"),
                    email=p.get("email"),
                    gst_no=p.get("gst_no"),
                    notes=p.get("notes"),
                    is_active=p.get("is_active", True)
                )
                db.add(new_p)
                existing_names.add(name)
                imported_count += 1
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
                "address_line_2_gu": "",
                "address_line_3_gu": "",
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
    """Batch translates multiple parties to Gujarati for bulk printing."""
    app_set = db.query(AppSettings).first()
    key = app_set.gemini_api_key if app_set else None
    parties = db.query(Party).filter(Party.id.in_(req.party_ids)).all()
    results = {}
    for p in parties:
        if not p.party_name_gu:
            tr = ai_service.translate_party_to_gujarati(
                p.party_name, p.address, p.city, p.state,
                address_line_2=p.address_line_2, address_line_3=p.address_line_3,
                api_key=key
            )
            p.party_name_gu = tr.get("party_name_gu")
            p.address_gu = tr.get("address_gu")
            p.city_gu = tr.get("city_gu")
            p.state_gu = tr.get("state_gu")
            results[p.id] = tr
        else:
            results[p.id] = {
                "party_name_gu": p.party_name_gu,
                "address_gu": p.address_gu or "",
                "city_gu": p.city_gu or "",
                "state_gu": p.state_gu or ""
            }
    db.commit()
    return {"success": True, "translations": results}

# Mount built React frontend if dist exists
dist_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
