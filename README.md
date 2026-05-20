# ExportIQ — Pakistan Textile Export Compliance Agent

AISeekho 2026 Google Antigravity Hackathon · Challenge 1: Autonomous Content-to-Action Agent.

---

## Project Overview

ExportIQ is an agentic AI system that protects Pakistani textile exporters from
losing EU/UK orders due to compliance failures. It ingests EU/UK regulation
PDFs, factory audit reports, and export volume data, then orchestrates **6
specialised LangGraph agents** (deployed on **Google Cloud Run**) to detect
gaps, surface contradictions between what factories claim and what data shows,
quantify financial risk in PKR, generate a prioritised action chain, and
simulate executing each action with before/after compliance scores.

**Google Antigravity** was used as the AI-powered development environment (IDE)
to build, debug, and iterate on the entire codebase — backend agents, mobile
app, and deployment configuration. It is not the runtime that executes the
agents; that role belongs to FastAPI + LangGraph on Cloud Run.

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

## Solution Design

ExportIQ's core design principle is **Content-to-Action**: raw regulatory PDFs
and factory audit documents go in, and prioritised remediation actions with
generated compliance documents come out — fully autonomously.

The system is split into three layers:

1. **Data Ingestion Layer** — Accepts regulation PDFs (EU CBAM, CSDDD, UK
   Modern Slavery Act), factory audit PDFs, and export CSV data. PDFs are
   parsed with PyMuPDF deterministically, with Gemini as fallback for messy
   scans. Pre-parsed JSON profiles exist for the 4 demo factories.

2. **Agentic Reasoning Layer** — A LangGraph DAG orchestrates 6 specialised
   agents sequentially (with a parallel start for Regulation + Factory
   Profile). Each agent writes to a shared `AgentState` TypedDict. A 7th
   Recovery Agent wraps every node so that any exception triggers a fallback
   artifact and the pipeline continues without crashing.

3. **Action & Output Layer** — The pipeline produces a compliance report with
   scored gaps, contradictions with dual-source citations, a PKR-denominated
   risk breakdown per buyer, a prioritised action chain, and generated
   documents (buyer emails, CBAM declarations, audit checklists). All outputs
   stream to Firestore in real time for the mobile app.

---

## Architecture

```
┌──────────────────────────┐
│  Expo (React Native) app │   ← runs in Expo Go via QR code
│ 13 screens, live Firestore│
│  subscriptions            │
└────────────┬──────────────┘
             │  REST + Firestore listeners
             ▼
┌──────────────────────────┐
│  FastAPI on Cloud Run    │
│  LangGraph DAG           │
│   ├─ Orchestrator        │
│   ├─ Regulation Ingestion│  ← parallel start
│   ├─ Factory Profile     │  ← parallel start
│   ├─ Gap Detection       │
│   ├─ Financial Impact    │
│   ├─ Action Chain        │
│   ├─ Execution Simulation│
│   └─ Recovery Agent      │  ← wraps every node
└────────────┬──────────────┘
             ▼
┌──────────────────────────┐
│ Firestore + Cloud Storage│   ← real-time score + agent trace
│ Vertex AI (Gemini 2.5 Pro)│
└──────────────────────────┘
```

Every agent writes to a shared LangGraph state (`AgentState` TypedDict). Each
step appends to `/jobs/{job_id}.agent_trace` in Firestore so the mobile UI
sees reasoning logs in real time.

### LangGraph DAG Shape

```
      START
       │
       ├──> regulation_ingestion ──┐
       │                           │  (parallel — both update state)
       └──> factory_profile  ─────┘
                                    │
                                    ▼
                         gap_detection
                                    │
                                    ▼
                         financial_impact
                                    │
                                    ▼
                         action_chain
                                    │
                                    ▼
                         execution_simulation
                                    │
                                    ▼
                          END
```

If any agent raises an exception, control routes to `recovery_agent` which
produces a minimal fallback artifact and the pipeline continues at the next
node.

---

## Agents Developed

### Agent 1: Regulation Ingestion (`regulation_agent.py`)
- **Input**: Regulation IDs (e.g. `eu_cbam`, `uk_modern_slavery`)
- **Process**: Loads pre-parsed JSON from `mock_data/regulations/` or parses
  real PDFs with PyMuPDF + Gemini extraction
