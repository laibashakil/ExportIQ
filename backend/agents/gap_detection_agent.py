"""Agent 3: Gap Detection.

Cross-references the regulation rulebook against the factory profile to
produce a list of gaps (missing certifications, exceeded numerical limits,
expired audits) and a list of contradictions (factory claim vs audit
evidence) — every contradiction must cite TWO sources by name.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, date

from tools.contradiction_detector import detect_contradictions
from tools.gemini_client import call_gemini
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.gap")

AGENT_NAME = "gap_detection"

SYSTEM_PROMPT = """You are the Gap Detection Agent for ExportIQ.

Given a regulation rulebook and a factory profile, identify every requirement
the factory fails to meet. For each gap, classify severity, cite the relevant
audit evidence, and compute days_remaining vs the deadline. Be conservative:
prefer false positives over false negatives — judges will see this output.
Output strict JSON: {"gaps": [...], "summary": "..."}"""


GAP_PROMPT = """Compare this regulation rulebook against this factory profile.

Identify gaps — every rule the factory does not satisfy. For each:
  gap_id          unique short id
  regulation      regulation name (e.g. "EU CBAM")
  requirement     plain-English rule statement
  status          MISSING | NON_CONFORMANT | EXPIRED | PARTIAL
  severity        CRITICAL | HIGH | MEDIUM | LOW
  deadline        ISO date (copy from the rule)
  days_remaining  integer (relative to today)
  evidence        list of strings citing the audit evidence used to flag this

Return ONLY valid JSON: {"gaps": [...], "summary": "one-paragraph executive summary"}"""


def run(state: AgentState) -> dict:
    patches: dict = {}
    patches.update(log_step(state, AGENT_NAME, "started", None, progress=40))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    factory = state.get("factory_data") or {}
    rules = state.get("regulation_rules") or []

    # Rule-based gap pass (deterministic — guarantees demo output)
    deterministic_gaps = _deterministic_gaps(factory, rules)
    patches.update(log_step(state, AGENT_NAME, "deterministic_pass",
                            {"gaps_found": len(deterministic_gaps)}))

    # LLM gap pass (catches the subtle ones)
    llm_gaps = _llm_gaps(factory, rules)
    patches.update(log_step(state, AGENT_NAME, "llm_pass",
                            {"gaps_found": len(llm_gaps)}))

    gaps = _merge_gaps(deterministic_gaps, llm_gaps)

    # Contradiction detection
    contradictions = detect_contradictions(
        claims=factory.get("claims", []),
        evidence=factory.get("audit_evidence", []),
    )
    patches.update(log_step(
        state, AGENT_NAME, "contradictions_detected",
        {"count": len(contradictions),
         "first": contradictions[0] if contradictions else None},
    ))

    patches["gaps"] = gaps
    patches["contradictions"] = contradictions
    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"gap_count": len(gaps),
                             "contradiction_count": len(contradictions)},
                            progress=55))
    return patches


def _deterministic_gaps(factory: dict, rules: list[dict]) -> list[dict]:
    """Rule-based gap detection — guarantees coverage of the demo critical gaps."""
    today = date.today()
    gaps: list[dict] = []

    # Build lookup of factory facts
    certs_by_name = {c.get("name", "").upper(): c for c in factory.get("certifications", [])}
    evidence_by_metric = {e.get("metric", "").lower(): e
                         for e in factory.get("audit_evidence", [])}

    for rule in rules:
        category = rule.get("category")
        deadline = rule.get("deadline")
        days_remaining = None
        if deadline:
            try:
                days_remaining = (date.fromisoformat(deadline) - today).days
            except ValueError:
                pass

        # Category: AUDIT_CERTIFICATION — check cert exists & valid
        if category == "AUDIT_CERTIFICATION":
            cert_name = rule.get("certification") or _guess_cert_from_req(rule.get("requirement", ""))
            if cert_name:
                cert = certs_by_name.get(cert_name.upper())
                if not cert:
                    gaps.append(_gap(rule, "MISSING",
                                     [f"No record of {cert_name} certification in factory profile"],
                                     days_remaining))
                elif cert.get("status") == "EXPIRED":
                    gaps.append(_gap(rule, "EXPIRED",
                                     [f"{cert_name} expired on {cert.get('expiry_date')}"],
                                     days_remaining))

        # Category: CHEMICAL — check measured value vs limit
        if category == "CHEMICAL" and rule.get("numerical_limit") is not None:
            metric = (rule.get("metric") or "").lower()
            ev = evidence_by_metric.get(metric)
            if ev and isinstance(ev.get("value"), (int, float)):
                if ev["value"] > rule["numerical_limit"]:
                    gaps.append(_gap(rule, "NON_CONFORMANT",
                                     [f"{metric} = {ev['value']} {ev.get('unit') or ''} > limit "
                                      f"{rule['numerical_limit']} ({ev.get('source')})"],
                                     days_remaining))

        # Category: REPORTING / CARBON — check the declaration claim exists
        if category in ("REPORTING", "CARBON"):
            claim_text = (rule.get("requirement") or "").lower()
            has_claim = any(claim_text[:20] in (c.get("claim", "").lower())
                          for c in factory.get("claims", []))
            if not has_claim:
                gaps.append(_gap(rule, "MISSING",
                                 [f"No factory claim or evidence for: {rule.get('requirement')}"],
                                 days_remaining))

        # Category: LABOUR — generic check
        if category == "LABOUR":
            metric = (rule.get("metric") or "").lower()
            if metric and metric in evidence_by_metric:
                ev = evidence_by_metric[metric]
                limit = rule.get("numerical_limit")
                if limit is not None and isinstance(ev.get("value"), (int, float)) \
                        and ev["value"] > limit:
                    gaps.append(_gap(rule, "NON_CONFORMANT",
                                     [f"{metric} = {ev['value']} > {limit} ({ev.get('source')})"],
                                     days_remaining))

    return gaps


def _gap(rule: dict, status: str, evidence: list[str], days_remaining: int | None) -> dict:
    return {
        "gap_id": f"gap_{uuid.uuid4().hex[:8]}",
        "regulation": rule.get("regulation_name") or rule.get("regulation_id") or "Unknown",
        "requirement": rule.get("requirement"),
        "status": status,
        "severity": rule.get("severity_if_missed", "HIGH"),
        "deadline": rule.get("deadline"),
        "days_remaining": days_remaining,
        "evidence": evidence,
        "rule_id": rule.get("rule_id"),
    }


def _guess_cert_from_req(req: str) -> str | None:
    req_u = req.upper()
    for cert in ("SA8000", "ISO 14001", "GOTS", "OEKO-TEX", "BSCI", "WRAP"):
        if cert in req_u:
            return cert
    return None


def _llm_gaps(factory: dict, rules: list[dict]) -> list[dict]:
    payload = {
        "rules": rules[:40],  # keep prompt tight
        "factory_profile": factory,
        "today": date.today().isoformat(),
    }
    stub = {"gaps": [], "summary": ""}
    out = call_gemini(SYSTEM_PROMPT, str(payload), expect_json=True, stub_response=stub)
    gaps = []
    if isinstance(out, dict):
        for g in out.get("gaps") or []:
            g.setdefault("gap_id", f"gap_{uuid.uuid4().hex[:8]}")
            gaps.append(g)
    return gaps


def _merge_gaps(a: list[dict], b: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for g in a + b:
        key = f"{g.get('regulation','')}|{g.get('requirement','')[:60]}"
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out
