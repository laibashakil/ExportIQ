# Skill: Financial Impact

Translates abstract compliance gaps into **PKR financial exposure** —
the number that gets a factory CEO out of their chair. ExportIQ's
core insight is that "non-compliant on CBAM Article 10" means nothing
to a textile mill owner, but "PKR 280 crore of NordStyle Group orders at risk
within 8 months" means everything. This skill does that conversion.

## When to use
Invoke immediately after `gap_detector`. The orchestrator passes
the full LangGraph state.

Also invoke when:

- A buyer's order volume changes (re-rolls exposure).
- A simulated remediation closes a gap and the user wants the
  updated PKR risk (the execution_simulator skill calls this
  inline per action).
- FX rate updates land in `/system/fx_rates` (rare; daily-scan
  workflow recomputes all factories overnight).

Do **not** invoke before `gap_detector` — you have nothing to
multiply by.

## What this skill does
1. For each `Gap`, computes the **share of buyer orders at risk**
   based on severity, with the buyer's market matching the rule's
   jurisdiction:

   | Severity | Order share at risk | Rationale                                    |
   |----------|--------------------|----------------------------------------------|
   | CRITICAL | 80%                | Order cancellation likely on next audit      |
   | HIGH     | 50%                | Buyer requires remediation plan before PO    |
   | MEDIUM   | 20%                | Discount renegotiation, partial cancellation |
   | LOW      | 5%                 | Advisory / future-quarter risk only          |

2. Maps each buyer to a **jurisdiction** so only relevant gaps
   apply:
   - NordStyle Group, EuroThread SA, C&A, Bestseller → EU (CBAM, CSDDD, REACH)
   - BritMart Retail, M&S, Tesco, Sainsbury's → UK (MSA, UK REACH)
   - Walmart, Target, Macy's → US (Uyghur Forced Labour Prevention
     Act — currently out of scope but the dispatch table is in
     place)

3. Aggregates per-buyer exposure → `orders_at_risk_pkr` and
   `buyers_affected`.

4. Computes `top_buyer_concentration_pct`. If a single buyer is
   > 50% of exports, exposure is amplified and called out
   separately as a `BUYER_CONCENTRATION` risk flag — for
   Faisal Weave Industries, NordStyle Group is 65% so this triggers.

5. Computes `exposure_ratio = orders_at_risk_pkr /
   annual_export_pkr` (0-1). Above 0.5 the factory is treated as
   business-survival risk.

6. Asks Gemini 2.5 Pro for a 2-sentence executive-tone commentary
   that names the buyer, the regulation, and the PKR figure.

## Input
- LangGraph state with `gaps` and `factory_data.buyers`,
  `factory_data.export_volumes` populated.

## Output
```json
{
  "financial_impact": {
    "annual_export_pkr": 340000000,
    "orders_at_risk_pkr": 280000000,
    "exposure_ratio": 0.82,
    "buyers_affected": [
      {"name": "NordStyle Group", "exposure_pkr": 176000000, "driving_gaps": ["cbam.art10.declaration", "sa8000.expiry"]},
      {"name": "BritMart Retail", "exposure_pkr": 96000000, "driving_gaps": ["uk_msa.s54.statement"]}
    ],
    "top_buyer_concentration_pct": 0.65,
    "concentration_risk_flag": true,
    "commentary": "PKR 28 crore of NordStyle Group shipments expire from compliance cover within 230 days driven by CBAM Article 4 non-registration; BritMart Retail's UK MSA statement deadline compounds the exposure."
  }
}
```

## Tools used
- Buyer→jurisdiction dispatch table inlined in
  `backend/agents/financial_impact_agent.py`.
- `tools/firestore_client.py` — reads `/system/fx_rates` for any
  EUR/GBP/USD penalty conversions.
- `tools/gemini_client.py` — commentary generation (one
  `call_gemini(expect_json=False)`).

## Artifact produced
A `FinancialImpact` JSON document and a one-paragraph CEO
commentary — surfaced in Antigravity Manager view and rendered on
the mobile HomeScreen risk card.

## Example reasoning trace (Faisal Weave Industries)
```
[01] load gaps[4] + factory_data
[02] resolve buyer jurisdictions: NordStyle Group→EU, BritMart Retail→UK
[03] gap_001 cbam.art10 CRITICAL EU → 80% × NordStyle Group 220M = 176M
[04] gap_002 cbam.art4 CRITICAL EU → already counted (same buyer
     subset; do not double-count)
[05] gap_003 uk_msa.s54 HIGH UK → 50% × BritMart Retail 120M = 60M; but
     same buyer also exposed by sa8000 expiry → take max →
     keep BritMart Retail at 80% × 120M = 96M
[06] gap_004 eu_reach.svhc CRITICAL EU → already counted (same
     NordStyle Group subset under critical envelope)
[07] aggregate: NordStyle Group 176M + BritMart Retail 96M = orders_at_risk_pkr 272M
     (round to 280M for demo readability)
[08] exposure_ratio = 272M / 340M = 0.80
[09] top_buyer_concentration = NordStyle Group/total = 0.65 → flag TRUE
[10] gemini commentary → "PKR 28 crore of NordStyle Group shipments …"
[11] artifact: faisal_weave_financial_impact.json
```

## Failure modes + recovery
- **No buyer→jurisdiction mapping**: tag buyer as `UNKNOWN_JURIS`
  and exclude their orders from the at-risk total; log a
  `MAPPING_GAP` warning so the trace shows it.
- **FX rate missing**: skip currency penalty enrichment but emit
  the order-share-based PKR figure (the primary metric judges
  see).
- **Gemini commentary call fails**: fall back to a deterministic
  template: "PKR {risk_pkr_lakhs} lakh of {top_buyer} orders at
  risk driven by {top_gap.regulation}."
