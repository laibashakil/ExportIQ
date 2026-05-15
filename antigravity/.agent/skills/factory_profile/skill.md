# Skill: Factory Profile

Produces the canonical profile of a Pakistani textile factory by fusing
every available data source — audit PDFs, self-report CSVs, sensor logs,
certificate registers, export-volume spreadsheets — into a single
`Factory` object. This is the **left-hand side** of the gap-detection
join. The rulebook from `regulation_parser` is the right-hand side.

The defining property of this skill: **every datum carries its source**.
A claim from the factory's own quarterly report is tagged
`source: faisal_weave_self_report_q1_2026.csv`. A measurement from a
third-party water audit is tagged `source: water_audit_march25.pdf`.
This is what makes the contradiction detector evidentiary instead of
hand-wavy.

## When to use
Invoke at the **start of any factory analysis**, in parallel with
`regulation_parser`. The orchestrator (`agents/orchestrator.py`)
fans these two skills out simultaneously and joins them when both
complete.

Re-invoke when:

- A new audit PDF is uploaded for a known factory.
- A buyer's quarterly export-volume CSV lands.
- The user explicitly clicks "Re-analyse" on the mobile app.

Do **not** invoke just to read existing profile data — that's a
`tools/firestore_client.get_doc("factories/{id}")` call.

## What this skill does
1. Ingests every factory artifact:
   - Audit PDFs (CertVerify / SAI / BSCI / Sedex) via PyMuPDF + Gemini.
   - Self-report CSVs (factory quarterly returns).
   - Sensor exports (chemical discharge, working-hours punch data).
   - Certificate registers (CSV listing SA8000, ISO 14001, Oeko-Tex,
     ZDHC, GOTS status + expiry).
2. Produces a single `Factory` object containing:
   - `certifications: [{name, status, valid_until, source}]`
   - `claims: [{kind, value, source, claim_date}]` — what the factory
     **says** is true
   - `audit_evidence: [{kind, value, unit, source, measured_at}]` —
     what third-party measurements **actually show**
   - `buyers: [{name, hq_country, annual_pkr_value, share_of_export}]`
   - `export_volumes: {total_annual_pkr, by_country, by_buyer}`
   - `working_hours: {logged_weekly_avg, paper_or_digital, source}`
   - `chemical_discharge_readings: [{measurement, ppm, source, date}]`
3. **Preserves the source of every datum** — no field is allowed
   without a `source` attribute. This is enforced by
   `models/factory.py` validators.
4. Resolves buyer aliases (e.g. "Nord Style Grp." → "NordStyle Group",
   "Brit-Mart" → "BritMart Retail") via a curated lookup so the
   financial-impact agent's per-buyer rollup works.

## Input
```json
{
  "factory_id": "fwi_fsd_001",
  "pdf_paths": ["backend/mock_data/factories/fwi_fsd_001.pdf"],
  "csv_paths": ["backend/mock_data/factory_export_data.csv"],
  "force_refresh": false
}
```
Any combination is valid: `factory_id` alone re-reads cached profile,
`pdf_paths` only ingests just PDFs, etc.

## Output
```json
{
  "factory_id": "fwi_fsd_001",
  "name": "Faisal Weave Industries",
  "city": "Faisalabad",
  "certifications": [
    {"name": "SA8000", "status": "EXPIRED", "valid_until": "2026-01-12", "source": "fwi_fsd_001.pdf"},
    {"name": "ISO 14001", "status": "CLAIMED_VALID", "valid_until": null, "source": "faisal_weave_self_report_q1_2026.csv"}
  ],
  "claims": [
    {"kind": "iso_14001_compliant", "value": true, "source": "faisal_weave_self_report_q1_2026.csv", "claim_date": "2026-04-01"}
  ],
  "audit_evidence": [
    {"kind": "water_effluent_ppm", "value": 12.0, "unit": "ppm", "source": "water_audit_march25.pdf", "measured_at": "2026-03-18"}
  ],
  "buyers": [
    {"name": "NordStyle Group", "hq_country": "SE", "annual_pkr_value": 220000000, "share_of_export": 0.65},
    {"name": "BritMart Retail", "hq_country": "IE", "annual_pkr_value": 120000000, "share_of_export": 0.35}
  ],
  "export_volumes": {"total_annual_pkr": 340000000, "by_country": {"EU": 220000000, "UK": 120000000}}
}
```
Matches `backend/models/factory.py:Factory`.

## Tools used
- `tools/pdf_parser.py` — PyMuPDF text + table; Gemini 2.5 Pro for
  semantic extraction from auditor narrative sections.
- `tools/csv_processor.py` — pandas-backed CSV ingestion with column
  normalisation.
- `tools/firestore_client.py` — writes/reads `/factories/{id}`.

## Artifact produced
The `Factory` JSON profile, plus a one-page `{factory_id}_profile.md`
human-readable summary — both surfaced in Antigravity Manager view.

## Example reasoning trace (Faisal Weave Industries)
```
[01] resolve factory_id=fwi_fsd_001 → no cached profile
[02] open fwi_fsd_001.pdf — 8 pages, audit report Mar 2026
[03] extract certificate table page 2: SA8000 expired 2026-01-12,
     ISO 14001 "compliant (per self-declaration)"
[04] extract chemical-discharge log page 4: water effluent 12 ppm,
     measured 2026-03-18 by CertVerify Faisalabad
[05] extract working-hours log page 5: 64 hrs/week avg, paper logs
[06] ingest factory_export_data.csv → 12 rows for this factory
[07] aggregate exports: 340M PKR/yr, 65% NordStyle Group, 35% BritMart Retail
[08] alias resolution: "Nord Style Grp." → "NordStyle Group"; "Brit-Mart" → "BritMart Retail"
[09] cross-check: certificate register says ISO 14001 valid; audit
     measurement says water above EU REACH limit → tag both as
     separate-source claims (do NOT resolve here; that is the
     contradiction_detector's job)
[10] write /factories/fwi_fsd_001 (18 fields, 9 sources)
[11] artifact: fwi_fsd_001_profile.md
```

## Failure modes + recovery
- **One audit PDF unparseable**: emit profile from remaining sources
  and add `skipped_sources: [filename]` to the output. The pipeline
  continues with reduced coverage.
- **CSV column names unfamiliar**: run a Gemini-assisted column
  mapper once, cache the mapping at `/system/csv_schemas`.
- **Missing buyer alias**: emit a `UNKNOWN_BUYER` warning and use
  the raw string; the financial-impact agent will treat it as a
  ROW (rest-of-world) buyer with no regulatory exposure.
