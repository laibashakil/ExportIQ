"""Shared LangGraph state passed between all 6 agents."""
from __future__ import annotations

from typing import Annotated, Any, TypedDict
from operator import add


class AgentState(TypedDict, total=False):
    job_id: str
    factory_id: str
    regulation_ids: list[str]

    # Outputs from each agent, accumulated as the graph runs
    factory_data: dict[str, Any]
    regulation_rules: list[dict[str, Any]]
    gaps: list[dict[str, Any]]
    contradictions: list[dict[str, Any]]
    financial_impact: dict[str, Any]
    action_chain: list[dict[str, Any]]
    simulation_result: dict[str, Any]
    documents: list[dict[str, Any]]

    # Real-time live trace — append-only via LangGraph reducer
    agent_trace: Annotated[list[dict[str, Any]], add]
    errors: Annotated[list[dict[str, Any]], add]

    # Demo failure injection — set by POST /failure-test
    inject_failure_in: str | None
    inject_failure_type: str | None
    recovery_used: bool
