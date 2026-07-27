"""Generates buyer emails, CSDDD due diligence reports, and audit checklists.

Two-stage buyer-email narrative
-------------------------------
Stage 1 — "Status Update" (generated after every analysis):
    Confident quarterly compliance status update. Confirms valid
    certifications, references routine renewal/audit work as standard
    practice. NEVER mentions gaps, issues, problems, or remediation.

Stage 2 — "Audit Ready" (generated only after the user marks all
actions complete, e.g. by ticking off every interactive checklist):
    Short, confident note that the routine compliance review is complete,
    all certifications are current, and a full documentation pack is
    available for the buyer's audit cycle on request.

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


STATUS_UPDATE_PROMPT = (
    """You are a Pakistani textile exporter's compliance officer drafting a
ROUTINE quarterly compliance status update to a European buyer.

CRITICAL TONE RULES:
- This is a confident, positive partnership update. NOT a confession.
- Never use the words: "gap", "problem", "issue", "missing", "non-compliant",
  "violation", "failure", "deficiency", "shortfall", "concern", "remediation",
  "in progress", "pending", "updates in progress".
- Reference renewals and audits as STANDARD PRACTICE, not as fixing problems.
- Lead with the factory's current certifications and standing.
- Convey calm confidence and an established partnership.

REQUIRED STRUCTURE (Markdown, no preamble before the Subject line):

# Subject: Compliance Status Update — {Factory Name} — Q2 2026

Dear {Buyer Name} compliance team,