- **Output**: Structured rulebook — list of rules with deadlines, numerical
  limits, severity ratings, and categories (CARBON, CHEMICAL, LABOUR,
  AUDIT_CERTIFICATION, REPORTING)

### Agent 2: Factory Profile (`factory_profile_agent.py`)
- **Input**: Factory ID
- **Process**: Loads factory JSON profile containing certifications, claims,
  audit evidence, and buyer/export data
- **Output**: Structured factory data with claims, certifications (with
  statuses: VALID/EXPIRED/MISSING), and audit evidence metrics

### Agent 3: Gap Detection (`gap_detection_agent.py`)
- **Input**: Regulation rules + factory profile from Agents 1 & 2
- **Process**: Two-pass detection:
  1. **Deterministic pass** — rule-based matching (cert status checks,
     numerical limit comparisons, reporting requirement verification)
  2. **LLM pass** — Gemini identifies subtle gaps the rules miss
- Also runs the **Contradiction Detector** tool which cross-references
  factory claims against audit evidence, citing two named source files per
  conflict. LLM-generated contradictions are validated against input source
  filenames to prevent hallucinated citations.
- **Output**: List of gaps (with severity, deadline, evidence) + list of
  contradictions (with dual-source citations and confidence scores)

### Agent 4: Financial Impact (`financial_impact_agent.py`)
- **Input**: Gaps + factory export data (per-buyer PKR volumes)
- **Process**: Calculates which buyers are affected by which gaps and how
  much PKR revenue is at risk per gap
- **Output**: Financial impact object with `orders_at_risk_pkr`,
  `buyers_affected`, and per-buyer risk breakdown

### Agent 5: Action Chain (`action_chain_agent.py`)
- **Input**: Gaps + financial impact
- **Process**: Ranks gaps by `severity × urgency × PKR impact`, selects the
  3–5 highest-impact actions, assigns effort levels (LOW/MEDIUM/HIGH) and
  deadlines
- **Output**: Prioritised action chain — each action has an `action_id`,
  title, `addresses_gap_ids`, `impact_pkr`, and effort level

### Agent 6: Execution Simulation (`execution_agent.py`)
- **Input**: Action chain + gaps + financial impact + factory profile
- **Process**: Simulates each action sequentially:
  - Removes addressed gaps from the active set
  - Recomputes compliance score and risk after each action
  - Generates supporting documents (CBAM forms, audit checklists)
  - Generates one proactive buyer email per affected buyer
  - Pushes real-time score updates to Firestore (drives mobile animation)
- **Output**: Before/after compliance scores, PKR risk reduction, list of
  generated documents

### Agent 7: Recovery Agent (`recovery_agent.py`)
- **Trigger**: Any exception in Agents 1–6
- **Process**: Logs the failure, records the error trace, and returns a
  minimal fallback artifact so the pipeline continues
- **Purpose**: Ensures the demo and production pipeline never produce a
  blank screen — judges always see output even under partial failure

---

## Mock vs Real APIs

| Component | Mock / Stub Mode | Real / Production Mode |
|---|---|---|
| **LLM (Gemini)** | Deterministic stub responses hardcoded per agent — pipeline produces realistic output with zero API calls | Gemini 2.5 Pro via Vertex AI (`langchain-google-vertexai`); falls back to AI Studio API key if Vertex quota exhausted |
| **Firestore** | In-memory `_MemStore` class mimics Firestore set/get/update/append/list operations with dict-backed storage | Firebase Admin SDK with real Firestore project; real-time listeners from mobile app |
| **Factory Data** | 4 pre-built JSON profiles in `mock_data/factories/` (Faisal Weave Industries, Chenab Fabric Works, Ravi Garments, AMS Sportswear) | Same JSON profiles; real deployment would ingest factory ERP exports |
| **Regulation Data** | 3 pre-parsed JSON rulebooks in `mock_data/regulations/` (EU CBAM, EU CSDDD, UK Modern Slavery Act) + real PDFs for Gemini parsing | Same; additional regulations can be dropped into the directory |
| **PDF Parsing** | PyMuPDF text extraction (always works) | PyMuPDF + Gemini-based structure extraction for complex/scanned PDFs |
| **Document Generation** | Deterministic Markdown templates for buyer emails, CBAM forms, and checklists | Gemini-generated documents with tone constraints (no confessional language) |
| **Export CSV** | `factory_export_data.csv` with PKR volumes per buyer | Same; production would pull from ERP/PO systems |

