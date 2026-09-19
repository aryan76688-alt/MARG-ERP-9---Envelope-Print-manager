import os
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from models import Base, Party, SenderSettings, AppSettings, PrintJob, PrintCase, User
import barcode_generator

DB_PATH = os.path.join(os.path.dirname(__file__), "envelope_manager.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes schema and seeds realistic MARG ERP demo data if database is empty."""
    Base.metadata.create_all(bind=engine)
    
    # Safe SQLite column migrations
    with engine.connect() as conn:
        try:
            party_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(parties)").fetchall()]
            if "address_line_2" not in party_cols:
                conn.exec_driver_sql("ALTER TABLE parties ADD COLUMN address_line_2 TEXT")
            if "address_line_3" not in party_cols:
                conn.exec_driver_sql("ALTER TABLE parties ADD COLUMN address_line_3 TEXT")
            
            job_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(print_jobs)").fetchall()]
            if "party_address_line_2_snap" not in job_cols:
                conn.exec_driver_sql("ALTER TABLE print_jobs ADD COLUMN party_address_line_2_snap TEXT")
            if "party_address_line_3_snap" not in job_cols:
                conn.exec_driver_sql("ALTER TABLE print_jobs ADD COLUMN party_address_line_3_snap TEXT")
            conn.commit()
        except Exception as e:
            print(f"Migration notice: {e}")

    db = SessionLocal()
    try:
        # 1. Check or Seed User
        admin = db.query(User).filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                password_hash="admin123", # Simple hash for local erp office setup
                full_name="Office Dispatch Manager"
            )
            db.add(admin)

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
                margin_top_mm=5.0,
                margin_left_mm=5.0,
                margin_right_mm=5.0,
                margin_bottom_mm=5.0,
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
                show_pan=False
            )
            db.add(app_settings)

        # 4. Check or Seed MARG ERP Parties
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

            # Seed an initial print job history for demo metrics
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
