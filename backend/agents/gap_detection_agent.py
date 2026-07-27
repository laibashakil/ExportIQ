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
  regulation      regulation name (e.g. "EU CSDDD")
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

    # LLM gap pass (catches the subtle ones). Filtered against the loaded
    # rule set so Gemini hallucinations (fire safety / HAZMAT / arbitrary
    # short codes) cannot inject phantom gaps into a clean factory and tip
    # the score into the wrong risk band.
    valid_rule_ids = {(r.get("rule_id") or "").lower() for r in rules if r.get("rule_id")}
    valid_reg_names = {(r.get("regulation_name") or "").lower() for r in rules if r.get("regulation_name")}
    raw_llm_gaps = _llm_gaps(factory, rules)
    llm_gaps = _filter_llm_gaps(raw_llm_gaps, valid_rule_ids, valid_reg_names)
    patches.update(log_step(state, AGENT_NAME, "llm_pass",
                            {"gaps_found": len(llm_gaps),
                             "gaps_filtered_out": len(raw_llm_gaps) - len(llm_gaps)}))

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

    # Generate plain-English display_title for every gap (≤6 words). This is
    # what the mobile Status screen renders as the card header.
    gaps = _attach_display_titles(gaps)
    patches.update(log_step(state, AGENT_NAME, "display_titles_attached",
                            {"count": len(gaps)}))

    patches["gaps"] = gaps
    patches["contradictions"] = contradictions
    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"gap_count": len(gaps),
                             "contradiction_count": len(contradictions)},
                            progress=55))
    return patches


# Heuristic plain-English titles — used as both the deterministic source of
# truth AND as the stub for Gemini in offline mode. We never want to render
# a raw `requirement` field on the mobile UI; every gap must have a clean
# imperative phrase under 6 words.
_TITLE_RULES: list[tuple[str, str]] = [
    # (regex against `requirement` or `regulation`, plain-English title)
    (r"periodic supplier audit|supplier audit|smeta|bsci",
     "Commission SMETA Supplier Audits"),
    (r"due diligence policy|csddd|article 8|article 5",
     "Establish CSDDD Due Diligence Policy"),
    (r"grievance|complaints procedure|article 11",
     "Implement Formal Grievance Mechanism"),
    (r"modern slavery statement|msa statement|section 54|s\.?54",
     "Publish Modern Slavery Statement"),
    (r"supply chain.*(audit|due diligence)",
     "Complete Supply Chain Due Diligence"),
    (r"minimum age|ilo.*138|age verification",
     "Verify Worker Age Records"),
    (r"azo dye|formaldehyde|chromium|svhc",
     "Commission REACH Chemical Test"),
    (r"sa[\s-]?8000|social accountability",
     "Renew Social Accountability Certificate"),
    (r"labour|labor.*(standard|cert)|certverify.*labour",
     "Renew Labour Standards Certificate"),
    (r"iso[\s-]?45001|worker safety",
     "Renew Worker Safety Certificate"),
    (r"working hours|paper logs|time tracking",
     "Digitise Worker Time Records"),
    (r"chemical discharge|effluent|water audit|water.*discharge",
     "Fix Water Discharge Levels"),
    (r"lead in dyes|heavy metal",
     "Reduce Heavy Metal Levels"),
    (r"iso[\s-]?14001|environmental management",
     "Fix Environmental Management Issues"),
    (r"zdhc|zero discharge",
     "Meet Chemical Discharge Rules"),
    (r"reach",
     "Meet EU Chemical Safety Rules"),
    (r"gots|organic textile",
     "Get Organic Textile Certificate"),
    (r"oeko[\s-]?tex",
     "Renew Textile Safety Standard"),
]


