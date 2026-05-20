"""Documents API.

- GET /documents/{factory_id}            — list every generated artifact.
- POST /documents/{factory_id}/audit-ready
    Trigger Stage 2 audit-ready email generation for every affected buyer
    once the user has marked all remediation actions complete (e.g. by
    ticking off every interactive checklist item on the mobile app).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.document_generator import generate_audit_ready_email
from tools.firestore_client import get_doc, set_doc

router = APIRouter()


@router.get("/{factory_id}")
async def get_documents(factory_id: str) -> dict:
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if not report:
        raise HTTPException(404, "no report yet — run /analyze first")
    return {"factory_id": factory_id, "documents": report.get("documents", [])}


@router.post("/{factory_id}/audit-ready")
async def generate_audit_ready(factory_id: str) -> dict:
    """Generate Stage 2 audit-ready emails for every affected buyer and append
    them to the report's documents array. Idempotent — if a Stage 2 email
    already exists for a given buyer it is skipped."""
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if not report:
        raise HTTPException(404, "no report yet — run /analyze first")

    factory_name = report.get("factory_name", "Factory")
    fin = report.get("financial_impact") or {}
    buyers = fin.get("buyers_affected") or []
    if not buyers:
        # Fall back to the factory doc's primary buyers if no impact yet
        factory_doc = get_doc(f"factories/{factory_id}") or {}
        buyers = factory_doc.get("primary_buyers") or []
    if not buyers:
        raise HTTPException(400, "no buyers found for this factory")

    # Pull valid certifications off the factory profile if present
    factory_data = report.get("factory_profile") or {}
    certs = factory_data.get("certifications") or []

    existing = report.get("documents") or []
    already = {
        (d.get("buyer"), d.get("stage"))
        for d in existing
        if d.get("kind") == "BUYER_EMAIL" and d.get("stage") == "AUDIT_READY"
    }

    new_docs = []
    for buyer in buyers[:4]:
        if (buyer, "AUDIT_READY") in already:
            continue
        new_docs.append(generate_audit_ready_email(
            factory_name, buyer, valid_certifications=certs,
        ))

    if not new_docs:
        return {
            "factory_id": factory_id,
            "stage_2_generated": 0,
            "documents": existing,
            "note": "audit-ready emails already exist for all affected buyers",
        }

    merged = existing + new_docs
    # Re-write the whole report doc with the merged documents array
    report["documents"] = merged
    set_doc(f"factories/{factory_id}/reports/latest", report)

    return {
        "factory_id": factory_id,
        "stage_2_generated": len(new_docs),
        "documents": merged,
    }
