"""ExportIQ FastAPI entry point.

Exposes the following routes used by the Expo mobile app + Antigravity Manager view:

    GET  /                                — service banner + agent list
    GET  /health                          — liveness probe (/healthz is reserved by Cloud Run's GFE)
    POST /upload                          — ingest PDFs / CSVs
    POST /analyze                         — kick off the 6-agent LangGraph pipeline
    GET  /status/{job_id}                 — poll progress + live agent trace
    GET  /report/{factory_id}             — final compliance report
    GET  /actions/{factory_id}            — prioritised action chain only
    POST /simulate/{factory_id}           — run execution-simulation for chosen actions
    GET  /documents/{factory_id}          — list generated artifacts (buyer emails, CSDDD reports)
    POST /documents/{factory_id}/audit-ready — bundle the audit-ready document set
    POST /failure-test/{job_id}           — inject a controlled failure for demo recovery
    GET  /export-summary                  — CSV/markdown export of every factory's status
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from api import upload, analyze, status, actions, simulate, failure_test, documents, report, export_summary

settings = get_settings()
logging.basicConfig(level=settings.log_level)
log = logging.getLogger("exportiq")

app = FastAPI(
    title="ExportIQ — Pakistan Textile Export Compliance Agent",
    description=(
        "Agentic AI system that ingests EU/UK regulations + factory audit reports, "
        "detects compliance gaps and contradictions, calculates PKR risk, and "
        "simulates remediation actions for Pakistani textile exporters."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict:
    return {
        "service": "exportiq",
        "status": "ok",
        "environment": settings.environment,
        "gemini_model": settings.gemini_model,
        "agents": [
            "regulation_ingestion",
            "factory_profile",
            "gap_detection",
            "financial_impact",
            "action_chain",
            "execution_simulation",
        ],
    }


@app.get("/health")
async def health() -> dict:
    # `/healthz` is reserved by the Google Front End above Cloud Run and is
    # never forwarded to the container — use `/health` instead.
    return {"ok": True}


# Static files — serves the downloadable sample audit report template
# (sample_audit_template.docx / .pdf) the upload pages link to.
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(upload.router, prefix="/upload", tags=["upload"])
app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])
app.include_router(status.router, prefix="/status", tags=["status"])
app.include_router(report.router, prefix="/report", tags=["report"])
app.include_router(actions.router, prefix="/actions", tags=["actions"])
app.include_router(simulate.router, prefix="/simulate", tags=["simulate"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(failure_test.router, prefix="/failure-test", tags=["demo"])
app.include_router(export_summary.router, prefix="/export-summary", tags=["export"])
