# Demo script — judge-facing 5-minute flow

This is the exact sequence to run during the live judge demo. Have both the
mobile phone (Expo Go) AND the laptop (Antigravity Manager view) on screen.

## Setup (before judges arrive)

1. Backend running on Cloud Run (or `uvicorn main:app --reload --port 8080` locally).
2. Firebase Firestore reachable (or in-memory fallback ready).
3. Mobile app running in Expo Go via QR scan.
4. Antigravity Manager view open in laptop browser; 6 agents visible.
5. Have a `/failure-test` curl ready to paste:
   ```bash
   curl -X POST https://YOUR-CLOUD-RUN/failure-test/$JOB_ID \
     -H "Content-Type: application/json" \
     -d '{"agent": "execution_simulation", "failure_type": "api_timeout"}'
   ```

## Timeline

| Time  | Action |
|------:|--------|
| 0:00  | Open mobile app. HomeScreen shows 3 seeded factories plus a 4th "New Factory (Demo Upload)" empty card — Faisal Weave Industries (43, RED), Chenab Fabric Works (78, AMBER), Ravi Garments Ltd (91, GREEN), and the upload-demo card. |
| 0:20  | Tap **Faisal Weave Industries**. ComplianceScreen opens: score card shows 43/100 in red, PKR 340M at risk, 4 gaps + 1 contradiction visible. |
| 0:40  | Scroll to the contradiction card: "Factory claims ISO 14001 compliance" vs "water_effluent_discharge = 12 ppm" — sources `faisal_weave_self_report_q1_2026.csv` and `water_audit_march25.pdf` cited. |
| 1:00  | Switch to laptop. Antigravity Manager view: 6 agents visible, each with its Skill markdown. Point out the parallel start (Regulation + Factory Profile) and the recovery wiring. |
| 1:30  | Back to mobile. Tap **Run Full Analysis** on Faisal Weave Industries. AgentTraceScreen shows reasoning streaming in: regulation_ingestion → factory_profile → gap_detection (with deterministic_pass + llm_pass + contradictions_detected) → financial_impact → action_chain. |
| 2:30  | Analysis completes. ActionCenter shows 5 prioritised actions: #1 Renew SA8000, #2 File CBAM Declaration, #3 Remediate water effluent, #4 Reduce overtime hours, #5 Publish CSDDD narrative. |
| 2:50  | Tap **Simulate** on #1 (Renew SA8000). HomeScreen score animates 43 → 51, risk drops PKR 340M → ~220M. Tap #2 → 51 → 65. |
| 3:10  | Tap **Simulate all** → score climbs to ~71, risk down to ~60M. Documents tab now lists 9-12 artifacts (3 buyer emails, 1 CBAM form, 5 checklists). |
| 3:30  | **FAILURE INJECTION**. Run the curl above. Switch to laptop — `execution_simulation` shows ERROR, recovery_agent activates with a `REMEDIATION_PLAN` artifact. Pipeline continues; mobile updates resume. |
| 4:00  | Open DocumentVault: tap the auto-drafted BritMart Retail buyer email — markdown opens in-app, professional tone, names the gap + timeline + ask. |
| 4:20  | Open AgentTrace one more time: scroll through full reasoning chain. Point out the contradiction-detection log entries citing source filenames by name. |
| 4:40  | Close: "15 million jobs depend on Pakistan's textile exports. One missed EU CBAM filing ends hundreds of them. ExportIQ catches the gap, calculates the rupee cost, drafts the recovery action, and shows the factory exactly which document to file — in 90 seconds, not 90 days." |

## Backup video script (90 seconds)

Same flow, condensed:

1. 0-15s: HomeScreen → 3 factories, traffic-light scores.
2. 15-35s: Faisal Weave Industries → contradiction card + 4 gaps.
3. 35-60s: Run Analysis → AgentTrace streams → ActionCenter populated.
4. 60-80s: Simulate all → score 43→71, risk drops, documents appear.
5. 80-90s: Tagline.

## Failure modes during demo

| Symptom | Fix |
|---|---|
| Mobile shows old score after analysis | Pull-to-refresh HomeScreen; the listener re-attaches. |
| `/analyze` returns 500 | Backend logs will show which agent threw. The recovery flow will still produce SOMETHING — narrate it. |
| Antigravity Manager view doesn't update | Check Firestore write permissions on the service account; trace logs need write access to `/jobs/{id}`. |
| Gemini quota exhausted | Set `GEMINI_API_KEY` env var to your AI Studio key; restart backend. |