**Circuit breaker**: If the first Gemini call fails with PermissionDenied,
billing, or quota errors, the client trips a circuit breaker and all
subsequent calls in that process use stubs — preventing 60s+ timeouts per
agent.

---

## Integrations Implemented

### Google Cloud / Firebase
- **Vertex AI** — All LLM calls route through `gemini_client.py` which
  initialises `ChatVertexAI` with the configured project and region
- **Cloud Run** — Backend deployed as a Docker container with Dockerfile;
  service-account JSON injected via Secret Manager
- **Firestore** — Real-time database for job progress, agent traces, factory
  scores, and compliance reports; mobile app subscribes to document changes
- **Cloud Storage** — Firebase Storage for uploaded PDFs and generated
  document artifacts

### LangGraph / LangChain
- **LangGraph `StateGraph`** — Defines the 6-node DAG with parallel edges
  from START to Regulation + Factory Profile, sequential edges through the
  remaining agents
- **Shared `AgentState` TypedDict** — Uses LangGraph's `Annotated[list, add]`
  reducer for append-only trace and error accumulation
- **LangChain messages** — `SystemMessage` + `HumanMessage` for every Gemini
  call via LangChain's chat model interface

### Google Antigravity (Development IDE)
- Used as the primary AI-assisted development environment throughout the
  project — for writing agents, debugging the LangGraph DAG, building the
  mobile app, configuring Cloud Run deployment, and iterating on document
  generation prompts
- **Skills directory** (`antigravity/.agent/skills/`) — 8 skill files
  documenting each agent and tool for Antigravity's context
- **Workflows directory** (`antigravity/.agent/workflows/`) — 2 workflow
  files (`full_compliance_analysis.md`, `daily_regulatory_scan.md`)

### Mobile App (Expo / React Native)
- **Firebase JS SDK** — Real-time `onSnapshot` listeners for live score
  updates and agent trace streaming
- **React Navigation** — Stack + bottom tab navigation across 13 screens
- **expo-document-picker** — PDF upload from device
- **expo-sharing** — Share generated documents

---

## How It Works (Plain English)

1. **Pick a factory in the mobile app**. The app shows the 4 demo factories
   (Faisal Weave, Chenab Fabric Works, Ravi Garments, AMS Sportswear) with
   their current compliance score, risk band, and PKR exposure.
2. **Tap "Run Full Analysis"**. The mobile app calls `POST /analyze`, which
   kicks off the agent pipeline as a background job.
3. **Six agents run in order on Cloud Run**:
   - **Regulation Ingestion** parses the EU CBAM regulation into a structured
     rulebook with deadlines and numerical limits.
   - **Factory Profile** parses the factory audit data into claims,
     certifications, and audit evidence.
   - **Gap Detection** matches every rule against the factory's profile and
     emits every gap with severity, deadline, evidence, and a plain-English
     display title. Runs a separate contradiction-detection pass that cites
     two named sources for every conflict.
   - **Financial Impact** calculates which buyers and how much PKR the gaps
     put at risk.
   - **Action Chain** ranks gaps by severity × urgency and picks the 3–5
     actions with the highest PKR impact.
   - **Execution Simulation** runs each action through a simulator, computes
     score deltas and risk recovered, and generates buyer emails, CBAM forms,
     and audit checklists.
4. **The mobile app streams the trace** from Firestore so the user watches
   each step in real time.
5. **The user can simulate any subset of actions**, see the score jump (e.g.
   43 → 71), watch PKR risk drop, and download the generated documents.

A 7th **Recovery Agent** is wired into the LangGraph so that if any of the 6
agents throws an exception (network, quota, malformed input) the pipeline
records the failure, produces a minimal fallback artifact, and continues.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile app | Expo 54 (React Native) + React Navigation | Single QR-code demo; works on judge's own phone |
| Backend | Python 3.11 + FastAPI + Uvicorn | Async-friendly; trivial Cloud Run deploy |
| Agent orchestration | LangGraph + LangChain | Multi-agent state graph; shared TypedDict state |
| LLM | Gemini 2.5 Pro on Vertex AI | Hackathon requirement; strong PDF understanding |
| LLM fallback | Google AI Studio + deterministic stubs | Demo never goes blank, even with quota issues |
| Database | Firebase Firestore | Real-time subscriptions from mobile app |
| File storage | Firebase Storage | Stores uploaded PDFs and generated documents |
| PDF parsing | PyMuPDF (fitz) + Gemini fallback | Fast deterministic parse; LLM cleanup for scans |
| Hosting | Google Cloud Run | Serverless container deployment |
| Auth | Firebase Auth (anonymous) | No signup friction for demo |
| Development IDE | Google Antigravity | AI-assisted development and debugging |

