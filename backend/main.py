"""ExportIQ FastAPI entry point.

Exposes 6 endpoints used by the Expo mobile app + Antigravity Manager view:

    POST /upload                — ingest PDFs / CSVs
    POST /analyze               — kick off the 6-agent LangGraph pipeline
    GET  /status/{job_id}       — poll progress + live agent trace
    GET  /report/{factory_id}   — final compliance report
    POST /simulate/{factory_id} — run execution-simulation for chosen actions
    GET  /documents/{factory_id}— list generated artifacts (buyer emails, CBAM forms)
    POST /failure-test/{job_id} — inject a controlled failure for demo recovery
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from api import upload, analyze, status, actions, simulate, failure_test, documents, report

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


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


app.include_router(upload.router, prefix="/upload", tags=["upload"])
app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])
app.include_router(status.router, prefix="/status", tags=["status"])
app.include_router(report.router, prefix="/report", tags=["report"])
app.include_router(actions.router, prefix="/actions", tags=["actions"])
app.include_router(simulate.router, prefix="/simulate", tags=["simulate"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(failure_test.router, prefix="/failure-test", tags=["demo"])
