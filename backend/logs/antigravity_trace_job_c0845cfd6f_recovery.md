# Antigravity Trace — job_c0845cfd6f_recovery

_Generated 2026-05-19T11:26:51.128488Z_

- **Factory:** `fwi_fsd_001` (Faisal Weave Industries, Faisalabad)
- **Job:** `job_c0845cfd6f_recovery`
- **Started:** 2026-05-19T11:26:49.380516
- **Finished:** 2026-05-19T11:26:49.975361
- **Status:** `complete`
- **Recovery used:** True

## 1. Workplan

Ingest EU/UK regulation rulebooks and a Pakistani textile factory's audit
profile. Identify compliance gaps + claim/evidence contradictions, quantify
PKR exposure, generate a prioritised action chain, and simulate executing
each action so the user sees the score delta + recovered orders before
committing. Persist a real-time agent trace for the mobile UI.

## 2. Task Plan

| # | Agent | Output | Downstream consumer |
|---|-------|--------|---------------------|
| 1 | Regulation Ingestion | Parsed rulebook (JSON rules) | Gap Detection |
| 2 | Factory Profile      | Claims + audit evidence + certifications | Gap Detection, Financial Impact |
| 3 | Gap Detection        | gaps[], contradictions[], display_titles  | Action Chain |
| 4 | Financial Impact     | orders_at_risk_pkr, buyers_affected       | Action Chain |
| 5 | Action Chain         | prioritised actions[]                     | Execution Simulation |
| 6 | Execution Simulation | simulation_result, generated documents    | Mobile UI |

## 3. Agent Observations

| Agent | Started | Ended | Duration (ms) |
|-------|---------|-------|---------------|
| Agent 5 — Action Chain | 2026-05-19T11:26:46.399760Z | 2026-05-19T11:26:46.930353Z | 532.0 |
| Agent 6 — Execution Simulation | 2026-05-19T11:26:47.742599Z | 2026-05-19T11:26:49.377583Z | 1625.0 |
| Agent 2 — Factory Profile | 2026-05-19T11:26:42.044644Z | 2026-05-19T11:26:43.152786Z | 1109.0 |
| Agent 4 — Financial Impact | 2026-05-19T11:26:45.322443Z | 2026-05-19T11:26:45.864289Z | 547.0 |
| Agent 3 — Gap Detection | 2026-05-19T11:26:43.686338Z | — | — |
| Master Orchestrator | 2026-05-19T11:26:41.486383Z | — | — |
| Agent 1 — Regulation Ingestion | 2026-05-19T11:26:42.253869Z | 2026-05-19T11:26:43.067245Z | 812.0 |

## 4. Reasoning Steps

### Agent 1 — Regulation Ingestion — `parsed_regulation`
_2026-05-19T11:26:42.531805Z_  

```json
{
  "regulation_id": "eu_cbam",
  "rule_count": 2
}
```

### Agent 2 — Factory Profile — `loaded_profile`
_2026-05-19T11:26:42.597098Z_  

```json
{
  "factory_name": "Faisal Weave Industries",
  "certifications": 4,
  "claims": 4,
  "evidence_items": 5
}
```

### Agent 3 — Gap Detection — `injected_failure`
_2026-05-19T11:26:43.965603Z_  

```json
{
  "kind": "api_timeout"
}
```

### Recovery Agent — `activated`
_2026-05-19T11:26:44.502809Z_  

```json
{
  "failed_agent": "gap_detection",
  "failure_type": "api_timeout"
}
```

### Recovery Agent — `fallback_artifact_generated`
_2026-05-19T11:26:44.763708Z_  

```json
{
  "document_id": "fallback_gap_detection"
}
```

### Agent 5 — Action Chain — `rationale`
_2026-05-19T11:26:47.204919Z_  

```json
"These 0 actions target the highest-severity, soonest-deadline gaps first, recovering an estimated PKR 0 of at-risk orders."
```

### Agent 6 — Execution Simulation — `initial_score`
_2026-05-19T11:26:48.272455Z_  

```json
{
  "score": 100,
  "risk_pkr": 0
}
```

### Agent 6 — Execution Simulation — `buyer_emails_drafted`
_2026-05-19T11:26:48.540894Z_  

```json
{
  "count": 4
}
```

## 5. Tool Calls

- `2026-05-19T11:26:46.934797` **Agent 5 — Action Chain** → `rationale` — "These 0 actions target the highest-severity, soonest-deadline gaps first, recovering an estimated PKR 0 of at-risk orders."
- `2026-05-19T11:26:48.003959` **Agent 6 — Execution Simulation** → `initial_score` — {
  "score": 100,
  "risk_pkr": 0
}
- `2026-05-19T11:26:48.274454` **Agent 6 — Execution Simulation** → `buyer_emails_drafted` — {
  "count": 4
}

## 6. Decisions Made

## 7. Action Execution Log

## 8. Error Recovery Log

### Agent 3 — Gap Detection — `RuntimeError`
_2026-05-19T11:26:44.236441Z_  

**Message:** injected failure (api_timeout) in gap_detection

```
{
  "trace": "Traceback (most recent call last):\n  File \"C:\\laiba\\personal-projects\\ExportIQ\\backend\\agents\\orchestrator.py\", line 74, in node\n    return fn(state)\n           ^^^^^^^^^\n  File \"C:\\laiba\\personal-projects\\ExportIQ\\backend\\agents\\gap_detection_agent.py\", line 54, in run\n    raise RuntimeError(f\"injected failure ({kind}) in {AGENT_NAME}\")\nRuntimeError: injected failure (api_timeout) in gap_detection\n"
}
```

## 9. Final Outcomes

- **Compliance score:** 100 / 100 → simulated **100 / 100**
- **Risk level:** `UNKNOWN`
- **Orders at risk:** PKR 0
- **PKR risk recovered (after simulated actions):** PKR 0
- **Buyers affected:** —
- **Documents generated:** 4
- **Recovery agent:** activated during this run.

---

_End of trace._