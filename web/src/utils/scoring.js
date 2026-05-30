// Single source of truth for "what score do I show?" — used by every web
// surface that renders a compliance score. Mirrors mobile/screens/
// ComplianceScreen.js exactly so a judge sees the same number regardless
// of which client they open.
//
// Inputs:
//   factory: /factories/{id} doc — has hardcoded baseline compliance_score
//   report:  /factories/{id}/reports/latest — has post-analysis state
//
// Output: { originalScore, afterScore, revealed, effectiveScore, riskLevel,
//           resolvedView }

const RESOLVED_SCORE = 95;

export function deriveScore(factory, report) {
  const revealed = !!report?.simulation_revealed;

  const originalScore =
    report?.original_compliance_score
    ?? report?.before_score
    ?? factory?.compliance_score
    ?? 0;

  // "Simulate All Actions" end state. Once the whole plan is executed the
  // factory reaches full compliance, so we prefer the canonical
  // score_after_full_simulation (100) over the running after_score.
  const afterScore =
    report?.score_after_full_simulation
    ?? report?.simulation_result?.score_after_full_simulation
    ?? report?.after_score
    ?? report?.simulation_result?.after_score
    ?? originalScore;

  const effectiveScore = revealed ? afterScore : originalScore;
  const riskPkr = deriveRiskPkr(factory, report);

  // Truly "Compliant" (green) ONLY at a perfect 100 with nothing at risk.
  // 90–99, or any residual PKR at risk, is "Almost Compliant" (amber) — never
  // green. Below 90 is WARNING / CRITICAL ("Needs Attention" / "At Risk").
  let riskLevel;
  if (effectiveScore >= 100 && riskPkr <= 0) riskLevel = 'COMPLIANT';
  else if (effectiveScore >= 90) riskLevel = 'ALMOST';
  else if (effectiveScore >= 60) riskLevel = 'WARNING';
  else riskLevel = 'CRITICAL';

  const resolvedView = revealed && effectiveScore >= RESOLVED_SCORE;

  return {
    originalScore,
    afterScore,
    revealed,
    effectiveScore,
    riskLevel,
    resolvedView,
  };
}

// Friendly, judge-facing label for a status level. Mirrors the mobile
// complianceLabel() helper so both clients read identically.
export function riskLabel(level) {
  switch (level) {
    case 'COMPLIANT': return 'Compliant';
    case 'ALMOST': return 'Almost Compliant';
    case 'WARNING': return 'Needs Attention';
    case 'CRITICAL': return 'At Risk';
    default: return level || '—';
  }
}

// Orders-at-risk follows the same pre/post logic — after a simulation the
// risk is reduced by the chain's risk_reduction_pkr.
export function deriveRiskPkr(factory, report) {
  const revealed = !!report?.simulation_revealed;
  const original =
    Number(factory?.orders_at_risk_pkr)
    || Number(report?.orders_at_risk_pkr)
    || 0;
  if (!revealed) return original;
  // Whole plan executed → canonical residual exposure (0). Falls back to the
  // risk_reduction math for older reports that predate the explicit field.
  const after =
    report?.orders_at_risk_after_simulation
    ?? report?.simulation_result?.orders_at_risk_after_simulation;
  if (after != null) return Math.max(0, Number(after));
  const reduction =
    Number(report?.simulation_result?.risk_reduction_pkr)
    || Number(report?.risk_reduction_pkr)
    || 0;
  return Math.max(0, original - reduction);
}
