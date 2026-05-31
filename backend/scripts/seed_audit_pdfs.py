"""Seed original factory audit PDFs into Firebase Storage + Firestore.

Idempotent. For each demo factory it:
  1. Uploads backend/mock_data/factories/{id}.pdf to Storage at
     `factories/{id}.pdf` (only if the object is missing), giving it a
     Firebase download token so the JS SDK `getDownloadURL()` resolves.
  2. Writes `audit_pdf_path: "factories/{id}.pdf"` onto /factories/{id}
     in Firestore (merge) so the mobile Documents tab auto-populates.

It also reports the state of the regulation PDFs the apps link to.

Usage (from backend/):
    python scripts/seed_audit_pdfs.py
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage

# Seed value for `last_analyzed_at` on the demo factories so the web sidebar
# shows a real date instead of "Not yet analyzed". 11:45 on 2026-05-29, pinned
# to PKT (UTC+5) so it renders as "May 29, 2026 at 11:45 AM" for demo viewers.
SEED_ANALYZED_AT = datetime(2026, 5, 29, 11, 45, 0, tzinfo=timezone(timedelta(hours=5)))

BACKEND_DIR = Path(__file__).resolve().parent.parent
FACTORY_DIR = BACKEND_DIR / "mock_data" / "factories"
SA_PATH = BACKEND_DIR / "service-account.json"
BUCKET = "gen-lang-client-0067611351.firebasestorage.app"

# factory_id -> source PDF filename in mock_data/factories
FACTORIES = {
    "fwi_fsd_001": "fwi_fsd_001.pdf",
    "cfw_lhe_002": "cfw_lhe_002.pdf",
    "rgl_khi_003": "rgl_khi_003.pdf",
}

# Storage path -> source PDF filename in mock_data/regulations.
# Note the source filenames differ from the canonical storage paths the
# mobile/web apps link to.
REGULATIONS = {
    "regulations/eu_cbam.pdf": "eu_cbam.pdf",
    "regulations/uk_modern_slavery.pdf": "uk_modern_slavery_act.pdf",
    "regulations/eu_supply_chain_directive.pdf": "eu_csddd.pdf",
}
REGULATION_DIR = BACKEND_DIR / "mock_data" / "regulations"


def _init():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SA_PATH))
        firebase_admin.initialize_app(cred, {"storageBucket": BUCKET})
    return firestore.client(), storage.bucket()


def _upload_with_token(bucket, local: Path, dest: str) -> str:
    """Upload `local` to `dest`, attaching a Firebase download token so the
    JS SDK getDownloadURL() resolves. Returns the storage path."""
    blob = bucket.blob(dest)
    token = uuid.uuid4().hex
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_filename(str(local), content_type="application/pdf")
    return dest


def main() -> int:
    db, bucket = _init()

    print("== Factory audit PDFs ==")
    for fid, fname in FACTORIES.items():
        local = FACTORY_DIR / fname
        dest = f"factories/{fid}.pdf"
        if not local.exists():
            print(f"  ! {fid}: source PDF missing at {local} — skipping upload")
        else:
            blob = bucket.blob(dest)
            if blob.exists():
                print(f"  = {dest} already in Storage")
            else:
                _upload_with_token(bucket, local, dest)
                print(f"  + uploaded {dest} ({local.stat().st_size:,} bytes)")
        # Always make sure the Firestore field points at it, and seed a
        # last_analyzed_at so the web "Last analyzed" label is never empty.
        db.document(f"factories/{fid}").set(
            {"audit_pdf_path": dest, "last_analyzed_at": SEED_ANALYZED_AT}, merge=True
        )
        print(f"    set /factories/{fid}.audit_pdf_path = {dest}")
        print(f"    set /factories/{fid}.last_analyzed_at = {SEED_ANALYZED_AT.isoformat()}")

    print("== Regulation PDFs ==")
    for dest, fname in REGULATIONS.items():
        local = REGULATION_DIR / fname
        blob = bucket.blob(dest)
        if blob.exists():
            print(f"  = {dest} already in Storage")
        elif not local.exists():
            print(f"  ! source PDF missing at {local} — skipping {dest}")
        else:
            _upload_with_token(bucket, local, dest)
            print(f"  + uploaded {dest} ({local.stat().st_size:,} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