---

## Project Structure

```
ExportIQ/
├── backend/
│   ├── agents/                    # LangGraph agent implementations
│   │   ├── orchestrator.py        # DAG builder + pipeline runner
│   │   ├── state.py               # AgentState TypedDict
│   │   ├── base.py                # Shared logging + failure injection
│   │   ├── regulation_agent.py    # Agent 1: Regulation Ingestion
│   │   ├── factory_profile_agent.py # Agent 2: Factory Profile
│   │   ├── gap_detection_agent.py # Agent 3: Gap Detection
│   │   ├── financial_impact_agent.py # Agent 4: Financial Impact
│   │   ├── action_chain_agent.py  # Agent 5: Action Chain
│   │   ├── execution_agent.py     # Agent 6: Execution Simulation
│   │   └── recovery_agent.py      # Agent 7: Recovery
│   ├── tools/                     # Shared tools used by agents
│   │   ├── gemini_client.py       # Vertex AI / AI Studio / stub client
│   │   ├── firestore_client.py    # Firestore + in-memory fallback
│   │   ├── contradiction_detector.py # Rule-based + LLM contradiction detection
│   │   ├── document_generator.py  # Buyer emails, CBAM forms, checklists
│   │   ├── compliance_scorer.py   # Score calculation from gaps
│   │   ├── pdf_parser.py          # PyMuPDF + Gemini extraction
│   │   ├── csv_processor.py       # Export data CSV parsing
│   │   ├── agent_logger.py        # Structured agent logging
│   │   └── trace_exporter.py      # Markdown trace file generation
│   ├── api/                       # FastAPI route handlers
│   ├── models/                    # Pydantic data models
│   ├── mock_data/                 # Demo factory + regulation data
│   │   ├── factories/             # 4 factory JSON profiles + PDFs
│   │   └── regulations/           # 3 regulation JSON + PDFs
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # Environment config (Pydantic Settings)
│   ├── Dockerfile                 # Cloud Run container
│   └── requirements.txt           # Python dependencies
├── mobile/
│   ├── App.js                     # Root navigator
│   ├── screens/                   # 13 React Native screens
│   ├── components/                # Reusable UI components
│   ├── services/                  # API + Firebase service layer
│   └── constants/                 # Theme, colours, config
├── antigravity/
│   └── .agent/
│       ├── skills/                # 8 skill.md files for Antigravity context
│       └── workflows/             # 2 workflow files
├── docs/
│   ├── architecture.md
│   ├── demo_script.md
│   └── agent_trace_example.md
└── README.md
```

---

## Setup Instructions

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows PowerShell: venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env              # fill in keys (see below)
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

### Environment Variables

To run with real cloud services:

1. **Google Cloud project** with Vertex AI enabled — set
   `GOOGLE_CLOUD_PROJECT` in `backend/.env`.
2. **Service-account JSON** with Vertex AI User + Firestore Admin roles, saved
   as `backend/service-account.json` and pointed to by
   `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_CREDENTIALS`.
3. **Firebase project** in the same GCP project, with Firestore enabled — set
   `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET`.
4. **Firebase web config** in `mobile/app.json` →
   `expo.extra.firebaseConfig`.
