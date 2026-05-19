"""Antigravity-compatible trace exporter.

For a completed analysis job, this tool reads:
  - Firestore: /jobs/{job_id}.agent_trace + final report at
    /factories/{factory_id}/reports/latest
  - Local JSON log: backend/logs/agent_trace_{job_id}.json

…and produces `backend/logs/antigravity_trace_{job_id}.md` — the
markdown deliverable for the hackathon "Antigravity logs" submission.

Sections (in order):
  1. Workplan
  2. Task Plan
  3. Agent Observations
  4. Reasoning Steps
  5. Tool Calls
  6. Decisions Made
  7. Action Execution Log
  8. Error Recovery Log
  9. Final Outcomes

Usage:
    python -m tools.trace_exporter --job-id job_xxxxxxxx [--factory-id fwi_fsd_001]
    # or programmatically:
    from tools.trace_exporter import export_trace
    path = export_trace("job_xxxxxxxx")
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from tools.firestore_client import get_doc
from tools.agent_logger import load_from_disk

log = logging.getLogger("exportiq.trace_exporter")

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
LOG_DIR.mkdir(exist_ok=True)


AGENT_DISPLAY = {
    "orchestrator":          "Master Orchestrator",
    "regulation_ingestion":  "Agent 1 — Regulation Ingestion",
    "factory_profile":       "Agent 2 — Factory Profile",
    "gap_detection":         "Agent 3 — Gap Detection",
    "financial_impact":      "Agent 4 — Financial Impact",
    "financial_impact_agent": "Agent 4 — Financial Impact",
    "action_chain":          "Agent 5 — Action Chain",
    "action_chain_agent":    "Agent 5 — Action Chain",
    "execution_simulation":  "Agent 6 — Execution Simulation",
    "recovery":              "Recovery Agent",
}


def _agent_label(name: str) -> str:
    return AGENT_DISPLAY.get(name, name)


def _fmt_data(d: Any, limit: int = 800) -> str:
    """Compact JSON-ish rendering for record payloads."""
    if d is None:
        return "_none_"
    try:
        s = json.dumps(d, default=str, indent=2, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        s = str(d)
    if len(s) > limit:
        s = s[:limit] + " …(truncated)"
    return s


def _records_for(records: Iterable[dict], event_match: str) -> list[dict]:
    return [r for r in records if event_match in str(r.get("event", ""))]


def export_trace(job_id: str, factory_id: str | None = None) -> Path:
    """Render the markdown trace for `job_id` and return the file path."""
    job = get_doc(f"jobs/{job_id}") or {}
    if not factory_id:
        factory_id = job.get("factory_id")
    report = (
        get_doc(f"factories/{factory_id}/reports/latest") if factory_id else {}
    ) or {}

    disk_records = load_from_disk(job_id)
    fs_trace = job.get("agent_trace", []) or []

    started_at = job.get("started_at") or report.get("updated_at") or ""
    finished_at = job.get("updated_at") or ""

    lines: list[str] = []
    p = lines.append

    # Header
    p(f"# Antigravity Trace — {job_id}")
    p("")
    p(f"_Generated {datetime.utcnow().isoformat()}Z_")
    p("")
    p(f"- **Factory:** `{factory_id}` ({report.get('factory_name', '—')}, {report.get('city', '—')})")
    p(f"- **Job:** `{job_id}`")
    p(f"- **Started:** {started_at}")
    p(f"- **Finished:** {finished_at}")
    p(f"- **Status:** `{job.get('status', 'unknown')}`")
    p(f"- **Recovery used:** {bool(report.get('recovery_used'))}")
    p("")

    # 1. Workplan
    p("## 1. Workplan")
    p("")
    p("Ingest EU/UK regulation rulebooks and a Pakistani textile factory's audit")
    p("profile. Identify compliance gaps + claim/evidence contradictions, quantify")
    p("PKR exposure, generate a prioritised action chain, and simulate executing")
    p("each action so the user sees the score delta + recovered orders before")
    p("committing. Persist a real-time agent trace for the mobile UI.")
    p("")

    # 2. Task plan
    p("## 2. Task Plan")
    p("")
    p("| # | Agent | Output | Downstream consumer |")
    p("|---|-------|--------|---------------------|")
    p("| 1 | Regulation Ingestion | Parsed rulebook (JSON rules) | Gap Detection |")
    p("| 2 | Factory Profile      | Claims + audit evidence + certifications | Gap Detection, Financial Impact |")
    p("| 3 | Gap Detection        | gaps[], contradictions[], display_titles  | Action Chain |")
    p("| 4 | Financial Impact     | orders_at_risk_pkr, buyers_affected       | Action Chain |")
    p("| 5 | Action Chain         | prioritised actions[]                     | Execution Simulation |")
    p("| 6 | Execution Simulation | simulation_result, generated documents    | Mobile UI |")
    p("")

    # 3. Agent observations — one row per agent with start/end + duration
    p("## 3. Agent Observations")
    p("")
    starts = {r["agent"]: r for r in disk_records if r.get("event") == "start"}
    ends   = {r["agent"]: r for r in disk_records if r.get("event") == "end"}
    p("| Agent | Started | Ended | Duration (ms) |")
    p("|-------|---------|-------|---------------|")
    for agent in sorted(set(list(starts.keys()) + list(ends.keys()))):
        s = starts.get(agent, {})
        e = ends.get(agent, {})
        p(
            f"| {_agent_label(agent)} | {s.get('timestamp','—')} | "
            f"{e.get('timestamp','—')} | {e.get('duration_ms','—')} |"
        )
    p("")

    # 4. Reasoning steps — every step:* event in order
    p("## 4. Reasoning Steps")
    p("")
    reason_records = _records_for(disk_records, "step:")
    if not reason_records:
        # Fall back to Firestore trace if local log not available
        for r in fs_trace:
            p(f"### {_agent_label(r.get('agent','?'))} — `{r.get('step')}`")
            p(f"_{r.get('ts','')}_  ")
            p("")
            p("```json")
            p(_fmt_data(r.get("detail")))
            p("```")
            p("")
    else:
        for r in reason_records:
            step = (r.get("event") or "").replace("step:", "")
            p(f"### {_agent_label(r.get('agent','?'))} — `{step}`")
            p(f"_{r.get('timestamp','')}_  ")
            p("")
            p("```json")
            p(_fmt_data(r.get("data")))
            p("```")
            p("")

    # 5. Tool calls — Gemini calls, Firestore writes, document generation
    p("## 5. Tool Calls")
    p("")
    tool_records = _records_for(disk_records, "tool_call")
    if tool_records:
        for r in tool_records:
            d = r.get("data") or {}
            p(f"- `{r.get('timestamp','')}` **{_agent_label(r.get('agent','?'))}** → "
              f"`{d.get('tool','?')}` — {_fmt_data(d.get('args'), limit=240)}")
        p("")
    else:
        # Derive implicit tool calls from the firestore trace
        for r in fs_trace:
            step = r.get("step", "")
            if step in ("llm_pass", "rationale", "deterministic_pass",
                         "contradictions_detected", "display_titles_attached",
                         "buyer_emails_drafted", "simulated_action", "initial_score"):
                p(f"- `{r.get('ts','')}` **{_agent_label(r.get('agent','?'))}** → "
                  f"`{step}` — {_fmt_data(r.get('detail'), limit=240)}")
        p("")

    # 6. Decisions made — derived from action_chain + gap_detection priorities
    p("## 6. Decisions Made")
    p("")
    gaps = report.get("gaps", []) or []
    actions = report.get("action_chain", []) or []
    if gaps:
        p("**Gaps identified (top 5 by severity):**")
        p("")
        for g in gaps[:5]:
            title = g.get("display_title") or g.get("requirement", "(no title)")
            p(f"- `{g.get('severity','?')}` — **{title}** (regulation: {g.get('regulation','?')}, "
              f"status: `{g.get('status','?')}`, days_remaining: {g.get('days_remaining','—')})")
        p("")
    if actions:
        p("**Prioritised action chain:**")
        p("")
        for a in actions:
            p(f"- **#{a.get('priority','?')}** {a.get('title','(no title)')} — effort `{a.get('effort','?')}`, "
              f"deadline `{a.get('deadline','—')}`, impact `PKR {a.get('impact_pkr',0):,}`")
        p("")

    # 7. Action execution log — per-action simulation deltas
    p("## 7. Action Execution Log")
    p("")
    if actions:
        p("| # | Action | Before → After | Score Δ | PKR risk recovered |")
        p("|---|--------|----------------|---------|--------------------|")
        for a in actions:
            sim = a.get("simulation_output") or {}
            p(
                f"| {a.get('priority','?')} | {a.get('title','(no title)')} | "
                f"{sim.get('before_score','—')} → {sim.get('after_score','—')} | "
                f"{sim.get('score_delta','—')} | "
                f"PKR {int(sim.get('risk_reduction_pkr') or 0):,} |"
            )
        p("")

    # 8. Error recovery log
    p("## 8. Error Recovery Log")
    p("")
    err_records = _records_for(disk_records, "error")
    if err_records:
        for r in err_records:
            d = r.get("data") or {}
            p(f"### {_agent_label(r.get('agent','?'))} — `{d.get('type','Error')}`")
            p(f"_{r.get('timestamp','')}_  ")
            p("")
            p(f"**Message:** {d.get('message','—')}")
            p("")
            if d.get("detail"):
                p("```")
                p(_fmt_data(d.get("detail")))
                p("```")
                p("")
    elif report.get("recovery_used"):
        p("Recovery agent activated — fallback outputs were produced for one or more agents.")
        p("")
    else:
        p("No agent errors. Pipeline completed cleanly.")
        p("")

    # 9. Final outcomes
    p("## 9. Final Outcomes")
    p("")
    sim = report.get("simulation_result") or {}
    fin = report.get("financial_impact") or {}
    p(f"- **Compliance score:** {report.get('compliance_score','—')} / 100 → "
      f"simulated **{sim.get('after_score','—')} / 100**")
    p(f"- **Risk level:** `{report.get('risk_level', 'UNKNOWN')}`")
    p(f"- **Orders at risk:** PKR {int(report.get('orders_at_risk_pkr', 0)):,}")
    p(f"- **PKR risk recovered (after simulated actions):** PKR "
      f"{int(sim.get('risk_reduction_pkr', 0)):,}")
    p(f"- **Buyers affected:** {', '.join(fin.get('buyers_affected', []) or []) or '—'}")
    p(f"- **Documents generated:** {len(report.get('documents', []) or [])}")
    if report.get("recovery_used"):
        p("- **Recovery agent:** activated during this run.")
    p("")
    p("---")
    p("")
    p("_End of trace._")

    out = LOG_DIR / f"antigravity_trace_{job_id}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def _main() -> int:
    parser = argparse.ArgumentParser(description="Export an Antigravity-style markdown trace.")
    parser.add_argument("--job-id", required=True, help="Firestore job id (e.g. job_xxxxxxxx)")
    parser.add_argument("--factory-id", default=None)
    args = parser.parse_args()
    out = export_trace(args.job_id, args.factory_id)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
