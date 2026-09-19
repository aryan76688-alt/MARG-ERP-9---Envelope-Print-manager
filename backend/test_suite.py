"""
End-to-end Automated Verification Test Suite for
MARG ERP 9+ – Envelope Print Manager
"""

import io
import sys
from fastapi.testclient import TestClient
import openpyxl

from main import app
from database import SessionLocal
from models import Party, PrintJob, PrintCase

client = TestClient(app)

def test_dashboard():
    print("Testing GET /api/dashboard...")
    res = client.get("/api/dashboard")
    assert res.status_code == 200, f"Dashboard failed: {res.status_code}"
    data = res.json()
    assert "metrics" in data
    assert "print_summary" in data
    assert "recent_activity" in data
    assert "trend" in data
    print(" -> Total parties in metrics:", data["metrics"]["total_parties"])
    print(" -> Total envelopes printed:", data["metrics"]["total_envelopes_printed"])
    print(" -> Print jobs count:", data["metrics"]["print_jobs"])
    print("[PASS] Dashboard endpoint works properly.")

def test_party_autocomplete_and_crud():
    print("\nTesting Party Autocomplete & CRUD...")
    # 1. Autocomplete for 'J'
    res = client.get("/api/parties/autocomplete?q=J&mode=contains")
    assert res.status_code == 200
    results = res.json()
    assert len(results) >= 5, "Expected at least 5 parties for 'J'"
    names = [p["party_name"] for p in results]
    assert "JODHPUR MEDICOSE" in names
    print(f" -> Found {len(results)} parties for 'J': {names[:3]}...")

    # 2. Verify NO PIN CODE anywhere in party fields
    for p in results:
        assert "pin" not in p
        assert "pincode" not in p
        assert "postal_code" not in p

    # 3. Create a new party
    new_party = {
        "party_name": "TEST PHARMA DISPATCH",
        "party_code": "P9999",
        "address": "PLOT 99, INDUSTRIAL ESTATE",
        "city": "AHMEDABAD",
        "state": "GUJARAT",
        "mobile_no": "9898989898",
        "email": "test@pharmadispatch.com",
        "notes": "E2E Test Party"
    }
    create_res = client.post("/api/parties", json=new_party)
    assert create_res.status_code == 201, f"Failed creating party: {create_res.text}"
    created_id = create_res.json()["id"]
    print(f" -> Created party ID: {created_id}")

    # 4. Update party
    new_party["address"] = "UPDATED PLOT 100, INDUSTRIAL ESTATE"
    update_res = client.put(f"/api/parties/{created_id}", json=new_party)
    assert update_res.status_code == 200
    assert update_res.json()["address"] == "UPDATED PLOT 100, INDUSTRIAL ESTATE"

    # 5. Delete party
    del_res = client.delete(f"/api/parties/{created_id}")
    assert del_res.status_code == 200
    print("[PASS] Party CRUD and 1-letter autocomplete passed.")

