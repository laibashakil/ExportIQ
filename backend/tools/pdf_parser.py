"""PDF parser — PyMuPDF for raw text + Gemini for structured extraction."""
from __future__ import annotations

import logging
from pathlib import Path

import fitz  # PyMuPDF

from .gemini_client import call_gemini

log = logging.getLogger("exportiq.pdf")


def extract_text(pdf_path: str | Path, max_pages: int = 50) -> str:
    """Pull raw text from a PDF. Used as Gemini context for downstream extraction."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    doc = fitz.open(path)
    out: list[str] = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        out.append(page.get_text("text"))
    return "\n\n".join(out).strip()


REGULATION_EXTRACTION_PROMPT = """You are a compliance analyst specialising in EU + UK trade rules.

Given the raw text of a regulation PDF, extract a structured rulebook for
Pakistani textile exporters. For EACH rule produce:

  rule_id          short stable id, e.g. "cbam_carbon_declare"
  requirement      one-sentence plain-English statement
  category         CARBON | CHEMICAL | LABOUR | AUDIT_CERTIFICATION | SUPPLY_CHAIN | REPORTING
  numerical_limit  number or null (e.g. ppm, tCO2)
  unit             string or null
  deadline         ISO date or null
  grace_period_days int or null
  applies_to_pakistan_exporters  bool
  severity_if_missed CRITICAL | HIGH | MEDIUM | LOW
  source_section   e.g. "Article 35(2)"

Return ONLY valid JSON of the shape:
  {"regulation_name": str, "jurisdiction": "EU"|"UK", "effective_date": str|null,
   "rules": [ {...}, ... ] }
"""


def extract_regulation_structure(text: str, *, fallback: dict) -> dict:
    """Ask Gemini to turn raw regulation text into a structured rulebook."""
    return call_gemini(  # type: ignore[return-value]
        system_prompt=REGULATION_EXTRACTION_PROMPT,
        user_prompt=text[:30000],
        expect_json=True,
        stub_response=fallback,
    )


FACTORY_EXTRACTION_PROMPT = """You are an auditor reviewing a textile factory's audit packet.

Extract every concrete piece of evidence you can find: certifications and
their status, measured discharge / emissions values, working-hour records,
buyer names, export volumes, and any self-reported claims.

Return ONLY valid JSON of the shape:
  {"factory_name": str, "city": str, "annual_export_pkr": int,
   "primary_buyers": [str], "primary_products": [str],
   "certifications": [{"name": str, "status": "VALID"|"EXPIRED"|"MISSING"|"PENDING",
                       "expiry_date": str|null, "issuer": str|null}],
   "claims":  [{"claim": str, "source": str, "value": str|number|bool|null}],
   "audit_evidence": [{"metric": str, "value": str|number, "unit": str|null,
                       "source": str, "measured_on": str|null}]}

If the document contradicts itself, list BOTH the claim and the evidence.
"""


def extract_factory_structure(text: str, *, fallback: dict) -> dict:
    return call_gemini(  # type: ignore[return-value]
        system_prompt=FACTORY_EXTRACTION_PROMPT,
        user_prompt=text[:30000],
        expect_json=True,
        stub_response=fallback,
    )
