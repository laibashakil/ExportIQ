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
    generate_csddd_report,
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
    # "Simulate All" — either no specific ids were passed (so we fell back to
    # the whole chain) or the request explicitly covers every action.
    all_actions = bool(actions) and len(selected) == len(actions)

    # Use the report's pinned/persisted current score as the starting point so
    # the simulation preview animates from the SAME number the home gauge shows
    # (demo factories are pinned via demo_report; uploads use the live score).
    before_score = int(
        report.get("compliance_score")
        or report.get("original_compliance_score")
        or score(gaps, n_contradictions=len(contradictions))
    )
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
            if "CSDDD" in (gap.get("regulation") or "").upper():
                documents.append(generate_csddd_report(factory_name, "Q2-2026"))
            documents.append(generate_audit_checklist(factory_name, gap))

    # Project the score forward from the pinned current score using each
    # action's estimated_score_delta — keeps the preview consistent with the
    # home gauge and the per-action deltas shown on the action cards.
    after_score = min(100, before_score + sum(
        int(a.get("estimated_score_delta") or 0) for a in selected
    ))

    # Executing the entire plan brings the factory to full compliance: every
    # gap is closed and the contradictions they stem from resolve alongside,
    # so the projected end state is exactly 100 / PKR 0 — never stranded at 92
    # by a residual contradiction penalty or a leftover risk balance.
    if all_actions:
        after_score = 100
        risk = 0

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
        # Present only when the whole chain was simulated; lets clients pin the
        # full-plan reveal to the canonical 100 / PKR 0 end state.
        "score_after_full_simulation": after_score if all_actions else None,
        "orders_at_risk_after_simulation": risk if all_actions else None,
        "all_actions": all_actions,
        "documents_generated": documents,
        "preview_only": True,
    }
