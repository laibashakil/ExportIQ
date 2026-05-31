"""POST /analyze — kick off the 6-agent LangGraph pipeline as a background job."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from agents.orchestrator import run_pipeline
from tools.firestore_client import set_doc

router = APIRouter()
log = logging.getLogger("exportiq.api.analyze")


class AnalyzeRequest(BaseModel):
    factory_id: str
    # Default to the full rulebook the apps send. Analysing against only a
    # subset (e.g. just CBAM) misses SA8000/CSDDD/chemical/labour gaps and
    # inflates the compliance score, so a bare /analyze must not do that.
    regulation_ids: list[str] = Field(
        default_factory=lambda: ["eu_cbam", "uk_modern_slavery", "eu_supply_chain_directive"]
    )
    inject_failure_in: str | None = None
    inject_failure_type: str | None = None


class AnalyzeResponse(BaseModel):
    job_id: str
    factory_id: str
    status: str = "running"


@router.post("", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, bg: BackgroundTasks) -> AnalyzeResponse:
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    set_doc(f"jobs/{job_id}", {
        "job_id": job_id,
        "factory_id": req.factory_id,
        "regulation_ids": req.regulation_ids,
        "status": "queued",
        "progress": 0,
        "started_at": datetime.utcnow().isoformat(),
        "agent_trace": [],
    })
    bg.add_task(
        run_pipeline,
        job_id=job_id,
        factory_id=req.factory_id,
        regulation_ids=req.regulation_ids,
        inject_failure_in=req.inject_failure_in,
        inject_failure_type=req.inject_failure_type,
    )
    return AnalyzeResponse(job_id=job_id, factory_id=req.factory_id, status="running")
