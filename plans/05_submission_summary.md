# ExportIQ — Hackathon Submission Summary

> **AISeekho 2026 Google Antigravity Hackathon**  
> **Challenge 1:** Autonomous Content-to-Action Agent  
> **Team:** Laiba Shakil  
> **Submission Date:** May 20, 2026

---

## The Problem

Pakistan's textile industry employs **15 million workers** and generates **$16 billion** in annual exports — 60% to the EU and UK. New regulations (EU CBAM, EU CSDDD, UK Modern Slavery Act) are creating compliance deadlines that Pakistani factories are poorly equipped to track. **A single missed filing can trigger order cancellations worth hundreds of millions of PKR**, cascading into factory closures and job losses.

No existing tool helps Pakistani textile exporters:
- Parse EU/UK regulation PDFs into actionable requirements
- Cross-reference factory audits against those requirements
- Detect contradictions between what factories claim and what audits show
- Calculate the exact PKR financial exposure per buyer
- Generate the actual documents needed to close compliance gaps

---

## The Solution

ExportIQ is a **6-agent AI compliance system** that ingests regulation PDFs and factory audit reports, detects gaps and contradictions, calculates PKR risk, generates prioritized action chains, and simulates execution — showing factories exactly what to do, in what order, to save their export orders.

### The 6 Agents

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Agent 1: Regulation Ingestion                          │
│  Parses EU CBAM, UK Modern Slavery Act, EU CSDDD into   │
│  structured rulebooks with deadlines + numerical limits  │
│                                                         │
│  Agent 2: Factory Profile                               │
│  Extracts certifications, claims, audit evidence, and    │
│  export volumes from factory audit PDFs + CSVs           │
│                                                         │
│  Agent 3: Gap Detection                                 │
│  Cross-references rules vs factory profile; flags gaps   │
│  + contradictions (factory says X, audit shows Y)        │
│                                                         │
│  Agent 4: Financial Impact                              │
│  Calculates PKR exposure per buyer. "NordStyle Group's   │
│  PKR 170M order is at risk because of CBAM non-filing"   │
│                                                         │
│  Agent 5: Action Chain                                  │
│  Generates 3-5 prioritized actions: what to file, what   │
│  to renew, what to remediate — deadlines + PKR impact    │
│                                                         │
│  Agent 6: Execution Simulation                          │
│  Simulates each action: score 43→71, risk PKR 340M→60M  │
│  Generates CBAM forms, buyer emails, audit checklists    │
│                                                         │
│  + Recovery Agent                                       │
│  Activates on failure → fallback artifact → pipeline     │
│  continues. Visible in Antigravity Manager view.         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Key Innovations

### 1. Contradiction Detection with Source Grounding
When a factory claims "ISO 14001 compliant" but its water audit shows discharge at 12 ppm (EU limit: 8 ppm), ExportIQ flags this contradiction and **cites both source filenames by name**. LLM-generated contradictions are filtered — only accepted if both sources appear in the actual input data.

### 2. Real-Time Compliance Score Animation
As Agent 6 simulates each action, it writes the new compliance score to Firestore every 400ms. The mobile app's `CircularScore` component subscribes via `onSnapshot()` and **animates the score climbing in real time** — judges see the number tick upward from 43 → 51 → 65 → 71.

### 3. Proactive Buyer Communication
Generated buyer emails are phrased as confident "quarterly compliance status updates" — never confessional. The system frames ongoing remediation as "scheduled certification refresh cycles" and leads with the factory's valid certifications. This is how real compliance officers communicate.

### 4. Financial Impact in PKR
Every gap is translated into **specific PKR amounts at risk per buyer**. "CRITICAL gap → 80% of NordStyle Group's PKR 170M order at risk." This makes compliance tangible for factory owners who think in rupees, not regulatory paragraphs.

