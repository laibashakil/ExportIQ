"""Agent 4: Financial Impact.

Translates compliance gaps into PKR exposure: which buyer orders are at risk,
how concentrated the exposure is, and what the realistic worst-case loss is
if gaps remain unremediated.
"""
from __future__ import annotations

import logging

from tools.compliance_scorer import risk_level, score as compute_score
from tools.firestore_client import update_compliance_score
from tools.gemini_client import call_gemini
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.financial")

AGENT_NAME = "financial_impact"

SYSTEM_PROMPT = """You are the Financial Impact Agent for ExportIQ.

Translate compliance gaps into PKR financial risk for a Pakistani textile
exporter. Assume that CRITICAL gaps put 80%% of buyer orders at immediate risk,
HIGH gaps 50%%, MEDIUM 20%%, LOW 5%%. Account for buyer concentration: a
single-buyer factory facing a CRITICAL gap from that buyer's home jurisdiction
faces near-total exposure. Output JSON only."""


SEVERITY_AT_RISK_PCT = {
    "CRITICAL": 0.80,
    "HIGH": 0.50,
    "MEDIUM": 0.20,
    "LOW": 0.05,
}

# Which buyer maps to which jurisdiction — used to scope at-risk orders
BUYER_JURISDICTION = {
    "NordStyle Group": "EU",
    "EuroThread SA": "EU",
    "EuroThread SA": "EU",
    "Mango": "EU",
    "BritMart Retail": "UK",
    "M&S": "UK",
    "Marks & Spencer": "UK",
    "Next": "UK",
    "Tesco": "UK",
    "Asda": "UK",
}


def run(state: AgentState) -> dict:
    patches: dict = {}
    patches.update(log_step(state, AGENT_NAME, "started", None, progress=60))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    factory = state.get("factory_data") or {}
    gaps = state.get("gaps") or []

    annual_export_pkr = int(factory.get("annual_export_pkr") or 0)
    buyers = factory.get("primary_buyers") or []
    exports_by_buyer = factory.get("exports_by_buyer_pkr") or {}

    # Determine worst-severity gap per jurisdiction
    max_eu_sev = _max_severity_for_jurisdictions(gaps, {"EU"})
    max_uk_sev = _max_severity_for_jurisdictions(gaps, {"UK"})

    at_risk_pkr = 0
    buyers_affected: list[str] = []
    for buyer in buyers:
        juris = BUYER_JURISDICTION.get(buyer)
        sev = max_eu_sev if juris == "EU" else (max_uk_sev if juris == "UK" else max_eu_sev)
        if sev is None:
            continue
        pct = SEVERITY_AT_RISK_PCT.get(sev, 0.0)
        if pct <= 0:
            continue
        buyer_exposure = int(exports_by_buyer.get(buyer, annual_export_pkr / max(len(buyers), 1)))
        at_risk_pkr += int(buyer_exposure * pct)
        buyers_affected.append(buyer)

    # Buyer concentration risk
    top_concentration_pct = 0.0
    if exports_by_buyer:
        top_concentration_pct = max(exports_by_buyer.values()) / sum(exports_by_buyer.values()) * 100
    elif buyers:
        top_concentration_pct = 100.0 / len(buyers)

    impact = {
        "annual_export_pkr": annual_export_pkr,
        "orders_at_risk_pkr": at_risk_pkr,
        "buyers_affected": buyers_affected,
        "max_eu_severity": max_eu_sev,
        "max_uk_severity": max_uk_sev,
        "top_buyer_concentration_pct": round(top_concentration_pct, 2),
        "exposure_ratio": round(at_risk_pkr / annual_export_pkr, 3) if annual_export_pkr else 0.0,
    }

    # Optional LLM commentary on the financial picture
    commentary = call_gemini(
        SYSTEM_PROMPT,
        f"Factory: {factory.get('factory_name')}\nImpact: {impact}\n"
        f"Top gap severities: EU={max_eu_sev}, UK={max_uk_sev}\n"
        f"Write a 2-sentence executive summary of the financial risk.",
        expect_json=False,
        stub_response=(
            f"{factory.get('factory_name', 'Factory')} faces PKR {at_risk_pkr:,} of orders at risk "
            f"({impact['exposure_ratio']*100:.1f}% of annual exports). "
            f"Buyer concentration of {top_concentration_pct:.0f}% with "
            f"{', '.join(buyers_affected) or 'no buyers'} compounds the exposure."
        ),
    )
    impact["commentary"] = commentary if isinstance(commentary, str) else str(commentary)

    patches["financial_impact"] = impact

    # Write the **real** compliance score to /factories/{id}. This is the
    # canonical source of truth read by the mobile HomeScreen + status gauge.
    # We do it here (not in execution_simulation) so what-if simulations
    # never overwrite the live score.
    contradictions = state.get("contradictions") or []
    real_score = compute_score(gaps, n_contradictions=len(contradictions))
    try:
        update_compliance_score(
            state["factory_id"], real_score, risk_level(real_score), at_risk_pkr,
        )
    except Exception:  # noqa: BLE001
        log.exception("failed to persist real compliance_score for %s", state.get("factory_id"))

    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"orders_at_risk_pkr": at_risk_pkr,
                             "buyers_affected": buyers_affected,
                             "real_compliance_score": real_score},
                            progress=70))
    return patches


_SEVERITY_RANK = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}


def _max_severity_for_jurisdictions(gaps: list[dict], jurisdictions: set[str]) -> str | None:
    best: str | None = None
    for g in gaps:
        reg = (g.get("regulation") or "").upper()
        in_juris = any(j in reg for j in jurisdictions)
        if not in_juris:
            continue
        sev = g.get("severity")
        if sev and _SEVERITY_RANK.get(sev, 0) > _SEVERITY_RANK.get(best or "", 0):
            best = sev
    return best
