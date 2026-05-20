"""GET /export-summary — generates a multi-factory compliance summary PDF.

The PDF is built on demand from whatever reports are currently in Firestore.
It is streamed back as application/pdf so the mobile client can save it
locally and offer a share sheet via expo-sharing.
"""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

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
)

from tools.firestore_client import get_doc

router = APIRouter()


# Same demo factory set the mobile app shows on HomeScreen.
DEFAULT_FACTORIES = [
    "fwi_fsd_001",
    "cfw_lhe_002",
    "rgl_khi_003",
]


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="ExportH1",
        parent=base["Heading1"],
        fontName="Helvetica-Bold", fontSize=20, leading=24,
        textColor=colors.HexColor("#0D1117"), spaceAfter=10,
    ))
    base.add(ParagraphStyle(
        name="ExportH2",
        parent=base["Heading2"],
        fontName="Helvetica-Bold", fontSize=14, leading=18,
        textColor=colors.HexColor("#1a3a5f"), spaceBefore=14, spaceAfter=8,
    ))
    base.add(ParagraphStyle(
        name="ExportBody",
        parent=base["Normal"],
        fontName="Helvetica", fontSize=10, leading=14,
    ))
    base.add(ParagraphStyle(
        name="ExportMeta",
        parent=base["Normal"],
        fontName="Helvetica", fontSize=9, leading=12,
        textColor=colors.HexColor("#6B7280"),
    ))
    return base


def _risk_color_hex(risk: str) -> str:
    return {
        "CRITICAL": "#EF4444",
        "WARNING":  "#F59E0B",
        "COMPLIANT": "#00B07A",
    }.get((risk or "").upper(), "#444444")


def _money(x) -> str:
    try:
        x = int(x or 0)
    except (TypeError, ValueError):
        return "—"
    if x >= 10_000_000:
        return f"PKR {x/10_000_000:.2f} crore"
    if x >= 100_000:
        return f"PKR {x/100_000:.2f} lakh"
    return f"PKR {x:,}"


def _build_pdf(factory_ids: list[str]) -> bytes:
    buf = io.BytesIO()
    margin = 20 * mm
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
        title=f"ExportIQ Compliance Summary {datetime.utcnow().date().isoformat()}",
    )
    s = _styles()
    story = []

    story.append(Paragraph("ExportIQ — Compliance Summary", s["ExportH1"]))
    story.append(Paragraph(
        f"Generated {datetime.utcnow().date().isoformat()} · "
        f"{len(factory_ids)} factories",
        s["ExportMeta"],
    ))
    story.append(Spacer(1, 12))

    # Overview table — one row per factory
    rows = [[
        Paragraph("<b>Factory</b>", s["ExportBody"]),
        Paragraph("<b>City</b>", s["ExportBody"]),
        Paragraph("<b>Score</b>", s["ExportBody"]),
        Paragraph("<b>Risk</b>", s["ExportBody"]),
        Paragraph("<b>Orders at risk</b>", s["ExportBody"]),
    ]]
    detail_blocks: list[tuple[str, dict]] = []
    for fid in factory_ids:
        report = get_doc(f"factories/{fid}/reports/latest") or {}
        factory = get_doc(f"factories/{fid}") or {}
        name = report.get("factory_name") or factory.get("factory_name") or fid
        city = report.get("city") or factory.get("city") or "—"
        score = (
            report.get("original_compliance_score")
            or report.get("compliance_score")
            or factory.get("compliance_score")
            or 0
        )
        risk = factory.get("risk_level") or "—"
        risk_html = f'<font color="{_risk_color_hex(risk)}"><b>{risk}</b></font>'
        risk_pkr = report.get("orders_at_risk_pkr") or factory.get("orders_at_risk_pkr") or 0
        rows.append([
            Paragraph(str(name), s["ExportBody"]),
            Paragraph(str(city), s["ExportBody"]),
            Paragraph(str(score), s["ExportBody"]),
            Paragraph(risk_html, s["ExportBody"]),
            Paragraph(_money(risk_pkr), s["ExportBody"]),
        ])
        detail_blocks.append((fid, report))

    # Column widths sum to 170mm
    table = Table(rows, colWidths=[55 * mm, 30 * mm, 18 * mm, 27 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#888888")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6fa")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    # Per-factory detail blocks
    for fid, report in detail_blocks:
        story.append(Spacer(1, 16))
        name = report.get("factory_name") or fid
        story.append(Paragraph(name, s["ExportH2"]))

        gaps = report.get("gaps") or []
        contras = report.get("contradictions") or []
        actions = report.get("action_chain") or []
        if not (gaps or contras or actions):
            story.append(Paragraph(
                "No analysis on file yet for this factory.",
                s["ExportMeta"],
            ))
            continue

        if gaps:
            story.append(Paragraph(f"<b>Open issues</b> ({len(gaps)})", s["ExportBody"]))
            for g in gaps[:10]:
                title = g.get("display_title") or g.get("requirement") or g.get("regulation") or "Gap"
                deadline = g.get("deadline") or "—"
                sev = (g.get("severity") or "MEDIUM").upper()
                story.append(Paragraph(
                    f"&bull; <b>{title}</b> — {sev}, due {deadline}",
                    s["ExportBody"],
                ))
            story.append(Spacer(1, 4))

        if contras:
            story.append(Paragraph(
                f"<b>Document mismatches</b> ({len(contras)})",
                s["ExportBody"],
            ))
            for c in contras[:5]:
                story.append(Paragraph(
                    f"&bull; {c.get('claim') or 'Claim'} ⇄ {c.get('evidence_text') or c.get('evidence') or 'evidence'}",
                    s["ExportBody"],
                ))
            story.append(Spacer(1, 4))

        if actions:
            story.append(Paragraph(
                f"<b>Recommended actions</b> ({len(actions)})",
                s["ExportBody"],
            ))
            for a in actions[:6]:
                title = a.get("title") or "Action"
                deadline = a.get("deadline") or "—"
                impact = _money(a.get("impact_pkr"))
                story.append(Paragraph(
                    f"&bull; <b>{title}</b> — by {deadline}, protects {impact}",
                    s["ExportBody"],
                ))

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "<i>Generated by ExportIQ. Synthetic data for hackathon submission.</i>",
        s["ExportMeta"],
    ))

    doc.build(story)
    return buf.getvalue()


@router.get("")
async def export_summary(factory_ids: str | None = None) -> StreamingResponse:
    ids = [s.strip() for s in (factory_ids or "").split(",") if s.strip()] or DEFAULT_FACTORIES
    pdf_bytes = _build_pdf(ids)
    filename = f"exportiq_summary_{datetime.utcnow().date().isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
