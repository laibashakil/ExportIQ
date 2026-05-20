# ExportIQ — Pakistan Textile Export Compliance Agent

AISeekho 2026 Google Antigravity Hackathon · Challenge 1: Autonomous Content-to-Action Agent.

---

## Project Overview

ExportIQ is an agentic AI system that protects Pakistani textile exporters from
losing EU/UK orders due to compliance failures. It ingests EU/UK regulation
PDFs, factory audit reports, and export volume data, then orchestrates **6
specialised LangGraph agents on Google Antigravity** to detect gaps, surface
contradictions between what factories claim and what data shows, quantify
financial risk in PKR, generate a prioritised action chain, and simulate
executing each action with before/after compliance scores.

The mobile app (Expo) reads real-time Firestore updates so a factory owner sees
agents reasoning live, watches the score climb as actions execute, and downloads
the buyer emails, CBAM forms, and audit checklists the agents generate.

---

## Problem Statement

Pakistan's textile sector ships ~USD 17B/year, employs ~15M people, and depends
on EU/UK buyers who increasingly enforce CBAM, CSDDD, Modern Slavery, REACH,
and ZDHC compliance. A single missed deadline or one expired SA8000 certificate
can cancel hundreds of millions of PKR in confirmed orders. Today, factories
discover gaps in third-party audits weeks before shipment — too late.

Existing tools either:

- **Consulting firms**: 6-week turnarounds and PKR 5–10M engagement fees that
  most factories cannot pay.
- **Generic ESG software**: built for European retailers, not exporters; no
  PKR risk quantification; no Urdu/Pakistan context; no per-factory action
  chain.
- **Spreadsheets / manual audits**: no agentic reasoning across multiple
  sources; contradictions go undetected; deadlines slip.

ExportIQ fills this gap with an autonomous agent pipeline that runs in under
60 seconds, produces PKR-denominated risk, drafts ready-to-send buyer comms,
and re-runs itself when new regulations or new audit evidence arrive.

---

## How It Works (Plain English)

1. **Pick a factory in the mobile app**. The app shows the 3 demo factories
   (Faisal Weave, Chenab Fabric Works, Ravi Garments) with their current
   compliance score, risk band, and PKR exposure.
2. **Tap "Run Full Analysis"**. The mobile app calls `POST /analyze`, which
   kicks off the agent pipeline as a background job.
3. **Six agents run in order on Antigravity**:
   - **Regulation Ingestion** parses the EU CBAM (and any other) regulation PDF
     into a structured rulebook with deadlines and numerical limits.
   - **Factory Profile** parses the factory audit PDF into claims,
     certifications, and audit evidence.
   - **Gap Detection** matches every rule against the factory's profile and
     emits every gap with severity, deadline, evidence, and a plain-English
     display title. It runs a separate contradiction-detection pass that cites
     two named sources for every conflict.
   - **Financial Impact** calculates which buyers and how much PKR the gaps
     put at risk.
   - **Action Chain** ranks gaps by severity × urgency and picks the 3–5
     actions with the highest PKR impact, each tagged with an effort level
     and a deadline.
   - **Execution Simulation** runs each action through a simulator, computes
     score deltas and risk recovered, and generates buyer emails, CBAM forms,
     and audit checklists.
4. **The mobile app streams the trace** from Firestore so the user watches
   each step in real time — and a markdown trace file is auto-written to
   `backend/logs/antigravity_trace_<job>.md` for Antigravity Manager view.
5. **The user can simulate any subset of actions**, see the score jump from
   43 to 71, watch PKR risk drop from 340M to 60M, and download the generated
   documents.

A 7th **Recovery Agent** is wired into the LangGraph so that if any of the 6
agents throws an exception (network, quota, malformed input) the pipeline
records the failure, produces a minimal fallback artifact, and continues. The
hackathon demo exercises this via `POST /failure-test/{job_id}`.

---

## Architecture

```
┌──────────────────────────┐
│  Expo (React Native) app │   ← runs in Expo Go via QR code
│ 12 screens, live Firestore│
│  subscriptions            │
└────────────┬──────────────┘
             │  REST + Firestore listeners
             ▼
┌──────────────────────────┐
│  FastAPI on Cloud Run    │
│  LangGraph DAG           │
│   ├─ Orchestrator        │
│   ├─ Regulation Ingestion│
│   ├─ Factory Profile     │
│   ├─ Gap Detection       │
│   ├─ Financial Impact    │
│   ├─ Action Chain        │
│   ├─ Execution Simulation│
│   └─ Recovery Agent      │
└────────────┬──────────────┘
             ▼
┌──────────────────────────┐
│ Firestore + Cloud Storage│   ← real-time score + agent trace
│ Vertex AI (Gemini 2.5 Pro)│
└──────────────────────────┘
```