def test_excel_import_and_template():
    print("\nTesting Excel Import, Mapping & Validation...")
    # 1. Download sample template
    tmpl_res = client.get("/api/import/sample-template")
    assert tmpl_res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(tmpl_res.content))
    ws = wb.active
    headers = [cell.value for cell in ws[1]]
    print(" -> Sample template headers:", headers)
    assert "Party Name *" in headers
    assert "Address *" in headers
    assert "City *" in headers
    assert not any("pin" in str(h).lower() for h in headers), "PIN code found in sample template!"

    # 2. Upload template back
    files = {"file": ("sample.xlsx", tmpl_res.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    up_res = client.post("/api/import/excel", files=files)
    assert up_res.status_code == 200
    up_data = up_res.json()
    assert up_data["total_rows"] >= 5
    assert "party_name" in up_data["detected_mapping"]
    assert "address" in up_data["detected_mapping"]
    print(f" -> Detected mappings: {up_data['detected_mapping']}")

    # 3. Validate mapping
    val_res = client.post("/api/import/validate", json={
        "raw_rows": up_data["sample_rows"],
        "mapping": up_data["detected_mapping"]
    })
    assert val_res.status_code == 200
    val_data = val_res.json()
    print(f" -> Validation: Total={val_data['total_rows']}, Valid={val_data['valid_count']}, Warnings={val_data['warning_count']}")
    print("[PASS] Excel parsing and validation engine passed.")

def test_print_job_creation_and_cases():
    print("\nTesting Print Job Multi-Case Parcel Engine...")
    # Mode 2: Individual weights (Case 1: 2.00, Case 2: 3.50, Case 3: 1.75 -> Total 7.25 KG)
    payload = {
        "party_name": "JODHPUR MEDICOSE",
        "party_code": "P0001",
        "address": "SHREE MOHANGADH, JAISALMER",
        "city": "JODHPUR",
        "state": "RAJASTHAN",
        "mobile_no": "9829012345",
        "parcel_type": "Medicine",
        "total_cases": 3,
        "case_weights": [2.00, 3.50, 1.75],
        "envelope_size": "A4",
        "envelopes_per_page": 2,
        "status": "Printed"
    }
    res = client.post("/api/print-jobs", json=payload)
    assert res.status_code == 201, f"Failed to create print job: {res.text}"
    job = res.json()
    assert job["total_cases"] == 3
    assert abs(job["total_weight"] - 7.25) < 0.01, f"Total weight mismatch: {job['total_weight']}"
    assert len(job["cases"]) == 3
    assert job["cases"][0]["barcode_value"] == f"{job['job_number']}-C1"
    assert job["cases"][0]["weight"] == 2.00
    assert job["cases"][1]["weight"] == 3.50
    assert job["cases"][2]["weight"] == 1.75
    print(f" -> Created Job: {job['job_number']} with 3 cases, total weight: {job['total_weight']} KG")
    print(" -> Barcodes generated:", [c["barcode_value"] for c in job["cases"]])

    # Test Reprint endpoint
    reprint_res = client.post(f"/api/print-jobs/{job['id']}/reprint")
    assert reprint_res.status_code == 200
    reprint_data = reprint_res.json()
    assert reprint_data["job_number"] == job["job_number"]
    assert len(reprint_data["cases"]) == 3
    print("[PASS] Print Job Multi-Case transaction and reprint passed.")
    return job["id"]

def test_pdf_generation(job_id):
    print("\nTesting Vector PDF Generation (/api/pdf/generate)...")
    res = client.post("/api/pdf/generate", json={"job_id": job_id})
    assert res.status_code == 200, f"PDF generation failed: {res.status_code}"
    assert res.headers["content-type"] == "application/pdf"
    pdf_bytes = res.content
    assert len(pdf_bytes) > 5000, f"PDF seems too small: {len(pdf_bytes)} bytes"
    assert pdf_bytes.startswith(b"%PDF"), "Invalid PDF header!"
    print(f" -> Generated PDF size: {len(pdf_bytes)} bytes ({len(pdf_bytes)//1024} KB)")
    print("[PASS] High-precision vector PDF generation passed.")

def test_xlsx_exports_and_backup():
    print("\nTesting XLSX Exports and Database Backup...")
    # Parties XLSX
    p_res = client.get("/api/export/parties.xlsx")
    assert p_res.status_code == 200
    assert len(p_res.content) > 1000
    wb = openpyxl.load_workbook(io.BytesIO(p_res.content))
    assert "Parties" in wb.sheetnames
    print(f" -> Parties XLSX exported ({len(p_res.content)} bytes)")

    # History XLSX
    h_res = client.get("/api/export/history.xlsx")
    assert h_res.status_code == 200
    assert len(h_res.content) > 1000
    wb2 = openpyxl.load_workbook(io.BytesIO(h_res.content))
    assert "Print History" in wb2.sheetnames
    print(f" -> History XLSX exported ({len(h_res.content)} bytes)")

    # Backup JSON
    b_res = client.get("/api/backup/export")
    assert b_res.status_code == 200
    backup_json = b_res.json()
    assert "parties" in backup_json
    assert "sender" in backup_json
    print(f" -> Database Backup JSON exported: {len(backup_json['parties'])} parties saved")
    print("[PASS] XLSX exports and database backup passed.")

if __name__ == "__main__":
    test_dashboard()
    test_party_autocomplete_and_crud()
    test_excel_import_and_template()
    job_id = test_print_job_creation_and_cases()
    test_pdf_generation(job_id)
    test_xlsx_exports_and_backup()
    print("\n========================================================")
    print("ALL 6 END-TO-END AUTOMATED VERIFICATION SUITES PASSED!")
    print("========================================================")
