# ExportIQ — Task Breakdown by Agent

> **Status Legend:** ✅ DONE · 🔨 IN PROGRESS · ⬜ TODO  
> **Priority:** 🔴 Critical (blocks demo) · 🟡 Important · 🟢 Nice-to-have  
> **Current Date:** May 18, 2026 · **Deadline:** May 20, 2026

---

## Agent 1: Regulation Ingestion

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 1.1 | Implement `regulation_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 1.2 | Load pre-parsed JSON regulations from `mock_data/regulations/` | ✅ DONE | 🔴 | — |
| 1.3 | PDF fallback path using `pdf_parser.extract_text()` + Gemini | ✅ DONE | 🔴 | — |
| 1.4 | Create `eu_cbam.json` mock regulation rulebook | ✅ DONE | 🔴 | — |
| 1.5 | Create `uk_modern_slavery.json` mock regulation rulebook | ✅ DONE | 🔴 | — |
| 1.6 | Create `eu_supply_chain_directive.json` mock regulation rulebook | ✅ DONE | 🔴 | — |
| 1.7 | Download real EU CBAM PDF from `taxation.ec.europa.eu` | ✅ DONE | 🟡 | — |
| 1.8 | Download real UK Modern Slavery Act PDF | ✅ DONE | 🟡 | — |
| 1.9 | Download real EU CSDDD PDF | ✅ DONE | 🟡 | — |
| 1.10 | Wire `log_step()` calls for Firestore agent trace | ✅ DONE | 🔴 | — |
| 1.11 | Failure injection support via `maybe_inject_failure()` | ✅ DONE | 🟡 | — |
| 1.12 | Antigravity skill file: `regulation_parser/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 2: Factory Profile

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 2.1 | Implement `factory_profile_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 2.2 | Load pre-parsed JSON factory profiles from `mock_data/factories/` | ✅ DONE | 🔴 | — |
| 2.3 | PDF fallback path using `pdf_parser` + `extract_factory_structure()` | ✅ DONE | 🔴 | — |
| 2.4 | Create `fwi_fsd_001.json` — Faisal Weave Industries (CRITICAL, score 43) | ✅ DONE | 🔴 | — |
| 2.5 | Create `cfw_lhe_002.json` — Chenab Fabric Works (WARNING, score 78) | ✅ DONE | 🔴 | — |
| 2.6 | Create `rgl_khi_003.json` — Ravi Garments Ltd (COMPLIANT, score 91) | ✅ DONE | 🔴 | — |
| 2.7 | Generate mock audit PDFs for all 3 factories | ✅ DONE | 🟡 | — |
| 2.8 | Wire `log_step()` calls for agent trace | ✅ DONE | 🔴 | — |
| 2.9 | Failure injection support | ✅ DONE | 🟡 | — |
| 2.10 | Antigravity skill file: `factory_profile/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 3: Gap Detection

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 3.1 | Implement `gap_detection_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 3.2 | Deterministic (rule-based) gap detection pass | ✅ DONE | 🔴 | — |
| 3.3 | LLM-powered gap detection pass via Gemini | ✅ DONE | 🔴 | — |
| 3.4 | Gap merge/dedup logic (`_merge_gaps()`) | ✅ DONE | 🔴 | — |
| 3.5 | Implement `contradiction_detector.py` (rule-based + LLM + grounding filter) | ✅ DONE | 🔴 | — |
| 3.6 | ISO 14001 vs water-audit hardcoded contradiction rule | ✅ DONE | 🔴 | — |
| 3.7 | SA8000 vs working-hours hardcoded contradiction rule | ✅ DONE | 🟡 | — |
| 3.8 | LLM contradiction grounding filter (reject hallucinated sources) | ✅ DONE | 🔴 | — |
| 3.9 | Display title generation (heuristic + Gemini refinement) | ✅ DONE | 🟡 | — |
| 3.10 | Humanized evidence text (replace variable dumps with plain English) | ✅ DONE | 🟡 | — |
| 3.11 | Wire `log_step()` calls for agent trace | ✅ DONE | 🔴 | — |
| 3.12 | Antigravity skill files: `gap_detector/skill.md` + `contradiction_detector/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 4: Financial Impact

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 4.1 | Implement `financial_impact_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 4.2 | Severity-based risk percentage model (CRITICAL=80%, HIGH=50%, etc.) | ✅ DONE | 🔴 | — |
| 4.3 | Buyer jurisdiction mapping (NordStyle→EU, BritMart→UK, etc.) | ✅ DONE | 🔴 | — |
| 4.4 | Per-buyer PKR exposure calculation | ✅ DONE | 🔴 | — |
| 4.5 | Buyer concentration risk metric | ✅ DONE | 🟡 | — |
| 4.6 | LLM-generated executive commentary | ✅ DONE | 🟡 | — |
| 4.7 | Wire `log_step()` calls for agent trace | ✅ DONE | 🔴 | — |
| 4.8 | Antigravity skill file: `financial_impact/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 5: Action Chain

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 5.1 | Implement `action_chain_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 5.2 | Gap ranking by severity × days_remaining (urgency) | ✅ DONE | 🔴 | — |
| 5.3 | PKR impact allocation per action (weighted by severity) | ✅ DONE | 🔴 | — |
| 5.4 | Action title generation (`_action_title()`) | ✅ DONE | 🔴 | — |
| 5.5 | Action description with evidence citations | ✅ DONE | 🟡 | — |
| 5.6 | LLM-generated overall rationale | ✅ DONE | 🟡 | — |
| 5.7 | Wire `log_step()` calls for agent trace | ✅ DONE | 🔴 | — |
| 5.8 | Antigravity skill file: `action_chain_generator/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 6: Execution Simulation

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 6.1 | Implement `execution_agent.py` with `run()` function | ✅ DONE | 🔴 | — |
| 6.2 | Per-action score recalculation with cumulative gap resolution | ✅ DONE | 🔴 | — |
| 6.3 | Real-time `update_compliance_score()` calls (drives mobile animation) | ✅ DONE | 🔴 | — |
| 6.4 | CBAM form generation (`generate_cbam_form()`) | ✅ DONE | 🔴 | — |
| 6.5 | Audit checklist generation (`generate_audit_checklist()`) | ✅ DONE | 🔴 | — |
| 6.6 | Proactive buyer email generation (quarterly status update tone) | ✅ DONE | 🔴 | — |
| 6.7 | Per-action Firestore persistence (`set_doc()` for each action) | ✅ DONE | 🔴 | — |
| 6.8 | 400ms delay between actions for score animation | ✅ DONE | 🟡 | — |
| 6.9 | Final simulation summary (before/after/delta/PKR recovered) | ✅ DONE | 🔴 | — |
| 6.10 | Wire `log_step()` calls for agent trace | ✅ DONE | 🔴 | — |
| 6.11 | Antigravity skill files: `execution_simulator/skill.md` + `document_drafter/skill.md` | ✅ DONE | 🔴 | — |

