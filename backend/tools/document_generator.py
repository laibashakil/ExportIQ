"""Generates buyer emails, CBAM forms, and audit checklists.

Each generated document gets stored on the action item's simulation_output
and listed at GET /documents/{factory_id}.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from .gemini_client import call_gemini


# Naming constraint shared by every prompt: this is a fictional product for a
# hackathon submission, so any third-party audit firm referenced must be
# "CertVerify Pakistan". Gemini's default vocabulary leans on real audit
# brands (SGS, Bureau Veritas, Intertek, TÜV) — the constraint below blocks
# those names from leaking into the generated document bodies.
_NAMING_CONSTRAINT = (
    "\n\nNAMING RULES (strict):\n"
    "- The third-party audit / certification firm in this scenario is "
    "  'CertVerify Pakistan'. Use that name whenever you reference an auditor.\n"
    "- Do NOT mention real audit firms by name: no 'SGS', no 'Bureau Veritas', "
    "  no 'Intertek', no 'TÜV', no 'BSI', no 'DNV'. If you need to refer to a "
    "  generic third party, use 'CertVerify Pakistan' or 'the independent "
    "  auditor'.\n"
    "- Do NOT mention real buyer brands like 'H&M', 'Primark', 'Inditex', "
    "  'Zara' — use only the buyer name passed in the user prompt verbatim.\n"
)


BUYER_EMAIL_PROMPT = (
    """You are a Pakistani textile exporter's compliance officer drafting a
PROACTIVE quarterly compliance status update to a European buyer ahead of
their upcoming audit season.

CRITICAL TONE RULES:
- This is a confident, positive partnership update. NOT a confession.
- Never use the words: "gap", "problem", "issue", "missing", "non-compliant",
  "violation", "failure", "deficiency", "shortfall", "concern".
- Frame ongoing work as "documentation updates", "continuous improvements",
  "scheduled certification renewals", or "compliance refresh cycle".
- Never mention severity, deadlines as warnings, or financial risk.
- Lead with strengths: valid certifications, current scope, factory's
  commitment to standards.
- Convey calm confidence and partnership.

REQUIRED STRUCTURE (Markdown, no preamble before the Subject line):

# Subject: Compliance Status Update — {Factory Name} — Q2 2026

Dear {Buyer Name} compliance team,

(Opening: 1-2 lines on why you are sharing this update — ahead of audit season,
as part of continuous transparency.)

**Current compliance position**

(2-3 lines listing valid certifications the factory holds in active scope —
e.g. ISO 14001 (valid through {date}), OEKO-TEX, etc. Number of valid
certifications.)

**Documentation updates in progress**

(2-3 lines on the documentation updates being completed this quarter,
phrased as routine refresh work — never as remediation of failure.)

**Continued partnership**

(1-2 lines reaffirming commitment to {Buyer Name}'s standards and inviting
any specific information they might need ahead of their audit cycle.)

Warm regards,
Compliance Office
{Factory Name}
"""
    + _NAMING_CONSTRAINT
)

CBAM_FORM_PROMPT = (
    """Draft a CBAM (EU Carbon Border Adjustment Mechanism)
quarterly declaration. Include factory name, reporting period, total embedded
emissions (tCO2e), default vs verified emission factors used, and signatory
block. Output Markdown.
"""
    + _NAMING_CONSTRAINT
)

AUDIT_CHECKLIST_PROMPT = (
    """Generate a short remediation checklist for the