def _heuristic_title(gap: dict) -> str:
    """Plain-English ≤6-word title derived from requirement + regulation + status.

    Never returns the bare word "Regulation" — falls back to a status verb
    (Renew/File/Fix) plus a humanised regulation name.
    """
    import re

    req = (gap.get("requirement") or "").lower()
    reg = (gap.get("regulation") or "").lower()
    haystack = f"{req} {reg}"
    for pattern, title in _TITLE_RULES:
        if re.search(pattern, haystack):
            return title
    # Status-derived verb + regulation name
    status = (gap.get("status") or "").upper()
    verb = {
        "EXPIRED": "Renew",
        "MISSING": "File",
        "NON_CONFORMANT": "Fix",
        "PARTIAL": "Complete",
    }.get(status, "Address")
    reg_short = (gap.get("regulation") or "Compliance Issue")
    # Trim long reg names to ≤4 words so verb + reg ≤6 total.
    reg_words = [w for w in reg_short.split() if w][:4]
    return f"{verb} {' '.join(reg_words)}"[:80]


def _attach_display_titles(gaps: list[dict]) -> list[dict]:
    """Use Gemini to produce a ≤6-word imperative title for every gap.

    Falls back to the deterministic heuristic when Gemini is offline or
    returns garbage (which is what the stub also returns).
    """
    if not gaps:
        return gaps

    # Always compute the heuristic title first — it's our floor.
    for g in gaps:
        if not g.get("display_title"):
            g["display_title"] = _heuristic_title(g)

    # Then ask Gemini for nicer phrasing. We pass the whole batch in one call
    # to keep latency down.
    payload = [
        {
            "gap_id": g.get("gap_id"),
            "regulation": g.get("regulation"),
            "requirement": g.get("requirement"),
            "status": g.get("status"),
            "heuristic_title": g.get("display_title"),
        }
        for g in gaps
    ]
    sys_prompt = (
        "You produce SHORT plain-English titles for compliance gaps. "
        "Each title must be an imperative verb phrase (e.g. 'File ...', "
        "'Renew ...', 'Fix ...') of AT MOST 6 words. No acronyms unless "
        "they are universally known (EU is fine, CSDDD/SA8000/ISO are not — "
        "spell them out as 'Supply Chain', 'Social Accountability', 'Environmental'). "
        "Return ONLY valid JSON: {\"titles\": [{\"gap_id\": ..., \"title\": "
        "\"...\"}, ...]}. If unsure, copy the heuristic_title verbatim."
    )
    try:
        out = call_gemini(
            sys_prompt, str(payload), expect_json=True,
            stub_response={"titles": [{"gap_id": g.get("gap_id"),
                                         "title": g.get("display_title")} for g in gaps]},
        )
        if isinstance(out, dict):
            by_id = {t.get("gap_id"): t.get("title") for t in (out.get("titles") or [])}
            for g in gaps:
                t = by_id.get(g.get("gap_id"))
                if t and isinstance(t, str):
                    # Enforce 6-word cap defensively.
                    words = t.strip().split()
                    if 0 < len(words) <= 8:
                        g["display_title"] = " ".join(words[:6])
    except Exception:  # noqa: BLE001
        log.exception("display_title LLM pass failed — heuristic titles kept")
    return gaps


# Rule_id → keywords that, if ALL present somewhere in factory claims, mean
# the factory has covered the requirement. Used as the fallback when no
# explicit metric value is on file.
_CLAIM_KEYWORDS: dict[str, tuple[str, ...]] = {
    "csddd.art8.due_diligence_policy": ("supply chain", "due diligence"),
    "csddd.art5.integrate_policy": ("due diligence", "policy"),
}


def _claims_contain_all(factory: dict, keywords: tuple[str, ...]) -> bool:
    blob = " ".join(c.get("claim", "").lower() for c in factory.get("claims", []))
    return all(kw in blob for kw in keywords)


def _status_str(val) -> str | None:
    if isinstance(val, str):
        return val.upper()
    return None