---

## Agent 7: Recovery Agent

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 7.1 | Implement `recovery_agent.py` | ✅ DONE | 🔴 | — |
| 7.2 | Fallback artifact generation (REMEDIATION_PLAN document) | ✅ DONE | 🔴 | — |
| 7.3 | Injection flag clearing (downstream agents proceed normally) | ✅ DONE | 🔴 | — |
| 7.4 | `_wrap_with_recovery()` in orchestrator | ✅ DONE | 🔴 | — |
| 7.5 | `_fallback_for()` per-agent minimal outputs | ✅ DONE | 🔴 | — |

---

## Orchestrator

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 8.1 | Implement `orchestrator.py` with `build_graph()` | ✅ DONE | 🔴 | — |
| 8.2 | Parallel START → Regulation + Factory Profile | ✅ DONE | 🔴 | — |
| 8.3 | Sequential chain: Gap → Financial → Action → Execution → END | ✅ DONE | 🔴 | — |
| 8.4 | `run_pipeline()` with job progress tracking | ✅ DONE | 🔴 | — |
| 8.5 | Final report persistence to `/factories/{id}/reports/latest` | ✅ DONE | 🔴 | — |
| 8.6 | Post-pipeline score reset (real-world state, not simulated) | ✅ DONE | 🟡 | — |
| 8.7 | Agent trace logging to Firestore | ✅ DONE | 🔴 | — |

