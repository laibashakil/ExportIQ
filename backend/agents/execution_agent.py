"""Agent 6: Execution Simulation.

Simulates the impact of executing each action: updates compliance score in
Firestore (real-time animation on mobile HomeScreen), computes PKR risk
reduction, and generates supporting documents (buyer email, CBAM form,
audit checklist).
"""
from __future__ import annotations

import logging
import time

from tools.compliance_scorer import score, risk_level, SEVERITY_PENALTY
from tools.document_generator import (
    generate_buyer_email,
    generate_cbam_form,
    generate_audit_checklist,
)
from tools.firestore_client import (
    set_doc,
    update_compliance_score,
    update_job_progress,
)
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.execution")

AGENT_NAME = "execution_simulation"

SYSTEM_PROMPT = """You are the Execution Simulation Agent for ExportIQ.

For each action in the chain, simulate what executing it would do: which gap
it closes, how the compliance score moves, how much PKR risk evaporates, and
what concrete artefacts (forms, emails, checklists) the factory would need to
produce. Stream score updates so the mobile UI animates in real time."""


def run(state: AgentState) -> dict:
    patches: dict = {}
    factory = state.get("factory_data") or {}
    gaps = state.get("gaps") or []
    actions = state.get("action_chain") or []
    contradictions = state.get("contradictions") or []
    financial = state.get("financial_impact") or {}
    factory_id = state["factory_id"]

    patches.update(log_step(state, AGENT_NAME, "started",
                            {"action_count": len(actions)}, progress=88))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    before_score = score(gaps, n_contradictions=len(contradictions))
    before_risk = int(financial.get("orders_at_risk_pkr") or 0)
    annual_export = int(financial.get("annual_export_pkr") or 0)

    # Persist initial score so the mobile dashboard reflects it
    update_compliance_score(factory_id, before_score, risk_level(before_score), before_risk)
    patches.update(log_step(state, AGENT_NAME, "initial_score",
                            {"score": before_score, "risk_pkr": before_risk}))

    # One proactive quarterly status email per affected buyer — generated up
    # front so we don't spam the buyer with one per action. This replaces the
    # old per-action buyer email which was confessional in tone.
    proactive_emails = _generate_proactive_buyer_emails(factory, financial)
    documents: list[dict] = list(proactive_emails)
    patches.update(log_step(state, AGENT_NAME, "buyer_emails_drafted",
                            {"count": len(proactive_emails)}))

    cumulative_resolved: set[str] = set()
    current_score = before_score
    current_risk = before_risk

    for action in actions:
        # Simulate this action being executed
        cumulative_resolved.update(action.get("addresses_gap_ids", []))
        remaining = [g for g in gaps if g.get("gap_id") not in cumulative_resolved]
        # Contradictions persist until the underlying claim<->evidence pair
        # is independently remediated; they don't disappear automatically
        # just because the related gap was closed.
        new_score = score(remaining, n_contradictions=len(contradictions))
        new_risk = max(0, current_risk - int(action.get("impact_pkr") or 0))
        score_delta = new_score - current_score
        risk_reduction = current_risk - new_risk

        # Generate supporting docs based on action type
        action_docs = _docs_for_action(factory, action, gaps)
        documents.extend(action_docs)

        action["status"] = "SIMULATED"
        action["simulation_output"] = {
            "before_score": current_score,
            "after_score": new_score,
            "score_delta": score_delta,
            "risk_before_pkr": current_risk,
            "risk_after_pkr": new_risk,
            "risk_reduction_pkr": risk_reduction,
            "documents_generated": action_docs,
            "rationale": (
                f"Executing '{action.get('title')}' closes "
                f"{len(action.get('addresses_gap_ids', []))} gap(s); "
                f"score moves {current_score}→{new_score}, risk drops "
                f"PKR {current_risk:,}→{new_risk:,}."
            ),
        }

        patches.update(log_step(
            state, AGENT_NAME, "simulated_action",
            {
                "action_id": action.get("action_id"),
                "title": action.get("title"),
                "score_delta": score_delta,
                "risk_reduction_pkr": risk_reduction,
            },
        ))

        # Real-time score update — drives the mobile score animation
        update_compliance_score(factory_id, new_score, risk_level(new_score), new_risk)
        # Persist per-action doc so the mobile listener picks it up
        set_doc(f"factories/{factory_id}/actions/{action['action_id']}", action)
        time.sleep(0.4)  # let the animation breathe during demo

        current_score = new_score
        current_risk = new_risk

    final = {
        "before_score": before_score,
        "after_score": current_score,
        "score_delta": current_score - before_score,
        "risk_before_pkr": before_risk,
        "risk_after_pkr": current_risk,
        "risk_reduction_pkr": before_risk - current_risk,
        "documents_generated": documents,
        "rationale": (
            f"Executing all {len(actions)} actions raises compliance score "
            f"{before_score}→{current_score} and recovers PKR "
            f"{(before_risk - current_risk):,} of at-risk orders out of "
            f"PKR {annual_export:,} annual exports."
        ),
    }
    patches["simulation_result"] = final
    patches["documents"] = documents
    patches["action_chain"] = actions

    update_job_progress(state["job_id"], status="complete", progress=100,
                       current_agent=AGENT_NAME)
    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"final_score": current_score,
                             "risk_reduction_pkr": before_risk - current_risk},
                            progress=100))
    return patches


def _docs_for_action(factory: dict, action: dict, gaps: list[dict]) -> list[dict]:
    """Filing documents (forms + checklists) only — buyer emails are now
    drafted once up-front per buyer, not per action."""
    addressed_ids = set(action.get("addresses_gap_ids", []))
    target_gaps = [g for g in gaps if g.get("gap_id") in addressed_ids]
    if not target_gaps:
        return []
    gap = target_gaps[0]
    out: list[dict] = []

    factory_name = factory.get("factory_name", "Factory")

    if "CBAM" in (gap.get("regulation") or "").upper():
        out.append(generate_cbam_form(factory_name, "Q2-2026", 1250.0))
    out.append(generate_audit_checklist(factory_name, gap))

    for d in out:
        d["relates_to_action"] = action.get("action_id")
    return out


def _generate_proactive_buyer_emails(factory: dict, financial: dict) -> list[dict]:
    """One Compliance Status Update email per affected buyer.

    Topics in progress are derived from the action chain titles if available,
    but kept high-level and routine in tone.
    """
    factory_name = factory.get("factory_name", "Factory")
    buyers = financial.get("buyers_affected") or factory.get("primary_buyers") or []
    if not buyers:
        return []

    valid_certs = [c for c in factory.get("certifications", []) if c.get("status") == "VALID"]
    # Topics phrased as routine refresh work — never as failure remediation.
    in_progress = [
        "scheduled certification refresh cycle",
        "emissions data documentation refresh",
        "audit trail digitisation for working-hours records",
    ]

    out = []
    for buyer in buyers[:4]:  # cap at 4 emails per factory
        out.append(
            generate_buyer_email(
                factory_name,
                buyer,
                gap={},  # legacy positional — ignored by the new prompt
                action_title="",
                valid_certifications=valid_certs,
                in_progress_topics=in_progress,
            )
        )
    return out
