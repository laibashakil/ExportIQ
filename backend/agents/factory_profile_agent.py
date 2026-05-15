"""Agent 2: Factory Profile.

Parses factory audit packets (PDFs + CSVs + self-reported JSON) into a
structured profile of certifications, claims, audit evidence, and export
volumes. This is the input the Gap Detection agent compares against the
regulation rulebook.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from tools.gemini_client import call_gemini
from tools.pdf_parser import extract_text, extract_factory_structure
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.factory")

AGENT_NAME = "factory_profile"

SYSTEM_PROMPT = """You are the Factory Profile Agent for ExportIQ.

Your job: read every factory artifact (audit PDF, self-report CSV, sensor
export) and produce a single canonical factory profile JSON. Preserve the
ORIGINAL SOURCE of each datum so the Gap Detection agent can cite who said
what when contradictions appear. Output strict JSON only."""

MOCK_FACTORY_DIR = Path(__file__).resolve().parents[1] / "mock_data" / "factories"


def run(state: AgentState) -> dict:
    patches: dict = {}
    factory_id = state["factory_id"]
    patches.update(log_step(state, AGENT_NAME, "started",
                            {"factory_id": factory_id}, progress=15))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    factory = _load_or_parse(factory_id, state)
    patches.update(log_step(
        state, AGENT_NAME, "loaded_profile",
        {
            "factory_name": factory.get("factory_name"),
            "certifications": len(factory.get("certifications", [])),
            "claims": len(factory.get("claims", [])),
            "evidence_items": len(factory.get("audit_evidence", [])),
        },
        progress=30,
    ))

    patches["factory_data"] = factory
    patches.update(log_step(state, AGENT_NAME, "complete", None, progress=35))
    return patches


def _load_or_parse(factory_id: str, state: dict) -> dict:
    json_path = MOCK_FACTORY_DIR / f"{factory_id}.json"
    if json_path.exists():
        with json_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    pdf_path = MOCK_FACTORY_DIR / f"{factory_id}.pdf"
    if pdf_path.exists():
        text = extract_text(pdf_path)
        log_step(state, AGENT_NAME, "extracting_pdf_with_gemini",
                 {"chars": len(text)})
        return extract_factory_structure(text, fallback={
            "factory_id": factory_id,
            "factory_name": factory_id,
            "city": "Faisalabad",
            "claims": [],
            "audit_evidence": [],
            "certifications": [],
        })
    log.warning("No factory data for %s — returning empty profile", factory_id)
    return {
        "factory_id": factory_id,
        "factory_name": factory_id,
        "city": "Faisalabad",
        "claims": [],
        "audit_evidence": [],
        "certifications": [],
    }
