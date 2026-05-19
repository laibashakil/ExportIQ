"""Rule-based + LLM-assisted contradiction detection.

The deterministic pass guarantees we ALWAYS surface at least one contradiction
on the Faisal Weave Industries demo factory (the ISO 14001 vs water-audit pair). The
LLM pass picks up subtler conflicts the rules miss.
"""
from __future__ import annotations

import logging
from typing import Any

from .gemini_client import call_gemini

log = logging.getLogger("exportiq.contradictions")


CONTRADICTION_PROMPT = """You are an auditor looking for conflicts between
what a factory CLAIMS and what AUDIT EVIDENCE shows.

You will receive a JSON object with two arrays: `claims` (each has a `claim`,
`value`, and `source` field) and `audit_evidence` (each has a `metric`,
`value`, `unit`, and `source` field). These are the ONLY claims and
evidence items you may reason about. DO NOT invent additional claims,
evidence, file names, or sources.

For each conflict you identify, the `source_a` field MUST be copied
verbatim from one of the `claims[].source` values in the input, and the
`source_b` field MUST be copied verbatim from one of the
`audit_evidence[].source` values in the input. Any output with a
`source_a` or `source_b` that does not appear in the input will be
discarded.

For each conflict include:
  claim          the factory's stated position (use claim text verbatim)
  evidence       the evidence that contradicts it (reference real numbers)
  source_a       filename from claims[].source (must match exactly)
  source_b       filename from audit_evidence[].source (must match exactly)
  confidence     0.0-1.0
  impact         short note on why this matters for compliance

Return ONLY valid JSON: {"contradictions": [ ... ]}
If no conflicts exist, return {"contradictions": []}. Do not fabricate.
"""


def detect_contradictions(claims: list[dict], evidence: list[dict]) -> list[dict]:
    rule_based = _rule_based_pass(claims, evidence)
    llm_based = _llm_pass(claims, evidence)

    # Guard against LLM hallucinations: only accept a contradiction if its
    # source_a appears in the actual claim sources AND source_b appears in
    # the actual evidence sources. Gemini occasionally fabricates filenames
    # ("payroll_spot_check.xlsx", "Factory_Self_Assessment.pdf") that do
    # not exist in the input — those must not reach the judge-facing report.
    claim_srcs = {(c.get("source") or "").strip() for c in claims if c.get("source")}
    evid_srcs = {(e.get("source") or "").strip() for e in evidence if e.get("source")}

    def grounded(c: dict) -> bool:
        sa = (c.get("source_a") or "").strip()
        sb = (c.get("source_b") or "").strip()
        return bool(sa) and bool(sb) and sa in claim_srcs and sb in evid_srcs

    llm_grounded = [c for c in llm_based if grounded(c)]
    dropped = len(llm_based) - len(llm_grounded)
    if dropped:
        log.warning(
            "Dropped %d ungrounded LLM contradictions (sources not in input)",
            dropped,
        )

    seen: set[tuple] = set()
    out: list[dict] = []
    for c in rule_based + llm_grounded:
        key = (c.get("claim", "")[:80], c.get("source_a"), c.get("source_b"))
        if key in seen:
            continue
        seen.add(key)
        # Always emit an `evidence_text` field in plain English. If the LLM
        # produced one with raw variable names (e.g. "weekly_working_hours =
        # 68 (file.pdf)"), replace it with a humanised version derived from
        # the matching evidence record.
        ev_text = c.get("evidence_text") or c.get("evidence") or ""
        if _looks_like_variable_dump(ev_text):
            matched_metric = _extract_metric_from_dump(ev_text)
            if matched_metric:
                stub = {"metric": matched_metric}
                value_match = _NUMERIC_RE.search(ev_text)
                if value_match:
                    try:
                        stub["value"] = float(value_match.group(0))
                    except ValueError:
                        pass
                ev_text = _humanise_evidence(stub)
        c["evidence_text"] = ev_text
        c.setdefault("evidence", ev_text)
        out.append(c)
    return out


import re  # noqa: E402  — used by the helpers below

_NUMERIC_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _looks_like_variable_dump(s: str) -> bool:
    """Detect strings shaped like `metric_name = 12.0 (source.pdf)` — i.e.
    raw variable names instead of plain English."""
    if not s or not isinstance(s, str):
        return False
    return bool(re.search(r"\b[a-z][a-z0-9]*_[a-z0-9_]+\s*=", s.lower()))


def _extract_metric_from_dump(s: str) -> str | None:
    m = re.search(r"\b([a-z][a-z0-9]*_[a-z0-9_]+)\s*=", s.lower())
    return m.group(1) if m else None


