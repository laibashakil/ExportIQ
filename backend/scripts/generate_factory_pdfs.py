"""Generate realistic factory audit PDFs from the canonical JSON fixtures.

Each PDF mirrors the data in `backend/mock_data/factories/*.json` so the
LangGraph pipeline sees consistent inputs whether the upstream tool ingests
the JSON directly or runs PyMuPDF over the PDF.

Usage:
    python scripts/generate_factory_pdfs.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)

FACTORY_DIR = Path(__file__).resolve().parent.parent / "mock_data" / "factories"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1Big", parent=styles["Heading1"], fontSize=18, spaceAfter=8, textColor=colors.HexColor("#1a3a5f")))
styles.add(ParagraphStyle(name="H2Sec", parent=styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#1a3a5f")))
styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, textColor=colors.grey))
styles.add(ParagraphStyle(name="Claim", parent=styles["Normal"], fontSize=10, leftIndent=14, textColor=colors.HexColor("#444444"), italic=True))
styles.add(ParagraphStyle(name="Warn", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#b03030")))


def _money_pkr(x: int) -> str:
    """Format PKR with crore/lakh readable suffix."""
    if x >= 10_000_000:
        return f"PKR {x/10_000_000:.2f} crore"
    if x >= 100_000:
        return f"PKR {x/100_000:.2f} lakh"
    return f"PKR {x:,}"


def _cert_color(status: str) -> colors.Color:
    return {
        "VALID": colors.HexColor("#1f7a1f"),
        "EXPIRED": colors.HexColor("#b03030"),
        "MISSING": colors.HexColor("#b03030"),
        "DRAFT": colors.HexColor("#b07a00"),
    }.get(status, colors.black)


def _table(data, col_widths=None, header=True):
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#888888")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6fa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3a5f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    t.setStyle(TableStyle(style))
    return t


def _audit_header(factory: dict, audit_date: str, auditor: str) -> list:
    elems = []
    elems.append(Paragraph(
        f"INDEPENDENT TEXTILE COMPLIANCE AUDIT — {factory['factory_name'].upper()}",
        styles["H1Big"],
    ))
    elems.append(Paragraph(
        f"Audit Reference: <b>EXP-{factory['factory_id'].upper()}-{audit_date.replace('-','')}</b> &nbsp;&nbsp; "
        f"Audited by <b>{auditor}</b> &nbsp;&nbsp; Date of issue: <b>{audit_date}</b>",
        styles["Small"],
    ))
    elems.append(Spacer(1, 4))
    meta = [
        ["Legal entity", factory["factory_name"]],
        ["City / Site", f"{factory['city']}, {'Sindh' if factory['city'] == 'Karachi' else 'Punjab'}, Pakistan"],
        ["Factory ID", factory["factory_id"]],
        ["Primary products", ", ".join(factory["primary_products"])],
        ["Audit scope", "EU CBAM (Reg 2023/956), UK Modern Slavery Act 2015 §54, EU CSDDD (Dir 2024/1760), ISO 14001 surveillance, SA8000 social compliance, OEKO-TEX, REACH SVHC effluent screening"],
        ["Audit method", "On-site inspection, sample chain-of-custody, effluent grab samples (3 points), HR log review, management interview"],
    ]
    elems.append(_table(meta, col_widths=[42 * mm, 130 * mm], header=False))
    elems.append(Spacer(1, 6))
    return elems


def _section_certifications(factory: dict) -> list:
    elems = [Paragraph("1. Certifications &amp; certification status", styles["H2Sec"])]
    data = [["Certification", "Status", "Valid until", "Issuer", "Notes"]]
    for c in factory["certifications"]:
        status_p = Paragraph(
            f'<font color="{_cert_color(c["status"]).hexval()}"><b>{c["status"]}</b></font>',
            styles["Normal"],
        )
        note = ""
        if c["status"] == "EXPIRED":
            note = f"Expired {c['expiry_date']}; auditor recommends immediate re-audit booking."
        elif c["status"] == "MISSING":
            note = "Not held. Required by at least one buyer's commercial Code of Conduct."
        elif c["status"] == "VALID":
            note = "Surveillance audit on file. Valid for full scope of EU/UK shipments."
        data.append([
            c["name"],
            status_p,
            c["expiry_date"] or "—",
            c["issuer"] or "—",
            note,
        ])
    elems.append(_table(data, col_widths=[28 * mm, 22 * mm, 24 * mm, 30 * mm, 70 * mm]))
    return elems


def _section_export_profile(factory: dict) -> list:
    elems = [Paragraph("2. Export profile and buyer concentration", styles["H2Sec"])]
    elems.append(Paragraph(
        f"Total annual export value reported by management: <b>{_money_pkr(factory['annual_export_pkr'])}</b>. "
        f"Breakdown by purchasing buyer (FY 2025):",
        styles["Normal"],
    ))
    rows = [["Buyer", "Annual order value (PKR)", "Share of total", "Buyer HQ jurisdiction"]]
    juris = {
        "NordStyle Group": "EU (Sweden)", "EuroThread SA": "EU (Spain)", "Mango": "EU (Spain)",
        "C&A": "EU", "Bestseller": "EU (Denmark)",
        "BritMart Retail": "UK (Ireland-listed, UK-regulated)", "M&S": "UK", "Tesco": "UK",
        "Next": "UK", "Asda": "UK",
    }
    total = factory["annual_export_pkr"]
    for buyer, value in factory["exports_by_buyer_pkr"].items():
        share = (value / total) * 100 if total else 0
        rows.append([
            buyer,
            _money_pkr(value),
            f"{share:.1f}%",
            juris.get(buyer, "—"),
        ])
    elems.append(_table(rows, col_widths=[34 * mm, 40 * mm, 25 * mm, 60 * mm]))
    elems.append(Spacer(1, 4))
    # Concentration commentary
    top_share = max(factory["exports_by_buyer_pkr"].values()) / total
    if top_share > 0.5:
        elems.append(Paragraph(
            f"<b>Concentration risk:</b> single buyer represents {top_share*100:.1f}% of exports. "
            "A compliance suspension by that buyer would materially threaten factory revenue.",
            styles["Warn"],
        ))
    return elems


def _section_self_reported(factory: dict) -> list:
    elems = [Paragraph("3. Self-reported compliance claims (factory submission)", styles["H2Sec"])]
    elems.append(Paragraph(
        f"The following statements were provided by {factory['factory_name']}'s compliance team in the quarterly self-report (source filename in parentheses). "
        "These statements are recorded verbatim and used as the LEFT-HAND side of the contradiction check in Section 5.",
        styles["Normal"],
    ))
    for c in factory["claims"]:
        elems.append(Paragraph(
            f"&bull; \"{c['claim']}\" &nbsp; <font color=\"#888888\">(source: {c['source']})</font>",
            styles["Claim"],
        ))
    return elems


def _section_audit_evidence(factory: dict) -> list:
    elems = [Paragraph("4. Independent audit evidence (third-party measurements)", styles["H2Sec"])]
    rows = [["Metric", "Measured value", "Unit", "Date", "Source document"]]
    for e in factory["audit_evidence"]:
        rows.append([
            e["metric"].replace("_", " "),
            str(e["value"]),
            e["unit"] or "—",
            e["measured_on"],
            e["source"],
        ])
    elems.append(_table(rows, col_widths=[44 * mm, 26 * mm, 22 * mm, 24 * mm, 50 * mm]))
    return elems


def _section_contradictions(factory: dict) -> list:
    """Walk known claim↔evidence pairs and surface conflicts inside the same PDF."""
    elems = [Paragraph("5. Auditor cross-check (claim vs evidence)", styles["H2Sec"])]
    elems.append(Paragraph(
        "The cross-check below compares Section 3 (self-reported claims) against Section 4 (independent measurements). "
        "Any inconsistency triggers a recommended remediation in Section 6.",
        styles["Normal"],
    ))

    claim_map = {c["claim"].lower(): c for c in factory["claims"]}
    evid_map = {e["metric"]: e for e in factory["audit_evidence"]}

    findings = []

    # ISO 14001 / water effluent
    water = evid_map.get("water_effluent_discharge")
    iso_claim = next((c for c in factory["claims"] if "iso 14001" in c["claim"].lower() or "effluent" in c["claim"].lower() or "reach" in c["claim"].lower()), None)
    if water and iso_claim and water["value"] > 8:
        findings.append({
            "claim_text": iso_claim["claim"],
            "claim_src": iso_claim["source"],
            "evidence_text": f"{water['metric']} = {water['value']} {water['unit']} (EU REACH/CBAM limit: 8 ppm)",
            "evidence_src": water["source"],
            "verdict": "CONTRADICTION",
            "confidence": 0.91,
            "rationale": "Self-report asserts compliance with effluent limits; lab measurement exceeds 8 ppm REACH ceiling by 50%.",
        })

    # SA8000 boolean claim vs measured weekly hours over 60
    hours = evid_map.get("weekly_working_hours")
    sa8000_claim = next(
        (c for c in factory["claims"]
         if "sa8000" in c["claim"].lower() and isinstance(c["value"], bool) and c["value"] is True),
        None,
    )
    if hours and sa8000_claim and hours["value"] > 60:
        findings.append({
            "claim_text": sa8000_claim["claim"],
            "claim_src": sa8000_claim["source"],
            "evidence_text": f"weekly working hours = {hours['value']} hrs (SA8000 ceiling: 60 hrs incl. overtime)",
            "evidence_src": hours["source"],
            "verdict": "CONTRADICTION",
            "confidence": 0.93,
            "rationale": "SA8000 §7.1.1 caps total weekly hours at 60 including overtime; observed value exceeds ceiling.",
        })

    # Numeric working-hours claim vs measured working hours (excluding the bool SA8000 claim)
    hours_numeric_claim = next(
        (c for c in factory["claims"]
         if "working hour" in c["claim"].lower()
         and isinstance(c["value"], (int, float)) and not isinstance(c["value"], bool)),
        None,
    )
    if hours and hours_numeric_claim and abs(hours["value"] - hours_numeric_claim["value"]) > 4:
        findings.append({
            "claim_text": hours_numeric_claim["claim"],
            "claim_src": hours_numeric_claim["source"],
            "evidence_text": f"Independent labour audit recorded {hours['value']} hrs/week",
            "evidence_src": hours["source"],
            "verdict": "CONTRADICTION",
            "confidence": 0.88,
            "rationale": "Self-reported weekly hours differ from third-party measurement by more than 4 hours.",
        })

    # CBAM filing absence: only fires when factory does NOT claim CBAM is filed
    # AND audit pack contains no CBAM filing record — i.e. a genuine omission gap,
    # not a fabricated contradiction against a truthful claim.
    cbam_filed_claim = next(
        (c for c in factory["claims"]
         if "cbam" in c["claim"].lower() and c.get("value") is True),
        None,
    )
    cbam_evid = next(
        (e for e in factory["audit_evidence"]
         if "cbam" in e["metric"].lower() or "embedded" in e["metric"].lower()),
        None,
    )
    if cbam_filed_claim is None and cbam_evid is None:
        findings.append({
            "claim_text": "(no CBAM filing claim in self-report)",
            "claim_src": "—",
            "evidence_text": "No CBAM declarant registration or quarterly filing record located in the audit evidence pack",
            "evidence_src": "(audit evidence pack)",
            "verdict": "GAP",
            "confidence": 0.95,
            "rationale": "Factory exports to EU; CBAM scope applies; no filing record exists. This is a regulatory GAP rather than a CONTRADICTION because the factory has not made a conflicting positive claim.",
        })

    # EU CSDDD draft narrative: contradiction if factory claims publication but
    # audit evidence shows DRAFT state.
    csddd_claim = next(
        (c for c in factory["claims"]
         if ("supply chain" in c["claim"].lower() or "csddd" in c["claim"].lower() or "due diligence" in c["claim"].lower())
         and c.get("value") is True),
        None,
    )
    csddd_evid = next(
        (e for e in factory["audit_evidence"]
         if e["metric"] == "supply_chain_due_diligence_report"),
        None,
    )
    if csddd_claim and csddd_evid and str(csddd_evid["value"]).upper() == "DRAFT":
        findings.append({
            "claim_text": csddd_claim["claim"],
            "claim_src": csddd_claim["source"],
            "evidence_text": f"CSDDD narrative status = {csddd_evid['value']} as of {csddd_evid['measured_on']}",
            "evidence_src": csddd_evid["source"],
            "verdict": "CONTRADICTION",
            "confidence": 0.86,
            "rationale": "Self-report claims publication; internal governance file shows DRAFT status. Directive (EU) 2024/1760 requires published narrative.",
        })
    elif csddd_evid and str(csddd_evid["value"]).upper() == "DRAFT" and not csddd_claim:
        findings.append({
            "claim_text": "(no published-status claim in self-report)",
            "claim_src": "—",
            "evidence_text": f"CSDDD narrative status = {csddd_evid['value']} as of {csddd_evid['measured_on']}",
            "evidence_src": csddd_evid["source"],
            "verdict": "GAP",
            "confidence": 0.90,
            "rationale": "Directive (EU) 2024/1760 transposition requires published due-diligence narrative; currently in DRAFT state.",
        })

    if not findings:
        elems.append(Paragraph(
            "&bull; All self-reported claims are consistent with the independent measurements. No contradictions found.",
            styles["Normal"],
        ))
        return elems

    rows = [["#", "Self-reported claim (source)", "Audit evidence (source)", "Confidence", "Verdict"]]
    for i, f in enumerate(findings, 1):
        rows.append([
            str(i),
            f"{f['claim_text']}\n[{f['claim_src']}]",
            f"{f['evidence_text']}\n[{f['evidence_src']}]",
            f"{f['confidence']:.2f}",
            f["verdict"],
        ])
    elems.append(_table(rows, col_widths=[8 * mm, 55 * mm, 60 * mm, 18 * mm, 25 * mm]))
    elems.append(Spacer(1, 4))
    for i, f in enumerate(findings, 1):
        elems.append(Paragraph(
            f"<b>Finding {i} rationale.</b> {f['rationale']}",
            styles["Normal"],
        ))
    return elems


def _section_risk_summary(factory: dict, score: int, risk_level: str, orders_at_risk_pkr: int, summary: str) -> list:
    elems = [Paragraph("6. Auditor risk summary and recommended remediation", styles["H2Sec"])]
    rows = [
        ["Compliance score (0-100)", str(score)],
        ["Risk level", risk_level],
        ["Estimated orders at risk", _money_pkr(orders_at_risk_pkr)],
        ["Buyers materially affected", ", ".join([b for b in factory["primary_buyers"][:3]])],
        ["Audit issued by", "Independent third-party (this report)"],
    ]
    elems.append(_table(rows, col_widths=[60 * mm, 100 * mm], header=False))
    elems.append(Spacer(1, 6))
    elems.append(Paragraph(summary, styles["Normal"]))
    return elems


def _build(factory: dict, audit_date: str, auditor: str, score: int, risk_level: str,
           orders_at_risk_pkr: int, summary: str, out_path: Path) -> None:
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=f"{factory['factory_name']} — Compliance Audit {audit_date}",
        author=auditor,
    )
    story: list = []
    story += _audit_header(factory, audit_date, auditor)
    story += _section_certifications(factory)
    story += _section_export_profile(factory)
    story += _section_self_reported(factory)
    story.append(PageBreak())
    story += _section_audit_evidence(factory)
    story += _section_contradictions(factory)
    story += _section_risk_summary(factory, score, risk_level, orders_at_risk_pkr, summary)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "<i>This report was generated for the AISeekho 2026 Google Antigravity Hackathon submission (ExportIQ). "
        "It contains realistic but synthetic data for the named factories.</i>",
        styles["Small"],
    ))
    doc.build(story)


PROFILES = {
    "fwi_fsd_001": dict(
        audit_date="2026-04-12",
        auditor="CertVerify Pakistan (Pvt) Ltd.",
        score=43,
        risk_level="CRITICAL",
        orders_at_risk_pkr=340_000_000,
        summary=(
            "<b>CRITICAL.</b> The factory's compliance posture is unsuitable for continued shipment of NordStyle Group and BritMart Retail orders without immediate remediation. "
            "The headline risks are (i) SA8000 social-compliance certification has lapsed since 15 January 2026; (ii) no CBAM declarant registration is held despite "
            "65% of exports going to EU jurisdictions; (iii) water effluent measurements exceed EU REACH SVHC limits by 50%; (iv) the self-reported claim of ISO 14001 "
            "compliance is materially inconsistent with the third-party water audit evidence. Without remediation the auditor recommends a hold on EU/UK shipment "
            "authorisations until certificate renewals are completed and CBAM registration is filed. Estimated revenue at risk within the next 12 months is "
            "PKR 34 crore. The mobile ExportIQ pipeline ranks the actions automatically and produces remediation artifacts including the CBAM declaration template, "
            "buyer communication drafts for NordStyle Group and BritMart Retail sourcing managers, and the SA8000 re-audit application letter."
        ),
    ),
    "cfw_lhe_002": dict(
        audit_date="2026-04-22",
        auditor="Bureau Veritas Pakistan",
        score=78,
        risk_level="WARNING",
        orders_at_risk_pkr=45_000_000,
        summary=(
            "<b>WARNING.</b> Chenab Fabric Works is broadly compliant across SA8000, ISO 14001, GOTS, and OEKO-TEX certifications, all of which are current and within "
            "their surveillance audit windows. Three residual gaps remain: (i) the EU Corporate Sustainability Due Diligence Directive (CSDDD) supply-chain narrative "
            "is in DRAFT status and has not yet been published; this is required for EuroThread SA's 2026-27 commercial cycle and the deadline lapses 2026-12-31. "
            "(ii) Reported weekly working hours of 52 are within SA8000 limits but the labour audit observed 53 hours, a minor variance that requires the HR log to be "
            "reconciled. (iii) CO2 intensity at 3.1 kgCO2/garment is acceptable for current CBAM scope but on the edge of the 2027 free-allowance phase-out — the "
            "factory should begin embedded-emissions monitoring under the CBAM authorised-declarant regime. Estimated exposure if these are not resolved within 6 months "
            "is PKR 4.5 crore, concentrated on the M&amp;S and EuroThread SA order books."
        ),
    ),
    "rgl_khi_003": dict(
        audit_date="2026-05-02",
        auditor="amfori-accredited audit (third party)",
        score=91,
        risk_level="COMPLIANT",
        orders_at_risk_pkr=2_500_000,
        summary=(
            "<b>COMPLIANT.</b> Ravi Garments Ltd is the gold-standard case for this audit cycle. All five certifications (SA8000, ISO 14001, GOTS, OEKO-TEX, BSCI) are "
            "current with surveillance audits on file. CBAM quarterly declarations have been filed since October 2025 under an authorised declarant registration. "
            "The UK Modern Slavery Act 2015 s.54 statement was published in April 2026 and is hosted on the factory's website with the supply-chain map. The EU "
            "Corporate Sustainability Due Diligence narrative has been published in line with Directive (EU) 2024/1760 transposition deadlines. Water effluent at "
            "3.2 ppm is well within the 8 ppm REACH ceiling; weekly working hours at 47 are below the SA8000 60-hour cap; CO2 per garment at 2.4 kgCO2 is the best "
            "in this audit cycle and positions Ideal favourably under the 2027 CBAM free-allowance phase-out. A single advisory: continue to monitor lead-in-dye "
            "measurements (currently 22 ppm vs OEKO-TEX limit 50 ppm) to maintain the current margin of safety."
        ),
    ),
    "ams_skl_004": dict(
        audit_date="2026-05-10",
        auditor="CertVerify Pakistan (Pvt) Ltd.",
        score=38,
        risk_level="CRITICAL",
        orders_at_risk_pkr=520_000_000,
        summary=(
            "<b>CRITICAL.</b> Al-Madina Sportswear (Pvt) Ltd presents multiple critical compliance failures that jeopardise continued shipment to EU and UK buyers. "
            "The primary risks are: (i) GOTS certification expired November 2025 — six months lapsed without renewal, affecting organic-cotton product lines shipped "
            "to NordStyle Group and M&amp;S; (ii) no EU CBAM declarant registration or quarterly filing exists despite 71% of exports going to EU jurisdictions "
            "(NordStyle Group + EuroThread SA); (iii) water effluent at 11.5 ppm exceeds the EU REACH SVHC ceiling of 8 ppm by 44%, contradicting the factory's "
            "self-reported claim of REACH compliance; (iv) weekly working hours measured at 62 exceed the SA8000 60-hour cap and contradict the self-reported figure "
            "of 49 hours — a discrepancy of 13 hours; (v) lead-in-dyes at 78 ppm exceeds the OEKO-TEX Standard 100 limit of 50 ppm; (vi) the EU Corporate "
            "Sustainability Due Diligence Directive (CSDDD) supply-chain narrative remains in DRAFT status. BSCI certification is not held, which is required "
            "by BritMart Retail's Code of Conduct. Without immediate remediation, estimated revenue at risk is PKR 52 crore across NordStyle Group, EuroThread SA, "
            "M&amp;S, and BritMart Retail order books. The auditor recommends a hold on all EU/UK shipment authorisations until the GOTS renewal audit is completed, "
            "CBAM registration is filed, and effluent remediation is verified by re-sampling."
        ),
    ),
}


def main() -> int:
    if not FACTORY_DIR.exists():
        print(f"missing dir {FACTORY_DIR}", file=sys.stderr)
        return 1
    for fid, meta in PROFILES.items():
        json_path = FACTORY_DIR / f"{fid}.json"
        if not json_path.exists():
            print(f"skip {fid}: no source JSON", file=sys.stderr)
            continue
        factory = json.loads(json_path.read_text(encoding="utf-8"))
        out = FACTORY_DIR / f"{fid}.pdf"
        _build(factory, out_path=out, **meta)
        print(f"wrote {out.relative_to(FACTORY_DIR.parent.parent)} ({out.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
