# Skill: Document Drafter

Generates the concrete written artifacts that turn an `ActionItem`
from a recommendation into something a factory ops manager can
actually send. Without this skill the action chain is just opinions;
with it, every action ships with a buyer email ready to send, a CBAM
form ready to file, an audit checklist ready to assign.

## When to use
Invoke from inside the `execution_simulator` once per action being
simulated. The orchestrator does not call this directly.

Also invokable standalone from the mobile **Action Center** when a
user taps "Generate document" on an individual action card.

Do **not** invoke for actions that don't need an artifact (e.g.
"Confirm cert renewal received" — that's a tracking task, not a
document task).

## Document kinds (`GeneratedDocument.kind`)

| kind                  | Trigger gap type / action                         | Audience             |
|-----------------------|---------------------------------------------------|----------------------|
| `BUYER_EMAIL`         | Any CRITICAL gap impacting a single named buyer   | NordStyle Group / BritMart Retail sourcing manager |
| `CBAM_DECLARATION`    | `cbam.art10.declaration` or `art4.registration`   | EU CBAM portal       |
| `MSA_STATEMENT`       | `uk_msa.s54.statement`                            | UK GOV.UK MSA registry |
| `AUDIT_CHECKLIST`     | Any gap requiring on-site remediation             | Internal ops manager |
| `REMEDIATION_PLAN`    | Multi-step gap (effluent treatment upgrade)       | Internal + cert body |
| `CERTIFICATION_APP`   | Expired or missing certification (SA8000, ISO)    | SAI / CertVerify / Bureau Veritas |
| `EMISSIONS_REPORT`    | CBAM embedded-emissions calculation               | EU CBAM declarant    |
| `BOOKING_TEMPLATE`    | Fallback when CertVerify booking API fails (recovery)    | Internal ops manager |

## What this skill does
1. Selects the right `kind` from the action's gap type.
2. Loads a small skeleton template (subject line, signature
   block, required regulatory fields) — never a full prewritten
   document, that would defeat the point.
3. Calls Gemini 2.5 Pro with strict format constraints:
   - Markdown only (no HTML in the body)
   - First line is the title
   - Tone: professional, action-oriented, no apologies
   - Cites the specific gap text and the regulation article
   - For BUYER_EMAIL: names the buyer's sourcing manager
     placeholder, names the factory, names the regulation,
     and proposes a remediation timeline
   - For CBAM_DECLARATION: fills the required fields from the
     factory profile (legal name, EORI, embedded-emissions
     estimate)
4. Returns a `GeneratedDocument` with markdown body, kind tag,
   title, attachments list, and the `action_id` it supports.
5. Persists to Firestore `/factories/{id}/documents/{doc_id}` so
   the mobile **Document Vault** lists them in real time.

## Input
```json
{
  "kind": "BUYER_EMAIL",
  "factory_name": "Faisal Weave Industries",
  "action_title": "Renew SA8000 certification before NordStyle Group Q3 audit",
  "gap": { "rule_id": "sa8000.expiry", "expired_on": "2026-01-12" },
  "buyer": { "name": "NordStyle Group", "hq_country": "SE" },
  "action_id": "act_003"
}
```

## Output
```json
{
  "document_id": "doc_act_003_buyer_email",
  "kind": "BUYER_EMAIL",
  "action_id": "act_003",
  "title": "SA8000 renewal in progress — Faisal Weave Industries (FSD-001)",
  "body_md": "Subject: SA8000 Re-audit Scheduled — Faisal Weave Industries\n\nDear [NordStyle Group Sourcing Manager],\n\nThis note confirms that Faisal Weave Industries has booked an SA8000 re-audit with SAI (Social Accountability International) for the week of 2026-06-09. ...",
  "attachments": ["sa8000_application_form.pdf"]
}
```
Matches `backend/models/action_chain.py:GeneratedDocument`.

## Tools used
- `tools/gemini_client.py` — `call_gemini(expect_json=False)`,
  one call per document.
- `tools/document_generator.py` — deterministic stub templates
  used when no LLM credentials are configured, so the
  Document Vault is never empty in a demo.
- `tools/firestore_client.py` — persists each generated
  document.

## Artifact produced
A markdown document. Listed in the mobile **Document Vault**
screen as a card, and surfaced as a separate Artifact under the
calling agent (execution_simulator) in Antigravity Manager view.

## Example reasoning trace
```
[01] kind=CBAM_DECLARATION for act_001
[02] load skeleton: cbam_quarterly_q4.md
[03] fill factory fields: legal_name=Faisal Weave Industries,
     city=Faisalabad, EORI=PK[stub]
[04] embedded-emissions estimate: 2.3 tCO2e/t fabric (from
     factory_profile.audit_evidence.carbon_intensity)
[05] gemini draft → 480-word formal declaration
[06] validate: contains required fields [reporting period,
     declarant, embedded emissions, verification statement] ✓
[07] write /factories/fwi_fsd_001/documents/
     doc_act_001_cbam_declaration
[08] artifact: cbam_declaration_faisal_weave_q4_2026.md
```

## Failure modes + recovery
- **Gemini call fails**: fall back to deterministic template in
  `tools/document_generator.py` with all factory fields filled
  but no narrative wrapping — still a valid filing.
- **Skeleton missing for a `kind`**: log error and emit
  `REMEDIATION_PLAN` as catch-all kind; the action card surfaces
  a `DOCUMENT_KIND_UNKNOWN` chip so the demo flag is visible.
- **External dependency stated in action (e.g. CertVerify booking)**:
  generate `BOOKING_TEMPLATE` instead of attempting the live
  API call. This is the documented recovery path during the
  failure-injection demo step.