audit gap described. Each item: action, owner role, target date, evidence
required. 5-8 items. Output Markdown.
"""
    + _NAMING_CONSTRAINT
)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def generate_buyer_email(
    factory_name: str,
    buyer: str,
    gap: dict,
    action_title: str,
    *,
    valid_certifications: list[dict] | None = None,
    in_progress_topics: list[str] | None = None,
) -> dict:
    """Draft a PROACTIVE quarterly compliance status update for a buyer.

    The email no longer mentions any single gap or deadline — it's a
    confident partnership update that lists strengths (valid certifications,
    factory scope) and frames any ongoing work as routine documentation
    updates. Never confessional.

    `valid_certifications` and `in_progress_topics` are optional context the
    caller can pass to make the LLM output more grounded.
    """
    certs_line = (
        ", ".join(
            f"{c.get('name', 'cert')} (valid through {c.get('expiry_date', 'current cycle')})"
            for c in (valid_certifications or [])
            if c.get("status") == "VALID"
        )
        or "ISO 14001 and OEKO-TEX (both valid through current cycle)"
    )
    in_progress_line = (
        "; ".join(in_progress_topics or [])
        or "scheduled certification refresh cycle and emissions data documentation refresh"
    )
    user = (
        f"Factory name: {factory_name}\n"
        f"Buyer name: {buyer}\n"
        f"Quarter: Q2 2026\n"
        f"Valid certifications: {certs_line}\n"
        f"Documentation updates in progress: {in_progress_line}"
    )
    stub = (
        f"# Subject: Compliance Status Update — {factory_name} — Q2 2026\n\n"
        f"Dear {buyer} compliance team,\n\n"
        f"We are sharing our current compliance status ahead of your upcoming "
        f"audit season, as part of our continuous transparency commitment to "
        f"valued partners.\n\n"
        f"**Current compliance position**\n\n"
        f"Our factory maintains {len([c for c in (valid_certifications or []) if c.get('status') == 'VALID']) or 'multiple'} "
        f"valid certifications in active scope: {certs_line}. All have been "
        f"independently verified and remain in good standing.\n\n"
        f"**Documentation updates in progress**\n\n"
        f"As part of our standard quarterly refresh cycle, we are currently "
        f"progressing {in_progress_line}. These are routine documentation "
        f"updates aligned with our 2026 compliance roadmap.\n\n"
        f"**Continued partnership**\n\n"
        f"We look forward to continued partnership with {buyer} and remain "
        f"available for any specific information you may need ahead of your "
        f"audit cycle.\n\n"
        f"Warm regards,\n"
        f"Compliance Office\n"
        f"{factory_name}\n"
    )
    body = call_gemini(BUYER_EMAIL_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Compliance Status Update — {factory_name} — Q2 2026",
        "buyer": buyer,
        "kind": "BUYER_EMAIL",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }


def generate_cbam_form(factory_name: str, period: str, emissions_tco2: float) -> dict:
    user = (
        f"Factory: {factory_name}\nReporting period: {period}\n"
        f"Embedded emissions (tCO2e): {emissions_tco2}"
    )
    stub = (
        f"# CBAM Quarterly Declaration — {factory_name}\n\n"
        f"**Reporting period:** {period}\n"
        f"**Embedded emissions:** {emissions_tco2} tCO2e\n"
        f"**Methodology:** EU default factors (interim — verified factors pending)\n\n"
        f"---\n_Signed: Compliance Office, {factory_name}_"
    )
    body = call_gemini(CBAM_FORM_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"CBAM Declaration — {factory_name} — {period}",
        "kind": "CBAM_FORM",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }


def generate_audit_checklist(factory_name: str, gap: dict) -> dict:
    user = (
        f"Factory: {factory_name}\nGap: {gap.get('regulation')} — {gap.get('requirement')}\n"
        f"Severity: {gap.get('severity')}\nDeadline: {gap.get('deadline')}"
    )
    stub = (
        f"# Remediation checklist — {gap.get('regulation')}\n\n"
        f"1. Assign compliance officer (HSE Manager) — by next Monday\n"
        f"2. Collect current evidence (sensor logs, certificates) — within 1 week\n"
        f"3. Engage external auditor (CertVerify Pakistan) — within 2 weeks\n"
        f"4. Implement corrective action — within 4 weeks\n"
        f"5. Re-audit + submit evidence to buyer — before {gap.get('deadline') or 'deadline'}\n"
    )
    body = call_gemini(AUDIT_CHECKLIST_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Audit checklist — {gap.get('regulation')}",
        "kind": "AUDIT_CHECKLIST",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }
