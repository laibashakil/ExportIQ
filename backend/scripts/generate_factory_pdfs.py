"""Generate realistic 7-page factory audit PDFs from the canonical JSON fixtures.

Each PDF mirrors the data in `backend/mock_data/factories/*.json` (flat audit
fields + the pinned `demo_report` block) so the pipeline and the apps see
consistent inputs. NO mention of "CBAM" anywhere — it does not apply to textiles.

7-page layout contract (every PDF obeys this):
  1. Cover
  2. Factory profile + buyers
  3. Certifications
  4. Self-reported compliance claims
  5. Independent audit measurements
  6. Contradiction cross-check
  7. Audit findings summary + risk summary

Run:
    python scripts/generate_factory_pdfs.py
"""
from __future__ import annotations

import json
import sys
from functools import partial
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
)

FACTORY_DIR = Path(__file__).resolve().parent.parent / "mock_data" / "factories"

PAGE_WIDTH_MM = 210
MARGIN_MM = 18
CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM  # 174mm
TOTAL_PAGES = 7

NAVY = colors.HexColor("#0F172A")
RED = colors.HexColor("#DC2626")
GREEN = colors.HexColor("#16A34A")
ORANGE = colors.HexColor("#F97316")
GRID = colors.HexColor("#E5E7EB")
GREY = colors.HexColor("#64748B")

RED_TOKENS = {"EXPIRED", "NON_CONFORMANT", "MISSING", "DRAFT", "CONTRADICTION", "NO", "CRITICAL"}
GREEN_TOKENS = {"VALID", "CONFORMANT", "PRESENT", "PASS", "YES", "PUBLISHED", "COMPLIANT"}
ORANGE_TOKENS = {"GAP", "PARTIAL", "WARNING", "PENDING", "NOT_HELD", "NOT TESTED", "UNVERIFIED"}


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
                          fontSize=24, leading=30, textColor=NAVY, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=14, leading=20, textColor=GREY))
styles.add(ParagraphStyle(name="H2Sec", parent=styles["Heading2"], fontName="Helvetica-Bold",
                          fontSize=12, leading=16, spaceBefore=10, spaceAfter=8, textColor=NAVY))
styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=10, leading=14))
styles.add(ParagraphStyle(name="Cell", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=9, leading=12))
styles.add(ParagraphStyle(name="CellB", parent=styles["Normal"], fontName="Helvetica-Bold",
                          fontSize=9, leading=12, textColor=colors.white))
styles.add(ParagraphStyle(name="Claim", parent=styles["Normal"], fontName="Helvetica-Oblique",
                          fontSize=10, leading=15, leftIndent=10, textColor=colors.HexColor("#334155")))
styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=8, leading=11, textColor=GREY))


def _cr(pkr) -> str:
    try:
        return f"PKR {int(pkr) / 1e7:.2f} crore"
    except (TypeError, ValueError):
        return "PKR —"


def _token_hex(value: str) -> str:
    v = (value or "").strip().upper()
    if v in RED_TOKENS:
        return "#DC2626"
    if v in GREEN_TOKENS:
        return "#16A34A"
    if v in ORANGE_TOKENS:
        return "#F97316"
    return "#0F172A"


def _color_span(value: str) -> str:
    return f'<font color="{_token_hex(value)}"><b>{value}</b></font>'


def _p(text: str, style: str = "Cell") -> Paragraph:
    return Paragraph(text, styles[style])


def _table(data, col_widths, header=True, font_size=9):
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", font_size),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", font_size),
        ]
    t.setStyle(TableStyle(style))
    return t


def _hdr(label: str) -> list:
    return [_p(f"<b>{label}</b>", "CellB")]


# ───────────────────────── pages ─────────────────────────


def _page_cover(f: dict) -> list:
    fid = f["factory_id"].upper()
    return [
        Spacer(1, 60),
        Paragraph(f["factory_name"], styles["CoverTitle"]),
        Paragraph("Independent Textile Compliance Audit Report", styles["CoverSub"]),
        Spacer(1, 30),
        Paragraph(f"<b>Audit Reference:</b> EXP-{fid}-20260510", styles["Body"]),
        Paragraph("<b>Audited by:</b> CertVerify Pakistan (Pvt) Ltd", styles["Body"]),
        Paragraph(f"<b>Date of Issue:</b> {f.get('audit_date', '2026-05-10')}", styles["Body"]),
        Spacer(1, 40),
        Paragraph("CONFIDENTIAL — For Internal Use Only", styles["Small"]),
    ]


