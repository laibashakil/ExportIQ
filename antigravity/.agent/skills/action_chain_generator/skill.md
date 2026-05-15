# Skill: Action Chain Generator

The "content-to-action" step of ExportIQ — the moment the system stops
describing problems and starts proposing concrete moves. This skill
takes the gap + financial-impact graph and emits a **short, prioritised
list (3-5 items)** of things the factory must do, each tied to a
specific gap, deadline, PKR impact, and effort estimate.

Five actions, not fifty. Long action lists are how compliance work
becomes a binder that nobody reads.

## When to use
Invoke after `financial_impact` completes. Inputs are stable by then —
gaps are scored, exposure is quantified, buyers are tagged.

Also re-invoke when:

- The user marks an action as `EXECUTED` and wants the next
  recommendation (action chains are regenerated, not appended).
- A new high-severity gap appears mid-quarter (re-prioritise).

Do **not** invoke before `financial_impact` — without PKR exposure
per gap, prioritisation has no anchor and you'll surface advisory
items above business-critical ones.

## What this skill does
1. **Rank gaps** by `severity_penalty × urgency` where:
   - `severity_penalty` ∈ `{CRITICAL: 40, HIGH: 20, MEDIUM: 8, LOW: 2}`
   - `urgency = clamp(1 + 180/days_remaining, 1, 5)`
2. **Pick the top 3-5 gaps**. If two gaps share a single
   underlying remediation (e.g. CBAM Art 4 + Art 10 both need
   registration), merge them under one action with both
   `addresses_gap_ids`.
3. For each, generate one `ActionItem` with:
   - `title` — specific verb-noun ("Renew SA8000 certification",
     **not** "Improve compliance")
   - `description` — cites the gap text + the evidence source
   - `addresses_gap_ids` — links back to the `gap_id`s
   - `effort` — `LOW` (< 1 week), `MEDIUM` (1-4 weeks), `HIGH`
     (> 4 weeks); calibrated against an internal effort lookup
     keyed by remediation type
   - `deadline` — copied from the most-urgent gap it closes, or
     today + 60 days if rolling
   - `impact_pkr` — proportional share of `orders_at_risk_pkr`
     attributable to the closed gaps
   - `estimated_score_delta` — points this action would recover,
     from `compliance_scorer.simulate_close(gap_ids)`
   - `external_dependencies` — e.g. CertVerify booking, SAI re-audit,
     Vertex AI carbon-calculator API
4. **Ask Gemini 2.5 Pro** for an overall rationale ("why these
   actions in this order"), explicitly referencing the buyer
   concentration risk if present.
5. Validate: action chain length ∈ [3, 5]; sum of
   `estimated_score_delta` must move the score across at least
   one risk-band threshold (CRITICAL < 60, WARNING < 80,
   COMPLIANT ≥ 80) — otherwise re-prompt with the constraint that
   simulated actions must move the score band.

## Input
- LangGraph state with `gaps`, `financial_impact`, and
  `factory_data` populated.

## Output
```json
{
  "action_chain": [
    {
      "action_id": "act_001",
      "priority": 1,
      "title": "Register as Authorised CBAM Declarant + file 2026 declaration",
      "description": "Address gap cbam.art4.registration + cbam.art10.declaration. Faisal Weave Industries currently has no CBAM declarant registration despite 65% of exports going to EU under NordStyle Group.",
      "addresses_gap_ids": ["gap_001", "gap_002"],
      "effort": "HIGH",
      "deadline": "2026-12-31",
      "impact_pkr": 176000000,
      "estimated_score_delta": 18,
      "external_dependencies": ["EU CBAM portal access", "embedded-emissions audit"]
    }
  ],
  "rationale": "NordStyle Group concentration (65%) makes CBAM the only single-action item that crosses the CRITICAL→WARNING threshold. SA8000 renewal is second because NordStyle Group's commercial team requires valid SA8000 for the 2027 PO cycle. UK MSA statement is third — BritMart Retail's deadline is sooner but exposure is smaller.",
  "score_after_full_simulation": 71
}
```
Matches `backend/models/action_chain.py:ActionChain`.

## Tools used
- `tools/compliance_scorer.py` — `simulate_close(gap_ids) → delta`
- `tools/gemini_client.py` — rationale prompt + per-action title
  refinement
- `tools/firestore_client.py` — persists chain at
  `/factories/{id}/actions/{action_id}`

## Artifact produced
The `ActionChain` JSON. Visible in Antigravity Manager view AND
displayed on the mobile **Action Center** screen — judges should
see both views during the demo.

## Example reasoning trace (Faisal Weave Industries)
```
[01] load 4 gaps + financial_impact
[02] rank: gap_001 cbam.art10 score 200, gap_002 cbam.art4 score 200,
     gap_004 reach.svhc score 200, gap_003 uk_msa score 100, gap_005
     sa8000 score 100
[03] merge cbam.art4 + cbam.art10 → single action (same remediation)
[04] top-4 actions selected (under cap of 5)
[05] action_1: CBAM register+file, HIGH effort, delta +18, impact 176M
[06] action_2: SVHC effluent treatment upgrade, HIGH effort, delta +12,
     impact 80M
[07] action_3: SA8000 renewal audit, MEDIUM effort, delta +6, impact 60M
[08] action_4: UK MSA s.54 statement, LOW effort, delta +4, impact 60M
[09] score delta sum: 18+12+6+4 = 40 → 43→83 (crosses two thresholds
     CRITICAL→COMPLIANT) ✓ band-move constraint satisfied
[10] gemini rationale → references NordStyle Group concentration + BritMart Retail deadline
[11] write /factories/fwi_fsd_001/actions/act_001..004
[12] artifact: faisal_weave_action_chain.json
```

## Failure modes + recovery
- **All gaps below threshold**: emit a single "Maintain compliance
  posture" advisory action with `effort: LOW`; do not pad with
  hallucinated work.
- **Gemini rationale call fails**: deterministic template
  ("Actions ordered by PKR impact, then by deadline.") replaces
  the narrative.
- **Score band cannot be crossed even with all 5 actions**:
  surface a `STRUCTURAL_RISK` flag — the factory cannot become
  compliant within the current planning horizon and needs a
  buyer-renegotiation conversation, not more actions.
