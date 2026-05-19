"""Structured JSON logging for every agent run.

Each agent calls `agent_log(job_id, agent, event, data)` at every meaningful
step. Records are written to `backend/logs/agent_trace_{job_id}.json` as a
JSON array (one record per line during the run, finalised to a valid JSON
array on flush) so the hackathon submission has a deterministic, file-based
trace per job — independent of Firestore.

Records are ALSO logged to stdout via the standard `logging` module so they
appear in the uvicorn console while developing.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(exist_ok=True)

_log = logging.getLogger("exportiq.agent_trace")

# A single in-memory buffer per job_id with a lock — multiple agents may be
# running in parallel (regulation_ingestion + factory_profile), and we don't
# want partial JSON writes to corrupt the file.
_BUFFERS: dict[str, list[dict]] = {}
_TIMERS: dict[tuple[str, str], float] = {}  # (job_id, agent) -> start time monotonic
_LOCK = threading.Lock()


def _log_path(job_id: str) -> Path:
    safe = "".join(c for c in job_id if c.isalnum() or c in "_-")[:64] or "unknown"
    return LOG_DIR / f"agent_trace_{safe}.json"


def _flush_locked(job_id: str) -> None:
    """Atomic-ish write — assumes _LOCK is already held."""
    buf = _BUFFERS.get(job_id, [])
    if not buf:
        return
    path = _log_path(job_id)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(buf, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def agent_log(
    job_id: str | None,
    agent: str,
    event: str,
    data: Any = None,
    *,
    duration_ms: float | None = None,
) -> None:
    """Append a single structured record.

    Schema:
        timestamp     ISO-8601 UTC
        job_id        run identifier
        agent         agent name (orchestrator|regulation_ingestion|…)
        event         step name (start|input_received|tool_call|output|complete|error|…)
        data          optional structured payload
        duration_ms   optional elapsed time for timed events

    Records are appended to an in-memory buffer per job and flushed on every
    write so the on-disk file is always at most one event behind.
    """
    rec = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "job_id": job_id,
        "agent": agent,
        "event": event,
        "data": data,
    }
    if duration_ms is not None:
        rec["duration_ms"] = round(duration_ms, 2)

    if not job_id:
        _log.info("agent_log (no job_id): %s %s %s", agent, event, data)
        return

    with _LOCK:
        _BUFFERS.setdefault(job_id, []).append(rec)
        try:
            _flush_locked(job_id)
        except Exception:  # noqa: BLE001
            _log.exception("failed to flush agent trace for %s", job_id)
    _log.info("[%s][%s] %s :: %s", job_id, agent, event, data)


def agent_start(job_id: str | None, agent: str, input_summary: Any = None) -> None:
    """Mark the start of an agent run + remember the start time so the
    corresponding `agent_end` call can compute duration."""
    if job_id:
        _TIMERS[(job_id, agent)] = time.monotonic()
    agent_log(job_id, agent, "start", {"input": input_summary})


def agent_end(job_id: str | None, agent: str, output_summary: Any = None) -> None:
    """Mark the end of an agent run with elapsed duration."""
    started = _TIMERS.pop((job_id or "", agent), None)
    dur = (time.monotonic() - started) * 1000 if started else None
    agent_log(job_id, agent, "end", {"output": output_summary}, duration_ms=dur)


def tool_call(job_id: str | None, agent: str, tool: str, args_summary: Any = None) -> None:
    agent_log(job_id, agent, "tool_call", {"tool": tool, "args": args_summary})


def reasoning(job_id: str | None, agent: str, step: str, detail: Any = None) -> None:
    agent_log(job_id, agent, f"reasoning:{step}", detail)


def error(job_id: str | None, agent: str, exc: BaseException, detail: Any = None) -> None:
    agent_log(
        job_id, agent, "error",
        {"type": type(exc).__name__, "message": str(exc), "detail": detail},
    )


def get_buffer(job_id: str) -> list[dict]:
    """Read the buffered records for a job — useful for the trace exporter."""
    with _LOCK:
        return list(_BUFFERS.get(job_id, []))


def load_from_disk(job_id: str) -> list[dict]:
    """Re-load a finished job's records from its JSON file."""
    path = _log_path(job_id)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        _log.exception("failed to load %s", path)
        return []
