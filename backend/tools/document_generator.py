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
    """You are a Pakistani textile exporter's compliance officer
drafting a status update for a European buyer. Be concise, professional, and
honest about the gap being remediated and the timeline. End with a clear ask
(extension, audit reschedule, etc).

Output Markdown only — no preamble.
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


def generate_buyer_email(factory_name: str, buyer: str, gap: dict, action_title: str) -> dict:
    user = (
        f"Factory: {factory_name}\nBuyer: {buyer}\n"
        f"Gap: {gap.get('regulation')} — {gap.get('requirement')}\n"
        f"Severity: {gap.get('severity')}\nDeadline: {gap.get('deadline')}\n"
        f"Remediation action: {action_title}"
    )
    stub = (
        f"# Subject: Compliance update — {gap.get('regulation')}\n\n"
        f"Dear {buyer} compliance team,\n\n"
        f"This is to confirm that {factory_name} has initiated remediation of the "
        f"{gap.get('regulation')} requirement \"{gap.get('requirement')}\". Action plan: "
        f"{action_title}. We aim to close this gap by {gap.get('deadline') or 'the next reporting cycle'} "
        f"and will share verification evidence on completion.\n\n"
        f"Regards,\nCompliance Office, {factory_name}\n"
    )
    body = call_gemini(BUYER_EMAIL_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Buyer email — {buyer} — {gap.get('regulation')}",
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
        f"3. Engage external auditor (CertVerify / Bureau Veritas) — within 2 weeks\n"
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
