"""Thin OpenAI-compatible chat-completions provider (Cerebras).

Uses ``requests`` against ``{base}/chat/completions`` — same shape as Groq,
without Groq's model-fallback hierarchy. Shared Tavily evidence is injected by
``SSEFallbackProvider`` before ``complete`` is called.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import requests

from llm.base import BaseLLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
# Prefer a capable production model; override with CEREBRAS_MODEL.
# Account catalog (as of Jul 2026): gpt-oss-120b, gemma-4-31b, zai-glm-4.7
DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b"


_MAX_RETRIES = 4
_RETRY_BASE_DELAY = 20.0


class OpenAICompatibleProvider(BaseLLMProvider):
    """Generic OpenAI-compatible chat completions client."""

    def __init__(
        self,
        *,
        name: str,
        api_key: str,
        base_url: str,
        model: str,
        context_window: int = 128_000,
        max_tokens_per_request: int = 16_000,
        timeout_sec: float = 120.0,
    ):
        self._name = name
        self._api_key = (api_key or "").strip()
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._context_window = context_window
        self._max_tokens_per_request = max_tokens_per_request
        self._timeout_sec = timeout_sec

    def is_available(self) -> bool:
        return bool(self._api_key)

    def get_token_limits(self) -> dict:
        return {
            "context_window": self._context_window,
            "max_tokens_per_request": self._max_tokens_per_request,
            "tokens_per_minute": self._max_tokens_per_request,
            "recommended_batch_size": int(self._max_tokens_per_request * 0.8),
        }

    def _request(self, payload: dict) -> dict:
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        last_err: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = requests.post(
                    url, json=payload, headers=headers, timeout=self._timeout_sec,
                )
            except Exception as exc:
                raise LLMProviderError(f"{self._name} request failed: {exc}") from exc
            if resp.status_code == 429:
                wait = min(_RETRY_BASE_DELAY * (2 ** attempt), 90.0)
                logger.warning(
                    "%s 429 rate-limited, waiting %.0fs (attempt %s/%s)",
                    self._name, wait, attempt + 1, _MAX_RETRIES,
                )
                time.sleep(wait)
                last_err = LLMProviderError(
                    f"{self._name} API error (429): {resp.text[:400]}"
                )
                continue
            if not resp.ok:
                raise LLMProviderError(
                    f"{self._name} API error ({resp.status_code}): {resp.text[:400]}"
                )
            try:
                return resp.json()
            except Exception as exc:
                raise LLMProviderError(
                    f"{self._name} failed to parse response: {exc}"
                ) from exc
        raise last_err or LLMProviderError(f"{self._name} request failed after retries")

    def complete(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        stop: Optional[list[str]] = None,
        system: Optional[str] = None,
        **kwargs,
    ) -> str:
        json_mode = kwargs.get("json_mode")
        if json_mode is None:
            json_mode = kwargs.get("task") != "unified"

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload: dict = {
            "model": model or self._model,
            "messages": messages,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if stop:
            payload["stop"] = stop
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        # Pin low temperature for classification/JSON tasks when callers pass it,
        # or default to 0 for SSE assessment (deterministic class labels).
        temperature = kwargs.get("temperature")
        if temperature is None and kwargs.get("task") == "sse":
            temperature = 0
        if temperature is not None:
            payload["temperature"] = float(temperature)

        data = self._request(payload)
        choices = data.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message") or {}).get("content", "") or ""

    def summarize_text(
        self,
        text: str,
        max_chars: int = 300,
        org_name: str | None = None,
        job_title: str | None = None,
    ) -> str:
        from llm.prompts import build_summary_prompt, build_summary_system_prompt

        prompt = build_summary_prompt(text, max_chars, org_name=org_name, job_title=job_title)
        system = build_summary_system_prompt()
        return self.complete(prompt, system=system, json_mode=False, task="summary")


class CerebrasProvider(OpenAICompatibleProvider):
    """Cerebras Inference (https://api.cerebras.ai/v1)."""

    def __init__(self, api_key: str | None = None, model: str | None = None, **kwargs):
        key = (api_key or os.environ.get("CEREBRAS_API_KEY") or "").strip()
        if not key:
            logger.warning("CEREBRAS_API_KEY not set — Cerebras unavailable")
        super().__init__(
            name="cerebras",
            api_key=key,
            base_url=kwargs.get("base_url") or CEREBRAS_BASE_URL,
            model=model
            or (os.environ.get("CEREBRAS_MODEL") or "").strip()
            or DEFAULT_CEREBRAS_MODEL,
            context_window=int(os.environ.get("CEREBRAS_CONTEXT_WINDOW", "128000")),
            max_tokens_per_request=int(
                os.environ.get("CEREBRAS_MAX_TOKENS_PER_REQUEST", "16000")
            ),
        )

