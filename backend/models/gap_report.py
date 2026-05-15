"""Output of the Gap Detection agent."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .factory import Contradiction, Gap


class GapReport(BaseModel):
    factory_id: str
    job_id: str
    gaps: list[Gap] = Field(default_factory=list)
    contradictions: list[Contradiction] = Field(default_factory=list)
    coverage_pct: float = Field(
        100.0,
        description="Percent of regulation rules that had factory evidence available",
    )
    summary: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)
