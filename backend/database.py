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
            with engine.connect() as conn:
                for col_name, col_type, default_val in columns_spec:
                    if col_name not in existing:
                        try:
                            default_clause = f" DEFAULT {default_val}" if default_val is not None else ""
                            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}{default_clause}"))
                            conn.commit()
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
            ("google_sheet_id", "TEXT", "''"),
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
            ("pod_signature", "TEXT", None),
            ("pod_photo", "TEXT", None),
            ("pod_notes", "TEXT", None),
            ("delivered_at", "TIMESTAMP", None),
            ("client_uuid", "TEXT", None),
        ])

        ensure_columns("users", [
            ("role", "TEXT", "'employee'"),
            ("permissions", "TEXT", None),
            ("is_active", "BOOLEAN", "1"),
        ])
    except Exception as mig_err:
        print(f"Column inspector migration notice: {mig_err}")

    import bcrypt
    
    def get_password_hash(password: str) -> str:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    db = SessionLocal()
    try:
        # 1. Check or Seed User
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
                iv_volumes_json='["100ML", "250ML", "500ML", "1LTR"]',
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
                app_settings.iv_volumes_json = '["100ML", "250ML", "500ML", "1LTR"]'
            elif "200ML" in str(app_settings.iv_volumes_json):
                try:
                    import json
                    vols = json.loads(app_settings.iv_volumes_json)
                    vols = [v for v in vols if v != "200ML"]
                    app_settings.iv_volumes_json = json.dumps(vols)
                except Exception:
                    pass
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
                db.add(case)

        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
