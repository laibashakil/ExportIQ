# Skill: Regulation Parser

Parses EU and UK regulatory PDFs into a structured rulebook the rest of the
ExportIQ pipeline can reason over. Today it covers the three regulations
that dominate the Pakistan → EU/UK textile corridor: **EU CBAM**, **EU
Corporate Sustainability Due Diligence Directive (CSDDD)**, and the **UK
Modern Slavery Act 2015**. New regulations are added by dropping their PDF
into `backend/mock_data/regulations/` and the same skill ingests them with
no code changes.

## When to use
Invoke this skill when **any** of the following is true:

- A new regulatory PDF is uploaded via `POST /upload?type=regulation`.
- The orchestrator starts a full compliance analysis and the factory's
  target markets include the EU or UK.
- The `daily_regulatory_scan` workflow finds a diff between today's
  published version and the cached rulebook in Firestore.

Do **not** invoke this skill on factory audit reports, export
declarations, buyer purchase orders, or chemical-test lab results —
those belong to `factory_profile`. Mixing them corrupts the rulebook
with factory-specific noise and breaks the gap-matching join.

## What this skill does
1. Streams the PDF through `pdf_parser` (PyMuPDF + Gemini 2.5 Pro
   vision) to recover text, tables, and the article-number outline.
2. Extracts every **compliance rule** as a JSON object with:
   - `rule_id` — stable identifier, e.g. `cbam.art10.declaration`
   - `article` — article + paragraph citation
   - `requirement` — what the exporter must do (verbatim, trimmed)
   - `category` — one of `CARBON`, `CHEMICAL`, `LABOUR`,
     `AUDIT_CERTIFICATION`, `SUPPLY_CHAIN`, `REPORTING`
   - `numerical_limit` — value + unit if any (e.g. `8 ppm`,
     `48 hours/week`, `2.1 tCO2e/t fabric`)
   - `deadline` — ISO date or recurring schedule
   - `grace_period_days` — days before enforcement starts
   - `applies_to_pakistan` — boolean with a one-sentence rationale
   - `evidence_required` — list of certificates / declarations /
     audit trails the rule demands as proof
   - `penalty_pkr_per_violation` — converted at the spot rate cached
     in Firestore `/system/fx_rates`
3. Builds a **deadline-sorted urgency queue** so downstream agents can
   prioritise without re-reading the rulebook.
4. Flags **ambiguous clauses** (e.g. "reliable monitoring data" without
   a definition) with an `ambiguity_score` so the gap detector and
   contradiction detector treat them with lower confidence.
5. Writes the rulebook to Firestore `/regulations/{regulation_id}` and
   returns a summary artifact for the Antigravity Manager view.

## Input
```json
{
  "regulation_id": "eu_cbam",
  "pdf_path": "backend/mock_data/regulations/eu_cbam.pdf",
  "jurisdiction": "EU",
  "effective_date_override": null
}
```
Alternative inputs: `regulation_id` alone (use cached rulebook),
`raw_text` (skip PDF parse and extract from string).

## Output
```json
{
  "regulation_id": "eu_cbam",
  "name": "EU Carbon Border Adjustment Mechanism",
  "jurisdiction": "EU",
  "effective_date": "2026-01-01",
  "rules": [
    {
      "rule_id": "cbam.art10.declaration",
      "article": "Article 10 §1",
      "requirement": "Authorised CBAM declarant shall submit a CBAM declaration for the preceding calendar year by 31 May.",
      "category": "CARBON",
      "numerical_limit": null,
      "deadline": "2027-05-31",
      "grace_period_days": 0,
      "applies_to_pakistan": true,
      "applies_rationale": "Pakistan is a non-EU origin country for textile exports subject to CBAM scope.",
      "evidence_required": ["embedded_emissions_report", "third_party_verification"],
      "penalty_pkr_per_violation": 28000000,
      "ambiguity_score": 0.05
    }
  ],
  "urgency_queue": ["cbam.art10.declaration", "cbam.art4.registration", "..."],
  "ambiguous_clause_count": 3,
  "coverage_pct": 100.0
}
```
Matches `backend/models/regulation.py:Regulation`.

## Tools used
- `tools/pdf_parser.py` — text + table extraction with PyMuPDF;
  image-only pages routed through Gemini 2.5 Pro vision for OCR.
- `tools/gemini_client.py` — `call_gemini(expect_json=True)` for rule
  extraction prompts (Vertex AI primary, AI Studio fallback).
- `tools/firestore_client.py` — caches parsed rulebook at
  `/regulations/{regulation_id}` so the second factory in the same
  demo reuses the cache (<1 s) instead of re-parsing the PDF.

## Artifact produced
A structured `Regulation` JSON document, plus a human-readable
`{regulation_id}_rulebook.md` summary — both surfaced under this
agent in Antigravity Manager view.

## Example reasoning trace (Faisal Weave Industries + EU CBAM)
```
[01] open eu_cbam.pdf — 47 pages, 184 KB
[02] table-of-contents detected on page 2; 23 articles enumerated
[03] page 14: "ppm" reference detected → flag for numerical_limit
[04] gemini chunk 1/4 (articles 1-8) → extracted 12 rules
[05] gemini chunk 2/4 (articles 9-15) → extracted 9 rules, 1 ambiguous
     ("reliable monitoring data")
[06] gemini chunk 3/4 (articles 16-20) → extracted 5 rules
[07] gemini chunk 4/4 (articles 21-23) → extracted 4 rules
[08] consolidation: 30 rules total; 27 apply to Pakistan textile
     exporters (the 3 excluded cover EU-internal producers)
[09] urgency queue built: nearest deadline 2026-12-31 (registration),
     furthest 2030-01-01 (full free-allowance phase-out)
[10] write /regulations/eu_cbam → 30 rules cached, 12 ms
[11] artifact: cbam_rulebook_v2026-05-15.json + cbam_rulebook.md
```

## Failure modes + recovery
- **PDF is image-only / scanned**: route every page through Gemini
  vision; expect 5× longer parse time, log a `vision_fallback`
  warning in the trace.
- **Gemini returns unparseable JSON**: retry once with a stricter
  system prompt; on second failure, fall back to the cached
  rulebook in Firestore and surface a `STALE_RULEBOOK` warning.
- **Regex deterministic fallback**: if Gemini is unavailable
  entirely, scan section headings (`^Article \d+`, `^Section \d+`)
  and emit a partial rulebook with `coverage_pct < 100` so
  downstream agents know to treat it as best-effort.
- **PDF > 20 MB**: reject up front and ask the orchestrator to split
  the document into article-sized chunks.
