"""Poll multiple jobs until all complete or timeout. Print final summary."""
import sys
import time
import json
import urllib.request

JOBS = sys.argv[1:]
DEADLINE = time.time() + 300


def status(jid):
    try:
        with urllib.request.urlopen(f"http://localhost:8000/status/{jid}", timeout=5) as r:
            return json.loads(r.read().decode())
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def report(fid):
    try:
        with urllib.request.urlopen(f"http://localhost:8000/report/{fid}", timeout=5) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


while time.time() < DEADLINE:
    states = [status(j) for j in JOBS]
    summary = [(j, s.get("status"), s.get("progress"), s.get("current_agent")) for j, s in zip(JOBS, states)]
    print(time.strftime("%H:%M:%S"), summary, flush=True)
    if all(s.get("status") == "complete" for s in states):
        print("ALL_COMPLETE")
        break
    if any(s.get("status") == "failed" for s in states):
        print("SOMETHING_FAILED")
        break
    time.sleep(5)

# Final summary
for j, s in zip(JOBS, states):
    fid = s.get("factory_id") or "?"
    r = report(fid) if fid != "?" else None
    if r:
        print(f"{j} fid={fid} score={r.get('compliance_score')} gaps={len(r.get('gaps',[]))} contras={len(r.get('contradictions',[]))} actions={len(r.get('action_chain',[]))}")
    else:
        print(f"{j} status={s.get('status')} (no report fetched, fid={fid})")