Every agent writes to a shared LangGraph state (`AgentState` TypedDict). Each
step appends to `/jobs/{job_id}.agent_trace` in Firestore so the mobile UI and
Antigravity Manager view see identical reasoning logs in real time.

---

## Google Antigravity Integration

This project is built around Antigravity from the start, not bolted on.

1. **Skills directory** — `antigravity/.agent/skills/` contains 8 `skill.md`
   files (one per agent plus the contradiction-detector and document-drafter
   tools). Each skill documents *when to use*, *what it does*, *inputs*,
   *outputs*, *tools used*, *example reasoning trace*, and *failure modes* —
   the exact metadata Antigravity Manager reads to render the agent panel.
2. **Workflows directory** — `antigravity/.agent/workflows/` contains
   `full_compliance_analysis.md` (the demo end-to-end flow) and
   `daily_regulatory_scan.md` (a scheduled job that re-checks all factories
   when new regulations land).
3. **Artifacts** — every agent produces at least one artifact visible in
   Manager view: a parsed rulebook (Regulation Ingestion), a profile JSON
   (Factory Profile), a gap report (Gap Detection), an action chain (Action
   Chain), generated PDFs/emails (Execution Simulation), a failure-recovery
   log (Recovery Agent).
4. **Reasoning trace** — `backend/tools/trace_exporter.py` writes one
   markdown trace per job (`antigravity_trace_<job>.md`) with 9 sections:
   Workplan, Task Plan, Agent Observations, Reasoning Steps, Tool Calls,
   Decisions Made, Action Execution Log, Error Recovery Log, Final Outcomes.
   This file is what the judges download from `backend/logs/`.
5. **Gemini 2.5 Pro via Vertex AI** — every LLM call goes through
   `backend/tools/gemini_client.py`, which prefers Vertex AI (the Antigravity
   default), falls back to AI Studio if Vertex is unavailable, and falls back
   again to deterministic stubs so the pipeline always produces output even
   when credentials are missing.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile app | Expo (React Native) + React Navigation | Single QR-code demo; works on judge's own phone |
| Backend | Python 3.11 + FastAPI + Uvicorn | Async-friendly; trivial Cloud Run deploy |
| Agent orchestration | LangGraph + LangChain | Required for multi-agent state; integrates with Antigravity |
| LLM | Gemini 2.5 Pro on Vertex AI | Mandated by hackathon; best PDF understanding |
| LLM fallback | Google AI Studio + deterministic stubs | Demo never goes blank, even with quota issues |
| Database | Firebase Firestore | Real-time subscriptions from mobile app; no server config |
| File storage | Firebase Storage | Stores uploaded PDFs and generated documents |
| PDF parsing | PyMuPDF (fitz) + Gemini fallback | Fast deterministic parse; LLM cleanup for messy scans |
| Hosting | Google Cloud Run | Hackathon credits; serverless; zero-config |
| Auth | Firebase Auth (anonymous) | No signup friction for demo |

---

## Setup Instructions

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows PowerShell: venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env              # fill in keys (see "What needs your input" below)
uvicorn main:app --reload --port 8000
```

The backend **runs without any credentials in stub mode** — Gemini calls return
deterministic stubs, Firestore writes to an in-memory store. This is enough to
demo the full pipeline locally.

### Mobile

```bash
cd mobile
npm install
npx expo start                    # scan QR with Expo Go
```

For Android emulator the default API base URL of `http://10.0.2.2:8000`
already points at host localhost. For physical-device demos via Expo Go, edit
`mobile/app.json` → `expo.extra.apiBaseUrl` to your laptop's LAN IP.

### What needs your input (real cloud services)

To run with real cloud services (required for the hackathon demo):

1. **Google Cloud project** with Vertex AI enabled — set
   `GOOGLE_CLOUD_PROJECT` in `backend/.env`.
