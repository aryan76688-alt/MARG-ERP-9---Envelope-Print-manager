import os
import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from models import Base, Party, SenderSettings, AppSettings, PrintJob, PrintCase, User
import barcode_generator

RAW_DATABASE_URL = os.environ.get("DATABASE_URL")
if RAW_DATABASE_URL:
    if RAW_DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = RAW_DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
    elif RAW_DATABASE_URL.startswith("postgresql://") and not RAW_DATABASE_URL.startswith("postgresql+"):
        DATABASE_URL = RAW_DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    else:
        DATABASE_URL = RAW_DATABASE_URL
    is_sqlite = False
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "envelope_manager.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    is_sqlite = True

if is_sqlite:
    engine = create_engine(
        DATABASE_URL, 
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=10,
        max_overflow=20
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_db_system_info():
    """Returns database type and connection health metadata."""
    db = SessionLocal()
    try:
        parties_count = db.query(Party).count()
        jobs_count = db.query(PrintJob).count()
        users_count = db.query(User).count()
        return {
            "type": "PostgreSQL" if not is_sqlite else "SQLite",
            "is_postgres": not is_sqlite,
            "connected": True,
            "parties_count": parties_count,
            "jobs_count": jobs_count,
            "users_count": users_count,
        }
    except Exception as e:
        return {
            "type": "PostgreSQL" if not is_sqlite else "SQLite",
            "is_postgres": not is_sqlite,
            "connected": False,
            "error": str(e)
        }
    finally:
        db.close()

def init_db():
    """Initializes schema and seeds realistic MARG ERP demo data if database is empty."""
    Base.metadata.create_all(bind=engine)
    
    # Universal database-agnostic column migrations
    try:
        inspector = inspect(engine)
        def ensure_columns(table_name, columns_spec):
            try:
                existing = {c["name"] for c in inspector.get_columns(table_name)}
            except Exception:
                existing = set()
            for col_name, col_type, default_val in columns_spec:
                if col_name not in existing:
                    try:
                        with engine.begin() as conn:
                            val_to_use = default_val
                            if col_type.upper() == "BOOLEAN" and val_to_use is not None:
                                s = str(val_to_use).strip("'\"").lower()
                                if not is_sqlite:
                                    val_to_use = "TRUE" if s in ("1", "true") else ("FALSE" if s in ("0", "false") else val_to_use)
                                else:
                                    val_to_use = "1" if s in ("1", "true") else ("0" if s in ("0", "false") else val_to_use)
                            default_clause = f" DEFAULT {val_to_use}" if val_to_use is not None else ""
                            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}{default_clause}"))
                    except Exception as e:
                        print(f"Migration note for {table_name}.{col_name}: {e}")

        ensure_columns("parties", [
            ("address_line_2", "TEXT", None),
            ("address_line_3", "TEXT", None),
            ("party_name_gu", "TEXT", None),
            ("address_gu", "TEXT", None),
            ("city_gu", "TEXT", None),
            ("state_gu", "TEXT", None),
            ("address_line_2_gu", "TEXT", None),
            ("address_line_3_gu", "TEXT", None),
            ("route", "TEXT", None),
            ("route_1", "TEXT", None),
            ("route_2", "TEXT", None),
            ("route_3", "TEXT", None),
            ("route_1_gu", "TEXT", None),
            ("route_2_gu", "TEXT", None),
            ("route_3_gu", "TEXT", None),
            ("latitude", "FLOAT", None),
            ("longitude", "FLOAT", None),
            ("geofence_radius_meters", "INTEGER", "75"),
            ("geofence_set_at", "TIMESTAMP", None),
            ("drug_licenses", "TEXT", None),
        ])

        ensure_columns("app_settings", [
            ("gemini_api_key", "TEXT", "''"),
            ("openai_api_key", "TEXT", "''"),
            ("default_language", "TEXT", "'en'"),
            ("envelope_template_format", "TEXT", "'attachment_pdf'"),
            ("auto_backup_enabled", "BOOLEAN", "1"),
            ("auto_backup_time", "TEXT", "'20:00'"),
            ("rclone_remote_name", "TEXT", "'gdrive'"),
            ("rclone_backup_path", "TEXT", "'MARG_Backups'"),
            ("last_backup_time", "TIMESTAMP", None),
            ("last_backup_status", "TEXT", None),
            ("iv_fluids_json", "TEXT", None),
            ("iv_volumes_json", "TEXT", None),
            ("google_sheets_api_key", "TEXT", "'AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg'"),
            ("google_sheet_id", "TEXT", "'1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg'"),
            ("auto_sync_google_sheet", "BOOLEAN", "1"),
            ("google_sheet_sync_interval_minutes", "INTEGER", "5"),
            ("last_google_sheet_sync_time", "TIMESTAMP", None),
            ("last_google_sheet_sync_status", "TEXT", None),
            ("google_oauth_client_id", "TEXT", "'58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com'"),
            ("gdrive_webhook_url", "TEXT", "''"),
            ("gdrive_api_key", "TEXT", "''"),
            ("gdrive_backup_folder", "TEXT", "'MARG_Backups'"),
            ("gdrive_notify_email", "TEXT", "''"),
        ])

        ensure_columns("print_jobs", [
            ("party_address_line_2_snap", "TEXT", None),
            ("party_address_line_3_snap", "TEXT", None),
            ("case_breakdown_json", "TEXT", None),
            ("delivery_boy_name", "TEXT", None),
            ("driver_name", "TEXT", None),
            ("delivery_route", "TEXT", None),
            ("language", "TEXT", "'en'"),
            ("template_format", "TEXT", "'attachment_pdf'"),
            ("created_by", "TEXT", "'Admin'"),
            ("delivery_status", "TEXT", "'Pending'"),
            ("delivered_by", "TEXT", None),
            ("pod_signature", "TEXT", None),
            ("pod_photo", "TEXT", None),
            ("pod_notes", "TEXT", None),
            ("delivered_at", "TIMESTAMP", None),
            ("client_uuid", "TEXT", None),
            ("delivered_latitude", "FLOAT", None),
            ("delivered_longitude", "FLOAT", None),
            ("distance_from_geofence_meters", "FLOAT", None),
            ("geofence_verified", "BOOLEAN", None),
            ("bill_inside", "BOOLEAN", "0"),
            ("updated_at", "TIMESTAMP", None),
        ])

        ensure_columns("users", [
            ("role", "TEXT", "'employee'"),
            ("permissions", "TEXT", None),
            ("is_active", "BOOLEAN", "1"),
            ("email", "TEXT", None),
            ("google_id", "TEXT", None),
            ("avatar_url", "TEXT", None),
            ("device_controls_json", "TEXT", "'{\"storage_access\": true, \"storage_quota_mb\": 1024, \"camera_access\": true, \"camera_mode\": \"rear_and_front\", \"mic_access\": true, \"mic_mode\": \"emergency_only\", \"remote_locked\": false, \"tracking_enabled\": true}'"),
        ])

        # High-Performance Indexes Migration
        indexes_to_ensure = [
            ("idx_parties_code", "parties", ["party_code"]),
            ("idx_parties_name", "parties", ["party_name"]),
            ("idx_parties_name_gu", "parties", ["party_name_gu"]),
            ("idx_parties_city", "parties", ["city"]),
            ("idx_parties_mobile", "parties", ["mobile_no"]),
            ("idx_parties_city_route", "parties", ["city", "route_1"]),
            ("idx_parties_active_updated", "parties", ["is_active", "updated_at"]),
            ("idx_print_jobs_created_at", "print_jobs", ["created_at"]),
            ("idx_print_jobs_status", "print_jobs", ["status"]),
            ("idx_print_jobs_party_snap", "print_jobs", ["party_name_snap"]),
        ]
        with engine.begin() as conn:
            for idx_name, tbl_name, cols in indexes_to_ensure:
                col_str = ", ".join(cols)
                try:
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {tbl_name} ({col_str})"))
                except Exception as ie:
                    print(f"Index migration note ({idx_name}): {ie}")
    except Exception as mig_err:
        print(f"Column inspector migration notice: {mig_err}")

    try:
        from auth import get_password_hash
    except ImportError:
        import hashlib
        def get_password_hash(password: str) -> str:
            salt = "shreeji_envelope_salt"
            return hashlib.sha256((salt + password).encode('utf-8')).hexdigest()

    db = SessionLocal()
    try:
        # 1. Check or Seed User
        superadmin_aryan = db.query(User).filter_by(username="Aryan180607").first()
        if not superadmin_aryan:
            superadmin_aryan = User(
                username="Aryan180607",
                password_hash=get_password_hash("Aryan@2007"),
                role="super_admin",
                permissions='["create_job", "save_job", "manage_users", "view_reports", "admin", "device_controls"]',
                full_name="Aryan Darji"
            )
            db.add(superadmin_aryan)
        else:
            superadmin_aryan.role = "super_admin"
            superadmin_aryan.full_name = "Aryan Darji"
            superadmin_aryan.password_hash = get_password_hash("Aryan@2007")

        owner_tushar = db.query(User).filter_by(username="Tushar@9263").first()
        if not owner_tushar:
            owner_tushar = User(
                username="Tushar@9263",
                password_hash=get_password_hash("Shreeji@9263"),
                role="owner",
                permissions='["create_job", "save_job", "manage_users", "view_reports", "admin"]',
                full_name="Tushar Patel"
            )
            db.add(owner_tushar)
        else:
            owner_tushar.role = "owner"
            owner_tushar.full_name = "Tushar Patel"
            owner_tushar.password_hash = get_password_hash("Shreeji@9263")

        # Also sync legacy Tushar9263 if present
        legacy_tushar = db.query(User).filter_by(username="Tushar9263").first()
        if legacy_tushar:
            legacy_tushar.password_hash = get_password_hash("Shreeji@9263")
            legacy_tushar.full_name = "Tushar Patel"

        superadmin = db.query(User).filter_by(username="Shreeji7").first()
        if not superadmin:
            superadmin = User(
                username="Shreeji7",
                password_hash=get_password_hash("Aryan@2007"),
                role="super_admin",
                permissions='["create_job", "save_job"]',
                full_name="Super Admin"
            )
            db.add(superadmin)

        first_admin = db.query(User).filter_by(username="Aryan007").first()
        if not first_admin:
            first_admin = User(
                username="Aryan007",
                password_hash=get_password_hash("Aryan@2007"),
                role="admin",
                permissions='["create_job", "save_job"]',
                full_name="Admin"
            )
            db.add(first_admin)

        owner_user = db.query(User).filter_by(username="owner").first()
        if not owner_user:
            owner_user = User(
                username="owner",
                password_hash=get_password_hash("Aryan@2007"),
                role="super_admin",
                permissions='["create_job", "save_job"]',
                full_name="Owner"
            )
            db.add(owner_user)

        driver_user = db.query(User).filter_by(username="driver").first()
        if not driver_user:
            driver_user = User(
                username="driver",
                password_hash=get_password_hash("driver123"),
                role="driver",
                permissions='["create_job"]',
                full_name="Driver"
            )
            db.add(driver_user)

        # Drop old plain text admin if it exists just to be clean
        old_admin = db.query(User).filter_by(username="admin").first()
        if old_admin:
            db.delete(old_admin)

        # 2. Check or Seed Sender Settings
        sender = db.query(SenderSettings).first()
        if not sender:
            sender = SenderSettings(
                business_name="SHREEJI HEALTHCARE-HEALTHCARE",
                address="SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305",
                city="DEHGAM",
                state="GUJARAT",
                mobile="+91 99245 44283",
                landline="02716-245123",
                email="SHREEJISEVEN@GMAIL.COM",
                gst_no="24AAACS1234F1Z5",
                is_default=True
            )
            db.add(sender)

        # 3. Check or Seed App Settings
        app_settings = db.query(AppSettings).first()
        if not app_settings:
            app_settings = AppSettings(
                default_envelope_size="A4",
                default_orientation="Landscape",
                default_copies=1,
                default_printer="Microsoft Print to PDF",
                margin_top_mm=15.0,
                margin_left_mm=3.0,
                margin_right_mm=3.0,
                margin_bottom_mm=10.0,
                scale_percent=100,
                envelopes_per_page=2,
                show_header=True,
                show_footer=False,
                show_barcode=True,
                show_case_number=True,
                show_weight=True,
                show_mobile=True,
                show_party_code=True,
                show_date=False,
                show_gst=False,
                show_pan=False,
                gemini_api_key="AQ." + "Ab8RN6KJLjFrTyGJh1Xw6SaEta7FexKhNkghpTvTH7CsHJJ-Tg",
                openai_api_key="AQ." + "Ab8RN6K29_vEWc7D16MIequ-fe7FArRV6b96moxHRJotJE7nJA",
                iv_fluids_json='["NS", "RL", "DNS", "METRO"]',
                iv_volumes_json='["100ML", "250ML", "500ML", "1LTR", "PCS"]',
                google_sheets_api_key="AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg",
                google_sheet_id=""
            )
            db.add(app_settings)
        else:
            # Update existing settings with new keys if they are blank or old
            app_settings.gemini_api_key = "AQ." + "Ab8RN6KJLjFrTyGJh1Xw6SaEta7FexKhNkghpTvTH7CsHJJ-Tg"
            if not getattr(app_settings, "google_sheets_api_key", None):
                app_settings.google_sheets_api_key = "AIzaSyBqmmiMRBWeV1s7Kpie1DlE6HIHKSnVuLg"
            if not getattr(app_settings, "iv_fluids_json", None):
                app_settings.iv_fluids_json = '["NS", "RL", "DNS", "METRO"]'
            if not getattr(app_settings, "iv_volumes_json", None):
                app_settings.iv_volumes_json = '["100ML", "250ML", "500ML", "1LTR", "PCS"]'
            else:
                try:
                    import json
                    vols = json.loads(app_settings.iv_volumes_json)
                    vols = [v for v in vols if v != "200ML"]
                    if "PCS" not in vols:
                        vols.append("PCS")
                    app_settings.iv_volumes_json = json.dumps(vols)
                except Exception:
                    pass
            if not getattr(app_settings, "google_sheet_id", None):
                app_settings.google_sheet_id = "1nZ_B6HBDjTDcLey5x1784b2o8r0nKweafWVUY8JW0wg"
            if not getattr(app_settings, "auto_sync_google_sheet", None):
                app_settings.auto_sync_google_sheet = True
            if not getattr(app_settings, "google_oauth_client_id", None):
                app_settings.google_oauth_client_id = "58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com"
            db.commit()
        # 4. Check if migrating existing SQLite database to PostgreSQL
        sqlite_file = os.path.join(os.path.dirname(__file__), "envelope_manager.db")
        if not is_sqlite and os.path.exists(sqlite_file) and db.query(Party).count() == 0:
            try:
                from sqlalchemy.orm import sessionmaker as sm
                sqlite_engine = create_engine(f"sqlite:///{sqlite_file}", connect_args={"check_same_thread": False})
                SqliteSession = sm(bind=sqlite_engine)
                sdb = SqliteSession()
                sqlite_parties = sdb.query(Party).all()
                if sqlite_parties:
                    print(f"Auto-migrating {len(sqlite_parties)} parties from SQLite to PostgreSQL database system...")
                    for p in sqlite_parties:
                        db.add(Party(
                            party_name=p.party_name, party_code=p.party_code,
                            address=p.address, address_line_2=p.address_line_2, address_line_3=p.address_line_3,
                            city=p.city, state=p.state, mobile_no=p.mobile_no, landline=p.landline,
                            email=p.email, gst_no=p.gst_no, notes=p.notes,
                            party_name_gu=p.party_name_gu, address_gu=p.address_gu,
                            address_line_2_gu=p.address_line_2_gu, address_line_3_gu=p.address_line_3_gu,
                            city_gu=p.city_gu, state_gu=p.state_gu, route=p.route, is_active=p.is_active
                        ))
                    db.commit()
                    print("Auto-migration to PostgreSQL completed successfully.")
                sdb.close()
            except Exception as mig_err:
                print(f"Auto-migration notice: {mig_err}")

        # 5. Check or Seed MARG ERP Parties if still empty
        if db.query(Party).count() == 0:
            demo_parties = [
                {
                    "party_name": "JODHPUR MEDICOSE",
                    "party_code": "P0001",
                    "address": "SHREE MOHANGADH, NEAR STN ROAD, JAISALMER",
                    "city": "JODHPUR",
                    "state": "RAJASTHAN",
                    "mobile_no": "9829012345",
                    "landline": "0291-2645120",
                    "email": "jodhpurmedicose@gmail.com",
                    "gst_no": "08ABCDE1234F1Z2",
                    "notes": "Fast express delivery via MARG courier"
                },
                {
                    "party_name": "JAY SHREE TRADERS",
                    "party_code": "P0002",
                    "address": "SHOP NO 14, APMC MARKET, SECTOR 19",
                    "city": "AHMEDABAD",
                    "state": "GUJARAT",
                    "mobile_no": "9876543210",
                    "landline": "079-25418900",
                    "email": "jayshreetraders@yahoo.com",
                    "gst_no": "24ABCDE5678G2Z1",
                    "notes": "Handle with care - medical consignments"
                },
                {
                    "party_name": "JIGNESH ENTERPRISE",
                    "party_code": "P0003",
                    "address": "GIDC PHASE 2, PLOT 45/A, NEAR CANAL ROAD",
                    "city": "VADODARA",
                    "state": "GUJARAT",
                    "mobile_no": "9824098765",
                    "landline": "0265-2890123",
                    "email": "jignesh_ent@rediffmail.com",
                    "gst_no": "24XYZAB9876C1Z8",
                    "notes": ""
                },
                {
                    "party_name": "J K PHARMA DISTRIBUTOR",
                    "party_code": "P0004",
                    "address": "SURAT MEDICINE COMPLEX, RING ROAD, OPP STATION",
                    "city": "SURAT",
                    "state": "GUJARAT",
                    "mobile_no": "9898011223",
                    "landline": "0261-2478901",
                    "email": "jkpharma@suratpharma.com",
                    "gst_no": "24LMNOP4321D1Z9",
                    "notes": "Priority morning dispatch"
                },
                {
                    "party_name": "JALARAM AGENCIES",
                    "party_code": "P0005",
                    "address": "GRAIN MARKET, OPP TOWN HALL, GANDHI CHOWK",
                    "city": "RAJKOT",
                    "state": "GUJARAT",
                    "mobile_no": "9426033445",
                    "landline": "0281-2234567",
                    "email": "jalaram_rajkot@gmail.com",
                    "gst_no": "24PQRSU8765E1Z4",
                    "notes": ""
                },
                {
                    "party_name": "JANTA MEDICALS",
                    "party_code": "P0006",
                    "address": "MAIN HOSPITAL ROAD, NEAR BUS STAND",
                    "city": "JAIPUR",
                    "state": "RAJASTHAN",
                    "mobile_no": "9829567890",
                    "landline": "0141-2356789",
                    "email": "jantamedicals.jpr@gmail.com",
                    "gst_no": "08JKLMN3456H1Z3",
                    "notes": "Critical cold-chain medicine parcel"
                },
                {
                    "party_name": "AMBICA PHARMACEUTICALS",
                    "party_code": "P0007",
                    "address": "402 SHIVALIK PLAZA, IIM ROAD, PANJRAPOLE",
                    "city": "AHMEDABAD",
                    "state": "GUJARAT",
                    "mobile_no": "9825123456",
                    "landline": "079-26301234",
                    "email": "ambicapharma@ambica.com",
                    "gst_no": "24BCDEF2345J1Z7",
                    "notes": ""
                },
                {
                    "party_name": "BHAVANI MEDICAL AGENCY",
                    "party_code": "P0008",
                    "address": "STATION ROAD, BEHIND SBI BANK",
                    "city": "MEHSANA",
                    "state": "GUJARAT",
                    "mobile_no": "9824345678",
                    "landline": "02762-251234",
                    "email": "bhavani.agency@gmail.com",
                    "gst_no": "24CDEFG3456K1Z6",
                    "notes": ""
                },
                {
                    "party_name": "TIRUPATI HEALTHCARE",
                    "party_code": "P0009",
                    "address": "PLOT NO 88, ELECTRONIC ZONE, GIDC",
                    "city": "GANDHINAGAR",
                    "state": "GUJARAT",
                    "mobile_no": "9727123890",
                    "landline": "079-23214567",
                    "email": "tirupati.health@tirupati.in",
                    "gst_no": "24DEFGH4567L1Z5",
                    "notes": "Large cartons delivery"
                },
                {
                    "party_name": "SHREE KRISHNA DISTRIBUTORS",
                    "party_code": "P0010",
                    "address": "CIVIL HOSPITAL CHOWK, STATION ROAD",
                    "city": "BHAVNAGAR",
                    "state": "GUJARAT",
                    "mobile_no": "9426987654",
                    "landline": "0278-2423456",
                    "email": "shreekrishna.dist@gmail.com",
                    "gst_no": "24EFGHI5678M1Z4",
                    "notes": ""
                }
            ]
            for p in demo_parties:
                db.add(Party(**p))
            db.commit()

            # Seed an initial print job history for demo metrics only if empty
            if db.query(PrintJob).count() == 0:
                p1 = db.query(Party).filter_by(party_name="JODHPUR MEDICOSE").first()
            if p1:
                job1 = PrintJob(
                    job_number="MRG-2026-000001",
                    party_id=p1.id,
                    party_name_snap=p1.party_name,
                    party_code_snap=p1.party_code,
                    party_address_snap=p1.address,
                    party_city_snap=p1.city,
                    party_state_snap=p1.state,
                    party_mobile_snap=p1.mobile_no,
                    party_gst_snap=p1.gst_no,
                    sender_name_snap="SHREEJI 7",
                    sender_address_snap="DAHEGAM",
                    sender_city_snap="DAHEGAM",
                    sender_state_snap="GUJARAT",
                    sender_mobile_snap="9924544283",
                    parcel_type="Medicine",
                    total_cases=3,
                    total_weight=7.50,
                    envelope_size="A4",
                    orientation="Landscape",
                    printer_name="Microsoft Print to PDF",
                    envelopes_per_page=2,
                    status="Printed",
                    created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
                )
                db.add(job1)
                db.flush()

                weights = [2.50, 2.50, 2.50]
                for idx, w in enumerate(weights, start=1):
                    case = PrintCase(
                        print_job_id=job1.id,
                        case_number=idx,
                        case_total=3,
                        weight=w,
                        barcode_value=f"MRG-2026-000001-C{idx}",
                        status="Printed"
                    )
                    db.add(case)

            p2 = db.query(Party).filter_by(party_name="JAY SHREE TRADERS").first()
            if p2:
                job2 = PrintJob(
                    job_number="MRG-2026-000002",
                    party_id=p2.id,
                    party_name_snap=p2.party_name,
                    party_code_snap=p2.party_code,
                    party_address_snap=p2.address,
                    party_city_snap=p2.city,
                    party_state_snap=p2.state,
                    party_mobile_snap=p2.mobile_no,
                    party_gst_snap=p2.gst_no,
                    sender_name_snap="SHREEJI 7",
                    sender_address_snap="DAHEGAM",
                    sender_city_snap="DAHEGAM",
                    sender_state_snap="GUJARAT",
                    sender_mobile_snap="9924544283",
                    parcel_type="Documents",
                    total_cases=1,
                    total_weight=0.50,
                    envelope_size="A4",
                    orientation="Landscape",
                    printer_name="Microsoft Print to PDF",
                    envelopes_per_page=2,
                    status="Printed",
                    created_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
                )
                db.add(job2)
                db.flush()

                case = PrintCase(
                    print_job_id=job2.id,
                    case_number=1,
                    case_total=1,
                    weight=0.50,
                    barcode_value="MRG-2026-000002-C1",
                    status="Printed"
                )
        # 6. Ensure all parties have standard MARG codes: MARG000001, MARG000002...
        all_parties = db.query(Party).order_by(Party.id.asc()).all()
        needs_commit = False
        for p in all_parties:
            expected_code = f"MARG{p.id:06d}"
            if not p.party_code or not (p.party_code.startswith("MARG") and len(p.party_code) == 10 and p.party_code[4:].isdigit()):
                p.party_code = expected_code
                needs_commit = True
        if needs_commit:
            db.commit()
            print(f"[DB] Standardized MARG party codes (e.g. MARG000001..MARG{len(all_parties):06d})")

        # 7. Check or Seed Stock Catalog Items from stock_report.xlsx if empty
        if db.query(Item).count() == 0:
            stock_xlsx = os.path.join(os.path.dirname(__file__), "data", "stock_report.xlsx")
            if os.path.exists(stock_xlsx):
                try:
                    import openpyxl
                    wb = openpyxl.load_workbook(stock_xlsx, read_only=True, data_only=True)
                    ws = wb.active
                    items_batch = []
                    seen_codes = set()
                    
                    for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
                        if r_idx < 2 or not row or len(row) < 2:
                            continue
                        code = str(row[0] or "").strip()
                        name = str(row[1] or "").strip()
                        if not code or not name or code in seen_codes or code.lower() == "code":
                            continue
                        seen_codes.add(code)
                        
                        unit = str(row[2] or "").strip() if len(row) > 2 and row[2] else ""
                        try:
                            stock_qty = float(row[3]) if len(row) > 3 and row[3] is not None else 0.0
                        except Exception:
                            stock_qty = 0.0
                        try:
                            cost_price = float(row[9]) if len(row) > 9 and row[9] is not None else None
                        except Exception:
                            cost_price = None
                        try:
                            mrp = float(row[11]) if len(row) > 11 and row[11] is not None else None
                        except Exception:
                            mrp = None
                        try:
                            sales_price = float(row[13]) if len(row) > 13 and row[13] is not None else None
                        except Exception:
                            sales_price = None
                        company = str(row[14] or "").strip() if len(row) > 14 and row[14] else None
                        rack_no = str(row[22] or "").strip() if len(row) > 22 and row[22] else None
                        
                        items_batch.append(Item(
                            item_code=code,
                            item_name=name,
                            unit=unit,
                            company=company,
                            mrp=mrp,
                            sales_price=sales_price,
                            cost_price=cost_price,
                            stock_qty=stock_qty,
                            rack_no=rack_no,
                            is_active=True
                        ))
                    
                    if items_batch:
                        db.bulk_save_objects(items_batch)
                        db.commit()
                        print(f"[DB] Auto-seeded {len(items_batch)} catalog items from stock_report.xlsx successfully!")
                    wb.close()
                except Exception as ex:
                    print(f"[DB] Stock items auto-seed notice: {ex}")

        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
