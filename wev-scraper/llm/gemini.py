"""Google Gemini provider with optional Google Search grounding.

Uses the google-genai SDK (google-genai package).

Models in use:
  gemini-2.5-flash        — default model for unified processing (summary, skills, values, SSE);
                            requires Google Search grounding for SSE classification.
  groq (llama-3.3-70b)   — fallback model for unified processing (no grounding)

Free-tier rate limits (as of March 2026, confirmed from AI Studio live quota):
  Gemini 2.5 Flash      : 4 RPM / 24 RPD (your quota)
  Gemini 2.5 Flash Lite : 8 RPM / 22 RPD (your quota)
  Gemini 3.1 Flash Lite : 0 RPM / 15 RPM, 0 RPD / 500 RPD (not available)
  Gemma models          : 0 RPM / 30 RPM, 0 RPD / 14.4K RPD (not available)

  No Gemini model currently offers a free tier suitable for large-scale summaries or values tagging.
  Groq is the best option for summaries and values unless your quota increases.

Constraints for the scraper:
  - gemini-2.5-flash is reserved exclusively for SSE (Google Search grounding required).
  - SSE calls: 1 per job → a 200-job scrape uses 200 req/day of the SSE quota.
  - gemini-2.5-flash-lite is NOT usable for summaries at scale (20 req/day confirmed).
  - Summaries and values are handled by Groq (see factory.py).
"""

import logging
import os
import re
import threading
import time

from llm.base import BaseLLMProvider, LLMProviderError
from llm.prompts import (
    build_summary_prompt,
    build_summary_system_prompt,
)
from settings import get_gemini_api_key

logger = logging.getLogger(__name__)


