"""Content quality checks for fwi_fsd_001 — Step 7 of QA pass."""
import json
import re
import sys
import urllib.request

BASE = "http://localhost:8000"
FID = "fwi_fsd_001"


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=15) as r:
        return json.loads(r.read().decode())


report = get(f"/report/{FID}")
docs = get(f"/documents/{FID}").get("documents", [])

failures = []
def fail(check, reason):
    failures.append((check, reason))
    print(f"  FAIL {check}: {reason}")


print("=" * 70)
print("GAP TITLES")
print("=" * 70)
for g in report.get("gaps", []):
    title = g.get("display_title") or ""
    print(f"  - '{title}' (status={g.get('status')}, reg={g.get('regulation')})")
    if not title:
        fail("gap.display_title", f"empty for gap_id={g.get('gap_id')}")
        continue
    # Mid-sentence trailing words
    lower = title.lower().rstrip(" .")
    if lower.endswith((" must", " must be", " must have", " minimum of",
                        " the", " a", " an", " of", " to", " for")):
        fail("gap.display_title", f"ends mid-sentence: '{title}'")
    if re.search(r"\bmust\s+(be|have)\b", title.lower()):
        fail("gap.display_title", f"contains 'must be/have': '{title}'")
    if re.search(r"minimum of", title.lower()):
        fail("gap.display_title", f"contains 'Minimum of': '{title}'")
    # Raw variable names like snake_case_thing
    if re.search(r"\b[a-z][a-z0-9]*_[a-z0-9_]+\b", title):
        fail("gap.display_title", f"contains raw variable name: '{title}'")
    if title.strip().lower() == "regulation":
        fail("gap.display_title", f"is just 'Regulation': '{title}'")

print()
print("=" * 70)
print("CONTRADICTIONS — evidence_text")
print("=" * 70)
for c in report.get("contradictions", []):
    ev = c.get("evidence_text") or c.get("evidence") or ""
    print(f"  - '{ev}'")
    if not ev:
        fail("contradiction.evidence_text", "empty")
        continue
    if re.search(r"\b[a-z][a-z0-9]*_[a-z0-9_]+\s*=", ev.lower()):
        fail("contradiction.evidence_text", f"variable_name = ... : '{ev}'")
    if ".pdf)" in ev.lower():
        fail("contradiction.evidence_text", f"contains '.pdf)': '{ev}'")
    # Python variable syntax (snake_case + assignment, or trailing snake_case)
    if re.search(r"\b[a-z]+_[a-z]+\b\s*[=:]", ev):
        fail("contradiction.evidence_text", f"python var syntax: '{ev}'")

print()
print("=" * 70)
print("BUYER EMAILS — body forbidden words")
print("=" * 70)
forbidden_email = ["gap", "problem", "missing", "non-compliant", "violation",
                    "failure", "deficiency", "shortfall", "concern",
                    "acknowledge", "apologize"]
emails = [d for d in docs if (d.get("kind") or d.get("type")) == "BUYER_EMAIL"]
print(f"Found {len(emails)} BUYER_EMAIL docs")
for em in emails:
    subj = em.get("subject") or em.get("title") or ""
    body = (em.get("body") or "").lower()
    print(f"  - Subject: '{subj}'")
    hits = [w for w in forbidden_email if re.search(r"\b" + re.escape(w) + r"\b", body)]
    if hits:
        fail(f"buyer_email", f"subject='{subj}' body contains forbidden: {hits}")

print()
print("=" * 70)
print("ACTION DESCRIPTIONS")
print("=" * 70)
for a in report.get("action_chain", []):
    title = a.get("title") or ""
    desc = a.get("description") or ""
    print(f"  - title='{title}'")
    print(f"    desc='{desc[:200]}'")
    if re.search(r"close gap on", desc.lower()):
        fail("action.description", f"contains 'Close gap on': '{title}'")
    if re.search(r"current status\s*:", desc.lower()):
        fail("action.description", f"contains 'Current status:': '{title}'")
    if re.search(r"severity\s*:", desc.lower()):
        fail("action.description", f"contains 'Severity:': '{title}'")
    # Raw regulation codes as first words: e.g. "CSDDD-..." or all-caps acronym kicker
    first_words = desc.split(maxsplit=2)[:2]
    if first_words and re.fullmatch(r"[A-Z]{3,}(-[A-Z0-9]+)+", first_words[0]):
        fail("action.description", f"raw reg code as first word: '{first_words[0]}'")

print()
print("=" * 70)
n = len(failures)
print(f"SUMMARY: {n} failure(s)")
if n:
    print("\nFAILURES:")
    for c, r in failures:
        print(f"  - {c}: {r}")
sys.exit(1 if n else 0)