def _page_profile(f: dict) -> list:
    province = f.get("province", "Punjab")
    rows = [
        [_p("<b>Legal entity</b>"), _p(f["factory_name"])],
        [_p("<b>Location</b>"), _p(f"{f['city']}, {province}, Pakistan")],
        [_p("<b>Factory ID</b>"), _p(f["factory_id"])],
        [_p("<b>Primary products</b>"), _p(", ".join(f.get("primary_products", [])))],
        [_p("<b>Employee count</b>"), _p(str(f.get("employee_count", "—")))],
        [_p("<b>Annual export volume</b>"), _p(_cr(f.get("annual_export_pkr")))],
        [_p("<b>Primary markets</b>"), _p("EU, UK")],
    ]
    elems = [Paragraph("Factory Profile", styles["H2Sec"]),
             _table(rows, [50 * mm, CONTENT_WIDTH_MM * mm - 50 * mm], header=False),
             Spacer(1, 10),
             Paragraph("Active Buyers", styles["H2Sec"])]
    brows = [[_p("<b>Buyer</b>", "CellB"), _p("<b>PKR Cr</b>", "CellB"),
              _p("<b>Share</b>", "CellB"), _p("<b>Jurisdiction</b>", "CellB")]]
    for b in f.get("buyers", []):
        brows.append([_p(b.get("name", "—")), _p(str(b.get("pkr_crore", "—"))),
                      _p(f"{b.get('share', 0) * 100:.1f}%"), _p(b.get("jurisdiction", "—"))])
    elems.append(_table(brows, [62 * mm, 28 * mm, 30 * mm, CONTENT_WIDTH_MM * mm - 120 * mm]))
    elems.append(Spacer(1, 10))
    elems.append(Paragraph(
        "<b>Audit scope:</b> EU CSDDD (Dir 2024/1760), UK Modern Slavery Act 2015 §54, "
        "SA8000 social compliance, EU REACH SVHC effluent screening, OEKO-TEX certification "
        "status, GSP+ ILO convention compliance.", styles["Body"]))
    return elems


def _page_certs(f: dict) -> list:
    rows = [[_p("<b>Certification</b>", "CellB"), _p("<b>Status</b>", "CellB"),
             _p("<b>Valid Until</b>", "CellB"), _p("<b>Issuer</b>", "CellB"), _p("<b>Notes</b>", "CellB")]]
    for c in f.get("certifications", []):
        status = c.get("status", "")
        note = {
            "EXPIRED": f"Expired {c.get('expiry_date')}; immediate re-audit required.",
            "MISSING": "Not held. Required by at least one buyer's Code of Conduct.",
            "VALID": "Surveillance audit on file; valid for EU/UK shipments.",
            "NON_CONFORMANT": "Held but a non-conformance was raised at audit.",
            "NOT_HELD": "Not applicable to current product lines.",
            "PENDING": "Renewal in progress.",
        }.get(status, "")
        rows.append([_p(c.get("name", "—")), _p(_color_span(status)),
                     _p(c.get("expiry_date") or "—"), _p(c.get("issuer") or "—"), _p(note)])
    return [Paragraph("Certifications", styles["H2Sec"]),
            _table(rows, [28 * mm, 30 * mm, 26 * mm, 30 * mm, CONTENT_WIDTH_MM * mm - 114 * mm])]


def _page_claims(f: dict) -> list:
    elems = [Paragraph("Self-Reported Compliance Claims", styles["H2Sec"])]
    claims = f.get("self_reported_claims") or [c.get("claim") for c in f.get("claims", [])]
    for c in claims:
        elems.append(Paragraph(f"&bull; \"{c}\"", styles["Claim"]))
        elems.append(Spacer(1, 4))
    elems.append(Spacer(1, 8))
    elems.append(Paragraph(
        f"Provided by {f['factory_name']} compliance team — {f.get('audit_date', '2026-05-10')}.",
        styles["Small"]))
    return elems


