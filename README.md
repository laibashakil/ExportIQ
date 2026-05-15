# ExportIQ

Pakistan Textile Export Compliance Agent — AISeekho 2026 Google Antigravity
Hackathon (Challenge 1: Autonomous Content-to-Action Agent).

## What it does

ExportIQ ingests EU/UK regulation PDFs + Pakistani factory audit reports +
export CSVs, runs them through **6 specialised LangGraph agents on Google
Antigravity**, detects compliance gaps and contradictions between what factories
claim vs what data shows, calculates exact PKR financial risk per factory,
generates a prioritised 3-5 action chain, and simulates execution showing
before/after compliance score and risk reduction — protecting Pakistani textile
factories from losing billions in EU/UK export orders.

## Architecture

```
┌──────────────────────┐
│  Expo (React Native) │   ← runs in Expo Go via QR code
│  6 screens, real-    │
│  time Firestore subs │
└──────────┬───────────┘
           │  REST + Firestore listeners
           ▼
┌──────────────────────┐
│  FastAPI on Cloud Run│
│  + LangGraph DAG     │
│  + 6 Gemini agents   │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Firestore + Storage  │   ← real-time score + agent trace
└──────────────────────┘
```

## The 6 agents (in execution order)

1. **Regulation Ingestion** — parses EU/UK regulation PDFs into a structured rulebook.
2. **Factory Profile** — parses factory audit PDFs/CSVs into a canonical profile.
3. **Gap Detection** — cross-references rules vs profile; emits gaps + contradictions.
4. **Financial Impact** — translates gaps into PKR risk per buyer (EU vs UK exposure).
5. **Action Chain** — selects 3-5 prioritised actions with deadlines + PKR impact.
6. **Execution Simulation** — simulates actions, streams score updates, generates documents.

A 7th **Recovery agent** activates if any agent throws, produces a fallback
artifact, and lets the pipeline continue.

## Project layout

```
ExportIQ/
├── backend/                FastAPI + LangGraph + Gemini
│   ├── main.py
│   ├── agents/             6 agents + orchestrator + recovery
│   ├── tools/              pdf_parser, firestore_client, gemini_client, …
│   ├── models/             Pydantic data models
│   ├── api/                upload, analyze, status, report, actions, simulate, …
│   └── mock_data/          3 factories + 3 regulations
├── mobile/                 Expo app (6 screens)
│   ├── App.js
│   ├── screens/
│   ├── components/
│   └── services/           api.js, firebase.js, notifications.js
├── antigravity/.agent/     Skills + Workflows for Antigravity Manager view
│   ├── skills/             6 skill.md files
│   └── workflows/          2 workflow files
└── docs/                   Architecture + demo script
```

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in your keys (see below)
uvicorn main:app --reload --port 8080
```

The backend **runs without any credentials in stub mode** — Gemini calls return
deterministic stubs, Firestore writes to an in-memory store. This is enough to
demo the full pipeline locally.

### Mobile

```bash
cd mobile
npm install
npx expo start              # scan QR with Expo Go
```

If running the backend locally + Android emulator, the default
`apiBaseUrl` of `http://10.0.2.2:8080` already points at host localhost.
For physical-device demos via Expo Go, edit `mobile/app.json` →
`expo.extra.apiBaseUrl` to your laptop's LAN IP.

## What needs your input

To run with real cloud services (required for the hackathon demo):

1. **Google Cloud project** with Vertex AI enabled. Set
   `GOOGLE_CLOUD_PROJECT` in `backend/.env`.
2. **Service-account JSON** with Vertex AI User + Firestore Admin roles, saved
   as `backend/service-account.json`. Point
   `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_CREDENTIALS` at it.
3. **Firebase project** in the same GCP project, with Firestore enabled. Set
   `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET`.
4. **Firebase web config** in `mobile/app.json` →
   `expo.extra.firebaseConfig` (the apiKey/projectId/etc the Firebase JS SDK
   needs for the mobile app to subscribe to Firestore).
5. *(Optional fallback)* **AI Studio API key** in `GEMINI_API_KEY` for when
   Vertex AI quota is exhausted during demo.

## Antigravity integration

The `antigravity/.agent/skills/` folder contains 6 `skill.md` files — one per
agent — that Antigravity Manager view reads to display agent specialisations
and Artifacts. The two `workflows/*.md` files describe the end-to-end pipeline
and the daily regulatory-scan job.

Every agent calls `tools.firestore_client.append_trace(job_id, …)` after each
reasoning step. This trace is the same data that Antigravity Manager view
surfaces as the agent's "thinking" — and that the mobile **Agent Trace** screen
streams live.

## Demo script

See `docs/demo_script.md` for the judge-facing 5-minute flow including the
failure-injection moment.

## License

MIT.