### 5. 3-Tier Gemini Fallback
The system works with zero credentials (deterministic stubs), with an AI Studio API key, or with full Vertex AI access. The pipeline never breaks regardless of environment — critical for reliable demo execution.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo (React Native) — 9 screens, dark theme |
| Backend | FastAPI + LangGraph StateGraph |
| LLM | Gemini 2.5 Pro via Vertex AI (+ AI Studio fallback) |
| Orchestration | Google Antigravity (6 agents visible in Manager view) |
| Database | Firebase Firestore (real-time score animation) |
| Storage | Firebase Storage (uploaded PDFs) |
| Hosting | Google Cloud Run (serverless) |
| PDF Parsing | PyMuPDF + Gemini structure extraction |

---

## Demo Highlights

| Timestamp | What Judges See |
|---|---|
| 0:00 | HomeScreen: 3 factories — Faisal Weave (43, 🔴), Chenab (78, 🟡), Ravi (91, 🟢) |
| 0:20 | Faisal Weave: 4 compliance gaps + 1 contradiction (ISO 14001 vs water audit) |
| 1:00 | Antigravity Manager view: 6 agents, parallel start visible |
| 1:30 | Run Analysis: AgentTrace streams reasoning live |
| 2:30 | ActionCenter: 5 prioritized actions with PKR impact |
| 2:50 | Simulate actions: Score animates 43 → 71, risk drops PKR 340M → 60M |
| 3:30 | **Failure injection**: Recovery agent activates, pipeline continues |
| 4:00 | DocumentVault: CBAM form, buyer emails, audit checklists generated |
| 4:40 | *"15 million jobs depend on these exports. ExportIQ prevents the next one from being lost."* |

---

## Evaluation Criteria Coverage

| Criterion (Weight) | How ExportIQ Addresses It |
|---|---|
| **Antigravity Integration (25%)** | 8 skills + 2 workflows in `.agent/` folder, all agents visible in Manager view, artifacts produced by every agent, trace exporter for Antigravity format |
| **Agentic Reasoning (20%)** | 6-agent LangGraph DAG with parallel branches, contradiction detection using claim↔evidence cross-reference, severity×urgency prioritization, failure recovery with fallback artifacts |
| **Insight Quality (20%)** | Specific PKR figures per buyer, named regulations + deadlines, contradictions with dual source citations, deterministic + LLM hybrid detection |
| **Action Simulation (15%)** | Before/after compliance score animation, PKR risk reduction per action, CBAM forms + buyer emails + audit checklists generated |
| **Technical Implementation (10%)** | FastAPI + LangGraph + Firestore + Expo, 3-tier Gemini fallback, in-memory Firestore fallback, recovery wrapping, clean agents/tools/models separation |
| **Innovation & UX (10%)** | First Pakistan-specific textile compliance tool, mobile-first, financial stakes in PKR, real-time score animation, proactive buyer communication tone |

---

## Repository Structure

```
ExportIQ/
├── backend/                 FastAPI + LangGraph + 6 agents
│   ├── agents/              orchestrator + 6 agents + recovery
│   ├── tools/               10 tools (Gemini, Firestore, PDF, etc.)
│   ├── api/                 8 REST endpoints
│   ├── models/              4 Pydantic schemas
│   └── mock_data/           3 factories + 3 regulations
├── mobile/                  Expo React Native
│   ├── screens/             9 screens
│   ├── components/          8 reusable components
│   └── services/            API + Firebase + formatting
├── antigravity/.agent/      8 skills + 2 workflows
└── docs/                    Architecture + demo script + traces
```

**Total:** ~4,500 lines of Python backend code, ~2,800 lines of JavaScript mobile code, 10 skill/workflow definitions, 6 mock data files.

---

## Running Locally

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8080

# Mobile
cd mobile && npm install && npx expo start

# The backend runs without any credentials in stub mode.
```

---

*ExportIQ — Protecting Pakistan's textile exports, one compliance gap at a time.*