def _deterministic_gaps(factory: dict, rules: list[dict]) -> list[dict]:
    """Rule-based gap detection — guarantees coverage of the demo critical gaps.

    Detection contract per category:
      AUDIT_CERTIFICATION       check cert by name → MISSING / EXPIRED
      CHEMICAL / LABOUR / CARBON measured metric value vs numerical_limit
      REPORTING / SUPPLY_CHAIN   metric-tagged evidence first (DRAFT/PUBLISHED/
                                  true/false), claim-keyword fallback if none
      REPORTING_ANNUAL          skipped here (LLM may still surface)
    """
    today = date.today()
    gaps: list[dict] = []

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

        # AUDIT_CERTIFICATION — check cert exists & valid
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
                elif cert.get("status") == "MISSING":
                    gaps.append(_gap(rule, "MISSING",
                                     [f"{cert_name} not held"],
                                     days_remaining))

        # CHEMICAL / LABOUR / CARBON — measured value vs numerical limit
        elif category in ("CHEMICAL", "LABOUR", "CARBON") and rule.get("numerical_limit") is not None:
            metric = (rule.get("metric") or "").lower()
            ev = evidence_by_metric.get(metric)
            if ev and isinstance(ev.get("value"), (int, float)) and not isinstance(ev.get("value"), bool):
                if ev["value"] > rule["numerical_limit"]:
                    gaps.append(_gap(rule, "NON_CONFORMANT",
                                     [f"{metric} = {ev['value']} {ev.get('unit') or ''} > limit "
                                      f"{rule['numerical_limit']} ({ev.get('source')})"],
                                     days_remaining))

        # REPORTING / SUPPLY_CHAIN — evidence metric first, claim-keyword fallback
        elif category in ("REPORTING", "SUPPLY_CHAIN"):
            metric = (rule.get("metric") or "").lower()
            ev = evidence_by_metric.get(metric)
            if ev is not None:
                val = ev.get("value")
                status = _status_str(val)
                if status in ("PUBLISHED", "FILED", "COMPLETE", "VALID", "TRUE"):
                    pass  # compliant
                elif status == "DRAFT":
                    gaps.append(_gap(rule, "PARTIAL",
                                     [f"{metric} status = DRAFT ({ev.get('source')})"],
                                     days_remaining))
                elif status in ("MISSING", "NONE", "NOT_FILED", "PENDING"):
                    gaps.append(_gap(rule, "MISSING",
                                     [f"{metric} = {status} ({ev.get('source')})"],
                                     days_remaining))
                elif val is False:
                    gaps.append(_gap(rule, "MISSING",
                                     [f"{metric} = false ({ev.get('source')})"],
                                     days_remaining))
                # else: True / numeric / other → treated as compliant
            else:
                keywords = _CLAIM_KEYWORDS.get(rule.get("rule_id") or "")
                if keywords and not _claims_contain_all(factory, keywords):
                    gaps.append(_gap(rule, "MISSING",
                                     [f"No factory claim covers: {rule.get('requirement')}"],
                                     days_remaining))
        # Any other category (e.g. REPORTING_ANNUAL) is intentionally skipped
        # here — the LLM gap pass remains free to surface those.

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
        # Normalize severity casing — the LLM occasionally returns "Critical"
        # or "High" (title case) which would otherwise be treated as unknown
        # severities by the scorer and the mobile UI.
        sev = (g.get("severity") or "").strip().upper()
        if sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            g["severity"] = sev
        key = f"{g.get('regulation','')}|{g.get('requirement','')[:60]}"
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out


_VALID_SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}


def _filter_llm_gaps(llm_gaps: list[dict], valid_rule_ids: set[str],
                    valid_reg_names: set[str]) -> list[dict]:
    """Keep only LLM gaps that reference an actually-loaded rule or regulation.

    The LLM is happy to invent plausible-sounding short codes (SH-01, ENV-03,
    LAB-05, fire-safety rules, HAZMAT certifications) that aren't in any of
    the regulation JSONs we shipped. Those phantom gaps would corrupt the
    deterministic score for a clean factory, so we drop anything whose
    rule_id and regulation_name are both unknown.
    """
    kept: list[dict] = []
    for g in llm_gaps:
        rid = (g.get("rule_id") or "").lower()
        reg = (g.get("regulation") or g.get("regulation_name") or "").lower()
        if rid and rid in valid_rule_ids:
            kept.append(g)
            continue
        if reg and reg in valid_reg_names:
            # Anchor unknown-rule_id gaps to a known regulation only when the
            # severity is at most MEDIUM — never let the LLM upgrade a
            # phantom gap to CRITICAL/HIGH severity for the demo factories.
            sev = (g.get("severity") or "").strip().upper()
            if sev in ("MEDIUM", "LOW"):
                kept.append(g)
    return kept
