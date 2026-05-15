# Architecture

## High-level

ExportIQ is a stateful multi-agent system: 6 specialised agents share a single
LangGraph state object as they run, with a recovery agent attached as a fault
handler. The graph runs inside Google Antigravity so its execution is visible
in Manager view, while the underlying compute is FastAPI on Cloud Run.

## Components

### Backend (`backend/`)

- **`main.py`** — FastAPI app, mounts 8 routers.
- **`agents/orchestrator.py`** — builds the LangGraph DAG. Both the
  Regulation Ingestion and Factory Profile agents run **in parallel** from
  `START`; both feed into Gap Detection. Then Financial → Action Chain →
  Execution Simulation → `END`.
- **`agents/{regulation,factory_profile,gap_detection,financial_impact,
  action_chain,execution,recovery}_agent.py`** — one file per agent.
- **`agents/base.py`** — `log_step()` helper that pushes a reasoning entry to
  BOTH the LangGraph state (`agent_trace` accumulates via `operator.add`
  reducer) AND Firestore at `/jobs/{job_id}.agent_trace[]`.
- **`tools/`** — pure functions: `pdf_parser` (PyMuPDF + Gemini),
  `csv_processor`, `firestore_client` (with in-memory fallback),
  `gemini_client` (Vertex AI → AI Studio fallback → deterministic stub),
  `contradiction_detector`, `compliance_scorer`, `document_generator`.
- **`models/`** — Pydantic v2 schemas for Factory, Regulation, GapReport,
  ActionChain, SimulationResult, GeneratedDocument.

### Mobile (`mobile/`)

- **`App.js`** — Stack ⇨ Tabs navigator. Tab order matches CLAUDE.md.
- **6 screens** — Home, Compliance, ActionCenter, DocumentVault, BuyerComms,
  AgentTrace.
- **`services/firebase.js`** — Firestore listeners. `subscribeFactory()`,
  `subscribeReport()`, `subscribeJob()`, `subscribeActions()` are the four
  subscriptions the screens depend on.
- **`services/api.js`** — fetch wrapper around the 8 backend endpoints.

### Antigravity (`antigravity/.agent/`)

Skill files declare each agent's capabilities to Antigravity Manager view.
Workflow files declare the pipelines.

## Data flow per analysis

1. User taps **Run Full Analysis** on mobile.
2. Mobile POSTs `/analyze` with `factory_id` + `regulation_ids[]`.
3. Backend creates `/jobs/{job_id}` and kicks off `run_pipeline()` as a
   FastAPI background task.
4. `run_pipeline()` invokes the compiled LangGraph graph.
5. As each agent runs, it:
   - Reads inputs from the shared state.
   - Calls Gemini via `tools/gemini_client.py`.
   - Writes outputs back to the state.
   - Appends reasoning steps to `/jobs/{job_id}.agent_trace[]`.
   - Updates `/jobs/{job_id}.progress` and `current_agent`.
6. The Execution Simulation agent additionally calls
   `update_compliance_score()` after each simulated action — this writes to
   `/factories/{id}.compliance_score`, which the mobile **HomeScreen** and
   **ComplianceScoreCard** subscribe to and **animate**.
7. Final report lands at `/factories/{id}/reports/latest`.

## Real-time mechanics

Three Firestore documents drive every live update in the demo:

| Document | Updated by | Subscribed on mobile by |
|---|---|---|
| `/factories/{id}` (score, risk_level) | Execution agent (per action) | HomeScreen, ComplianceScreen |
| `/jobs/{id}` (progress, agent_trace) | Every agent (per reasoning step) | AgentTraceScreen, AgentStatusBar |
| `/factories/{id}/reports/latest` | Orchestrator (end of pipeline) | ComplianceScreen, ActionCenterScreen, DocumentVaultScreen, BuyerCommsScreen |

## Failure handling

Each agent is wrapped by `_wrap_with_recovery(name, fn)` in
`agents/orchestrator.py`. If the wrapped function raises:

1. Traceback appended to `agent_trace`.
2. Recovery agent runs and emits a fallback `REMEDIATION_PLAN` document.
3. A best-effort minimal output for THIS agent is produced
   (`_fallback_for(name, state)`) so downstream agents still receive a
   non-empty input.
4. The graph continues to the next agent.

The `POST /failure-test/{job_id}` endpoint sets `inject_failure_in` + `inject_failure_type`
on the state at start of a recovery pipeline; the corresponding agent reads
these flags in `maybe_inject_failure()` and raises a controlled exception —
giving judges a clean "live failure → recovery" moment in Antigravity Manager
view.

## Why this won't degrade in a demo

- **No-credentials mode**: every external dependency has a deterministic
  fallback (in-memory Firestore, stub Gemini responses, pre-parsed regulation
  JSONs instead of PDF extraction).
- **Rule-based contradiction detection**: the Faisal Weave Industries ISO 14001 vs
  water-audit contradiction is hard-coded as a rule, so it shows up even with
  no LLM.
- **Backup video**: a pre-recorded 90-second demo lives in `docs/` (to be
  recorded on day 5).