2. **Service-account JSON** with Vertex AI User + Firestore Admin roles, saved
   as `backend/service-account.json` and pointed to by
   `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_CREDENTIALS`.
3. **Firebase project** in the same GCP project, with Firestore enabled — set
   `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET`.
4. **Firebase web config** in `mobile/app.json` →
   `expo.extra.firebaseConfig` (apiKey/projectId/etc the Firebase JS SDK
   needs).
5. *(Optional)* **AI Studio API key** in `GEMINI_API_KEY` for when Vertex
   quota is exhausted during demo.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/` | Service banner + agent list |
| `GET`  | `/health` | Liveness probe (`/healthz` is reserved by Cloud Run's GFE) |
| `POST` | `/upload` | Ingest a regulation PDF, factory audit PDF, or export CSV |
| `POST` | `/analyze` | Kick off the 6-agent LangGraph pipeline for a factory |
| `GET`  | `/status/{job_id}` | Poll progress + live agent trace |
| `GET`  | `/report/{factory_id}` | Full compliance report (gaps, contradictions, actions, sim result) |
| `GET`  | `/actions/{factory_id}` | Just the prioritised action chain |
| `POST` | `/simulate/{factory_id}` | Re-run execution simulation on a chosen subset of actions |
| `GET`  | `/documents/{factory_id}` | All generated documents (buyer emails, CBAM forms, checklists) |
| `POST` | `/documents/{factory_id}/audit-ready` | Bundle the audit-ready document set into a single artifact |
| `POST` | `/failure-test/{job_id}` | Inject a controlled failure in a chosen agent — used for the demo recovery moment |
| `GET`  | `/export-summary` | Cross-factory CSV/markdown export — risk, gaps, and action chains in one file |

All endpoints return JSON. CORS is open for the Expo dev server and Expo Go
LAN ranges.

---

## Demo Flow

A 5-minute judge-facing flow is captured in `docs/demo_script.md`. Summary:

1. Open mobile app, select **Faisal Weave Industries** — score `43/100`,
   PKR 340M at risk (RED).
2. Show 4 gaps + 1 contradiction card ("Factory claims ISO 14001, water audit
   disagrees").
3. Open Antigravity Manager view; tap **Run Full Analysis** on mobile; all 6
   agents fire and produce Artifacts visible in Manager.
4. Tap **Simulate CBAM Filing** — score 43 → 61, risk 340M → 180M PKR.
5. Tap **Simulate All Actions** — score 43 → 71, risk 340M → 60M PKR.
6. Hit `POST /failure-test/<job_id>` for the **recovery moment** — kill the
   CertVerify booking API; the Recovery Agent runs a fallback artifact
   (manual booking template) and the pipeline continues.
7. Show the generated documents: CBAM declaration, buyer email, audit
   checklist.
8. Show the mobile **Agent Trace** screen — full reasoning visible, mirrors
   Antigravity Manager.

---

## Evaluation Criteria Mapping

| Criterion | Weight | How ExportIQ covers it |
|---|---|---|
| Google Antigravity Integration | 25% | 8 `skill.md` files, 2 workflow files, 9-section markdown traces, every agent produces Manager-visible artifacts, Gemini 2.5 Pro on Vertex AI |
| Agentic Reasoning & Workflow | 20% | 6 agents on LangGraph DAG with shared state, parallel start (Regulation + Factory in parallel), contradiction detection across two sources, constraint-based action prioritisation, failure recovery with fallback |
| Insight & Decision Quality | 20% | Specific PKR figures per buyer, named regulations (CBAM/CSDDD/Modern Slavery/REACH), contradictions cite two sources by name, non-trivial gaps (e.g. ISO 14001 claim vs water audit) |
| Action Simulation & Outcome | 15% | Per-action and aggregate score delta, PKR risk reduction calculated, real document generation (buyer emails, CBAM forms, audit checklists), before/after state persisted |
| Technical Implementation | 10% | FastAPI + LangGraph + Firestore + Expo, clean separation of agents/tools/models/api, 100% backend test pass via QA script, failure handling + circuit breaker for LLM outages |
| Innovation & UX | 10% | No existing solution for Pakistan textile compliance, mobile-first, PKR-denominated risk makes consequences visceral, Urdu/English-ready copy |

---

## Assumptions and Limitations

**Assumptions made for the demo**

- Three factories with hand-curated audit profiles approximate realistic
  Pakistani textile factories. Real-world adoption would ingest existing
  factory ERP exports and third-party audit PDFs from CertVerify Pakistan.
- The EU CBAM rulebook is the primary demo regulation. The architecture
  supports additional regulations dropped into `backend/mock_data/regulations/`.
- PKR risk numbers are derived from the factory's `annual_export_pkr` and
  severity-weighted gap penalties. Real production would tie this to confirmed
  PO numbers and shipment manifests.
- Document generation outputs Markdown; PDF rendering would be added pre-prod.

**Known limitations**

- The mobile app uses Firebase Auth anonymous sign-in for the demo; production
  would require factory-owner email + phone OTP.
- Action effort estimates (LOW/MEDIUM/HIGH) are heuristic, not calibrated
  against a real industrial-engineering effort model.
- Recovery Agent fallbacks are minimal — they unblock the pipeline but a
  production deployment would integrate proper alerting (PagerDuty / email).
- Only English copy is included; Urdu translation is on the roadmap.
- No multi-tenant separation yet — factory IDs are global. A SaaS deployment
  would partition Firestore by tenant.

---

## Cost and Latency Analysis

**Per-analysis cost (Gemini 2.5 Pro on Vertex AI, May 2026 pricing)**

| Component | Tokens (approx) | Cost (USD) |
|---|---|---|
| Regulation parsing (1 PDF) | 8K in + 2K out | $0.012 |
| Gap detection LLM pass     | 6K in + 1K out | $0.009 |
| Contradiction LLM pass     | 4K in + 1K out | $0.007 |
| Action chain rationale     | 2K in + 0.5K out | $0.003 |
| Buyer-email + CBAM + checklist generation | 8K in + 4K out | $0.022 |
| **Total per analysis**     | ~30K in + 8K out | **~USD 0.05** |

At PKR 280/USD that is roughly **PKR 14 per analysis**. A factory running this
weekly costs PKR 728/year — versus the PKR 5–10M consultancy alternative.

**Per-analysis latency** (with real Vertex AI quota)

| Stage | Wall-clock |
|---|---|
| Regulation + Factory Profile (parallel) | 6–8 s |
| Gap Detection (deterministic + LLM) | 10–14 s |
| Financial Impact | 1–2 s |
| Action Chain (with LLM rationale) | 4–6 s |
| Execution Simulation + document generation | 12–18 s |
| **End-to-end** | **35–50 s** |

In **stub mode** (no LLM credentials) end-to-end runs in ~3–5 s.

**Scaling note** — Cloud Run autoscales horizontally; LangGraph state is
JSON-serialisable so we can shard analyses across instances with no cross-talk.

---

## Baseline Comparison (Agentic vs Non-Agentic)

| Capability | Manual / Spreadsheet | Generic ESG SaaS | ExportIQ (agentic) |
|---|---|---|---|
| Time to first gap report | 2–6 weeks | 1–3 days | **45 s** |
| Cross-source contradiction detection | Manual review | None | **Auto, cites two sources** |
| PKR-denominated risk per buyer | None | Generic % score | **PKR per buyer per gap** |
| Actionable next steps | Generic checklist | Ticket queue | **3–5 prioritised actions with PKR impact** |
| Document drafting | Manual | Templates | **Auto-generated buyer email, CBAM form, audit checklist** |
| Continuous re-check on new regulation | Manual | Quarterly scan | **Auto via daily_regulatory_scan workflow** |
| Failure resilience | Person on leave → blocked | Vendor outage → blocked | **Recovery Agent fallback** |
| Cost per analysis | PKR 50–200K (consultant) | USD 500–2000/month subscription | **~PKR 14 per analysis** |

A non-agentic LLM call ("here is the rulebook and the factory profile, list
gaps") loses to ExportIQ on three concrete dimensions:

1. **Contradictions** — a single prompt cannot cross-reference filenames
   reliably; ExportIQ's contradiction detector grounds every conflict in
   two named sources from the input and drops hallucinated filenames.
2. **Action prioritisation** — non-agentic output dumps all gaps without
   PKR weighting; ExportIQ ranks by severity × deadline and assigns PKR
   impact per action.
3. **Failure recovery** — non-agentic chains break on a single API timeout;
   the Recovery Agent unblocks the pipeline so judges (and real users) get
   a useful output even under partial failure.

---

## License

MIT. See `LICENSE`.
