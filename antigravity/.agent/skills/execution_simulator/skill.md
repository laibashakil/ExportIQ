# Skill: Execution Simulator

The final skill in the ExportIQ pipeline and the one judges spend
the most time looking at. Walks the action chain, simulates each
remediation, recomputes the compliance score, recalculates PKR
risk, and streams every update to Firestore so the mobile
HomeScreen score animates as actions tick through. This is the
"action simulation & outcome" axis (15% of the hackathon score).

## When to use
Invoke after `action_chain_generator` completes. The orchestrator
hands off the LangGraph state.

Also invokable from the mobile app:

- "Simulate" button on a single action card (single-action mode).
- "Simulate All" button on the home screen (full-chain mode).

Do **not** invoke before an action chain exists, and do **not**
simulate the same chain twice in the same minute — Firestore
score-update animations would conflict on the mobile UI.

## What this skill does

For each action in the chain, **in priority order**:

1. **Mark addressed gaps as resolved** in a working copy of the
   factory profile (no mutation of the source-of-truth doc).
2. **Recompute the compliance score** with those gaps removed,
   via `tools/compliance_scorer.simulate_close(gap_ids)`.
3. **Subtract `action.impact_pkr`** from the orders-at-risk PKR
   total (clamped at 0).
4. **Stream the updated score + risk to Firestore** via
   `update_compliance_score(factory_id, score, risk_level,
   orders_at_risk_pkr)`. The mobile app's Firestore listener
   on `/factories/{id}` triggers a score animation.
5. **Trigger `document_drafter`** for the action's required
   artifacts (CBAM form, buyer email, audit checklist, etc.).
6. **Wait 0.4 s** before the next action — this is purely so the
   demo animation reads cleanly to the judges. Remove for
   production batch runs.

After the final action:

- Produce a `SimulationResult` with `before_score`, `after_score`,
  `before_risk_pkr`, `after_risk_pkr`, `risk_reduction_pkr`,
  `score_delta`, plus the full `documents` set.
- Write the result to Firestore `/factories/{id}/reports/latest.simulation_result`.

The simulator is **idempotent within a run** — re-simulating the
same chain produces the same scores. But running it twice in a
row from the mobile button (e.g. Simulate All after a few
single-action sims) re-applies the chain to the original score
and resets the animation cleanly.

## Input
- LangGraph state with `action_chain`, `gaps`, `factory_data`,
  `financial_impact` populated.
- Optional: `action_ids: list[str]` to simulate only a subset
  (used by the single-action mobile button).

## Output
```json
{
  "simulation_result": {
    "before_score": 43,
    "after_score": 71,
    "score_delta": 28,
    "before_risk_pkr": 340000000,
    "after_risk_pkr": 60000000,
    "risk_reduction_pkr": 280000000,
    "before_risk_level": "CRITICAL",
    "after_risk_level": "WARNING",
    "actions_simulated": ["act_001", "act_002", "act_003", "act_004"],
    "per_action_breakdown": [
      {"action_id": "act_001", "score_after": 61, "risk_after_pkr": 164000000},
      {"action_id": "act_002", "score_after": 67, "risk_after_pkr": 104000000},
      {"action_id": "act_003", "score_after": 70, "risk_after_pkr": 76000000},
      {"action_id": "act_004", "score_after": 71, "risk_after_pkr": 60000000}
    ]
  },
  "documents": [
    {"document_id": "doc_act_001_cbam_declaration", "kind": "CBAM_DECLARATION", "title": "..."},
    {"document_id": "doc_act_001_buyer_email", "kind": "BUYER_EMAIL", "title": "..."},
    {"document_id": "doc_act_003_buyer_email", "kind": "BUYER_EMAIL", "title": "..."},
    {"document_id": "doc_act_004_msa_statement", "kind": "MSA_STATEMENT", "title": "..."}
  ]
}
```

## Tools used
- `tools/compliance_scorer.py` — `simulate_close(gap_ids) → score`
- `tools/document_generator.py` (via `document_drafter` skill)
- `tools/firestore_client.update_compliance_score()` — **real-time
  mobile push**

## Real-time guarantee
This skill's defining feature: it calls
`update_compliance_score(...)` after **every** action. The mobile
HomeScreen Firestore listener fires the score-card animation on
each update. Judges watch the score climb 43 → 61 → 67 → 70 → 71
in real time. The 0.4-second sleep between updates exists only so
the animation reads cleanly.

## Artifact produced
The `SimulationResult` JSON + the full document set — both
visible in Antigravity Manager view as artifacts under this
agent. The document set is also rendered on the mobile
**Document Vault** screen.

## Example reasoning trace (Faisal Weave Industries "Simulate All")
```
[01] load action_chain (4 actions) + gaps (5) + factory_data
[02] snapshot before_score=43, before_risk_pkr=340M
[03] action_1 CBAM register+file:
     close gaps[001, 002] → score 43→61, risk 340→164M
     update_compliance_score(fwi_fsd_001, 61, CRITICAL, 164M)
     document_drafter(CBAM_DECLARATION) → doc_act_001_cbam_declaration
     document_drafter(BUYER_EMAIL, buyer=NordStyle Group) → doc_act_001_buyer_email
     sleep 0.4s
[04] action_2 effluent treatment upgrade:
     close gap[004] → score 61→67, risk 164→104M
     update_compliance_score(fwi_fsd_001, 67, WARNING, 104M)
     document_drafter(REMEDIATION_PLAN) → doc_act_002_remediation_plan
     sleep 0.4s
[05] action_3 SA8000 renewal audit:
     close gap[005] → score 67→70, risk 104→76M
     update_compliance_score(fwi_fsd_001, 70, WARNING, 76M)
     document_drafter(CERTIFICATION_APP) → doc_act_003_cert_app
     document_drafter(BUYER_EMAIL, buyer=NordStyle Group) → doc_act_003_buyer_email
     sleep 0.4s
[06] action_4 UK MSA s.54 statement:
     close gap[003] → score 70→71, risk 76→60M
     update_compliance_score(fwi_fsd_001, 71, WARNING, 60M)
     document_drafter(MSA_STATEMENT) → doc_act_004_msa_statement
[07] final SimulationResult: score 43→71 (+28), risk 340M→60M
     (-280M), 4 actions simulated, 6 documents generated
[08] write /factories/fwi_fsd_001/reports/latest
     .simulation_result
[09] artifact: faisal_weave_simulation_result.json + 6 documents
```

## Failure modes + recovery
- **`document_drafter` fails for one action**: continue the
  simulation; mark `documents_pending: [doc_kind]` so the user
  knows. Score progression is not blocked by document
  generation.
- **`compliance_scorer` raises on malformed gap**: skip that
  gap from the close-set and log; never let one bad gap kill
  the chain.
- **Firestore update fails mid-chain**: log + retry once with
  exponential backoff; if still failing, finish the simulation
  locally and emit the result with a `realtime_sync_failed`
  flag so the mobile UI can do a final pull instead of relying
  on the listener.
- **Failure-injection demo**: when `POST /failure-test` kills
  an external dependency (e.g. CertVerify booking API) for one
  action, the recovery agent intercepts, calls
  `document_drafter(kind=BOOKING_TEMPLATE)` to produce a
  manual fallback, and lets the simulation continue. The
  mobile trace screen shows the recovery path live.
