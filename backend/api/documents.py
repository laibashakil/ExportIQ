"""GET /documents/{factory_id} — all generated artifacts."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.firestore_client import get_doc

router = APIRouter()


@router.get("/{factory_id}")
async def get_documents(factory_id: str) -> dict:
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if not report:
        raise HTTPException(404, "no report yet — run /analyze first")
    return {"factory_id": factory_id, "documents": report.get("documents", [])}
