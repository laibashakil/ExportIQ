# Skill: Gap Detector

The reasoning core of ExportIQ. Joins the regulation rulebook from
`regulation_parser` against the factory profile from `factory_profile`
and decides, rule-by-rule, where the factory falls short. Every gap it
emits cites the exact regulation article on one side and the exact
factory data source on the other — no vague "non-compliant" outputs.

## When to use
Invoke **after** both `regulation_parser` and `factory_profile` have
completed for the same `job_id`. The orchestrator joins the LangGraph
state and routes here.

Re-invoke when:

- A factory uploads new evidence that might close an open gap.
- A new regulation rulebook is published (re-scan all factories).
- The user manually clicks "Re-check compliance" on the mobile app.

Do **not** invoke for cross-factory analysis or industry benchmarking —
that is out of scope for ExportIQ's MVP.

## What this skill does
1. Walks the rulebook rule-by-rule. For each `RegulationRule`:
   a. Find matching evidence in the factory profile (cert exists +
      valid; measured value vs `numerical_limit`; claim made +
      `evidence_required` satisfied; deadline still in future).
   b. If satisfied → no gap; record `compliance_hit`.
   c. If not satisfied → emit a `Gap` citing:
      - `rule_id`, `article`, `requirement` (from rulebook)
      - `factory_status` ("MISSING", "EXPIRED", "EXCEEDS_LIMIT",
        "UNVERIFIED", "PAPER_ONLY")
      - `evidence_source` (factory profile filename)
      - `severity` — derived from `compliance_scorer`:
        `CRITICAL` if penalty > PKR 100M OR deadline < 60 days
        `HIGH` if penalty > PKR 25M OR deadline < 180 days
        `MEDIUM` otherwise; `LOW` for advisory rules
      - `deadline`, `days_remaining`
      - `recommendation` (one sentence)
2. Runs the `contradiction_detector` skill over the factory's
   `claims` vs `audit_evidence`. Every contradiction cites two
   filenames by name. Contradictions are emitted **in addition to**
   gaps, not in place of them — a factory can both fail a rule and
   misrepresent its status.
3. Computes `coverage_pct` — share of rules that had enough data
   to make a determination. Below 80% triggers a `LOW_COVERAGE`
   warning in the agent trace.
4. Writes the gap report to Firestore `/factories/{id}/reports/latest`.

## Input
- Full LangGraph state with `regulation_rules` and `factory_data`
  populated by the two upstream skills.

## Output
```json
{
  "gaps": [
    {
      "gap_id": "gap_001",
      "rule_id": "cbam.art10.declaration",
      "regulation": "EU CBAM",
      "article": "Article 10 §1",
      "requirement": "Submit CBAM declaration for preceding calendar year by 31 May.",
      "factory_status": "MISSING",
      "evidence_source": "fwi_fsd_001.pdf",
      "severity": "CRITICAL",
      "deadline": "2027-05-31",
      "days_remaining": 381,
      "recommendation": "Register as authorised CBAM declarant and file 2026 declaration."
    }
  ],
  "contradictions": [
    {
      "claim": "Factory self-reports ISO 14001 compliance",
      "evidence": "Water audit March 2026 shows effluent 12 ppm (limit 8 ppm)",
      "source_a": "faisal_weave_self_report_q1_2026.csv",
      "source_b": "water_audit_march25.pdf",
      "confidence": 0.91,
      "impact": "ISO 14001 audit would fail; certification at risk of suspension."
    }
  ],
  "coverage_pct": 96.7,
  "compliance_score": 43
}
```
Matches `backend/models/gap_report.py:GapReport`.

## Tools used
- `tools/contradiction_detector.py` — deterministic rule pass
  (chemical limits, working hours, certification claims) + LLM
  pass using Gemini 2.5 Pro for subtler conflicts.
- `tools/compliance_scorer.py` — converts gaps to a 0-100 score.
- `tools/firestore_client.py` — persists the report and updates
  `/factories/{id}.compliance_score` live for the mobile app.

## Artifact produced
The `GapReport` JSON — surfaced in Antigravity Manager view as
this agent's primary deliverable.

## Demo guarantee
The Faisal Weave Industries mock factory contains a deliberately seeded
contradiction: "Factory claims ISO 14001 compliance" (source:
self-report CSV) vs "water_effluent_discharge = 12 ppm > 8 ppm
limit" (source: water audit PDF). The deterministic rule-based
pass in `contradiction_detector.py` guarantees this finding always
surfaces with confidence ≥ 0.9 — even with zero LLM credentials,
so the judges always see at least one contradiction.

## Example reasoning trace (Faisal Weave Industries)
```
[01] load /regulations/eu_cbam (30 rules) + /regulations/uk_msa (14
     rules) + /regulations/eu_csddd (22 rules) = 66 rules
[02] load /factories/fwi_fsd_001
[03] eu_cbam.art4.registration: factory.cbam_declarant=null → GAP
     (CRITICAL, deadline 2026-12-31, 230 days remaining)
[04] eu_cbam.art10.declaration: factory.cbam_2025_filing=null → GAP
     (CRITICAL, deadline 2027-05-31, but blocker for art4)
[05] uk_msa.s54.statement: factory.modern_slavery_statement_2025=null
     → GAP (HIGH, primark buyer requires this)
[06] eu_reach.svhc.azo: factory.water_effluent_ppm=12 > limit 8
     → GAP (CRITICAL, immediate enforcement)
[07] sa8000: factory.sa8000.status=EXPIRED 2026-01-12
     → GAP (HIGH, h&m requires SA8000)
[08] iso_14001: factory.iso_14001.status=CLAIMED_VALID (no audit
     evidence) → flag for contradiction_detector
[09] contradiction_detector: ISO 14001 claim + 12 ppm evidence
     → CONTRADICTION confidence=0.91
[10] coverage: 64/66 rules had data → 97% coverage
[11] compliance_scorer: penalty-weighted score = 43/100
[12] write /factories/fwi_fsd_001/reports/latest
[13] artifact: faisal_weave_gap_report.json (4 gaps, 1 contradiction)
```

## Failure modes + recovery
- **Rule has no matching factory field**: skip and decrement
  `coverage_pct`; do not emit a false gap.
- **`contradiction_detector` LLM call fails**: deterministic
  rule pass still runs and emits the seeded contradiction.
- **Coverage < 50%**: emit a `LOW_COVERAGE` recovery action
  asking the user to upload additional audit evidence rather
  than producing a misleading report.
