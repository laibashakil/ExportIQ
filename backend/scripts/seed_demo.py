"""Seed the demo Firebase project (gen-lang-client-0067611351).

Run from backend/ (so ./service-account.json resolves):
    python scripts/seed_demo.py

What it does (idempotent):
  1. Uploads all 5 factory audit PDFs   -> Storage factories/{id}.pdf
  2. Uploads all 5 regulation PDFs       -> Storage regulations/{name}.pdf
  3. For the 3 PRE-LOADED factories: writes the pinned report
     (/factories/{id}/reports/latest), the live factory doc (/factories/{id})
     with the new flat fields + audit_pdf_path + last_analyzed_at (legacy
     cbam_* fields stripped), and one /factories/{id}/actions/{action_id} doc
     per action.
  4. For the 2 UPLOAD factories (ams, sgd): writes only a pending_upload
     factory doc with audit_pdf_path and NO compliance_score, so they do not
     appear pre-analyzed. Their report is created live when uploaded+analyzed.
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import json  # noqa: E402

from tools.firestore_client import set_doc, get_doc, upload_to_storage  # noqa: E402

FACTORY_DIR = BACKEND / "mock_data" / "factories"
REG_DIR = BACKEND / "mock_data" / "regulations"

PRELOADED = ["fwi_fsd_001", "cfw_lhe_002", "rgl_khi_003"]
UPLOAD_ONLY = ["ams_skl_004", "sgd_tex_005"]

REGULATION_PDFS = [
    "eu_csddd.pdf", "uk_modern_slavery.pdf", "sa8000.pdf", "eu_reach.pdf", "gsplus.pdf",
]

# May 29, 2026 11:45 AM PKT (UTC+5)
SEED_ANALYZED_AT = datetime(2026, 5, 29, 11, 45, 0, tzinfo=timezone(timedelta(hours=5)))

# Flat audit fields copied onto /factories/{id} for the apps + completeness.
FLAT_FIELDS = [
    "province", "employee_count", "annual_export_pkr", "primary_products",
    "avg_regular_hours", "avg_overtime_hours", "avg_weekly_hours", "overtime_voluntary",
    "minimum_worker_age", "age_verification_complete", "grievance_mechanism",
    "msa_statement_published", "water_effluent_ppm", "lead_in_dyes_ppm", "co2_per_unit",
    "chemical_testing_cert", "dye_suppliers_verified", "azo_dye_test", "formaldehyde_ppm",
    "tier1_suppliers_mapped", "tier1_suppliers_audited", "tier2_suppliers_mapped",
    "csddd_due_diligence_policy", "csddd_due_diligence_report",
    "sa8000_status", "sa8000_expiry", "iso_14001_status", "iso_14001_expiry",
    "gots_status", "gots_expiry", "wrap_status",
]


def _load(fid: str) -> dict:
    return json.loads((FACTORY_DIR / f"{fid}.json").read_text(encoding="utf-8"))


def _upload_pdf(local: Path, dest: str) -> None:
    if not local.exists():
        print(f"  ! missing {local} — skipping {dest}")
        return
    res = upload_to_storage(dest, local.read_bytes(), content_type="application/pdf")
    print(f"  + uploaded {dest} ({local.stat().st_size:,} bytes)" if res
          else f"  = (in-memory store) {dest} not uploaded")


def _strip_cbam(d: dict) -> dict:
    return {k: v for k, v in d.items() if "cbam" not in k.lower()}


def _documents_for(f: dict) -> list[dict]:
    """A few pre-baked CSDDD-era documents so the Documents tab has content.
    No Gemini calls — deterministic markdown bodies."""
    name = f["factory_name"]
    dr = f.get("demo_report", {})
    gaps = dr.get("gaps", [])
    buyers = [b.get("name") for b in f.get("buyers", [])][:2]
    docs: list[dict] = []
    for buyer in buyers:
        docs.append({
            "document_id": f"doc_{uuid.uuid4().hex[:8]}",
            "title": f"Compliance Status Update — {name} — Q2 2026",
            "kind": "BUYER_EMAIL",
            "buyer": buyer,
            "stage": "STATUS_UPDATE",
            "body": (
                f"# Subject: Compliance Status Update — {name} — Q2 2026\n\n"
                f"Dear {buyer} compliance team,\n\n"
                f"As part of our ongoing transparency commitment we are sharing our quarterly "
                f"compliance status update. Our certifications remain in active scope and our "
                f"renewal and surveillance audit calendar continues on its standard schedule.\n\n"
                f"We remain available for any information you may need ahead of your audit cycle.\n\n"
                f"Warm regards,\nCompliance Office\n{name}\n"
            ),
            "generated_at": datetime.utcnow().isoformat(),
        })
    if any("CSDDD" in (g.get("regulation") or "") for g in gaps):
        docs.append({
            "document_id": f"doc_{uuid.uuid4().hex[:8]}",
            "title": f"CSDDD Due Diligence Report — {name} — Q2 2026",
            "kind": "CSDDD_DUE_DILIGENCE_REPORT",
            "body": (
                f"# CSDDD Supply Chain Due Diligence Report — {name}\n\n"
                f"**Directive:** EU CSDDD (Dir 2024/1760), Articles 5, 7, 8, 10, 11\n\n"
                f"**1. Due diligence policy.** Board-level policy and supplier code of conduct.\n"
                f"**2. Identified risks.** Human-rights and environmental risks across tier-1/tier-2 suppliers.\n"
                f"**3. Prevention & mitigation.** Periodic SMETA/BSCI supplier audits.\n"
                f"**4. Grievance mechanism.** Confidential, non-retaliatory complaints procedure.\n\n"
                f"---\n_Signed: Compliance Office, {name}_\n"
            ),
            "generated_at": datetime.utcnow().isoformat(),
        })
    for g in gaps[:1]:
        docs.append({
            "document_id": f"doc_{uuid.uuid4().hex[:8]}",
            "title": f"Audit checklist — {g.get('regulation')}",
            "kind": "AUDIT_CHECKLIST",
            "regulation": g.get("regulation"),
            "body": (
                f"# Remediation checklist — {g.get('regulation')}\n\n"
                f"1. Assign compliance officer — by next Monday\n"
                f"2. Collect current evidence (certificates, audit records) — within 1 week\n"
                f"3. Engage CertVerify Pakistan — within 2 weeks\n"
                f"4. Implement corrective action — within 4 weeks\n"
                f"5. Re-audit + submit evidence to buyer — before {g.get('deadline') or 'deadline'}\n"
            ),
            "generated_at": datetime.utcnow().isoformat(),
        })
    return docs


def _build_report(f: dict, documents: list[dict]) -> dict:
    fid = f["factory_id"]
    dr = f["demo_report"]
    score = int(dr["compliance_score"])
    at_risk = int(dr["orders_at_risk_pkr"])
    after = int(dr.get("score_after_full_simulation", 100))
    at_risk_after = int(dr.get("orders_at_risk_after_simulation", 0))
    profile = {k: v for k, v in f.items() if k != "demo_report"}
    return {
        "factory_id": fid,
        "job_id": "seed",
        "factory_name": f["factory_name"],
        "city": f["city"],
        "compliance_score": score,
        "original_compliance_score": score,
        "before_score": score,
        "after_score": after,
        "simulation_revealed": False,
        "risk_level": dr["risk_level"],
        "orders_at_risk_pkr": at_risk,
        "risk_reduction_pkr": at_risk - at_risk_after,
        "score_after_full_simulation": after,
        "orders_at_risk_after_simulation": at_risk_after,
        "gaps": dr.get("gaps", []),
        "contradictions": dr.get("contradictions", []),
        "action_chain": dr.get("action_chain", []),
        "simulation_result": {
            "before_score": score,
            "after_score": after,
            "score_delta": after - score,
            "risk_before_pkr": at_risk,
            "risk_after_pkr": at_risk_after,
            "risk_reduction_pkr": at_risk - at_risk_after,
            "score_after_full_simulation": after,
            "orders_at_risk_after_simulation": at_risk_after,
            "documents_generated": [],
            "rationale": (
                f"Executing the full action chain raises compliance {score} -> {after} "
                f"and recovers PKR {at_risk - at_risk_after:,} of at-risk orders."
            ),
        },
        "documents": documents,
        "financial_impact": {
            "annual_export_pkr": int(f.get("annual_export_pkr") or 0),
            "orders_at_risk_pkr": at_risk,
            "buyers_affected": dr.get("buyers_affected", []),
        },
        "factory_profile": profile,
        "recovery_used": False,
        "demo_pinned": True,
        "updated_at": datetime.utcnow().isoformat(),
    }


def seed_preloaded(fid: str) -> None:
    f = _load(fid)
    dr = f["demo_report"]
    documents = _documents_for(f)

    # 1. report
    report = _build_report(f, documents)
    set_doc(f"factories/{fid}/reports/latest", report)

    # 2. live factory doc (strip legacy cbam_* fields, full overwrite)
    existing = get_doc(f"factories/{fid}") or {}
    clean = _strip_cbam(existing)
    clean.update({
        "factory_id": fid,
        "factory_name": f["factory_name"],
        "name": f["factory_name"],
        "city": f["city"],
        "compliance_score": int(dr["compliance_score"]),
        "risk_level": dr["risk_level"],
        "orders_at_risk_pkr": int(dr["orders_at_risk_pkr"]),
        "score_after_full_simulation": int(dr.get("score_after_full_simulation", 100)),
        "orders_at_risk_after_simulation": int(dr.get("orders_at_risk_after_simulation", 0)),
        "audit_pdf_path": f"factories/{fid}.pdf",
        "last_analyzed_at": SEED_ANALYZED_AT,
        "updated_at": datetime.utcnow().isoformat(),
    })
    for k in FLAT_FIELDS:
        if k in f:
            clean[k] = f[k]
    set_doc(f"factories/{fid}", clean, merge=False)

    # 3. per-action docs (mobile Fix It listens to the actions subcollection)
    for a in dr.get("action_chain", []):
        set_doc(f"factories/{fid}/actions/{a['action_id']}", a)

    print(f"  seeded /factories/{fid}: score={dr['compliance_score']} "
          f"risk={dr['risk_level']} gaps={len(dr.get('gaps', []))} "
          f"actions={len(dr.get('action_chain', []))} docs={len(documents)}")


def seed_upload_only(fid: str) -> None:
    f = _load(fid)
    existing = get_doc(f"factories/{fid}") or {}
    clean = _strip_cbam(existing)
    # Remove any pre-existing analyzed state so it is truly "pending".
    for k in ("compliance_score", "risk_level", "orders_at_risk_pkr",
              "score_after_full_simulation", "orders_at_risk_after_simulation"):
        clean.pop(k, None)
    clean.update({
        "factory_id": fid,
        "factory_name": f["factory_name"],
        "name": f["factory_name"],
        "city": f["city"],
        "status": "pending_upload",
        "audit_pdf_path": f"factories/{fid}.pdf",
        "updated_at": datetime.utcnow().isoformat(),
    })
    set_doc(f"factories/{fid}", clean, merge=False)
    print(f"  seeded /factories/{fid}: status=pending_upload (no compliance_score)")


def main() -> int:
    print("== Upload factory PDFs ==")
    for fid in PRELOADED + UPLOAD_ONLY:
        _upload_pdf(FACTORY_DIR / f"{fid}.pdf", f"factories/{fid}.pdf")

    print("== Upload regulation PDFs ==")
    for name in REGULATION_PDFS:
        _upload_pdf(REG_DIR / name, f"regulations/{name}")

    print("== Seed pre-loaded factories ==")
    for fid in PRELOADED:
        seed_preloaded(fid)

    print("== Seed upload-only factories (pending) ==")
    for fid in UPLOAD_ONLY:
        seed_upload_only(fid)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