def _page_measurements(f: dict) -> list:
    def g(key, default="—"):
        v = f.get(key)
        return default if v is None else str(v)

    csddd = f.get("csddd_due_diligence_policy") or f.get("csddd_due_diligence_report") or "—"
    rows = [[_p("<b>Metric</b>", "CellB"), _p("<b>Measured Value</b>", "CellB"),
             _p("<b>Unit</b>", "CellB"), _p("<b>Date</b>", "CellB"), _p("<b>Source Document</b>", "CellB")]]
    measurements = [
        ("Water effluent discharge", g("water_effluent_ppm"), "ppm", "2026-03-18", "certverify_water_audit"),
        ("Weekly working hours", g("avg_weekly_hours"), "hours", "2026-03-22", "certverify_labour_audit"),
        ("Overtime hours", g("avg_overtime_hours"), "hours/week", "2026-03-22", "certverify_labour_audit"),
        ("Lead in dyes", g("lead_in_dyes_ppm"), "ppm", "2026-03-10", "chemical_lab_report"),
        ("Formaldehyde in fabric", g("formaldehyde_ppm"), "ppm", "2026-03-10", "chemical_lab_report"),
        ("CSDDD due diligence status", _color_span(csddd), "—", "2026-04-05", "internal_governance"),
    ]
    for m in measurements:
        rows.append([_p(m[0]), _p(m[1]), _p(m[2]), _p(m[3]), _p(m[4])])
    return [Paragraph("Independent Audit Measurements", styles["H2Sec"]),
            _table(rows, [46 * mm, 32 * mm, 24 * mm, 24 * mm, CONTENT_WIDTH_MM * mm - 126 * mm])]


def _page_contradictions(f: dict) -> list:
    elems = [Paragraph("Contradiction Cross-Check", styles["H2Sec"])]
    contradictions = (f.get("demo_report") or {}).get("contradictions", [])
    if not contradictions:
        elems.append(Paragraph(
            "All self-reported claims are consistent with the independent measurements. "
            f"{_color_span('PASS')} — no contradictions found.", styles["Body"]))
        return elems
    rows = [[_p("<b>#</b>", "CellB"), _p("<b>Self-reported claim</b>", "CellB"),
             _p("<b>Audit evidence</b>", "CellB"), _p("<b>Confidence</b>", "CellB"),
             _p("<b>Verdict</b>", "CellB")]]
    for i, c in enumerate(contradictions, 1):
        rows.append([
            _p(str(i)),
            _p(f"{c.get('claim', '')}<br/><font color=\"#64748B\">[{c.get('source_a', '')}]</font>"),
            _p(f"{c.get('evidence', '')}<br/><font color=\"#64748B\">[{c.get('source_b', '')}]</font>"),
            _p(f"{c.get('confidence', 0):.2f}"),
            _p(_color_span("CONTRADICTION")),
        ])
    elems.append(_table(rows, [8 * mm, 58 * mm, 58 * mm, 22 * mm, CONTENT_WIDTH_MM * mm - 146 * mm]))
    elems.append(Spacer(1, 8))
    for i, c in enumerate(contradictions, 1):
        if c.get("impact"):
            elems.append(Paragraph(f"<b>Finding {i}.</b> {c['impact']}", styles["Body"]))
            elems.append(Spacer(1, 4))
    return elems