class GeminiProvider(BaseLLMProvider):
    """Gemini provider. Choose model per task via constructor params."""

    MODEL = "gemini-2.5-flash-lite"

    def __init__(self, api_key: str | None = None, model: str | None = None):
        """Initialize Gemini provider with API key and model.

        Args:
            api_key: Google AI API key. If None, uses GEMINI_API_KEY env var.
            model: Model name. Defaults to gemini-2.5-flash-lite.
                 Use full names like: gemini-2.5-flash, gemini-2.5-flash-lite
        """
        self._api_key = (api_key or get_gemini_api_key() or "").strip()
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY required")

        self._model = model or "gemini-2.5-flash-lite"
        self._client = None

        try:
            timeout_sec = int(os.environ.get("GEMINI_CALL_TIMEOUT_SEC", "90"))
        except ValueError:
            logger.warning("Invalid GEMINI_CALL_TIMEOUT_SEC value; defaulting to 90s.")
            timeout_sec = 90
        timeout_sec = max(timeout_sec, 1)
        self._call_timeout_sec = timeout_sec

    def _key_last4(self) -> str:
        if not self._api_key:
            return "none"
        return self._api_key[-4:]

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise LLMProviderError(
                "google-genai is not installed. Install with: pip install google-genai"
            ) from e
        if not self._api_key:
            raise LLMProviderError(
                "GEMINI_API_KEY is not set. Get a key at https://aistudio.google.com/app/apikey"
            )
        self._genai = genai
        self._types = types
        # Set HTTP socket timeout based on call timeout (default 90s)
        # Successful unified calls finish in 7-45s; anything longer is likely hanging.
        timeout_ms = self._call_timeout_sec * 1000
        self._http_timeout_ms = timeout_ms
        self._client = genai.Client(
            api_key=self._api_key,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key or get_gemini_api_key())

    def _extract_text(self, response) -> str:
        """Extract text content from a Gemini response object safely."""
        text = getattr(response, "text", "") or ""
        candidates = getattr(response, "candidates", None) or []
        if not text and candidates:
            # Try to extract from parts directly
            candidate = candidates[0]
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) or [] if content else []
            for part in parts:
                part_text = getattr(part, "text", None)
                if part_text:
                    text = part_text
                    break

            if not text:
                finish_reason = getattr(candidate, "finish_reason", "UNKNOWN")
                part_types = [
                    type(p).__name__ + (f"({getattr(p, 'function_call', None) and 'fn_call'})" if hasattr(p, 'function_call') else "")
                    for p in parts
                ]
                logger.warning(
                    "Empty text from Gemini. finish_reason=%s candidates=%d parts=%d part_types=%s",
                    finish_reason, len(candidates), len(parts), part_types,
                )

        return text or ""

    def complete(self, prompt: str, model: str | None = None, system: str | None = None, **kwargs) -> str:
        """Generic text completion via Gemini.

        Args:
            prompt: User prompt.
            model: Optional Gemini model override.
            system: Optional system instruction passed via GenerateContentConfig.
        """
        from llm.config import should_use_grounding

        t0 = time.perf_counter()
        logger.info("Gemini.complete: acquiring HTTP client…")
        print("  … gemini: resolving client… (t+0.0s)", flush=True)
        client = self._get_client()
        types = self._types
        t_client = time.perf_counter() - t0
        logger.info(f"Gemini.complete: client ready in {t_client:.3f}s")

        task_type = kwargs.get("task")
        if "use_grounding" in kwargs:
            use_grounding = bool(kwargs["use_grounding"])
        else:
            use_grounding = should_use_grounding(task_type) if task_type else False
        resolved_model = model or self._model
        timeout_ms = self._call_timeout_sec * 1000

        safety_settings = [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
        ]

        if use_grounding:
            config = types.GenerateContentConfig(
                system_instruction=system,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                safety_settings=safety_settings,
            )
        else:
            config = types.GenerateContentConfig(
                system_instruction=system,
                safety_settings=safety_settings,
            )

        print(
            f"  … gemini: invoking generate_content "
            f"model={resolved_model} grounding={use_grounding} "
            f"task={task_type or '—'} timeout_ms={timeout_ms} "
            f"prompt_chars={len(prompt)} (setup {time.perf_counter() - t0:.2f}s)",
            flush=True,
        )
        logger.info(
            "Gemini.generate_content: model=%s grounding=%s task=%s timeout_ms=%s prompt_chars=%s",
            resolved_model,
            use_grounding,
            task_type,
            timeout_ms,
            len(prompt),
        )

        stop_hb = threading.Event()
        hb_sec = int(os.environ.get("GEMINI_HEARTBEAT_SEC", "30"))

        def _heartbeat() -> None:
            if hb_sec <= 0:
                return
            total = 0
            while not stop_hb.wait(hb_sec):
                total += hb_sec
                msg = (
                    f"Gemini HTTP still in flight ({total}s elapsed; "
                    f"server-side timeout {timeout_ms / 1000:.0f}s; key …{self._key_last4()})"
                )
                logger.info(msg)
                print(f"  … {msg}", flush=True)

        if hb_sec > 0:
            threading.Thread(
                target=_heartbeat, name="gemini-heartbeat", daemon=True
            ).start()

        t_api = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=resolved_model,
                contents=prompt,
                config=config,
            )
        except Exception as e:
            from google.genai.errors import APIError, ServerError

            is_timeout = False
            if isinstance(e, TimeoutError):
                is_timeout = True
            elif isinstance(e, (ServerError, APIError)):
                if getattr(e, "code", None) in (408, 504):
                    is_timeout = True

            if is_timeout:
                raise LLMProviderError(
                    f"Gemini call timed out "
                    f"(model={resolved_model}, prompt_chars={len(prompt)}). "
                    f"The model may be stuck in an extended thinking loop."
                ) from e
            raise LLMProviderError(f"Gemini completion error: {e}") from e
        finally:
            stop_hb.set()

        api_s = time.perf_counter() - t_api
        total_s = time.perf_counter() - t0
        text = self._extract_text(response)
        logger.info(
            "Gemini.complete: generate_content finished api=%.2fs total=%.2fs response_chars=%s",
            api_s,
            total_s,
            len(text),
        )
        print(
            f"  … gemini: generate_content returned in {api_s:.1f}s "
            f"(total {total_s:.1f}s, {len(text)} chars)",
            flush=True,
        )
        return text

    def get_token_limits(self) -> dict:
        """Return token limits for Gemini provider.

        Confirmed limits (March 2026, free tier):
          gemini-2.5-flash      : 4 RPM, 24 RPD, 1M input ctx, 65,535 output tokens
          gemini-2.5-flash-lite : 8 RPM, 22 RPD, 1M input ctx, 65,535 output tokens

        RPD is the binding constraint at scale. We use large batches (50K tokens)
        to pack as many jobs as possible per request and conserve the daily budget.
        50K input tokens ≈ 12-15 typical job descriptions.
        """
        if "flash-lite" in self._model:
            return {
                "context_window": 1_048_576,
                "max_output_tokens": 65_535,
                "max_tokens_per_request": 900_000,  # 90% of context window (leave room for output)
                "requests_per_minute": 8,
                "requests_per_day": 22,
                "recommended_batch_size": 50_000,
            }
        else:
            # gemini-2.5-flash
            return {
                "context_window": 1_048_576,
                "max_output_tokens": 65_535,
                "max_tokens_per_request": 900_000,
                "requests_per_minute": 4,
                "requests_per_day": 24,
                "recommended_batch_size": 50_000,
            }

    def summarize_text(self, text: str, max_chars: int = 300, org_name: str | None = None, job_title: str | None = None) -> str:
        """Summarize a job description in one sentence, up to max_chars. No grounding.

        Uses the same action/mission-focused prompt as the Groq provider so output
        style is comparable across providers.
        """
        if not (text and text.strip()):
            return ""
        max_words = max(10, max_chars // 6)
        prompt = build_summary_prompt(max_words, job_title=job_title) + f"{text[:10000]}"
        system = build_summary_system_prompt()
        client = self._get_client()
        types = self._types
        config = types.GenerateContentConfig(system_instruction=system)
        try:
            response = client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config,
            )
        except Exception as e:
            err_msg_raw = str(e)
            err_msg = err_msg_raw.lower()
            if "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg:
                raise LLMProviderError(
                    "Gemini rate limit or quota exceeded. "
                    "gemini-2.5-flash-lite free tier: 30 req/min, 1,500 req/day. "
                    "Quota resets at midnight Pacific. "
                    f"key_last4={self._key_last4()} raw_error={err_msg_raw}"
                ) from e
            if "403" in err_msg or "permission" in err_msg:
                raise LLMProviderError(
                    f"Gemini API key invalid or permission denied. Check GEMINI_API_KEY. key_last4={self._key_last4()} raw_error={err_msg_raw}"
                ) from e
            raise LLMProviderError(f"Gemini API error: key_last4={self._key_last4()} raw_error={err_msg_raw}") from e

        summary = self._extract_text(response).strip().strip('"').strip("'")
        summary = summary.replace("**", "")
        colon_prefix = re.match(r'^[^.]{1,60}: ', summary)
        if colon_prefix:
            summary = summary[colon_prefix.end():].lstrip()
            if summary:
                summary = summary[0].upper() + summary[1:]
        if len(summary) > max_chars:
            summary = summary[:max_chars].rsplit(None, 1)[0]
        return summary
