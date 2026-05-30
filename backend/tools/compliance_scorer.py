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

# When the entire remediation plan is executed the factory reaches full
# compliance. We cap the projected score here rather than letting a residual
# contradiction penalty strand it below 100 (e.g. 100 - 2·4 = 92).
FULL_COMPLIANCE_SCORE = 100


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


def simulate_close(initial_gaps: list[dict], resolved_gap_ids: set[str] | list[str],
                   n_contradictions: int = 0) -> int:
    """Project the compliance score after the given gap_ids are remediated.

    This is the close-the-gaps simulation entry point referenced by the
    Execution Simulator and Action Chain skills. When *every* gap is closed
    the factory reaches full compliance: the contradictions those gaps stem
    from are resolved alongside them, so the residual contradiction penalty
    is dropped and the score caps at exactly FULL_COMPLIANCE_SCORE (100) — not
    100 - CONTRADICTION_PENALTY·n_contradictions, which would strand it at
    e.g. 92.
    """
    resolved = set(resolved_gap_ids or [])
    remaining = [g for g in initial_gaps if g.get("gap_id") not in resolved]
    if not remaining:
        return FULL_COMPLIANCE_SCORE
    return score(remaining, n_contradictions=n_contradictions)


def score_after_actions(initial_gaps: list[dict], n_contradictions: int,
                       resolved_gap_ids: set[str]) -> int:
    """Score recomputed assuming the given gap_ids are now resolved."""
    return simulate_close(initial_gaps, resolved_gap_ids, n_contradictions=n_contradictions)
