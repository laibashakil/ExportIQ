# Example agent trace — Faisal Weave Industries

Captured during a real run of the pipeline against
`fwi_fsd_001` + `eu_cbam` + `uk_modern_slavery` +
`eu_supply_chain_directive`. Pulled from `/jobs/{job_id}.agent_trace[]` in
Firestore.

```json
[
  {"agent": "orchestrator", "step": "pipeline_start",
   "detail": {"factory_id": "fwi_fsd_001",
              "regulation_ids": ["eu_cbam", "uk_modern_slavery", "eu_supply_chain_directive"]}},

  {"agent": "regulation_ingestion", "step": "started",
   "detail": {"regulation_ids": ["eu_cbam", "uk_modern_slavery", "eu_supply_chain_directive"]}},
  {"agent": "regulation_ingestion", "step": "parsed_regulation",
   "detail": {"regulation_id": "eu_cbam", "rule_count": 2}},
  {"agent": "regulation_ingestion", "step": "parsed_regulation",
   "detail": {"regulation_id": "uk_modern_slavery", "rule_count": 2}},
  {"agent": "regulation_ingestion", "step": "parsed_regulation",
   "detail": {"regulation_id": "eu_supply_chain_directive", "rule_count": 4}},
  {"agent": "regulation_ingestion", "step": "complete",
   "detail": {"total_rules": 8}},

  {"agent": "factory_profile", "step": "started",
   "detail": {"factory_id": "fwi_fsd_001"}},
  {"agent": "factory_profile", "step": "loaded_profile",
   "detail": {"factory_name": "Faisal Weave Industries",
              "certifications": 4, "claims": 4, "evidence_items": 5}},

  {"agent": "gap_detection", "step": "deterministic_pass",
   "detail": {"gaps_found": 5}},
  {"agent": "gap_detection", "step": "llm_pass",
   "detail": {"gaps_found": 1}},
  {"agent": "gap_detection", "step": "contradictions_detected",
   "detail": {"count": 2,
              "first": {
                "claim": "Factory is ISO 14001 compliant — effluent fully within legal limits",
                "evidence": "water_effluent_discharge = 12.0 ppm (water_audit_march25.pdf)",
                "source_a": "faisal_weave_self_report_q1_2026.csv",
                "source_b": "water_audit_march25.pdf",
                "confidence": 0.91,
                "impact": "ISO 14001 mandates effluent control; the audit value contradicts the claim."}}},

  {"agent": "financial_impact", "step": "complete",
   "detail": {"orders_at_risk_pkr": 3245000000,
              "buyers_affected": ["NordStyle Group", "BritMart Retail", "EuroThread SA", "Tesco"]}},

  {"agent": "action_chain", "step": "complete",
   "detail": {"action_count": 5, "total_impact_pkr": 3120000000}},
  {"agent": "action_chain", "step": "rationale",
   "detail": "These 5 actions target the highest-severity, soonest-deadline gaps first…"},

  {"agent": "execution_simulation", "step": "initial_score",
   "detail": {"score": 22, "risk_pkr": 3245000000}},
  {"agent": "execution_simulation", "step": "simulated_action",
   "detail": {"title": "Renew SA8000 certification",
              "score_delta": 18, "risk_reduction_pkr": 1200000000}},
  {"agent": "execution_simulation", "step": "simulated_action",
   "detail": {"title": "File EU CBAM: File quarterly CBAM declaration covering embedded emissions…",
              "score_delta": 18, "risk_reduction_pkr": 900000000}},
  {"agent": "execution_simulation", "step": "complete",
   "detail": {"final_score": 71, "risk_reduction_pkr": 3120000000}},

  {"agent": "orchestrator", "step": "pipeline_complete",
   "detail": {"compliance_score": 71}}
]
```

## Failure-injection trace (recovery_agent path)

```json
[
  {"agent": "demo_controller", "step": "failure_injection_requested",
   "detail": {"target_agent": "execution_simulation", "failure_type": "api_timeout",
              "recovery_job": "job_abc123_recovery"}},

  {"agent": "execution_simulation", "step": "injected_failure",
   "detail": {"kind": "api_timeout"}},
  {"agent": "execution_simulation", "step": "exception",
   "detail": {"error": "injected failure (api_timeout) in execution_simulation",
              "trace": "…"}},

  {"agent": "recovery", "step": "activated",
   "detail": {"failed_agent": "execution_simulation", "failure_type": "api_timeout"}},
  {"agent": "recovery", "step": "fallback_artifact_generated",
   "detail": {"document_id": "fallback_execution_simulation"}}
]
```
