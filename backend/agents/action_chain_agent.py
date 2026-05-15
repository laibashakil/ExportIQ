"""Agent 5: Action Chain.

Produces 3-5 prioritised actions that, taken together, would close the
highest-impact gaps. Each action carries an estimated PKR risk-reduction and
score-delta so the Simulation agent has something to verify.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta

from tools.compliance_scorer import SEVERITY_PENALTY
from tools.gemini_client import call_gemini
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.action_chain")

AGENT_NAME = "action_chain"

SYSTEM_PROMPT = """You are the Action Chain Agent for ExportIQ.

Given a list of compliance gaps and the factory's financial exposure, produce
the SMALLEST set of actions (3-5) that mitigate the largest PKR risk. Prefer
actions with binding deadlines first. Each action must list which gap_ids it
addresses, an effort level, a deadline, and an honest PKR-impact estimate.
Output strict JSON only."""


EFFORT_BY_STATUS = {
    "MISSING": "HIGH",
    "EXPIRED": "MEDIUM",
    "NON_CONFORMANT": "MEDIUM",
    "PARTIAL": "LOW",
}


def run(state: AgentState) -> dict:
    patches: dict = {}
    patches.update(log_step(state, AGENT_NAME, "started", None, progress=75))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    gaps = state.get("gaps") or []
    financial = state.get("financial_impact") or {}
    orders_at_risk = int(financial.get("orders_at_risk_pkr") or 0)

    # Rank gaps by severity × days_remaining (urgency)
    ranked = sorted(
        gaps,
        key=lambda g: (
            -SEVERITY_PENALTY.get(g.get("severity", "MEDIUM"), 5),
            g.get("days_remaining") if g.get("days_remaining") is not None else 9999,
        ),
    )
    top = ranked[:5]

    total_penalty = sum(SEVERITY_PENALTY.get(g.get("severity", "MEDIUM"), 5) for g in top) or 1

    actions: list[dict] = []
    for i, gap in enumerate(top, start=1):
        weight = SEVERITY_PENALTY.get(gap.get("severity", "MEDIUM"), 5) / total_penalty
        impact_pkr = int(orders_at_risk * weight)
        action = {
            "action_id": f"act_{uuid.uuid4().hex[:8]}",
            "priority": i,
            "title": _action_title(gap),
            "description": _action_description(gap),
            "addresses_gap_ids": [gap.get("gap_id")],
            "effort": EFFORT_BY_STATUS.get(gap.get("status", ""), "MEDIUM"),
            "deadline": gap.get("deadline") or (date.today() + timedelta(days=60)).isoformat(),
            "impact_pkr": impact_pkr,
            "status": "PENDING",
            "estimated_score_delta": SEVERITY_PENALTY.get(gap.get("severity", "MEDIUM"), 5),
        }
        actions.append(action)

    # LLM-generated overall rationale
    rationale = call_gemini(
        SYSTEM_PROMPT,
        f"Top gaps: {[(g.get('regulation'), g.get('severity')) for g in top]}\n"
        f"Orders at risk: PKR {orders_at_risk:,}\n"
        f"Draft a 2-sentence rationale for why these actions, in this order, "
        f"minimise loss for the exporter.",
        expect_json=False,
        stub_response=(
            f"These {len(actions)} actions target the highest-severity, soonest-deadline "
            f"gaps first, recovering an estimated PKR {sum(a['impact_pkr'] for a in actions):,} "
            f"of at-risk orders."
        ),
    )

    patches["action_chain"] = actions
    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"action_count": len(actions),
                             "total_impact_pkr": sum(a["impact_pkr"] for a in actions)},
                            progress=85))
    if isinstance(rationale, str):
        patches.update(log_step(state, AGENT_NAME, "rationale", rationale))
    return patches


def _action_title(gap: dict) -> str:
    reg = gap.get("regulation", "Compliance")
    req = (gap.get("requirement") or "").strip().rstrip(".")
    if gap.get("status") == "EXPIRED":
        return f"Renew {reg} certification"
    if gap.get("status") == "MISSING":
        return f"File {reg}: {req[:48]}"
    if gap.get("status") == "NON_CONFORMANT":
        return f"Remediate {reg} non-conformance: {req[:48]}"
    return f"Address {reg}: {req[:48]}"


def _action_description(gap: dict) -> str:
    return (
        f"Close gap on {gap.get('regulation')}: {gap.get('requirement')}. "
        f"Current status: {gap.get('status')}. "
        f"Severity: {gap.get('severity')}. "
        f"Deadline: {gap.get('deadline') or 'rolling'}. "
        f"Evidence cited: {'; '.join(gap.get('evidence', []))[:240]}"
    )