def _page_findings(f: dict) -> list:
    dr = f.get("demo_report") or {}
    gaps = dr.get("gaps", [])
    elems = [Paragraph("Audit Findings Summary", styles["H2Sec"])]
    for i, g in enumerate(gaps, 1):
        req = (g.get("requirement") or "").split(". ")[0].rstrip(".") + "."
        status = (g.get("factory_status") or g.get("status") or "").split(" — ")[0]
        elems.append(Paragraph(f"<b>Finding {i}:</b> {req}", styles["Body"]))
        elems.append(Paragraph(
            f"Status: {_color_span(status)} &nbsp;&nbsp; Severity: {_color_span(g.get('severity', ''))} "
            f"&nbsp;&nbsp; Regulation: {g.get('regulation', '')}", styles["Cell"]))
        elems.append(Spacer(1, 6))

    elems.append(Spacer(1, 6))
    elems.append(Paragraph("Risk Summary", styles["H2Sec"]))
    score = dr.get("compliance_score", "—")
    risk = dr.get("risk_level", "—")
    at_risk = dr.get("orders_at_risk_pkr", 0)
    buyers = ", ".join(dr.get("buyers_affected", []) or [b.get("name") for b in f.get("buyers", [])])
    rows = [
        [_p("<b>Compliance Score</b>"), _p(f"{score}/100")],
        [_p("<b>Risk Level</b>"), _p(_color_span(risk))],
        [_p("<b>Estimated Orders at Risk</b>"), _p(_cr(at_risk))],
        [_p("<b>Buyers Materially Affected</b>"), _p(buyers)],
    ]
    elems.append(_table(rows, [55 * mm, CONTENT_WIDTH_MM * mm - 55 * mm], header=False))
    elems.append(Spacer(1, 8))
    narrative = (
        f"{f['factory_name']} carries a compliance score of {score}/100 ({risk}). "
        f"The findings above place an estimated {_cr(at_risk)} of orders at risk across "
        f"{buyers or 'its EU/UK buyers'}, driven principally by the highest-severity gaps listed. "
        f"Remediating the action chain in full restores the factory to a 100/100 compliant posture."
    )
    elems.append(Paragraph(narrative, styles["Body"]))
    elems.append(Spacer(1, 10))
    elems.append(Paragraph(
        "This report was generated for the AISeekho 2026 Google Antigravity Hackathon submission "
        "(ExportIQ). It contains realistic but synthetic data for the named factories.",
        styles["Small"]))
    return elems


# ───────────────────────── chrome (header/footer) ─────────────────────────


def _draw_chrome(canvas, doc, factory_name: str):
    canvas.saveState()
    width, height = A4
    # Header bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 16 * mm, width, 16 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(MARGIN_MM * mm, height - 11 * mm, factory_name)
    canvas.setFont("Helvetica", 9)
    page = canvas.getPageNumber()
    canvas.drawRightString(width - MARGIN_MM * mm, height - 11 * mm, f"Page {page} of {TOTAL_PAGES}")
    # Footer
    canvas.setFillColor(GREY)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(MARGIN_MM * mm, 10 * mm,
                      f"Confidential — {factory_name} Audit Report Q1 2026 — Page {page} of {TOTAL_PAGES}")
    canvas.restoreState()


def _build(f: dict, out_path: Path) -> None:
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=MARGIN_MM * mm, rightMargin=MARGIN_MM * mm,
        topMargin=24 * mm, bottomMargin=18 * mm,
        title=f"{f['factory_name']} — Compliance Audit",
        author="CertVerify Pakistan (Pvt) Ltd",
    )
    story: list = []
    story += _page_cover(f)
    story.append(PageBreak())
    story += _page_profile(f)
    story.append(PageBreak())
    story += _page_certs(f)
    story.append(PageBreak())
    story += _page_claims(f)
    story.append(PageBreak())
    story += _page_measurements(f)
    story.append(PageBreak())
    story += _page_contradictions(f)
    story.append(PageBreak())
    story += _page_findings(f)
    chrome = partial(_draw_chrome, factory_name=f["factory_name"])
    doc.build(story, onFirstPage=chrome, onLaterPages=chrome)


FACTORY_IDS = ["fwi_fsd_001", "cfw_lhe_002", "rgl_khi_003", "ams_skl_004", "sgd_tex_005"]


def main() -> int:
    if not FACTORY_DIR.exists():
        print(f"missing dir {FACTORY_DIR}", file=sys.stderr)
        return 1
    for fid in FACTORY_IDS:
        json_path = FACTORY_DIR / f"{fid}.json"
        if not json_path.exists():
            print(f"skip {fid}: no source JSON", file=sys.stderr)
            continue
        factory = json.loads(json_path.read_text(encoding="utf-8"))
        out = FACTORY_DIR / f"{fid}.pdf"
        _build(factory, out)
        print(f"wrote {out.name} ({out.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
