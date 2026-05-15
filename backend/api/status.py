"""GET /status/{job_id} — poll progress + live agent reasoning trace."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from tools.firestore_client import get_doc

router = APIRouter()


@router.get("/{job_id}")
async def status(job_id: str) -> dict:
    job = get_doc(f"jobs/{job_id}")
    if not job:
        raise HTTPException(404, f"job {job_id} not found")
    return {
        "job_id": job_id,
        "status": job.get("status", "unknown"),
        "progress": job.get("progress", 0),
        "current_agent": job.get("current_agent"),
        "started_at": job.get("started_at"),
        "updated_at": job.get("updated_at"),
        "agent_trace": job.get("agent_trace", []),
    }
