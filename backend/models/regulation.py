"""Regulation rulebook models."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Jurisdiction = Literal["EU", "UK", "USA", "INTERNATIONAL"]


class RegulationRule(BaseModel):
    rule_id: str
    requirement: str = Field(..., description="Plain-English rule statement")
    category: Literal[
        "CARBON",
        "CHEMICAL",
        "LABOUR",
        "AUDIT_CERTIFICATION",
        "SUPPLY_CHAIN",
        "REPORTING",
        "REPORTING_ANNUAL",
    ]
    numerical_limit: float | None = None
    unit: str | None = None
    deadline: str | None = Field(None, description="ISO date; null if continuous")
    grace_period_days: int | None = None
    applies_to_pakistan_exporters: bool = True
    severity_if_missed: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"] = "HIGH"
    source_section: str | None = Field(None, description="e.g. 'Article 35(2)'")


class Regulation(BaseModel):
    regulation_id: str
    name: str = Field(..., description="e.g. 'EU CSDDD', 'UK Modern Slavery Act 2015'")
    jurisdiction: Jurisdiction
    effective_date: str | None = None
    source_url: str | None = None
    rules: list[RegulationRule] = Field(default_factory=list)
    parsed_at: datetime = Field(default_factory=datetime.utcnow)
    source_document: str | None = Field(None, description="Original PDF filename")