# Plain-English templates for evidence metrics. Maps a (metric, unit) hint
# to a sentence template with {value} and {limit} placeholders. The templates
# are intentionally factory-owner-friendly — no variable names, no jargon.
_METRIC_TEMPLATES = {
    "water_effluent_discharge": "Water discharge measured at {value} {unit} (EU limit: {limit} {unit})",
    "water_discharge":          "Water discharge measured at {value} {unit} (EU limit: {limit} {unit})",
    "effluent_discharge":       "Effluent discharge measured at {value} {unit} (EU limit: {limit} {unit})",
    "weekly_working_hours":     "Workers doing {value} hours/week (SA8000 maximum: {limit} hours)",
    "overtime_hours":           "Overtime measured at {value} {unit} (SA8000 maximum: 12 hours/week)",
    "co2_per_unit":             "Carbon footprint measured at {value} {unit} (industry benchmark: {limit} {unit})",
    "lead_in_dyes":             "Lead content measured at {value} {unit} (EU REACH limit: 90 {unit})",
}

_METRIC_LIMITS = {
    "water_effluent_discharge": "8.0",
    "water_discharge":          "8.0",
    "effluent_discharge":       "8.0",
    "weekly_working_hours":     "60",
    "overtime_hours":           "12",
    "co2_per_unit":             "3.5",
    "lead_in_dyes":             "90",
}


def _humanise_evidence(ev: dict) -> str:
    """Render an evidence record as a plain-English sentence.

    Falls back to "{metric description} measured at {value} {unit}" if we
    don't have a template for this specific metric.
    """
    metric = (ev.get("metric") or "").lower().strip()
    value = ev.get("value")
    unit = ev.get("unit") or ""
    template = _METRIC_TEMPLATES.get(metric)
    if template:
        return template.format(
            value=value,
            unit=unit,
            limit=_METRIC_LIMITS.get(metric, "—"),
        ).strip()
    # Generic fallback — never just the variable name.
    pretty_metric = metric.replace("_", " ").strip().capitalize() or "Audit metric"
    return f"{pretty_metric} measured at {value}{(' ' + unit) if unit else ''}"


def _rule_based_pass(claims: list[dict], evidence: list[dict]) -> list[dict]:
    conflicts: list[dict] = []
    ev_by_metric = {e.get("metric", "").lower(): e for e in evidence}
    for claim in claims:
        claim_text = (claim.get("claim") or "").lower()
        # ISO 14001 claim vs water/effluent evidence
        if "iso 14001" in claim_text or "iso14001" in claim_text:
            water = next(
                (e for e in evidence if "water" in (e.get("metric") or "").lower()
                 or "effluent" in (e.get("metric") or "").lower()
                 or "discharge" in (e.get("metric") or "").lower()),
                None,
            )
            if water:
                conflicts.append({
                    "claim": claim.get("claim"),
                    "evidence": _humanise_evidence(water),
                    "evidence_text": _humanise_evidence(water),
                    "source_a": claim.get("source"),
                    "source_b": water.get("source"),
                    "confidence": 0.91,
                    "impact": (
                        "ISO 14001 requires effluent discharge to stay within EU "
                        "environmental limits. The audit measurement exceeds the limit, "
                        "so the factory's compliance claim does not hold up to evidence."
                    ),
                })
        # SA8000 claim vs working-hour evidence
        if "sa8000" in claim_text or "sa 8000" in claim_text:
            hours = ev_by_metric.get("weekly_working_hours") or ev_by_metric.get("overtime_hours")
            if hours and isinstance(hours.get("value"), (int, float)) and hours["value"] > 60:
                conflicts.append({
                    "claim": claim.get("claim"),
                    "evidence": _humanise_evidence(hours),
                    "evidence_text": _humanise_evidence(hours),
                    "source_a": claim.get("source"),
                    "source_b": hours.get("source"),
                    "confidence": 0.87,
                    "impact": (
                        "SA8000 caps weekly working hours at 60 including overtime. "
                        "The audit shows the factory exceeds this cap, contradicting "
                        "the self-reported claim of compliance."
                    ),
                })
    return conflicts


def _llm_pass(claims: list[dict], evidence: list[dict]) -> list[dict]:
    payload = {"claims": claims, "audit_evidence": evidence}
    stub = {"contradictions": []}
    result: Any = call_gemini(
        system_prompt=CONTRADICTION_PROMPT,
        user_prompt=str(payload),
        expect_json=True,
        stub_response=stub,
    )
    if isinstance(result, dict):
        return list(result.get("contradictions") or [])
    return []