---

## Tools

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 9.1 | `gemini_client.py` — 3-tier fallback (Vertex → AI Studio → stub) | ✅ DONE | 🔴 | — |
| 9.2 | `firestore_client.py` — real Firestore + in-memory `_MemStore` | ✅ DONE | 🔴 | — |
| 9.3 | `pdf_parser.py` — PyMuPDF extraction + Gemini structure | ✅ DONE | 🔴 | — |
| 9.4 | `csv_processor.py` — factory export data CSV ingestion | ✅ DONE | 🟡 | — |
| 9.5 | `contradiction_detector.py` — rule + LLM + grounding | ✅ DONE | 🔴 | — |
| 9.6 | `compliance_scorer.py` — 0–100 scoring logic | ✅ DONE | 🔴 | — |
| 9.7 | `document_generator.py` — 3 document types with naming constraints | ✅ DONE | 🔴 | — |
| 9.8 | `agent_logger.py` — JSON log to disk + Firestore trace | ✅ DONE | 🔴 | — |
| 9.9 | `trace_exporter.py` — Antigravity-compatible markdown trace | ✅ DONE | 🔴 | — |

---

## API Endpoints

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 10.1 | `POST /upload` — PDF/CSV multipart ingestion | ✅ DONE | 🔴 | — |
| 10.2 | `POST /analyze` — trigger full pipeline as background task | ✅ DONE | 🔴 | — |
| 10.3 | `GET /status/{job_id}` — poll progress | ✅ DONE | 🔴 | — |
| 10.4 | `GET /report/{factory_id}` — final report | ✅ DONE | 🔴 | — |
| 10.5 | `GET /actions/{factory_id}` — action chain | ✅ DONE | 🔴 | — |
| 10.6 | `POST /simulate/{factory_id}` — run simulation | ✅ DONE | 🔴 | — |
| 10.7 | `GET /documents/{factory_id}` — list generated docs | ✅ DONE | 🔴 | — |
| 10.8 | `POST /failure-test/{job_id}` — inject controlled failure | ✅ DONE | 🔴 | — |

---

## Mobile App

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 11.1 | Expo project setup with navigation (Stack + Tabs) | ✅ DONE | 🔴 | — |
| 11.2 | `HomeScreen` — 3 factory cards + circular score + risk badges | ✅ DONE | 🔴 | — |
| 11.3 | `ComplianceScreen` — gap breakdown + contradiction cards | ✅ DONE | 🔴 | — |
| 11.4 | `ActionCenterScreen` — action items + Simulate button | ✅ DONE | 🔴 | — |
| 11.5 | `DocumentVaultScreen` — generated documents viewer | ✅ DONE | 🔴 | — |
| 11.6 | `BuyerCommsScreen` — auto-drafted buyer emails | ✅ DONE | 🟡 | — |
| 11.7 | `AgentTraceScreen` — live reasoning trace | ✅ DONE | 🔴 | — |
| 11.8 | `UploadScreen` — PDF file upload | ✅ DONE | 🔴 | — |
| 11.9 | `AnalysisProgressScreen` — agent status bar | ✅ DONE | 🔴 | — |
| 11.10 | `HowItWorksScreen` — explainer | ✅ DONE | 🟡 | — |
| 11.11 | `CircularScore` component — animated score ring | ✅ DONE | 🔴 | — |
| 11.12 | `ComplianceScoreCard` component | ✅ DONE | 🔴 | — |
| 11.13 | `ActionItem` component | ✅ DONE | 🔴 | — |
| 11.14 | `RiskBadge` component | ✅ DONE | 🔴 | — |
| 11.15 | `ContradictionAlert` component | ✅ DONE | 🔴 | — |
| 11.16 | `services/api.js` — fetch wrapper for 8 endpoints | ✅ DONE | 🔴 | — |
| 11.17 | `services/firebase.js` — Firestore real-time listeners | ✅ DONE | 🔴 | — |
| 11.18 | Firebase config with real project credentials | ✅ DONE | 🔴 | — |
| 11.19 | Demo factory seed data in `constants/config.js` | ✅ DONE | 🔴 | — |
| 11.20 | Dark theme with proper color system | ✅ DONE | 🟡 | — |

