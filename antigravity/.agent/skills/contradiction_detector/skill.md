# Skill: Contradiction Detector

Surfaces cases where the factory **says one thing** but the **evidence
says another**. This is a stronger finding than a plain compliance
gap: a gap is "you don't meet the rule", a contradiction is "you
told us you do, but you don't". Buyers treat contradictions as
fraud signals — they trigger commercial audits, not just remediation
plans.

## When to use
Invoke **from inside** the `gap_detector` skill whenever the factory
profile contains both `claims` and `audit_evidence`. The orchestrator
does not call this directly; gap_detector does.

Also invokable as a standalone tool from the mobile app's
"Re-check evidence integrity" button — same code path, different
caller.

Do **not** invoke when only one side is populated (claims with no
evidence, or evidence with no claims). Without both, there's
nothing to contradict.

## What this skill does

**Pass 1: deterministic rule library** (lives in
`backend/tools/contradiction_detector.py`). These are the
well-known textile-compliance patterns the team has seen in real
audits:

| Claim                                  | Conflicting evidence pattern                | Confidence |
|----------------------------------------|---------------------------------------------|------------|
| `iso_14001_compliant = true`           | `water_effluent_ppm > 8`                    | 0.91       |
| `iso_14001_compliant = true`           | `air_emission_violations.count > 0`         | 0.85       |
| `sa8000_compliant = true`              | `working_hours_weekly_avg > 60`             | 0.93       |
| `sa8000_compliant = true`              | `child_labour_findings.count > 0`           | 0.99       |
| `cbam_declaration_filed = true`        | No CBAM filing record in evidence           | 0.97       |
| `oeko_tex_compliant = true`            | Forbidden-azo dye detected in textile lab   | 0.95       |
| `zdhc_compliant = true`                | MRSL-listed chemical in discharge data      | 0.90       |
| `modern_slavery_statement_2025 = true` | No s.54 statement file in evidence          | 0.99       |
| `digital_working_hours = true`         | Working-hours source filename ends `.pdf`   | 0.80       |

The rule library is intentionally narrow — false positives are worse
than misses for a contradiction finding, because each contradiction
is shown to the user with high prominence.

**Pass 2: LLM pass.** Passes both lists to Gemini 2.5 Pro with the
prompt "Find conflicts between the factory's self-reported claims
and the third-party audit evidence. Cite the source filename for
each side. Confidence 0-1. Be conservative — only flag if you can
quote both sides." Captures subtler conflicts the rule library
misses (e.g. "labour audit narrative says workers reported
verbal warnings for overtime refusal" vs claim of voluntary OT).

**Pass 3: dedupe + merge.** If both passes flag the same
(claim, evidence) pair, keep the higher confidence and union the
rationale.

## Input
- `claims: list[FactoryClaim]` — from factory profile
- `audit_evidence: list[AuditEvidence]` — from factory profile

## Output
```json
{
  "contradictions": [
    {
      "claim": "Factory self-reports ISO 14001 environmental compliance",
      "evidence": "March 2026 CertVerify water audit shows effluent 12 ppm vs EU REACH limit 8 ppm",
      "source_a": "faisal_weave_self_report_q1_2026.csv",
      "source_b": "water_audit_march25.pdf",
      "confidence": 0.91,
      "rule_id_or_llm": "deterministic.iso14001_vs_water_ppm",
      "impact": "ISO 14001 certifying body (CertVerify) would suspend on next surveillance audit; NordStyle Group's environmental scorecard treats ISO 14001 as gateway requirement."
    }
  ]
}
```

## Tools used
- `tools/contradiction_detector.py` — rule library + driver code
- `tools/gemini_client.py` — `call_gemini(expect_json=True)` for
  the LLM pass; stub returns `[]` if no credentials

## Artifact produced
The list of contradictions, rendered as a `Contradictions` card on
the mobile **ComplianceScreen** and surfaced as a separate
artifact in Antigravity Manager view under the calling agent.

## Demo guarantee
The Faisal Weave Industries mock factory is seeded with the ISO 14001 +
water effluent contradiction. The deterministic pass **always**
flags this with confidence ≥ 0.9, even when:

- No Gemini credentials are configured.
- Vertex AI is down (failure-injection demo).
- The factory profile has missing evidence sources.

This is the headline finding in the demo flow at the 1:00 minute
mark. It must never silently disappear.

## Example reasoning trace
```
[01] receive claims (5) + audit_evidence (8)
[02] pass 1 (deterministic):
     - iso_14001 claim + water_effluent_ppm=12 → MATCH rule
       "iso14001_vs_water_ppm" → contradiction, conf=0.91
     - sa8000 claim + working_hours_weekly_avg=64 → MATCH rule
       "sa8000_vs_hours" → contradiction, conf=0.93
     - cbam claim absent → no rule fires
[03] pass 2 (gemini): "Working-hours source is .pdf despite
     factory claiming digital tracking" → contradiction, conf=0.80
[04] dedupe: 3 distinct contradictions
[05] sort by confidence desc; cap at 5 to keep mobile card readable
[06] artifact: faisal_weave_contradictions.json
```

## Failure modes + recovery
- **Gemini fails entirely**: skip pass 2; emit only deterministic
  findings. The Faisal Weave Industries seeded contradictions still
  surface — demo unaffected.
- **Source filename missing on one side**: still emit but mark
  `confidence -= 0.2` and add `evidence_quality: PARTIAL`.
- **Conflicting confidence between passes**: keep the
  deterministic one (rule library is hand-tuned and more
  trustworthy than an LLM guess).
