"""One-off smoke test: write + read back a Firestore document in collection `test`."""
from __future__ import annotations

import sys
import time
from pathlib import Path

# Ensure backend/ is on sys.path so `config` and `tools` resolve when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_settings  # noqa: E402
from tools.firestore_client import set_doc, get_doc, _client, _mem  # noqa: E402


def main() -> int:
    s = get_settings()
    print(f"firebase_project_id     = {s.firebase_project_id}")
    print(f"firebase_credentials    = {s.firebase_credentials}")
    print(f"has_real_firebase       = {s.has_real_firebase}")

    client = _client()
    using_real = client is not _mem
    print(f"backend                 = {'REAL Firestore' if using_real else 'IN-MEMORY (fallback)'}")

    doc_id = f"smoke_{int(time.time())}"
    path = f"test/{doc_id}"
    payload = {
        "msg": "hello from exportiq smoke test",
        "ts": time.time(),
    }

    print(f"\n--> WRITE  {path}  payload={payload}")
    set_doc(path, payload)

    print(f"<-- READ   {path}")
    got = get_doc(path)
    print(f"    got = {got}")

    ok = got is not None and got.get("msg") == payload["msg"]
    print("\nRESULT:", "PASS" if ok else "FAIL", "(real Firestore)" if using_real else "(in-memory only)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
