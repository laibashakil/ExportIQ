"""One-off smoke test: send a single prompt to Gemini and print the response."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import get_settings  # noqa: E402
from tools.gemini_client import call_gemini, get_llm  # noqa: E402


def main() -> int:
    s = get_settings()
    print(f"gemini_model            = {s.gemini_model}")
    print(f"google_cloud_project    = {s.google_cloud_project}")
    print(f"google_cloud_location   = {s.google_cloud_location}")
    print(f"google_application_credentials = {s.google_application_credentials}")
    print(f"gemini_api_key          = {'<set>' if s.gemini_api_key else '<unset>'}")
    print(f"has_real_gemini         = {s.has_real_gemini}")

    llm = get_llm()
    print(f"LLM client              = {type(llm).__name__ if llm else 'None (stub)'}")
    if llm is None:
        print("\nRESULT: FAIL — no Gemini client available")
        return 1

    print("\n--> PROMPT: Hello, respond in one sentence")
    reply = call_gemini(
        system_prompt="You are a helpful assistant. Respond in exactly one sentence.",
        user_prompt="Hello, respond in one sentence",
        expect_json=False,
    )
    print(f"<-- RESPONSE:\n{reply}\n")

    ok = isinstance(reply, str) and len(reply.strip()) > 0
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
