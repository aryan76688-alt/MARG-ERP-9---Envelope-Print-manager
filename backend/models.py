import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="employee") # super_admin, admin, employee
    permissions = Column(Text, nullable=True) # JSON list of features
    full_name = Column(String(150), default="Administrator")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Party(Base):
    __tablename__ = "parties"

    id = Column(Integer, primary_key=True, index=True)
    party_name = Column(String(200), nullable=False, index=True)
    party_code = Column(String(50), nullable=True, index=True)
    address = Column(Text, nullable=False)
    address_line_2 = Column(Text, nullable=True)
    address_line_3 = Column(Text, nullable=True)
    city = Column(String(100), nullable=False, index=True)
    state = Column(String(100), nullable=False, index=True)
    mobile_no = Column(String(50), nullable=True, index=True)
    landline = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    gst_no = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    party_name_gu = Column(String(200), nullable=True)
    address_gu = Column(Text, nullable=True)
    address_line_2_gu = Column(Text, nullable=True)
    address_line_3_gu = Column(Text, nullable=True)
    city_gu = Column(String(100), nullable=True)
    state_gu = Column(String(100), nullable=True)
    route = Column(String(100), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    print_jobs = relationship("PrintJob", back_populates="party", cascade="all, delete-orphan")


class SenderSettings(Base):
    __tablename__ = "sender_settings"

    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(200), nullable=False, default="SHREEJI 7")
    address = Column(Text, nullable=False, default="DAHEGAM")
    city = Column(String(100), nullable=False, default="DAHEGAM")
    state = Column(String(100), nullable=False, default="GUJARAT")
    mobile = Column(String(50), nullable=False, default="9924544283")
    landline = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True, default="contact@shreeji7.com")
    gst_no = Column(String(50), nullable=True)
    is_default = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    default_envelope_size = Column(String(50), default="A4") # DL, DL Long, A4, A5, Custom
    default_orientation = Column(String(20), default="Landscape") # Landscape, Portrait
    default_copies = Column(Integer, default=1)
    default_printer = Column(String(100), default="Microsoft Print to PDF")
    margin_top_mm = Column(Float, default=15.0)
    margin_left_mm = Column(Float, default=3.0)
    margin_right_mm = Column(Float, default=3.0)
    margin_bottom_mm = Column(Float, default=10.0)
    scale_percent = Column(Integer, default=100)
    envelopes_per_page = Column(Integer, default=2) # 1, 2, 4
    
    # Template display toggles
    show_header = Column(Boolean, default=True)
    show_footer = Column(Boolean, default=False)
    show_barcode = Column(Boolean, default=True)
    show_case_number = Column(Boolean, default=True)
    show_weight = Column(Boolean, default=True)
    show_mobile = Column(Boolean, default=True)
    show_party_code = Column(Boolean, default=True)
    show_date = Column(Boolean, default=False)
    show_gst = Column(Boolean, default=False)
    show_pan = Column(Boolean, default=False)
    gemini_api_key = Column(String(200), default="")
    openai_api_key = Column(String(255), default="")
    default_language = Column(String(10), default="en") # en or gu
    envelope_template_format = Column(String(50), default="attachment_pdf") # attachment_pdf or marg_grid_22

    # Rclone Auto Cloud Backup Settings
    auto_backup_enabled = Column(Boolean, default=True)
    auto_backup_time = Column(String(10), default="20:00") # 8:00 PM default
    rclone_remote_name = Column(String(100), default="gdrive")
    rclone_backup_path = Column(String(200), default="MARG_Backups")
    last_backup_time = Column(DateTime, nullable=True)
    last_backup_status = Column(String(255), nullable=True)

    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class PrintJob(Base):
    __tablename__ = "print_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_number = Column(String(50), unique=True, index=True) # e.g. MRG-2026-000001
    party_id = Column(Integer, ForeignKey("parties.id", ondelete="SET NULL"), nullable=True)
    
    # Snapshots for immutability in print history
    party_name_snap = Column(String(200), nullable=False)
    party_code_snap = Column(String(50), nullable=True)
    party_address_snap = Column(Text, nullable=False)
    party_address_line_2_snap = Column(Text, nullable=True)
    party_address_line_3_snap = Column(Text, nullable=True)
    party_city_snap = Column(String(100), nullable=False)
    party_state_snap = Column(String(100), nullable=False)
    party_mobile_snap = Column(String(50), nullable=True)
    party_gst_snap = Column(String(50), nullable=True)
    
    sender_name_snap = Column(String(200), nullable=False)
    sender_address_snap = Column(Text, nullable=False)
    sender_city_snap = Column(String(100), nullable=False)
    sender_state_snap = Column(String(100), nullable=False)
    sender_mobile_snap = Column(String(50), nullable=False)
    
    parcel_type = Column(String(50), default="Medicine") # Documents, Parcel, Medicine, Box, Other
    total_cases = Column(Integer, default=1)
    total_weight = Column(Float, default=0.0)
    envelope_size = Column(String(50), default="A4")
    orientation = Column(String(20), default="Landscape")
    printer_name = Column(String(100), default="Default System Printer")
    envelopes_per_page = Column(Integer, default=2)
    status = Column(String(30), default="Printed") # Printed, Pending, Failed
    case_breakdown_json = Column(Text, nullable=True) # JSON list of case items with quantities and volumes
    delivery_boy_name = Column(String(100), nullable=True)
    delivery_route = Column(String(100), nullable=True)
    language = Column(String(10), default="en") # en or gu
    template_format = Column(String(50), default="attachment_pdf") # attachment_pdf or marg_grid_22
    created_by = Column(String(100), default="Admin") # User attribution
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    # Relationships
    party = relationship("Party", back_populates="print_jobs")
    cases = relationship("PrintCase", back_populates="print_job", cascade="all, delete-orphan", order_by="PrintCase.case_number")


class PrintCase(Base):
    __tablename__ = "print_cases"

    id = Column(Integer, primary_key=True, index=True)
    print_job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="CASCADE"), nullable=False)
    case_number = Column(Integer, nullable=False) # e.g. 1
    case_total = Column(Integer, nullable=False)  # e.g. 3 -> CASE: 1/3
    weight = Column(Float, default=0.0) # weight in KG
    barcode_value = Column(String(100), nullable=False) # e.g. MRG-2026-000001-C1
    status = Column(String(30), default="Printed")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship
    print_job = relationship("PrintJob", back_populates="cases")


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, default=0)
    sheet_name = Column(String(100), nullable=True)
    total_rows = Column(Integer, default=0)
    imported_rows = Column(Integer, default=0)
    skipped_rows = Column(Integer, default=0)
    duplicate_rows = Column(Integer, default=0)
    error_rows = Column(Integer, default=0)
    status = Column(String(50), default="Completed") # Completed, Partial, Failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    errors = relationship("ImportErrorLog", back_populates="import_job", cascade="all, delete-orphan")


class ImportErrorLog(Base):
    __tablename__ = "import_error_logs"

    id = Column(Integer, primary_key=True, index=True)
    import_job_id = Column(Integer, ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False)
    row_index = Column(Integer, nullable=False)
    party_name = Column(String(200), nullable=True)
    party_code = Column(String(50), nullable=True)
    error_reason = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    import_job = relationship("ImportJob", back_populates="errors")
