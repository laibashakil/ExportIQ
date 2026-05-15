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
from typing import Callable

from langgraph.graph import StateGraph, END, START

from tools.firestore_client import update_job_progress, append_trace, set_doc
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
        "regulation_ids": regulation_ids or ["eu_cbam"],
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
    graph = get_graph()
    final_state = graph.invoke(initial)

    # Persist final report
    report = {
        "factory_id": factory_id,
        "job_id": job_id,
        "factory_name": (final_state.get("factory_data") or {}).get("factory_name"),
        "city": (final_state.get("factory_data") or {}).get("city"),
        "compliance_score": (final_state.get("simulation_result") or {}).get("after_score", 0),
        "before_score": (final_state.get("simulation_result") or {}).get("before_score", 0),
        "orders_at_risk_pkr": (final_state.get("simulation_result") or {}).get("risk_after_pkr", 0),
        "risk_reduction_pkr": (final_state.get("simulation_result") or {}).get("risk_reduction_pkr", 0),
        "gaps": final_state.get("gaps", []),
        "contradictions": final_state.get("contradictions", []),
        "action_chain": final_state.get("action_chain", []),
        "simulation_result": final_state.get("simulation_result", {}),
        "documents": final_state.get("documents", []),
        "financial_impact": final_state.get("financial_impact", {}),
        "recovery_used": final_state.get("recovery_used", False),
    }
    set_doc(f"factories/{factory_id}/reports/latest", report)
    update_job_progress(job_id, status="complete", progress=100,
                       current_agent="orchestrator")
    append_trace(job_id, {"agent": "orchestrator", "step": "pipeline_complete",
                          "detail": {"compliance_score": report["compliance_score"]}})
    return final_state
