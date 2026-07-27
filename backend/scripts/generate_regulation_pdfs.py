"""Generate 1-page placeholder PDFs for regulations that have no real source PDF.

Produces sa8000.pdf, eu_reach.pdf, gsplus.pdf in mock_data/regulations/ from
the matching regulation JSON, and copies the real CSDDD / Modern Slavery PDFs
to their canonical storage filenames if needed. NO 'CBAM' anywhere.

Run:
    python scripts/generate_regulation_pdfs.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem

REG_DIR = Path(__file__).resolve().parent.parent / "mock_data" / "regulations"
NAVY = colors.HexColor("#0F172A")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="RTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
                          fontSize=18, leading=22, textColor=NAVY, spaceAfter=8))
styles.add(ParagraphStyle(name="RBody", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=10, leading=15))
styles.add(ParagraphStyle(name="RSmall", parent=styles["Normal"], fontName="Helvetica",
                          fontSize=8, leading=11, textColor=colors.grey))

# regulation_id -> output filename for the placeholder PDFs we generate
GENERATE = {
    "sa8000": "sa8000.pdf",
    "eu_reach": "eu_reach.pdf",
    "gsplus": "gsplus.pdf",
}

# (storage-canonical filename, existing source filename) pairs to ensure exist
COPIES = {
    "eu_csddd.pdf": "eu_csddd.pdf",          # already present (real directive)
    "uk_modern_slavery.pdf": "uk_modern_slavery_act.pdf",
}


def _build(reg: dict, out: Path) -> None:
    doc = SimpleDocTemplate(str(out), pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=20 * mm, bottomMargin=20 * mm,
                            title=reg.get("full_name", reg.get("name")))
    story = [
        Paragraph(reg.get("full_name", reg.get("name")), styles["RTitle"]),
        Paragraph(f"Jurisdiction: {reg.get('jurisdiction', '—')} &nbsp;&nbsp; "
                  f"Source: {reg.get('source_url', '')}", styles["RSmall"]),
        Spacer(1, 12),
        Paragraph("Key requirements relevant to Pakistani textile exporters:", styles["RBody"]),
        Spacer(1, 6),
    ]
    items = []
    for r in reg.get("rules", []):
        items.append(ListItem(Paragraph(
            f"<b>{r.get('source_section', r.get('rule_id'))}.</b> {r.get('requirement')}",
            styles["RBody"])))
    if items:
        story.append(ListFlowable(items, bulletType="bullet", start="•"))
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        "This is a condensed reference summary generated for the AISeekho 2026 Google "
        "Antigravity Hackathon submission (ExportIQ). Refer to the official source for the "
        "full legal text.", styles["RSmall"]))
    doc.build(story)


def main() -> int:
    for reg_id, fname in GENERATE.items():
        jpath = REG_DIR / f"{reg_id}.json"
        if not jpath.exists():
            print(f"  ! no JSON for {reg_id}")
            continue
        reg = json.loads(jpath.read_text(encoding="utf-8"))
        out = REG_DIR / fname
        _build(reg, out)
        print(f"wrote {fname} ({out.stat().st_size:,} bytes)")

    for canonical, source in COPIES.items():
        src = REG_DIR / source
        dst = REG_DIR / canonical
        if src.exists() and not dst.exists():
            shutil.copyfile(src, dst)
            print(f"copied {source} -> {canonical}")
        elif dst.exists():
            print(f"= {canonical} already present")
        else:
            print(f"  ! source {source} missing for {canonical}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
