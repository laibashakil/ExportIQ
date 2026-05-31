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
    """Use the gap's plain-English display_title verbatim — this is already
    an imperative ≤6-word phrase set by the gap_detection agent (e.g.
    "Establish CSDDD Due Diligence Policy"). Falls back to a status-derived verb plus
    a humanised regulation name if no display_title is present."""
    display = (gap.get("display_title") or "").strip()
    if display:
        return display
    reg = gap.get("regulation") or "Compliance Issue"
    reg_short = " ".join(reg.split()[:4])
    verb = {
        "EXPIRED": "Renew",
        "MISSING": "File",
        "NON_CONFORMANT": "Fix",
        "PARTIAL": "Complete",
    }.get((gap.get("status") or "").upper(), "Address")
    return f"{verb} {reg_short}".strip()


# Friendly imperative phrasing for each gap status — used in the action
# description so the mobile UI never shows raw status enums like "MISSING"
# or labels like "Severity: CRITICAL".
_STATUS_PHRASE = {
    "MISSING":         "is not yet on file with the buyer",
    "EXPIRED":         "is past its renewal date",
    "NON_CONFORMANT":  "currently exceeds the buyer's published limit",
    "PARTIAL":         "is only partially documented",
}

_DEADLINE_PHRASE = {
    None:   "as soon as practical",
}


def _action_description(gap: dict) -> str:
    """Plain-English action description aimed at a factory owner.

    No internal labels ("Severity:", "Current status:", "Close gap on"),
    no raw regulation IDs as the first words. We weave the regulation
    name, the human-friendly status phrase, and the deadline into one
    or two natural sentences.
    """
    reg = (gap.get("regulation") or "the buyer regulation").strip()
    status_phrase = _STATUS_PHRASE.get(
        (gap.get("status") or "").upper(),
        "needs documentation refreshed",
    )
    deadline = gap.get("deadline")
    days_remaining = gap.get("days_remaining")
    if deadline and isinstance(days_remaining, int) and days_remaining >= 0:
        timing = f"before the {deadline} deadline ({days_remaining} days remaining)"
    elif deadline:
        timing = f"before the {deadline} deadline"
    else:
        timing = "before the next buyer audit cycle"

    # Evidence sentence — only if we have meaningful evidence
    evidence_items = [e for e in (gap.get("evidence") or []) if e]
    if evidence_items:
        evidence_sentence = (
            f" The audit on file shows {evidence_items[0].rstrip('.')}, "
            f"which is what the buyer's compliance team will flag."
        )
    else:
        evidence_sentence = ""

    return (
        f"The factory's {reg} documentation {status_phrase}. "
        f"Submit the updated paperwork, evidence, and any required "
        f"third-party verification {timing}.{evidence_sentence}"
    ).strip()
