"""POST /failure-test/{job_id} — controlled failure injection for the demo.

Two modes:

1. If the job hasn't started yet, the orchestrator picks up the failure flags
   we save on the job doc.
2. If the job is already running, this re-runs the pipeline with failure
   injection enabled so the judges see the recovery agent kick in live in
   Antigravity Manager view.
"""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agents.orchestrator import run_pipeline
from tools.firestore_client import append_trace, get_doc, set_doc

router = APIRouter()


class FailureTestRequest(BaseModel):
    agent: Literal[
        "regulation_ingestion",
        "factory_profile",
        "gap_detection",
        "financial_impact",
        "action_chain",
        "execution_simulation",
    ]
    failure_type: Literal["api_timeout", "missing_data", "contradiction", "rate_limit"]


@router.post("/{job_id}")
async def inject_failure(job_id: str, req: FailureTestRequest, bg: BackgroundTasks) -> dict:
    job = get_doc(f"jobs/{job_id}")
    if not job:
        raise HTTPException(404, f"job {job_id} not found")

    factory_id = job["factory_id"]
    regulation_ids = job.get("regulation_ids") or ["eu_csddd", "uk_modern_slavery", "sa8000", "eu_reach", "gsplus"]

    new_job_id = f"job_{uuid.uuid4().hex[:10]}_recovery"
    set_doc(f"jobs/{new_job_id}", {
        "job_id": new_job_id,
        "factory_id": factory_id,
        "regulation_ids": regulation_ids,
        "status": "queued",
        "progress": 0,
        "inject_failure_in": req.agent,
        "inject_failure_type": req.failure_type,
        "parent_job": job_id,
        "agent_trace": [],
    })
    append_trace(job_id, {
        "agent": "demo_controller",
        "step": "failure_injection_requested",
        "detail": {"target_agent": req.agent, "failure_type": req.failure_type,
                   "recovery_job": new_job_id},
    })

    bg.add_task(
        run_pipeline,
        job_id=new_job_id,
        factory_id=factory_id,
        regulation_ids=regulation_ids,
        inject_failure_in=req.agent,
        inject_failure_type=req.failure_type,
    )
    return {
        "original_job_id": job_id,
        "recovery_job_id": new_job_id,
        "agent_failed": req.agent,
        "failure_type": req.failure_type,
        "status": "recovery_pipeline_started",
    }
