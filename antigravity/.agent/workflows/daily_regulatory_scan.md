# Workflow: Daily Regulatory Scan

A scheduled workflow that polls EU + UK regulator publications for new or
amended rules and triggers re-analysis of factories whose compliance might
be affected.

## Trigger
- Cron: 06:00 UTC daily.
- Manual: `POST /analyze` with `regulation_ids` set to today's new rules.

## Steps

1. **Fetch new publications**
   - Pull RSS / publication feeds from:
     - taxation.ec.europa.eu (CBAM updates)
     - legislation.gov.uk (Modern Slavery Act amendments)
     - eur-lex.europa.eu (Supply Chain Due Diligence Directive amendments)
   - Compare against `/regulations/{regulation_id}.last_updated`.

2. **Parse new regulations**
   - Skill `regulation_parser` runs on each new PDF.
   - Diff old vs new rules; flag rules whose `numerical_limit`,
     `deadline`, or `severity_if_missed` changed.

3. **Identify impacted factories**
   - For each changed rule, list factories in Firestore that have current
     gaps or contradictions referencing that rule.

4. **Re-trigger analysis**
   - For each impacted factory, call the `full_compliance_analysis`
     workflow.
   - Push an Expo notification to the factory owner with: "EU CBAM rule
     change — your risk profile has been recomputed".

## Outputs
- Updated `/regulations/{regulation_id}` documents.
- New `/jobs/{job_id}` per impacted factory.
- Push notification per impacted factory.

## Why this matters
A factory might be fully compliant today and CRITICAL tomorrow if the EU
tightens a numerical limit. This workflow catches that within 24 hours —
before the next shipment goes out.
