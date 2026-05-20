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

  const afterScore =
    report?.after_score
    ?? report?.simulation_result?.after_score
    ?? originalScore;

  const effectiveScore = revealed ? afterScore : originalScore;

  let riskLevel;
  if (effectiveScore >= 85) riskLevel = 'COMPLIANT';
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

// Orders-at-risk follows the same pre/post logic — after a simulation the
// risk is reduced by the chain's risk_reduction_pkr.
export function deriveRiskPkr(factory, report) {
  const revealed = !!report?.simulation_revealed;
  const original =
    Number(factory?.orders_at_risk_pkr)
    || Number(report?.orders_at_risk_pkr)
    || 0;
  if (!revealed) return original;
  const reduction =
    Number(report?.simulation_result?.risk_reduction_pkr)
    || Number(report?.risk_reduction_pkr)
    || 0;
  return Math.max(0, original - reduction);
}
