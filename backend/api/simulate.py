"""POST /simulate/{factory_id} — re-run execution simulation on selected actions.

This lets the mobile UI offer "Simulate Action 1" or "Simulate All" buttons
that re-trigger the Execution Agent against a subset of the action chain.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tools.compliance_scorer import score
from tools.document_generator import (
    generate_audit_checklist,
    generate_buyer_email,
    generate_cbam_form,
)
from tools.firestore_client import (
    append_trace,
    get_doc,
)

router = APIRouter()


class SimulateRequest(BaseModel):
    action_ids: list[str] = Field(default_factory=list)
    job_id: str | None = None


@router.post("/{factory_id}")
async def simulate(factory_id: str, req: SimulateRequest) -> dict:
    report = get_doc(f"factories/{factory_id}/reports/latest")
    if not report:
        raise HTTPException(404, "no report yet — run /analyze first")

    actions = report.get("action_chain", [])
    gaps = report.get("gaps", [])
    contradictions = report.get("contradictions", [])
    selected = [a for a in actions if a.get("action_id") in set(req.action_ids)] or actions

    before_score = score(gaps, n_contradictions=len(contradictions))
    before_risk = report.get("orders_at_risk_pkr") or 0

    resolved: set[str] = set()
    risk = before_risk
    documents: list[dict] = []
    factory_name = report.get("factory_name", "Factory")

    for action in selected:
        resolved.update(action.get("addresses_gap_ids", []))
        risk = max(0, risk - int(action.get("impact_pkr") or 0))
        # docs
        addressed = [g for g in gaps if g.get("gap_id") in set(action.get("addresses_gap_ids", []))]
        if addressed:
            gap = addressed[0]
            documents.append(generate_buyer_email(factory_name, "NordStyle Group", gap, action.get("title", "")))
            if "CBAM" in (gap.get("regulation") or "").upper():
                documents.append(generate_cbam_form(factory_name, "Q2-2026", 1250.0))
            documents.append(generate_audit_checklist(factory_name, gap))

    remaining = [g for g in gaps if g.get("gap_id") not in resolved]
    after_score = score(remaining, n_contradictions=0 if not remaining else len(contradictions))

    # SIMULATION ONLY — never overwrites real score.
    # /simulate is a pure what-if preview. We do NOT write the projected
    # score (or any other simulated field) anywhere on /factories/{id} —
    # not on the live doc, not on a /simulations/ subdoc. The projected
    # values are returned inline so the mobile card can render them in
    # place without subscribing to any Firestore listener.
    if req.job_id:
        append_trace(req.job_id, {
            "agent": "execution_simulation",
            "step": "manual_simulate",
            "detail": {
                "action_count": len(selected),
                "before_score": before_score,
                "after_score": after_score,
                "risk_reduction_pkr": before_risk - risk,
            },
        })

    return {
        "factory_id": factory_id,
        "before_score": before_score,
        "after_score": after_score,
        "score_delta": after_score - before_score,
        "risk_before_pkr": before_risk,
        "risk_after_pkr": risk,
        "risk_reduction_pkr": before_risk - risk,
        "documents_generated": documents,
        "preview_only": True,
    }
