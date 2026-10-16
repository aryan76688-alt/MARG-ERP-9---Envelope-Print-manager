"""
Shreeji Healthcare - Google Drive & Gmail Cloud Webhook Service
100% Free, Zero-OAuth2 automated backup, restore, and 1-click email dispatch.
"""

import json
import base64
import os
import io
import zipfile
import datetime
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

def _make_request(webhook_url: str, payload: Dict[str, Any], timeout: int = 45) -> Dict[str, Any]:
    """Sends JSON POST request to Google Apps Script Webhook."""
    if not webhook_url or not webhook_url.startswith("http"):
        return {"success": False, "error": "Invalid or missing Google Apps Script Webhook URL"}

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=req_data,
        headers={"Content-Type": "application/json", "User-Agent": "Shreeji-Healthcare-Sync/1.0"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        try:
            return json.loads(err_msg)
        except Exception:
            return {"success": False, "error": f"HTTP {e.code}: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def test_connection(webhook_url: str, api_key: str) -> Dict[str, Any]:
    """Tests the Google Apps Script Webhook connection."""
    payload = {
        "apiKey": api_key,
        "action": "test_connection"
    }
    return _make_request(webhook_url, payload, timeout=15)

def upload_backup(
    webhook_url: str,
    api_key: str,
    filename: str,
    content_bytes: bytes,
    mime_type: str = "application/zip",
    folder_name: str = "Shreeji_Healthcare_Backups"
) -> Dict[str, Any]:
    """Uploads a backup archive (zip or json) to Google Drive."""
    base64_content = base64.b64encode(content_bytes).decode("utf-8")
    payload = {
        "apiKey": api_key,
        "action": "upload_backup",
        "filename": filename,
        "content": base64_content,
        "isBase64": True,
        "mimeType": mime_type,
        "folderName": folder_name
    }
    return _make_request(webhook_url, payload, timeout=60)

def list_backups(
    webhook_url: str,
    api_key: str,
    folder_name: str = "Shreeji_Healthcare_Backups"
) -> Dict[str, Any]:
    """Lists backup files in the Google Drive folder."""
    payload = {
        "apiKey": api_key,
        "action": "list_backups",
        "folderName": folder_name
    }
    return _make_request(webhook_url, payload, timeout=30)

def download_backup(webhook_url: str, api_key: str, file_id: str) -> Dict[str, Any]:
    """Downloads a backup file from Google Drive."""
    payload = {
        "apiKey": api_key,
        "action": "download_backup",
        "fileId": file_id
    }
    res = _make_request(webhook_url, payload, timeout=60)
    if res.get("success") and res.get("content"):
        try:
            raw_bytes = base64.b64decode(res["content"])
            res["raw_bytes"] = raw_bytes
        except Exception as e:
            return {"success": False, "error": f"Base64 decode failed: {e}"}
    return res

def send_email(
    webhook_url: str,
    api_key: str,
    to_email: str,
    subject: str,
    body_html: str,
    attachments: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Sends an email with attachments via Gmail Webhook.
    attachments: list of {"filename": "invoice.pdf", "content_bytes": b"...", "mimeType": "application/pdf"}
    """
    encoded_attachments = []
    if attachments:
        for att in attachments:
            c_bytes = att.get("content_bytes")
            if isinstance(c_bytes, bytes):
                enc = base64.b64encode(c_bytes).decode("utf-8")
            elif isinstance(c_bytes, str):
                enc = base64.b64encode(c_bytes.encode("utf-8")).decode("utf-8")
            else:
                enc = att.get("content_base64", "")
            
            encoded_attachments.append({
                "filename": att.get("filename", "attachment.bin"),
                "content": enc,
                "mimeType": att.get("mimeType", "application/octet-stream"),
                "isBase64": True
            })

    payload = {
        "apiKey": api_key,
        "action": "send_email",
        "to": to_email,
        "subject": subject,
        "bodyHtml": body_html,
        "attachments": encoded_attachments
    }
    return _make_request(webhook_url, payload, timeout=45)

def _serialize_model(instance):
    """Converts a SQLAlchemy model instance to a dict."""
    if not instance:
        return None
    data = {}
    for column in instance.__table__.columns:
        val = getattr(instance, column.name)
        if isinstance(val, (datetime.datetime, datetime.date)):
            data[column.name] = val.isoformat()
        else:
            data[column.name] = val
    return data

def create_envelope_backup_archive(db_session, base_dir: str) -> tuple[str, bytes]:
    """
    Creates a compressed ZIP archive containing:
    1. envelope_manager.db (raw SQLite database)
    2. backup_data.json (full database tables: parties, settings, print jobs)
    3. metadata.json (timestamp, version, counts)
    """
    from models import Party, SenderSettings, AppSettings, PrintJob, PrintCase, User

    timestamp_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"Shreeji_Envelope_Backup_{timestamp_str}.zip"

    parties = db_session.query(Party).all()
    sender = db_session.query(SenderSettings).first()
    app_settings = db_session.query(AppSettings).first()
    print_jobs = db_session.query(PrintJob).order_by(PrintJob.id.desc()).limit(1000).all()
    print_cases = db_session.query(PrintCase).order_by(PrintCase.id.desc()).limit(1000).all()

    backup_json = {
        "version": "2.0.0",
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "parties": [_serialize_model(p) for p in parties],
        "sender_settings": _serialize_model(sender),
        "app_settings": _serialize_model(app_settings),
        "print_jobs": [_serialize_model(j) for j in print_jobs],
        "print_cases": [_serialize_model(c) for c in print_cases]
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Raw SQLite DB if present
        candidates = [
            os.path.join(base_dir, "backend", "envelope_manager.db"),
            os.path.join(base_dir, "envelope_manager.db"),
            "envelope_manager.db"
        ]
        db_path = None
        for cand in candidates:
            if os.path.exists(cand):
                db_path = cand
                break
        
        if db_path and os.path.exists(db_path):
            with open(db_path, "rb") as f:
                zf.writestr("envelope_manager.db", f.read())

        # 2. JSON Data dump
        zf.writestr("backup_data.json", json.dumps(backup_json, indent=2, ensure_ascii=False))

        # 3. Metadata
        meta = {
            "app": "MARG ERP 9 Envelope Print Manager",
            "version": "2.0.0",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "timestamp": timestamp_str,
            "counts": {
                "parties": len(parties),
                "print_jobs": len(print_jobs),
                "print_cases": len(print_cases)
            }
        }
        zf.writestr("metadata.json", json.dumps(meta, indent=2))

    return filename, zip_buffer.getvalue()

def restore_envelope_backup(db_session, backup_bytes: bytes, base_dir: str) -> Dict[str, Any]:
    """
    Restores database from downloaded backup zip archive.
    Safe operation: creates pre-restore snapshot first.
    """
    from models import Party, SenderSettings, AppSettings

    try:
        zip_buffer = io.BytesIO(backup_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            file_list = zf.namelist()
            
            # Create a safety pre-restore snapshot of current database
            now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            candidates = [
                os.path.join(base_dir, "backend", "envelope_manager.db"),
                os.path.join(base_dir, "envelope_manager.db"),
                "envelope_manager.db"
            ]
            for cand in candidates:
                if os.path.exists(cand):
                    safety_copy = f"{cand}.pre_restore_{now_str}.bak"
                    try:
                        with open(cand, "rb") as src, open(safety_copy, "wb") as dst:
                            dst.write(src.read())
                    except Exception:
                        pass
                    break

            restored_parties_count = 0
            restored_settings = False

            if "backup_data.json" in file_list:
                json_content = zf.read("backup_data.json").decode("utf-8")
                data = json.loads(json_content)

                # Restore/merge parties
                parties_data = data.get("parties", [])
                for p_dict in parties_data:
                    if not p_dict or not p_dict.get("name"):
                        continue
                    name = p_dict["name"].strip()
                    existing = db_session.query(Party).filter(Party.name.ilike(name)).first()
                    if not existing:
                        new_party = Party(
                            name=name,
                            address=p_dict.get("address", ""),
                            address_line_2=p_dict.get("address_line_2"),
                            address_line_3=p_dict.get("address_line_3"),
                            city=p_dict.get("city", ""),
                            state=p_dict.get("state", ""),
                            pincode=p_dict.get("pincode"),
                            phone=p_dict.get("phone"),
                            mobile=p_dict.get("mobile"),
                            email=p_dict.get("email"),
                            gst_no=p_dict.get("gst_no"),
                            dl_no=p_dict.get("dl_no"),
                            contact_person=p_dict.get("contact_person"),
                            marg_code=p_dict.get("marg_code"),
                            is_active=p_dict.get("is_active", True)
                        )
                        db_session.add(new_party)
                        restored_parties_count += 1
                    else:
                        # Update fields if blank
                        if not existing.phone and p_dict.get("phone"):
                            existing.phone = p_dict["phone"]
                        if not existing.gst_no and p_dict.get("gst_no"):
                            existing.gst_no = p_dict["gst_no"]
                        if not existing.pincode and p_dict.get("pincode"):
                            existing.pincode = p_dict["pincode"]

                # Restore sender settings
                sender_data = data.get("sender_settings")
                if sender_data:
                    sender = db_session.query(SenderSettings).first()
                    if not sender:
                        sender = SenderSettings()
                        db_session.add(sender)
                    for k, v in sender_data.items():
                        if k not in ["id", "created_at", "updated_at"] and hasattr(sender, k) and v is not None:
                            setattr(sender, k, v)
                    restored_settings = True

                db_session.commit()

            return {
                "success": True,
                "message": f"Backup restored successfully: {restored_parties_count} new parties added/updated.",
                "restored_parties": restored_parties_count,
                "restored_settings": restored_settings,
                "files_in_archive": file_list
            }

    except Exception as e:
        db_session.rollback()
        return {
            "success": False,
            "error": f"Failed to restore backup archive: {str(e)}"
        }

