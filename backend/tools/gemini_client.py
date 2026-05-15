"""Centralised Gemini 1.5 Pro client.

Every agent funnels its LLM calls through here. We support two paths:

1. Vertex AI (preferred, used in Antigravity) via langchain-google-vertexai
2. Google AI Studio API key (demo fallback if Vertex quota is exhausted)

If neither is configured we return a deterministic stub response so that the
pipeline still produces *something* end-to-end in a dev environment with no
credentials. The stub paths are clearly logged.
"""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache

from config import get_settings

log = logging.getLogger("exportiq.gemini")


@lru_cache(maxsize=1)
def get_llm():
    settings = get_settings()
    if settings.google_application_credentials:
        try:
            from langchain_google_vertexai import ChatVertexAI
            llm = ChatVertexAI(
                model_name=settings.gemini_model,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
                temperature=0.1,
                max_output_tokens=4096,
            )
            log.info("Gemini: ChatVertexAI initialised (%s)", settings.gemini_model)
            return llm
        except Exception:  # noqa: BLE001
            log.exception("Vertex AI init failed; trying AI Studio fallback")
    if settings.gemini_api_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
            llm = ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=settings.gemini_api_key,
                temperature=0.1,
            )
            log.info("Gemini: ChatGoogleGenerativeAI initialised (%s)", settings.gemini_model)
            return llm
        except Exception:  # noqa: BLE001
            log.exception("AI Studio fallback failed")
    log.warning("Gemini: no credentials configured — using deterministic stub")
    return None


def _strip_json_fence(text: str) -> str:
    """Strip ```json ... ``` fences models sometimes wrap output in."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    return text


def call_gemini(system_prompt: str, user_prompt: str, *,
                expect_json: bool = True,
                stub_response: dict | str | None = None) -> dict | str:
    """Run a chat completion. Returns parsed JSON if expect_json else string.

    `stub_response` is what we return if no LLM is available — required for
    deterministic local demos.
    """
    llm = get_llm()
    if llm is None:
        if stub_response is None:
            return {} if expect_json else ""
        return stub_response

    from langchain_core.messages import SystemMessage, HumanMessage
    msg = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])
    text = getattr(msg, "content", str(msg))
    if not expect_json:
        return text
    raw = _strip_json_fence(text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Gemini returned non-JSON; falling back to stub")
        return stub_response if stub_response is not None else {}
