"""Shared helpers for all 6 agents.

Every agent uses `log_step` to push a reasoning entry into the LangGraph state
AND into Firestore. The Firestore append is what drives the live agent trace
on the mobile AgentTraceScreen — and what Antigravity Manager view picks up
as agent "thinking".
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from tools.firestore_client import append_trace, update_job_progress
from tools.agent_logger import agent_log, agent_start, agent_end

log = logging.getLogger("exportiq.agents")


def log_step(state: dict, agent: str, step: str, detail: Any = None,
             *, progress: int | None = None) -> dict:
    """Append a reasoning step to LangGraph state, Firestore, AND the JSON
    log file at `backend/logs/agent_trace_{job_id}.json`.

    The JSON file is the Antigravity trace deliverable — every meaningful
    reasoning step shows up there with a timestamp.
    """
    entry = {
        "agent": agent,
        "step": step,
        "detail": detail,
        "ts": datetime.utcnow().isoformat(),
    }
    job_id = state.get("job_id")
    if job_id:
        try:
            append_trace(job_id, entry)
        except Exception:  # noqa: BLE001
            log.exception("failed to append trace for job %s", job_id)
        if progress is not None:
            try:
                update_job_progress(job_id, current_agent=agent, progress=progress)
            except Exception:  # noqa: BLE001
                log.exception("failed to update progress")

        # Structured JSON record — independent of Firestore. The orchestrator
        # also calls agent_start/agent_end at the bookends of each node so
        # durations are captured.
        try:
            if step == "started":
                agent_start(job_id, agent, input_summary=detail)
            elif step in ("complete", "pipeline_complete"):
                agent_end(job_id, agent, output_summary=detail)
            else:
                agent_log(job_id, agent, f"step:{step}", detail)
        except Exception:  # noqa: BLE001
            log.exception("agent_logger flush failed")

    log.info("[%s] %s :: %s", agent, step, detail)
    return {"agent_trace": [entry]}


def maybe_inject_failure(state: dict, agent: str) -> tuple[bool, str | None]:
    """Return (should_fail, failure_type) if this agent is the target."""
    if state.get("inject_failure_in") == agent:
        return True, state.get("inject_failure_type")
    return False, None