5. *(Optional)* **AI Studio API key** in `GEMINI_API_KEY` for when Vertex
   quota is exhausted during demo.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/` | Service banner + agent list |
| `GET`  | `/health` | Liveness probe |
| `POST` | `/upload` | Ingest a regulation PDF, factory audit PDF, or export CSV |
| `POST` | `/analyze` | Kick off the 6-agent LangGraph pipeline for a factory |
| `GET`  | `/status/{job_id}` | Poll progress + live agent trace |
| `GET`  | `/report/{factory_id}` | Full compliance report |
| `GET`  | `/actions/{factory_id}` | Prioritised action chain only |
| `POST` | `/simulate/{factory_id}` | Re-run execution simulation on chosen actions |
| `GET`  | `/documents/{factory_id}` | All generated documents |
| `POST` | `/documents/{factory_id}/audit-ready` | Bundle audit-ready document set |
| `POST` | `/failure-test/{job_id}` | Inject a controlled failure for demo recovery |
| `GET`  | `/export-summary` | Cross-factory CSV/markdown export |

All endpoints return JSON. CORS is open for the Expo dev server and Expo Go
LAN ranges.

---

## Demo Flow

1. Open mobile app, select **Faisal Weave Industries** — score `43/100`,
   PKR 340M at risk (RED).
2. Show 4 gaps + 1 contradiction card ("Factory claims ISO 14001, water audit
   disagrees").
3. Tap **Run Full Analysis** on mobile; all 6 agents fire and produce output
   visible in the Agent Trace screen.
4. Tap **Simulate CBAM Filing** — score 43 → 61, risk 340M → 180M PKR.
5. Tap **Simulate All Actions** — score 43 → 71, risk 340M → 60M PKR.
6. Hit `POST /failure-test/<job_id>` for the **recovery moment** — kill an
   agent; the Recovery Agent runs a fallback artifact and the pipeline
   continues.
7. Show the generated documents: CBAM declaration, buyer email, audit
   checklist.
8. Show the mobile **Agent Trace** screen — full reasoning visible.

---

## Evaluation Criteria Mapping

| Criterion | Weight | How ExportIQ covers it |
|---|---|---|
| Google Antigravity Integration | 25% | Used as primary development IDE; 8 skill files + 2 workflow files in `antigravity/.agent/`; Gemini 2.5 Pro on Vertex AI for all LLM calls |
| Agentic Reasoning & Workflow | 20% | 6 agents on LangGraph DAG with shared state, parallel start, contradiction detection across two sources, constraint-based action prioritisation, failure recovery with fallback |
| Insight & Decision Quality | 20% | Specific PKR figures per buyer, named regulations (CBAM/CSDDD/Modern Slavery/REACH), contradictions cite two sources by name, non-trivial gaps |
| Action Simulation & Outcome | 15% | Per-action and aggregate score delta, PKR risk reduction, real document generation, before/after state persisted |
| Technical Implementation | 10% | FastAPI + LangGraph + Firestore + Expo, clean separation of agents/tools/models/api, failure handling + circuit breaker |
| Innovation & UX | 10% | No existing solution for Pakistan textile compliance, mobile-first, PKR-denominated risk, Urdu/English-ready |

---

## Cost and Latency

**Per-analysis cost (Gemini 2.5 Pro on Vertex AI)**

| Component | Tokens (approx) | Cost (USD) |
|---|---|---|
| Regulation parsing (1 PDF) | 8K in + 2K out | $0.012 |
| Gap detection LLM pass     | 6K in + 1K out | $0.009 |
| Contradiction LLM pass     | 4K in + 1K out | $0.007 |
| Action chain rationale     | 2K in + 0.5K out | $0.003 |
| Document generation        | 8K in + 4K out | $0.022 |
| **Total per analysis**     | ~30K in + 8K out | **~USD 0.05** |

At PKR 280/USD ≈ **PKR 14 per analysis** vs PKR 5–10M consultancy alternative.

**Per-analysis latency** (with real Vertex AI): **35–50s** end-to-end.
In **stub mode** (no LLM): **~3–5s**.

---

## Assumptions and Limitations

**Assumptions**

- 4 factories with hand-curated audit profiles approximate realistic Pakistani
  textile factories. Real-world adoption would ingest existing factory ERP
  exports and third-party audit PDFs.
- EU CBAM is the primary demo regulation. Additional regulations can be added
  to `backend/mock_data/regulations/`.
- PKR risk numbers are derived from `annual_export_pkr` and severity-weighted
  gap penalties.

**Known limitations**

- Firebase Auth anonymous sign-in for demo; production would use email + OTP.
- Action effort estimates are heuristic, not calibrated against real
  industrial-engineering models.
- Recovery Agent fallbacks are minimal; production would add alerting.
- Only English copy; Urdu translation is on the roadmap.
- No multi-tenant separation yet.

---

## License

MIT. See `LICENSE`.
