"""Verify each factory PDF is consistent with its source JSON.

For all 5 factories it:
  1. Reads the factory JSON and extracts key numeric/string values.
  2. Opens the matching PDF with PyMuPDF (fitz) and extracts the full text.
  3. Checks each JSON value appears verbatim in the PDF text.
  4. Checks the string "CBAM" never appears (it must not — CBAM does not apply
     to textiles).
Prints a per-field ✓/✗ report and exits non-zero if anything fails.

Run:
    python scripts/verify_pdf_json_match.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

FACTORY_DIR = Path(__file__).resolve().parent.parent / "mock_data" / "factories"
FACTORY_IDS = ["fwi_fsd_001", "cfw_lhe_002", "rgl_khi_003", "ams_skl_004", "sgd_tex_005"]


def _checks(data: dict) -> list[tuple[str, str]]:
    """(label, expected-substring) pairs for fields the PDF renders verbatim.
    None / missing values are skipped."""
    dr = data.get("demo_report") or {}
    raw = {
        "water_effluent_ppm": data.get("water_effluent_ppm"),
        "avg_weekly_hours": data.get("avg_weekly_hours"),
        "avg_overtime_hours": data.get("avg_overtime_hours"),
        "lead_in_dyes_ppm": data.get("lead_in_dyes_ppm"),
        "formaldehyde_ppm": data.get("formaldehyde_ppm"),
        "sa8000_status": data.get("sa8000_status"),
        "sa8000_expiry": data.get("sa8000_expiry"),
        "gots_status": data.get("gots_status"),
        "csddd_policy": data.get("csddd_due_diligence_policy") or data.get("csddd_due_diligence_report"),
        "iso_14001_expiry": data.get("iso_14001_expiry"),
        "compliance_score": dr.get("compliance_score"),
        "risk_level": dr.get("risk_level"),
    }
    out = []
    for label, value in raw.items():
        if value is None or value == "":
            continue
        out.append((label, str(value)))
    return out


def main() -> int:
    all_ok = True
    for fid in FACTORY_IDS:
        json_path = FACTORY_DIR / f"{fid}.json"
        pdf_path = FACTORY_DIR / f"{fid}.pdf"
        print(f"\n=== {fid} ===")
        if not json_path.exists() or not pdf_path.exists():
            print(f"  ✗ missing {'JSON' if not json_path.exists() else 'PDF'}")
            all_ok = False
            continue
        data = json.loads(json_path.read_text(encoding="utf-8"))
        with fitz.open(pdf_path) as doc:
            text = "".join(page.get_text() for page in doc)

        for label, expected in _checks(data):
            ok = expected in text
            all_ok = all_ok and ok
            print(f"  [{'OK' if ok else 'XX'}] {label}: {expected!r}")

        cbam_free = "cbam" not in text.lower()
        all_ok = all_ok and cbam_free
        print(f"  [{'OK' if cbam_free else 'XX'}] no 'CBAM' in PDF text")

    print("\n" + ("ALL FIELDS MATCH — PDFs consistent with JSON." if all_ok
                  else "MISMATCHES FOUND — fix the PDF template and re-run."))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
