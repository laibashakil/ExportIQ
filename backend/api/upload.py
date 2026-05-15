"""POST /upload — ingest a regulation PDF, factory audit PDF, or export CSV."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from config import get_settings
from tools.firestore_client import set_doc

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

    meta = {
        "file_id": file_id,
        "filename": file.filename,
        "kind": kind,
        "factory_id": factory_id,
        "regulation_id": regulation_id,
        "size_bytes": len(body),
        "stored_path": str(dest),
    }
    set_doc(f"uploads/{file_id}", meta)
    return {"file_id": file_id, "status": "uploaded", **meta}
