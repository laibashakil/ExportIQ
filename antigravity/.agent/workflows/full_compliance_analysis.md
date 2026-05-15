# Workflow: Full Compliance Analysis

End-to-end pipeline that runs the 6 ExportIQ agents over a single factory.
This is the workflow the mobile app triggers when a user taps **Run Full
Analysis** on the home screen.

## Trigger
- API: `POST /analyze` with `{ factory_id, regulation_ids[] }`
- Mobile button: HomeScreen → "Run Full Analysis"

## Steps

1. **Parallel ingestion**
   - Skill `regulation_parser` parses each `regulation_id`.
   - Skill `factory_profile` builds the canonical factory profile.
   - Both write progress to `/jobs/{job_id}`.

2. **Gap Detection**
   - Skill `gap_detector` runs against the two outputs.
   - Skill `contradiction_detector` runs inside it — guarantees ≥1 contradiction
     for the demo factory.

3. **Financial Impact**
   - Skill `financial_impact` converts gaps → PKR risk per buyer.

4. **Action Chain**
   - Skill `action_chain_generator` selects top 3-5 gaps and emits one action
     each, with deadlines and impact estimates.

5. **Execution Simulation**
   - Skill `execution_simulator` simulates each action sequentially.
   - For each action, calls Skill `document_drafter` to produce supporting
     artifacts (buyer email, CBAM form, audit checklist).
   - Streams compliance-score updates to Firestore in real time — the mobile
     home screen animates the score climbing as each action ticks.

## Failure handling
Any skill throwing routes to the recovery agent, which produces a fallback
artifact (e.g. manual booking template instead of CertVerify API call). The
pipeline then continues with a minimal output for the failed agent so
downstream agents still produce useful work.

## Outputs
- Firestore document `/factories/{factory_id}/reports/latest` with the full
  `FactoryComplianceReport`.
- Firestore document `/jobs/{job_id}` with status + `agent_trace[]`.
- Document set under `report.documents`.

## Expected duration
60-90 seconds end-to-end on Vertex AI Gemini 2.5 Pro (90-95% spent in LLM
calls). Stub mode runs in ~5 seconds.
