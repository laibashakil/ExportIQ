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

log = logging.getLogger("exportiq.agents")


def log_step(state: dict, agent: str, step: str, detail: Any = None,
             *, progress: int | None = None) -> dict:
    """Append a reasoning step to both LangGraph state and Firestore.

    Returns a state patch the agent can spread into its return dict so LangGraph
    accumulates the trace via its `add` reducer.
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
    log.info("[%s] %s :: %s", agent, step, detail)
    return {"agent_trace": [entry]}


def maybe_inject_failure(state: dict, agent: str) -> tuple[bool, str | None]:
    """Return (should_fail, failure_type) if this agent is the target."""
    if state.get("inject_failure_in") == agent:
        return True, state.get("inject_failure_type")
    return False, None
