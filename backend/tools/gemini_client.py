"""Centralised Gemini 2.5 Pro client.

Every agent funnels its LLM calls through here. We support two paths:

1. Vertex AI (preferred, used in Antigravity) via langchain-google-vertexai
2. Google AI Studio API key (demo fallback if Vertex quota is exhausted or
   the Vertex endpoint hangs)

If neither is configured we return a deterministic stub response so that the
pipeline still produces *something* end-to-end in a dev environment with no
credentials. The stub paths are clearly logged.
"""
from __future__ import annotations

import concurrent.futures
import json
import logging
import re
from functools import lru_cache

from config import get_settings

LLM_INVOKE_TIMEOUT_SECONDS = 45
# Hard cap on how long the (one-time, lru_cached) ChatVertexAI constructor may
# block. On some freshly-created GCP projects the default gRPC channel setup
# hangs for several minutes; we use REST transport to avoid that, and this
# timeout is a backstop so a cold start can never wedge the whole pipeline.
LLM_INIT_TIMEOUT_SECONDS = 30

# Module-level executor — we deliberately do NOT use `with ... as` because the
# context manager waits for in-flight workers on exit, which would defeat the
# whole point of a timeout when llm.invoke blocks indefinitely.
_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="gemini")

log = logging.getLogger("exportiq.gemini")


# Circuit breaker: once a Vertex call times out or returns a billing-style
# error, skip Vertex for the rest of the process so the pipeline doesn't
# spend ~60s per agent retrying the same broken endpoint. The fallback
# (AI Studio) is invoked separately and bypasses this flag.
_LLM_DISABLED: bool = False


def _disable_llm(reason: str) -> None:
    global _LLM_DISABLED
    if not _LLM_DISABLED:
        log.warning("Gemini primary disabled: %s — switching to AI Studio fallback for the rest of this process", reason)
    _LLM_DISABLED = True


def safe_llm_invoke(llm, messages, timeout: int = LLM_INVOKE_TIMEOUT_SECONDS):
    """Invoke an LLM with a hard timeout enforced via a module-level executor.

    Raises RuntimeError if the global circuit breaker has already tripped,
    or if the invocation exceeds the timeout. In the latter case the
    circuit breaker trips so subsequent primary calls fail fast and the
    caller can switch to the AI Studio fallback.
    """
    global _LLM_DISABLED
    if _LLM_DISABLED:
        raise RuntimeError("LLM disabled by circuit breaker")
    future = _EXECUTOR.submit(llm.invoke, messages)
    try:
        return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError as exc:
        _LLM_DISABLED = True
        future.cancel()
        raise RuntimeError(
            f"Gemini timed out after {timeout}s — circuit breaker tripped"
        ) from exc


@lru_cache(maxsize=1)
def _get_primary_llm():
    """Vertex AI ChatVertexAI — returns None if creds not configured or init stalls.

    Construction runs on the shared executor under a hard timeout: the gRPC
    channel setup can hang for minutes on some fresh projects, so we force
    REST transport (matches the fast REST endpoint) and bail to the stub path
    if construction still exceeds LLM_INIT_TIMEOUT_SECONDS.
    """
    settings = get_settings()
    if not settings.google_application_credentials:
        return None

    def _build():
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(
            model_name=settings.gemini_model,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
            temperature=0.1,
            max_output_tokens=4096,
            max_retries=1,
            api_transport="rest",
        )

    try:
        llm = _EXECUTOR.submit(_build).result(timeout=LLM_INIT_TIMEOUT_SECONDS)
        log.info("Gemini primary: ChatVertexAI initialised (%s, rest)", settings.gemini_model)
        return llm
    except concurrent.futures.TimeoutError:
        log.warning(
            "Vertex AI init exceeded %ss — disabling primary, using stub/fallback",
            LLM_INIT_TIMEOUT_SECONDS,
        )
        return None
    except Exception:  # noqa: BLE001
        log.exception("Vertex AI init failed")
        return None


@lru_cache(maxsize=1)
def _get_fallback_llm():
    """AI Studio ChatGoogleGenerativeAI — returns None if API key not set."""
    settings = get_settings()
    if not settings.gemini_api_key:
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
        llm = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
            temperature=0.1,
            max_retries=1,
        )
        log.info("Gemini fallback: ChatGoogleGenerativeAI initialised (%s)", settings.gemini_model)
        return llm
    except Exception:  # noqa: BLE001
        log.exception("AI Studio fallback init failed")
        return None


def get_llm():
    """Return whichever LLM is currently healthy.

    Kept for backward compatibility with scripts that import it. When the
    primary has been disabled by the circuit breaker, returns the AI Studio
    fallback (if available) instead.
    """
    if not _LLM_DISABLED:
        primary = _get_primary_llm()
        if primary is not None:
            return primary
    return _get_fallback_llm()


def _strip_json_fence(text: str) -> str:
    """Strip ```json ... ``` fences models sometimes wrap output in."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    return text


def _invoke_with_fallback(messages):
    """Try Vertex first, then AI Studio. Returns the LLM message or None."""
    # 1. Vertex (skipped if breaker tripped)
    primary = _get_primary_llm()
    if primary is not None and not _LLM_DISABLED:
        try:
            return safe_llm_invoke(primary, messages)
        except Exception as exc:  # noqa: BLE001
            exc_name = type(exc).__name__
            msg_text = str(exc).lower()
            log.warning("Vertex (primary) invoke failed: %s — %s", exc_name, str(exc)[:160])
            if (
                exc_name in {"PermissionDenied", "Unauthenticated", "ResourceExhausted"}
                or "billing" in msg_text
                or "permission" in msg_text
                or "quota" in msg_text
            ):
                _disable_llm(f"{exc_name}: {str(exc)[:120]}")

    # 2. AI Studio fallback — bypasses _LLM_DISABLED (different provider).
    fallback = _get_fallback_llm()
    if fallback is None:
        return None
    try:
        future = _EXECUTOR.submit(fallback.invoke, messages)
        return future.result(timeout=LLM_INVOKE_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        log.warning("AI Studio fallback timed out after %ss", LLM_INVOKE_TIMEOUT_SECONDS)
        return None
    except Exception as exc:  # noqa: BLE001
        log.warning("AI Studio fallback invoke failed: %s — %s",
                    type(exc).__name__, str(exc)[:160])
        return None


def call_gemini(system_prompt: str, user_prompt: str, *,
                expect_json: bool = True,
                stub_response: dict | str | None = None) -> dict | str:
    """Run a chat completion. Returns parsed JSON if expect_json else string.

    `stub_response` is what we return if every LLM path is exhausted —
    required for deterministic local demos.
    """
    from langchain_core.messages import SystemMessage, HumanMessage
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    msg = _invoke_with_fallback(messages)
    if msg is None:
        if stub_response is None:
            return {} if expect_json else ""
        return stub_response

    text = getattr(msg, "content", str(msg))
    if not expect_json:
        return text
    raw = _strip_json_fence(text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Gemini returned non-JSON; falling back to stub")
        return stub_response if stub_response is not None else {}
