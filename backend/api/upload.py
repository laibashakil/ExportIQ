"""POST /upload — ingest a regulation PDF, factory audit PDF, or export CSV."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from config import get_settings
from tools.firestore_client import set_doc, upload_to_storage

router = APIRouter()
log = logging.getLogger("exportiq.api.upload")


UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("")
async def upload(
    file: UploadFile = File(...),
    kind: Literal["regulation", "factory_audit", "export_data"] = Form(...),
    factory_id: str | None = Form(None),
    regulation_id: str | None = Form(None),
):
    settings = get_settings()
    size_limit = settings.max_pdf_size_mb * 1024 * 1024

    body = await file.read()
    if len(body) > size_limit:
        raise HTTPException(413, f"File exceeds {settings.max_pdf_size_mb}MB limit")

    file_id = f"f_{uuid.uuid4().hex[:10]}"
    dest = UPLOAD_DIR / f"{file_id}_{file.filename}"
    dest.write_bytes(body)

    # For a factory audit PDF, push the file to Firebase Storage and record
    # its path on the factory doc so the mobile Documents tab can surface the
    # "Original Audit Report" card automatically (no manual seeding needed).
    audit_pdf_path = None
    if kind == "factory_audit" and factory_id:
        audit_pdf_path = f"factories/{factory_id}.pdf"
        try:
            stored = upload_to_storage(
                audit_pdf_path, body, content_type=file.content_type or "application/pdf"
            )
            if stored:
                set_doc(f"factories/{factory_id}", {"audit_pdf_path": stored}, merge=True)
            else:
                # In-memory fallback (no real Firebase) — nothing to link.
                audit_pdf_path = None
        except Exception:  # noqa: BLE001
            log.exception("failed to persist audit PDF to Storage for %s", factory_id)
            audit_pdf_path = None

    meta = {
        "file_id": file_id,
        "filename": file.filename,
        "kind": kind,
        "factory_id": factory_id,
        "regulation_id": regulation_id,
        "size_bytes": len(body),
        "stored_path": str(dest),
        "audit_pdf_path": audit_pdf_path,
    }
    set_doc(f"uploads/{file_id}", meta)
    return {"file_id": file_id, "status": "uploaded", **meta}
