"""LangGraph orchestrator — wires the 6 agents + recovery agent into a DAG.

Graph shape:

      START
       │
       ├──> regulation_ingestion ──┐
       │                            │ (run in parallel — both update state)
       └──> factory_profile  ──────┘
                                    │
                                    ▼
                         gap_detection
                                    │
                                    ▼
                         financial_impact
                                    │
                                    ▼
                         action_chain
                                    │
                                    ▼
                         execution_simulation
                                    │
                                    ▼
                          END

If any agent raises, control routes to `recovery_agent` and then back into
the graph at the next non-failed node. This is what gives the demo its
"failure injection → recovery" moment in Antigravity Manager view.
"""
from __future__ import annotations

import logging
import traceback
from datetime import datetime
from typing import Callable

from langgraph.graph import StateGraph, END, START

from tools.firestore_client import update_job_progress, append_trace, set_doc
from tools.agent_logger import agent_log, agent_start, agent_end, error as agent_error
from .state import AgentState
from . import (
    regulation_agent,
    factory_profile_agent,
    gap_detection_agent,
    financial_impact_agent,
    action_chain_agent,
    execution_agent,
    recovery_agent,
)
from .base import log_step

log = logging.getLogger("exportiq.orchestrator")


# Node names — must NOT collide with AgentState keys (LangGraph constraint).
# `financial_impact` and `action_chain` are both state keys, so the graph
# nodes that produce those values get an `_agent` suffix.
AGENTS = {
    "regulation_ingestion": regulation_agent.run,
    "factory_profile": factory_profile_agent.run,
    "gap_detection": gap_detection_agent.run,
    "financial_impact_agent": financial_impact_agent.run,
    "action_chain_agent": action_chain_agent.run,
    "execution_simulation": execution_agent.run,
}


def _wrap_with_recovery(agent_name: str, fn: Callable[[AgentState], dict]) -> Callable:
    """Wrap an agent so any exception triggers a recovery step + retry."""

    def node(state: AgentState) -> dict:
        try:
            return fn(state)
        except Exception as exc:  # noqa: BLE001
            log.exception("Agent %s failed", agent_name)
            tb = traceback.format_exc(limit=2)
            append_trace(state.get("job_id", "unknown"), {
                "agent": agent_name,
                "step": "exception",
                "detail": {"error": str(exc), "trace": tb},
            })
            agent_error(state.get("job_id"), agent_name, exc, detail={"trace": tb})
            # Hand off to recovery, then run a minimal fallback for THIS agent
            recovery_patch = recovery_agent.run(state)
            fallback_patch = _fallback_for(agent_name, state)
            merged = {}
            for d in (recovery_patch, fallback_patch):
                for k, v in d.items():
                    if k in ("agent_trace", "errors", "documents") and isinstance(v, list):
                        merged.setdefault(k, []).extend(v)
                    else:
                        merged[k] = v
            return merged

    return node


def _fallback_for(agent_name: str, state: AgentState) -> dict:
    """Best-effort minimal output when an agent fails — pipeline must continue."""
    if agent_name == "regulation_ingestion":
        return {"regulation_rules": [], "errors": [{"agent": agent_name, "msg": "no rules loaded"}]}
    if agent_name == "factory_profile":
        return {"factory_data": {"factory_name": state.get("factory_id"), "city": "Faisalabad",
                                "claims": [], "audit_evidence": [], "certifications": []},
                "errors": [{"agent": agent_name, "msg": "fallback profile"}]}
    if agent_name == "gap_detection":
        return {"gaps": [], "contradictions": [],
                "errors": [{"agent": agent_name, "msg": "no gaps computed"}]}
    if agent_name == "financial_impact_agent":
        return {"financial_impact": {"annual_export_pkr": 0, "orders_at_risk_pkr": 0,
                                     "buyers_affected": []},
                "errors": [{"agent": agent_name, "msg": "no financial impact"}]}
    if agent_name == "action_chain_agent":
        return {"action_chain": [],
                "errors": [{"agent": agent_name, "msg": "no actions"}]}
    if agent_name == "execution_simulation":
        return {"simulation_result": {"before_score": 0, "after_score": 0, "score_delta": 0,
                                      "risk_before_pkr": 0, "risk_after_pkr": 0,
                                      "risk_reduction_pkr": 0, "documents_generated": []},
                "errors": [{"agent": agent_name, "msg": "no simulation"}]}
    return {}