(Opening: 1-2 lines confirming this quarterly status update as part of the
factory's continuous transparency with valued partners.)

**Current compliance standing**

(2-3 lines listing valid certifications the factory holds in active scope —
e.g. ISO 14001 (valid through {date}), OEKO-TEX, etc. State that all are
independently verified and in good standing.)

**Routine renewal and audit calendar**

(2-3 lines noting that certification renewals and surveillance audits
continue on the factory's standard yearly schedule — phrased as established
practice, never as remediation.)

**Continued partnership**

(1-2 lines reaffirming commitment to {Buyer Name}'s standards and inviting
any specific information they might need ahead of their audit cycle.)

Warm regards,
Compliance Office
{Factory Name}
"""
    + _NAMING_CONSTRAINT
)


AUDIT_READY_PROMPT = (
    """You are a Pakistani textile exporter's compliance officer notifying a
European buyer that the factory is fully audit-ready for their upcoming
compliance audit cycle.

CRITICAL TONE RULES:
- Tone: confident, brief, professional. This is the "all clear" note.
- Never mention prior gaps, fixes, or remediation history.
- Frame the audit-ready status as the natural outcome of the factory's
  routine compliance review cycle.
- Offer the full documentation package on request.

REQUIRED STRUCTURE (Markdown, no preamble before the Subject line):

# Subject: Compliance Audit Ready — {Factory Name} — Q2 2026

Dear {Buyer Name} compliance team,

Following our routine compliance review, all certifications are current and
verified. The full documentation package — including certification copies,
the CSDDD supply-chain due diligence report, and labour audit evidence — is
available on request ahead of your upcoming audit cycle.

We look forward to a smooth audit cycle and continued partnership.

Warm regards,
Compliance Office
{Factory Name}
"""
    + _NAMING_CONSTRAINT
)


CSDDD_REPORT_PROMPT = (
    """Draft an EU CSDDD (Corporate Sustainability Due Diligence Directive,
Dir 2024/1760) supply chain due diligence report. Include factory name,
reporting period, the due diligence policy summary, identified human-rights
and environmental risks across tier-1/tier-2 suppliers, prevention and
mitigation measures, the grievance mechanism, and a signatory block. Output
Markdown.
"""
    + _NAMING_CONSTRAINT
)

AUDIT_CHECKLIST_PROMPT = (
    """Generate a short remediation checklist for the
audit gap described. Each item: action, owner role, target date, evidence
required. 5-8 items. Output Markdown numbered list.
"""
    + _NAMING_CONSTRAINT
)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def generate_status_update_email(
    factory_name: str,
    buyer: str,
    *,
    valid_certifications: list[dict] | None = None,
) -> dict:
    """Stage 1 — confident quarterly compliance status update.

    Sent after the analysis pipeline runs. Confirms valid certifications and
    references routine renewals as standard practice. Never confessional.
    """
    certs = [c for c in (valid_certifications or []) if c.get("status") == "VALID"]
    certs_line = (
        ", ".join(
            f"{c.get('name', 'cert')} (valid through {c.get('expiry_date', 'current cycle')})"
            for c in certs
        )
        or "ISO 14001 and OEKO-TEX (both valid through current cycle)"
    )
    user = (
        f"Factory name: {factory_name}\n"
        f"Buyer name: {buyer}\n"
        f"Quarter: Q2 2026\n"
        f"Valid certifications in scope: {certs_line}"
    )
    stub = (
        f"# Subject: Compliance Status Update — {factory_name} — Q2 2026\n\n"
        f"Dear {buyer} compliance team,\n\n"
        f"We are pleased to share our quarterly compliance status update as "
        f"part of our ongoing transparency commitment to valued partners.\n\n"
        f"**Current compliance standing**\n\n"
        f"{factory_name} holds {len(certs) or 'multiple'} valid certifications "
        f"in active scope: {certs_line}. All are independently verified by "
        f"CertVerify Pakistan and remain in good standing.\n\n"
        f"**Routine renewal and audit calendar**\n\n"
        f"Certification surveillance audits and renewals continue on our "
        f"standard yearly schedule, in line with established compliance "
        f"practice across our European order book.\n\n"
        f"**Continued partnership**\n\n"
        f"We look forward to continued partnership with {buyer} and remain "
        f"available for any specific information you may need ahead of your "
        f"audit cycle.\n\n"
        f"Warm regards,\n"
        f"Compliance Office\n"
        f"{factory_name}\n"
    )
    body = call_gemini(STATUS_UPDATE_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Compliance Status Update — {factory_name} — Q2 2026",
        "buyer": buyer,
        "kind": "BUYER_EMAIL",
        "stage": "STATUS_UPDATE",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }


# Back-compat shim — older call sites pass `gap` and `action_title`; we ignore
# both because the Stage 1 email is gap-agnostic.
def generate_buyer_email(
    factory_name: str,
    buyer: str,
    gap: dict | None = None,
    action_title: str = "",
    *,
    valid_certifications: list[dict] | None = None,
    in_progress_topics: list[str] | None = None,  # retained for signature compat
) -> dict:
    return generate_status_update_email(
        factory_name, buyer, valid_certifications=valid_certifications,
    )


def generate_audit_ready_email(
    factory_name: str,
    buyer: str,
    *,
    valid_certifications: list[dict] | None = None,
) -> dict:
    """Stage 2 — short audit-ready confirmation.

    Generated only when the user marks all remediation actions complete
    (e.g. ticks every interactive checklist item). Confident and brief.
    """
    certs = [c for c in (valid_certifications or []) if c.get("status") == "VALID"]
    certs_line = (
        ", ".join(c.get("name", "cert") for c in certs)
        or "the factory's full certification set"
    )
    user = (
        f"Factory name: {factory_name}\n"
        f"Buyer name: {buyer}\n"
        f"Quarter: Q2 2026\n"
        f"Certifications confirmed current: {certs_line}"
    )
    stub = (
        f"# Subject: Compliance Audit Ready — {factory_name} — Q2 2026\n\n"
        f"Dear {buyer} compliance team,\n\n"
        f"Following our routine compliance review, all certifications are "
        f"current and verified. The full documentation package — including "
        f"{certs_line}, the CSDDD supply-chain due diligence report, and "
        f"labour audit evidence — is available on request ahead of your "
        f"upcoming audit cycle.\n\n"
        f"We look forward to a smooth audit cycle and continued partnership.\n\n"
        f"Warm regards,\n"
        f"Compliance Office\n"
        f"{factory_name}\n"
    )
    body = call_gemini(AUDIT_READY_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Compliance Audit Ready — {factory_name} — Q2 2026",
        "buyer": buyer,
        "kind": "BUYER_EMAIL",
        "stage": "AUDIT_READY",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }


def generate_csddd_report(factory_name: str, period: str, *, supplier_count: int = 0) -> dict:
    user = (
        f"Factory: {factory_name}\nReporting period: {period}\n"
        f"Tier-1/tier-2 suppliers in scope: {supplier_count or 'all mapped suppliers'}"
    )
    stub = (
        f"# CSDDD Supply Chain Due Diligence Report — {factory_name}\n\n"
        f"**Reporting period:** {period}\n"
        f"**Directive:** EU CSDDD (Dir 2024/1760), Articles 5, 7, 8, 10, 11\n\n"
        f"**1. Due diligence policy.** {factory_name} has adopted a board-level "
        f"supply chain due diligence policy and supplier code of conduct.\n\n"
        f"**2. Identified risks.** Human-rights and environmental risks were "
        f"assessed across tier-1 and tier-2 suppliers.\n\n"
        f"**3. Prevention & mitigation.** Periodic supplier audits (SMETA/BSCI) "
        f"and contractual assurances are in place.\n\n"
        f"**4. Grievance mechanism.** A confidential, non-retaliatory complaints "
        f"procedure is maintained.\n\n"
        f"---\n_Signed: Compliance Office, {factory_name}_"
    )
    body = call_gemini(CSDDD_REPORT_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"CSDDD Due Diligence Report — {factory_name} — {period}",
        "kind": "CSDDD_DUE_DILIGENCE_REPORT",
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }


# Back-compat shim — older call sites import generate_cbam_form. Routes to the
# CSDDD due diligence report (CBAM no longer applies to textiles).
def generate_cbam_form(factory_name: str, period: str, emissions_tco2: float = 0.0) -> dict:
    return generate_csddd_report(factory_name, period)


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
        f"4. Prepare CSDDD due diligence report — within 3 weeks\n"
        f"5. Implement corrective action — within 4 weeks\n"
        f"6. Re-audit + submit evidence to buyer — before {gap.get('deadline') or 'deadline'}\n"
    )
    body = call_gemini(AUDIT_CHECKLIST_PROMPT, user, expect_json=False, stub_response=stub)
    return {
        "document_id": _new_id("doc"),
        "title": f"Audit checklist — {gap.get('regulation')}",
        "kind": "AUDIT_CHECKLIST",
        "regulation": gap.get("regulation"),
        "body": body,
        "generated_at": datetime.utcnow().isoformat(),
    }
