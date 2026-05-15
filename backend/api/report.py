"""GET /report/{factory_id} — full compliance report (latest)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.firestore_client import get_doc

router = APIRouter()


@router.get("/{factory_id}")
async def get_report(factory_id: str) -> dict:
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if not report:
        raise HTTPException(404, f"no report yet for {factory_id} — run /analyze first")
    return report
