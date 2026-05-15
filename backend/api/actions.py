"""GET /actions/{factory_id} — action chain for the latest report."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.firestore_client import get_doc, list_collection

router = APIRouter()


@router.get("/{factory_id}")
async def get_actions(factory_id: str) -> dict:
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if report and report.get("action_chain"):
        return {"factory_id": factory_id, "actions": report["action_chain"]}
    # Fallback: list from per-action subcollection
    docs = list_collection(f"factories/{factory_id}/actions")
    if not docs:
        raise HTTPException(404, "no actions yet — run /analyze first")
    return {"factory_id": factory_id, "actions": docs}
