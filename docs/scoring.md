# Compliance Scoring — Developer Reference

> Source of truth for how the 0–100 compliance score and risk bands actually
> work **today**, verified against the code. Use this for dev review before
> changing scoring or writing any user-facing "how your score is calculated"
> copy — the product spec's proposed numbers do **not** all match the code
> (see [§5 Spec vs. actual](#5-spec-vs-actual)).

---

## 1. The model

Every factory starts at **100**. Points are subtracted for each detected gap
(weighted by severity) and for each document contradiction. The result is
clamped to `[0, 100]`.

```
score = 100
        − Σ severity_penalty(gap)        for every gap
        − contradiction_penalty × n_contradictions
score = max(0, min(100, score))
```

Implemented in `backend/tools/compliance_scorer.py → score()`.

## 2. Penalty weights (actual)

From `SEVERITY_PENALTY` / `CONTRADICTION_PENALTY` in `compliance_scorer.py`:

| Item | Weight | Notes |
|---|---|---|
| Critical gap | **−12** | e.g. missing CBAM registration |
| High severity gap | **−10** | e.g. SA8000 expired |
| Medium severity gap | **−5** | e.g. supply-chain mapping incomplete |
| Low severity gap | **−2** | e.g. advisory not addressed |
| Document contradiction | **−4** | per contradiction (e.g. ISO claim vs audit data) |
| Unknown severity | −5 | fallback when `severity` is not one of the four above |

There is **no separate "missing evidence" penalty**. A missing certificate is
just a gap, scored by its own severity.

## 3. Risk bands — there are TWO systems

### 3a. Backend `risk_level()` (compliance_scorer.py)
Used only to populate the stored `risk_level` field on `/factories/{id}`.

| Score | Level |
|---|---|
| `< 60` | `CRITICAL` |
| `60–79` | `WARNING` |
| `>= 80` | `COMPLIANT` |

### 3b. UI banding (`web/src/utils/scoring.js → deriveScore`, `mobile/services/format.js → complianceLevel`)
This is what the **gauge and labels the user sees** are derived from. The UI
ignores the stored `risk_level` and recomputes its own from score + PKR-at-risk:

| Condition | Level | User-facing label | Colour intent |
|---|---|---|---|
| `score === 100 && riskPkr === 0` | `COMPLIANT` | "Compliant" | green |
| `score >= 90` | `ALMOST` | "Almost Compliant" | amber |
| `score >= 60` | `WARNING` | "Needs Attention" | amber/orange |
| `score < 60` | `CRITICAL` | "At Risk" | red |

> ⚠️ **Known inconsistency:** the backend calls `>= 80` "COMPLIANT" while the UI
> only calls a perfect `100` (with zero PKR at risk) "Compliant" and treats
> `90–99` as "Almost Compliant". Ravi Garments (91) therefore shows amber
> "Almost Compliant", not green. The UI banding is the one users experience.

## 4. Simulation ("what raises the score")

`simulate_close()` / `score_after_actions()` recompute the score assuming a set
of `gap_id`s are resolved:

- Fixing a gap restores its full deducted points.
- Resolving a contradiction restores **4** points.
- When **all** gaps are resolved the score is capped at exactly **100**
  (`FULL_COMPLIANCE_SCORE`) — the residual contradiction penalty is dropped so
  it doesn't strand the score at e.g. 92. This is "complete the whole action
  plan → 100", **not** "complete only the critical actions → 100".

The mobile/web "Simulate" UI surfaces the projected score per action so the
user can see which fix has the biggest impact before committing.

## 5. Spec vs. actual

The product spec for the "How Your Score Is Calculated" UI proposed different
numbers. Recorded here so a dev can decide whether to (a) keep the code and fix
the copy, or (b) change the code to match the spec (which **shifts the tuned
demo scores 43 / 78 / 91**).

| Item | Spec proposed | Actual code |
|---|---|---|
| Critical gap | −20 | **−12** |
| High gap | −10 | −10 ✓ |
| Medium gap | −5 | −5 ✓ |
| Low gap | −2 | −2 ✓ |
| Contradiction | −8 | **−4** |
| "Missing evidence" | −3 | **no such penalty** |
| Bands | 90–100 / 70–89 / 40–69 / 0–39 | 100 / 90–99 / 60–89 / 0–59 (UI) |
| Band labels | COMPLIANT / ALMOST / NEEDS ATTENTION / CRITICAL | Compliant / Almost Compliant / Needs Attention / At Risk |
| "All critical actions → 100" | — | all **gaps** resolved → 100 |
| "Contradiction → buyer notification requirement" | — | not enforced; buyer emails are generated as part of the action plan |

**Accurate parts of the spec:** the ISO 14001 vs 12 ppm (limit 8 ppm)
contradiction example (matches `mock_data/factories/fwi_fsd_001.json`), and the
description of the Simulate feature.

## 6. File map

| Concern | File |
|---|---|
| Penalty weights, bands, simulation | `backend/tools/compliance_scorer.py` |
| Gap severities assigned | `backend/agents/gap_detection_agent.py` |
| Contradiction detection (count feeds the penalty) | `backend/tools/contradiction_detector.py` |
| UI banding + labels (web) | `web/src/utils/scoring.js` |
| UI banding + labels (mobile) | `mobile/services/format.js` |
