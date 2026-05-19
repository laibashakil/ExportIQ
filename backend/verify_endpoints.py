"""Hit every documented endpoint, print pass/fail table."""
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

BASE = "http://localhost:8000"
results = []


def hit(method, path, *, json_body=None, multipart=None, expect=200, label=None):
    url = BASE + path
    started = time.time()
    code = "?"
    body_snippet = ""
    try:
        if multipart is not None:
            # build multipart manually
            import io, uuid
            boundary = "----exportiq-" + uuid.uuid4().hex
            parts = []
            for k, v in multipart.items():
                if isinstance(v, tuple):
                    filename, content, ctype = v
                    parts.append(
                        f"--{boundary}\r\n"
                        f"Content-Disposition: form-data; name=\"{k}\"; filename=\"{filename}\"\r\n"
                        f"Content-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n"
                    )
                else:
                    parts.append(
                        f"--{boundary}\r\n"
                        f"Content-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
                    )
            parts.append(f"--{boundary}--\r\n".encode())
            data = b"".join(parts)
            req = urllib.request.Request(url, data=data, method=method,
                                          headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        elif json_body is not None:
            data = json.dumps(json_body).encode()
            req = urllib.request.Request(url, data=data, method=method,
                                          headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url, method=method)
        with urllib.request.urlopen(req, timeout=60) as r:
            code = r.status
            full_body = r.read().decode(errors="replace")
            body_snippet = full_body
    except urllib.error.HTTPError as e:
        code = e.code
        body_snippet = e.read(200).decode(errors="replace") if e.fp else ""
    except Exception as e:
        code = f"ERR:{type(e).__name__}"
        body_snippet = str(e)[:200]
    elapsed_ms = int((time.time() - started) * 1000)
    ok = code == expect
    results.append((label or f"{method} {path}", code, elapsed_ms, "PASS" if ok else "FAIL", body_snippet[:200]))
    return body_snippet, code


# 1. GET /
hit("GET", "/")
# 2. GET /healthz
hit("GET", "/healthz")

# 3. POST /upload — multipart with fwi PDF
pdf_path = Path(__file__).resolve().parent / "mock_data" / "factories" / "fwi_fsd_001.pdf"
pdf_bytes = pdf_path.read_bytes() if pdf_path.exists() else b"%PDF-1.4\nstub\n"
hit(
    "POST", "/upload",
    multipart={
        "file": ("fwi_fsd_001.pdf", pdf_bytes, "application/pdf"),
        "kind": "factory_audit",
        "factory_id": "fwi_fsd_001",
    },
)

# 4. POST /analyze
body, _ = hit("POST", "/analyze", json_body={"factory_id": "fwi_fsd_001"})
job_id = json.loads(body).get("job_id") if body.startswith("{") else None

# 5. GET /status/{job_id} — poll until complete (use new job_id)
if job_id:
    deadline = time.time() + 120
    while time.time() < deadline:
        body, code = hit("GET", f"/status/{job_id}", label="GET /status/{job_id}")
        d = json.loads(body) if body.startswith("{") else {}
        if d.get("status") == "complete":
            break
        time.sleep(3)
        # drop intermediate polls from results
        results.pop()
    # one final entry recorded above

# 6. GET /report/fwi_fsd_001
hit("GET", "/report/fwi_fsd_001")

# 7. GET /actions/fwi_fsd_001
hit("GET", "/actions/fwi_fsd_001")

# 8. POST /simulate/fwi_fsd_001
hit("POST", "/simulate/fwi_fsd_001", json_body={"action_ids": []})

# 9. GET /documents/fwi_fsd_001
hit("GET", "/documents/fwi_fsd_001")

# 10. POST /failure-test/{job_id}
if job_id:
    hit("POST", f"/failure-test/{job_id}", json_body={"agent": "gap_detection", "failure_type": "api_timeout"},
        label="POST /failure-test/{job_id}")

print(f"\n{'Endpoint':<40} {'Code':>6} {'ms':>6}  Pass/Fail")
print("-" * 70)
for label, code, ms, status, snippet in results:
    print(f"{label:<40} {str(code):>6} {ms:>6}  {status}")
    if status == "FAIL":
        print(f"    >> {snippet[:200]}")

n_pass = sum(1 for r in results if r[3] == "PASS")
print(f"\n{n_pass}/{len(results)} endpoints passed")
