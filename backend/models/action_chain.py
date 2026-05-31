"""Action chain + simulation result models."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ActionStatus = Literal["PENDING", "SIMULATED", "EXECUTED", "FAILED"]
Effort = Literal["LOW", "MEDIUM", "HIGH"]


class GeneratedDocument(BaseModel):
    document_id: str
    title: str
    kind: Literal["CSDDD_DUE_DILIGENCE_REPORT", "CBAM_FORM", "BUYER_EMAIL", "AUDIT_CHECKLIST", "REMEDIATION_PLAN", "CERTIFICATION_APP"]
    body: str = Field(..., description="Markdown / HTML body, ready to render or email")
    relates_to_action: str | None = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ActionItem(BaseModel):
    action_id: str
    priority: int = Field(..., ge=1, le=10)
    title: str
    description: str
    addresses_gap_ids: list[str] = Field(default_factory=list)
    effort: Effort
    deadline: str | None = None
    impact_pkr: int = Field(..., description="Risk mitigated in PKR if action is executed")
    status: ActionStatus = "PENDING"
    estimated_score_delta: int = 0
    simulation_output: "SimulationResult | None" = None


class SimulationResult(BaseModel):
    before_score: int
    after_score: int
    score_delta: int
    risk_before_pkr: int
    risk_after_pkr: int
    risk_reduction_pkr: int
    documents_generated: list[GeneratedDocument] = Field(default_factory=list)
    rationale: str = ""


class ActionChain(BaseModel):
    factory_id: str
    job_id: str
    actions: list[ActionItem] = Field(default_factory=list)
    overall_rationale: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)


ActionItem.model_rebuild()