---

## Antigravity Integration

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 12.1 | 8 skill.md files in `.agent/skills/` | ✅ DONE | 🔴 | — |
| 12.2 | `full_compliance_analysis.md` workflow | ✅ DONE | 🔴 | — |
| 12.3 | `daily_regulatory_scan.md` workflow | ✅ DONE | 🔴 | — |
| 12.4 | `trace_exporter.py` for Antigravity-format markdown traces | ✅ DONE | 🔴 | — |

---

## Infrastructure & Deployment

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 13.1 | `Dockerfile` for backend | ✅ DONE | 🔴 | — |
| 13.2 | `requirements.txt` with all dependencies | ✅ DONE | 🔴 | — |
| 13.3 | `.env.example` with documented variables | ✅ DONE | 🔴 | — |
| 13.4 | Firebase project setup (Firestore + Storage) | ✅ DONE | 🔴 | — |
| 13.5 | Service account JSON with Vertex AI + Firestore roles | ✅ DONE | 🔴 | — |
| 13.6 | Deploy backend to Cloud Run | 🔨 IN PROGRESS | 🔴 | 1h |
| 13.7 | Verify Gemini 2.5 Pro Vertex AI access | ⬜ TODO | 🟡 | 30m |
| 13.8 | `.gitignore` for secrets, node_modules, pycache | ✅ DONE | 🔴 | — |

---

## Documentation & Demo Prep

| # | Task | Status | Priority | Est. |
|---|------|--------|----------|------|
| 14.1 | `README.md` — hackathon submission README | ✅ DONE | 🔴 | — |
| 14.2 | `docs/architecture.md` — system architecture | ✅ DONE | 🔴 | — |
| 14.3 | `docs/demo_script.md` — 5-minute judge flow | ✅ DONE | 🔴 | — |
| 14.4 | `docs/agent_trace_example.md` — sample trace | ✅ DONE | 🟡 | — |
| 14.5 | `CLAUDE.md` — AI assistant instructions | ✅ DONE | 🟡 | — |
| 14.6 | Record 90-second backup video | ⬜ TODO | 🔴 | 1h |
| 14.7 | Rehearse failure injection demo flow | ⬜ TODO | 🔴 | 30m |
| 14.8 | Seed 3 factories into Firestore for demo | ⬜ TODO | 🔴 | 30m |
| 14.9 | Test full pipeline end-to-end with real Gemini | ⬜ TODO | 🔴 | 1h |

---

## Summary

| Category | Total Tasks | Done | Remaining |
|---|---|---|---|
| Agent 1: Regulation Ingestion | 12 | 12 | 0 |
| Agent 2: Factory Profile | 10 | 10 | 0 |
| Agent 3: Gap Detection | 12 | 12 | 0 |
| Agent 4: Financial Impact | 8 | 8 | 0 |
| Agent 5: Action Chain | 8 | 8 | 0 |
| Agent 6: Execution Simulation | 11 | 11 | 0 |
| Agent 7: Recovery | 5 | 5 | 0 |
| Orchestrator | 7 | 7 | 0 |
| Tools | 9 | 9 | 0 |
| API Endpoints | 8 | 8 | 0 |
| Mobile App | 20 | 20 | 0 |
| Antigravity Integration | 4 | 4 | 0 |
| Infrastructure | 8 | 7 | **1** |
| Documentation & Demo Prep | 9 | 5 | **4** |
| **TOTAL** | **131** | **126** | **5** |

> **96% complete. 5 tasks remaining — all are deployment, testing, and demo prep.**

---

*Generated May 18, 2026*
