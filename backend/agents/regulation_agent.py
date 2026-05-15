"""Agent 1: Regulation Ingestion.

Reads EU/UK regulation PDFs (or pre-parsed JSON in mock mode), extracts a
structured rulebook with deadlines, numerical limits, and Pakistan-applicability
flags.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from tools.gemini_client import call_gemini
from tools.pdf_parser import extract_text, extract_regulation_structure
from .base import log_step, maybe_inject_failure
from .state import AgentState

log = logging.getLogger("exportiq.agents.regulation")

AGENT_NAME = "regulation_ingestion"

SYSTEM_PROMPT = """You are the Regulation Ingestion Agent for ExportIQ — a
compliance system for Pakistani textile exporters shipping to EU/UK markets.

Your job: turn raw regulation text into a structured machine-readable rulebook.
Be precise about deadlines, numerical thresholds, and which rules apply to
Pakistan-based exporters specifically. Output strict JSON only."""

MOCK_DATA_DIR = Path(__file__).resolve().parents[1] / "mock_data" / "regulations"


def run(state: AgentState) -> dict:
    patches: dict = {}
    patches.update(log_step(state, AGENT_NAME, "started",
                            {"regulation_ids": state.get("regulation_ids", [])},
                            progress=10))

    should_fail, kind = maybe_inject_failure(state, AGENT_NAME)
    if should_fail:
        patches.update(log_step(state, AGENT_NAME, "injected_failure", {"kind": kind}))
        raise RuntimeError(f"injected failure ({kind}) in {AGENT_NAME}")

    regulation_ids = state.get("regulation_ids") or ["eu_cbam"]
    rules: list[dict] = []
    for reg_id in regulation_ids:
        parsed = _load_or_parse(reg_id, state)
        patches.update(log_step(
            state, AGENT_NAME, "parsed_regulation",
            {"regulation_id": reg_id, "rule_count": len(parsed.get("rules", []))},
        ))
        for r in parsed.get("rules", []):
            r.setdefault("regulation_id", reg_id)
            r.setdefault("regulation_name", parsed.get("name") or reg_id)
            rules.append(r)

    patches.update(log_step(state, AGENT_NAME, "complete",
                            {"total_rules": len(rules)}, progress=25))
    patches["regulation_rules"] = rules
    return patches


def _load_or_parse(regulation_id: str, state: dict) -> dict:
    """Prefer pre-parsed JSON; fall back to PDF + Gemini extraction."""
    json_path = MOCK_DATA_DIR / f"{regulation_id}.json"
    if json_path.exists():
        with json_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    pdf_path = MOCK_DATA_DIR / f"{regulation_id}.pdf"
    if pdf_path.exists():
        text = extract_text(pdf_path)
        log_step(state, AGENT_NAME, "extracting_with_gemini",
                 {"regulation_id": regulation_id, "chars": len(text)})
        return extract_regulation_structure(text, fallback={
            "name": regulation_id,
            "jurisdiction": "EU",
            "rules": [],
        })
    log.warning("No regulation source found for %s", regulation_id)
    return {"name": regulation_id, "jurisdiction": "EU", "rules": []}