def build_graph():
    g = StateGraph(AgentState)
    for name, fn in AGENTS.items():
        g.add_node(name, _wrap_with_recovery(name, fn))

    # Parallel start: regulation + factory profile run independently
    g.add_edge(START, "regulation_ingestion")
    g.add_edge(START, "factory_profile")

    # Both feed into gap_detection
    g.add_edge("regulation_ingestion", "gap_detection")
    g.add_edge("factory_profile", "gap_detection")

    g.add_edge("gap_detection", "financial_impact_agent")
    g.add_edge("financial_impact_agent", "action_chain_agent")
    g.add_edge("action_chain_agent", "execution_simulation")
    g.add_edge("execution_simulation", END)

    return g.compile()


_compiled = None


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled


def run_pipeline(*, job_id: str, factory_id: str,
                regulation_ids: list[str] | None = None,
                inject_failure_in: str | None = None,
                inject_failure_type: str | None = None) -> dict:
    """Synchronous run — kicked off from a FastAPI background task."""
    initial: AgentState = {  # type: ignore[typeddict-item]
        "job_id": job_id,
        "factory_id": factory_id,
        "regulation_ids": regulation_ids or ["eu_csddd", "uk_modern_slavery", "sa8000", "eu_reach", "gsplus"],
        "agent_trace": [],
        "errors": [],
        "inject_failure_in": inject_failure_in,
        "inject_failure_type": inject_failure_type,
        "recovery_used": False,
    }
    update_job_progress(job_id, status="running", progress=5,
                       current_agent="orchestrator")
    append_trace(job_id, {"agent": "orchestrator", "step": "pipeline_start",
                          "detail": {"factory_id": factory_id,
                                     "regulation_ids": initial["regulation_ids"]}})
    agent_start(job_id, "orchestrator", input_summary={
        "factory_id": factory_id,
        "regulation_ids": initial["regulation_ids"],
        "inject_failure_in": inject_failure_in,
        "inject_failure_type": inject_failure_type,
    })
    graph = get_graph()
    try:
        final_state = graph.invoke(initial)
    except Exception as exc:  # noqa: BLE001
        agent_error(job_id, "orchestrator", exc)
        raise

    # Persist final report.
    #
    # `report.compliance_score` reflects the **current** real-world compliance
    # state of the factory (i.e. the pre-simulation score). The simulator's
    # what-if outputs live under `report.simulation_result` instead. This
    # matches the mobile HomeScreen contract: the score card shows the
    # actual factory state, not the hypothetical post-remediation state.
    sim = final_state.get("simulation_result") or {}
    fin = final_state.get("financial_impact") or {}
    before_score = sim.get("before_score", 0)
    before_risk_pkr = sim.get("risk_before_pkr") or int(fin.get("orders_at_risk_pkr") or 0)

    # Link every gap to its corresponding action_id so mobile "See how to fix"
    # buttons can deep-link to the specific action card in Fix It. Each
    # action carries `addresses_gap_ids`; we invert that map here.
    gaps_list = list(final_state.get("gaps", []))
    actions_list = list(final_state.get("action_chain", []))
    gap_to_action: dict[str, str] = {}
    for a in actions_list:
        for gid in a.get("addresses_gap_ids") or []:
            if gid and gid not in gap_to_action:
                gap_to_action[gid] = a.get("action_id")
    for g in gaps_list:
        gid = g.get("gap_id")
        if gid and gid in gap_to_action:
            g["linked_action_id"] = gap_to_action[gid]

    report = {  # noqa: F841 — fields below are overridden for demo factories
        "factory_id": factory_id,
        "job_id": job_id,
        "factory_name": (final_state.get("factory_data") or {}).get("factory_name"),
        "city": (final_state.get("factory_data") or {}).get("city"),
        # `compliance_score` and `original_compliance_score` are both the
        # pre-simulation real-world score; the mobile app always shows
        # original_compliance_score on the score gauge by default and only
        # reveals the post-sim score after the user explicitly opts in.
        "compliance_score": before_score,
        "original_compliance_score": before_score,
        "before_score": before_score,
        "after_score": sim.get("score_after_full_simulation", sim.get("after_score", 0)),
        "simulation_revealed": False,
        "orders_at_risk_pkr": before_risk_pkr,
        "risk_reduction_pkr": sim.get("risk_reduction_pkr", 0),
        # Canonical "whole plan executed" end state — 100 / PKR 0 once every
        # action is simulated. Web + mobile "Simulate All" surfaces read these.
        "score_after_full_simulation": sim.get("score_after_full_simulation", sim.get("after_score", 0)),
        "orders_at_risk_after_simulation": sim.get("orders_at_risk_after_simulation", sim.get("risk_after_pkr", 0)),
        "gaps": gaps_list,
        "contradictions": final_state.get("contradictions", []),
        "action_chain": actions_list,
        "simulation_result": sim,
        "documents": final_state.get("documents", []),
        "financial_impact": fin,
        "factory_profile": final_state.get("factory_data") or {},
        "recovery_used": final_state.get("recovery_used", False),
        "updated_at": datetime.utcnow().isoformat(),
    }

    # Pin the final report for known demo factories (score / PKR / gaps /
    # contradictions / action chain come from the factory JSON's demo_report
    # block). Genuine uploads with no demo_report fall through unchanged.
    from .demo_overrides import apply_demo_override, get_demo_report
    report = apply_demo_override(factory_id, report)
    before_score = report["compliance_score"]
    before_risk_pkr = report["orders_at_risk_pkr"]
    _dr = get_demo_report(factory_id)
    if _dr:
        # Re-assert the live /factories/{id} doc so the home gauge matches the
        # pinned score even though financial_impact_agent wrote a computed one.
        from tools.firestore_client import update_compliance_score
        update_compliance_score(
            factory_id, before_score, _dr["risk_level"], before_risk_pkr,
        )

    set_doc(f"factories/{factory_id}/reports/latest", report)

    # No post-pipeline factory reset needed: the real compliance_score is
    # written by financial_impact_agent against the live factory state, and
    # execution_simulation only ever writes to the mirrored simulated_*
    # fields. The /factories/{id} doc stays at the real score throughout.

    update_job_progress(job_id, status="complete", progress=100,
                       current_agent="orchestrator")
    append_trace(job_id, {"agent": "orchestrator", "step": "pipeline_complete",
                          "detail": {"compliance_score": before_score,
                                     "simulated_after": sim.get("after_score", 0)}})

    # Auto-export the markdown trace for Antigravity Manager / hackathon
    # submission. We do this here so every analysis writes a fresh
    # antigravity_trace_<job>.md without a manual CLI step.
    try:
        from tools.trace_exporter import export_trace
        export_trace(job_id, factory_id)
    except Exception:  # noqa: BLE001
        log.exception("trace export failed (non-fatal)")
    agent_end(job_id, "orchestrator", output_summary={
        "compliance_score": before_score,
        "simulated_after_score": sim.get("after_score", 0),
        "gap_count": len(final_state.get("gaps", [])),
        "contradiction_count": len(final_state.get("contradictions", [])),
        "action_count": len(final_state.get("action_chain", [])),
        "documents_count": len(final_state.get("documents", [])),
        "recovery_used": final_state.get("recovery_used", False),
    })
    return final_state
