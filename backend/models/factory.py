"""Factory + compliance report models."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["CRITICAL", "WARNING", "COMPLIANT"]
Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class Certification(BaseModel):
    name: str = Field(..., description="e.g. SA8000, ISO 14001, GOTS, OEKO-TEX")
    status: Literal["VALID", "EXPIRED", "MISSING", "PENDING"]
    expiry_date: str | None = None
    issuer: str | None = None


class FactoryClaim(BaseModel):
    """Things the factory self-reports — may contradict audit evidence."""
    claim: str
    source: str = Field(..., description="Filename or system the claim came from")
    value: str | float | bool | None = None


class AuditEvidence(BaseModel):
    """Hard data from third-party audits / sensor logs / shipment records."""
    metric: str
    value: str | float
    unit: str | None = None
    source: str
    measured_on: str | None = None


class Gap(BaseModel):
    regulation: str = Field(..., description="e.g. 'EU CBAM', 'UK Modern Slavery Act'")
    requirement: str
    status: Literal["MISSING", "NON_CONFORMANT", "EXPIRED", "PARTIAL"]
    severity: Severity
    deadline: str | None = None
    days_remaining: int | None = None
    evidence: list[str] = Field(default_factory=list)


class Contradiction(BaseModel):
    claim: str
    evidence: str
    source_a: str = Field(..., description="The source making the claim")
    source_b: str = Field(..., description="The source providing contradictory evidence")
    confidence: float = Field(..., ge=0.0, le=1.0)
    impact: str | None = None


class Factory(BaseModel):
    factory_id: str
    factory_name: str
    city: Literal["Faisalabad", "Karachi", "Lahore", "Sialkot", "Multan"]
    primary_products: list[str] = Field(default_factory=list)
    annual_export_pkr: int = 0
    primary_buyers: list[str] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    claims: list[FactoryClaim] = Field(default_factory=list)
    audit_evidence: list[AuditEvidence] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FactoryComplianceReport(BaseModel):
    factory_id: str
    factory_name: str
    city: str
    compliance_score: int = Field(..., ge=0, le=100)
    risk_level: RiskLevel
    orders_at_risk_pkr: int
    buyers_affected: list[str] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)
    contradictions: list[Contradiction] = Field(default_factory=list)
    action_chain_ids: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)
