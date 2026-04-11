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

import re

from llm.base import BaseLLMProvider, LLMProviderError
from llm.prompts import (
    build_summary_prompt,
    build_summary_system_prompt,
)
from settings import get_gemini_api_key


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
        self._client = genai.Client(api_key=self._api_key)
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key or get_gemini_api_key())

    def complete(self, prompt: str, model: str | None = None, system: str | None = None, **kwargs) -> str:
        """Generic text completion via Gemini.

        Args:
            prompt: User prompt.
            model: Optional Gemini model override.
            system: Optional system instruction passed via GenerateContentConfig.
        """
        from llm.config import should_use_grounding
        
        client = self._get_client()
        types = self._types
        
        # Check if grounding should be used for this task via the explicit 'task' kwarg.
        task_type = kwargs.get("task")
        use_grounding = should_use_grounding(task_type) if task_type else False
        
        if use_grounding:
            # Enable Google Search grounding
            config = types.GenerateContentConfig(
                system_instruction=system,
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        else:
            # No grounding
            config = types.GenerateContentConfig(system_instruction=system) if system else None
            
        try:
            response = client.models.generate_content(
                model=model or self._model,
                contents=prompt,
                config=config,
            )
        except Exception as e:
            raise LLMProviderError(f"Gemini completion error: {e}") from e
        text = getattr(response, "text", "")
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            text = text or getattr(response.candidates[0].content.parts[0], "text", "") or ""
        return text or ""

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
        out = getattr(response, "text", None) or ""
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            out = out or getattr(response.candidates[0].content.parts[0], "text", None) or ""
        summary = (out or "").strip().strip('"').strip("'")
        summary = summary.replace("**", "")
        colon_prefix = re.match(r'^[^.]{1,60}: ', summary)
        if colon_prefix:
            summary = summary[colon_prefix.end():].lstrip()
            if summary:
                summary = summary[0].upper() + summary[1:]
        if len(summary) > max_chars:
            summary = summary[:max_chars].rsplit(None, 1)[0]
        return summary
