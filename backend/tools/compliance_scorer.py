"""Deterministic 0-100 compliance scoring used by Gap Detection + Simulation."""
from __future__ import annotations

from models.factory import Gap


SEVERITY_PENALTY = {
    "CRITICAL": 12,
    "HIGH": 10,
    "MEDIUM": 5,
    "LOW": 2,
}
CONTRADICTION_PENALTY = 4


def score(gaps: list[dict] | list[Gap], n_contradictions: int = 0) -> int:
    total = 100
    for g in gaps:
        sev = g.get("severity") if isinstance(g, dict) else g.severity
        total -= SEVERITY_PENALTY.get(sev, 5)
    total -= CONTRADICTION_PENALTY * n_contradictions
    return max(0, min(100, total))


def risk_level(score_value: int) -> str:
    # Bands chosen so the demo's three factories sit cleanly inside their
    # intended risk colour: CRITICAL (<60) lights up Faisal Weave's red gauge,
    # WARNING (60-79) covers Chenab Fabric's yellow band, COMPLIANT (>=80)
    # keeps Ravi Garments green even with a stray LLM advisory.
    if score_value < 60:
        return "CRITICAL"
    if score_value < 80:
        return "WARNING"
    return "COMPLIANT"


def score_after_actions(initial_gaps: list[dict], n_contradictions: int,
                       resolved_gap_ids: set[str]) -> int:
    """Score recomputed assuming the given gap_ids are now resolved."""
    remaining = [g for g in initial_gaps if g.get("gap_id") not in resolved_gap_ids]
    return score(remaining, n_contradictions=0 if not remaining else n_contradictions)
