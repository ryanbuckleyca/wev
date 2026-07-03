"""Local LLM provider using Tavily search + Ollama for grounded responses.

Used when ENV_MODE=local to avoid hitting Gemini/Groq APIs during local development.
"""

import logging
import os
import threading
import time

from llm.base import BaseLLMProvider, LLMProviderError

logger = logging.getLogger(__name__)


class LocalGroundedProvider(BaseLLMProvider):
    """Local LLM provider using Tavily search + Ollama.

    This provider:
    1. Uses Tavily to search for relevant context
    2. Feeds the context to a local Ollama model
    3. Returns grounded responses without hitting external APIs
    """

    def __init__(self, **kwargs):
        """Initialize the local grounded provider.

        Args:
            **kwargs: Ignored, kept for interface compatibility
        """
        self._tavily_client = None
        self._tavily_api_key = os.getenv("TAVILY_API_KEY")
        self.model: str = os.getenv("LOCAL_LLM_MODEL", "mistral")
        self._ollama_available = None
        self._tavily_available = None
        try:
            self._call_timeout_sec = int(os.getenv("LOCAL_LLM_CALL_TIMEOUT_SEC", "120"))
        except (TypeError, ValueError):
            self._call_timeout_sec = 120
            logger.warning(
                "LOCAL_LLM_CALL_TIMEOUT_SEC is not a valid integer, falling back to %s",
                self._call_timeout_sec,
            )
        self._ollama_client = None

    def _init_tavily(self):
        """Initialize Tavily client if not already done."""
        if self._tavily_client is None:
            try:
                from tavily import TavilyClient
                api_key = self._tavily_api_key
                if not api_key:
                    raise ValueError("TAVILY_API_KEY not set")
                self._tavily_client = TavilyClient(api_key=api_key)
            except ImportError:
                raise ValueError("tavily-python not installed. Add to requirements-dev.txt") from None

    def _check_ollama(self) -> bool:
        """Check if Ollama is available and has the required model."""
        if self._ollama_available is None:
            try:
                import ollama
                # Check if Ollama is running
                models = ollama.list()
                model_names = [model.model for model in models.models]

                # Look for the configured model
                target_model = self.model.split(':')[0].lower()  # handle version tags
                matching_models = [name for name in model_names if name and target_model in name.lower()]
                if not matching_models:
                    # Model not found, instruct user instead of pulling implicitly
                    logger.warning(f"Required local model '{self.model}' not found. Run: ollama pull {self.model}")
                    self._ollama_available = False
                else:
                    self._ollama_available = True

            except ImportError:
                self._ollama_available = False
            except Exception:
                # Ollama not running or not accessible
                self._ollama_available = False

        return self._ollama_available

    def _check_tavily(self) -> bool:
        """Check if Tavily API key is available and working."""
        if self._tavily_available is None:
            try:
                self._init_tavily()
                self._tavily_available = True
            except Exception:
                self._tavily_available = False

        return self._tavily_available

    def is_available(self) -> bool:
        """Return True if Ollama is configured and accessible.

        Tavily is only required for grounded tasks (SSE classification) and is
        checked lazily at call time, not here — so the provider is considered
        available as long as Ollama is running with the required model.
        """
        try:
            return self._check_ollama()
        except Exception:
            return False

    def get_token_limits(self) -> dict:
        """Return token limits for local Ollama model."""
        return {
            "context_window": 8_192,
            "max_tokens_per_request": 8_192,  # hard cap = context window for local models
            "tokens_per_minute": 0,           # no rate limit for local
            "recommended_batch_size": 1,      # sequential — local models are slow
        }

    def _search_context(self, query: str) -> str:
        """Search for relevant context using Tavily."""
        self._init_tavily()
        assert self._tavily_client is not None

        try:
            results = self._tavily_client.search(
                query,
                search_depth="basic",
                max_results=5
            )

            context_pieces = [r["content"] for r in results.get("results", [])]
            return "\n\n".join(context_pieces)

        except Exception as e:
            raise LLMProviderError(f"Tavily search failed: {e}") from e

    def _get_ollama_client(self):
        """Return a cached Ollama client with configured timeout."""
        if self._ollama_client is None:
            import ollama
            self._ollama_client = ollama.Client(timeout=self._call_timeout_sec)
        return self._ollama_client

    def _generate_with_ollama(self, prompt: str, json_mode: bool = False) -> str:
        """Generate response using local Ollama model."""
        if not self._check_ollama():
            raise LLMProviderError(f"Ollama not available or model '{self.model}' not found")

        try:
            client = self._get_ollama_client()

            options = {
                "num_predict": 2000,
                "temperature": 0.1,
            }
            fmt = "json" if json_mode else None
            print(
                f"  … ollama: generate start model={self.model} json_format={bool(fmt)} "
                f"prompt_chars={len(prompt)}",
                flush=True,
            )
            logger.info(
                "ollama.generate: model=%s json_format=%s prompt_chars=%s",
                self.model,
                bool(fmt),
                len(prompt),
            )
            stop_hb = threading.Event()
            hb_sec = int(os.environ.get("LOCAL_LLM_HEARTBEAT_SEC", "30"))

            def _heartbeat() -> None:
                if hb_sec <= 0:
                    return
                total = 0
                while not stop_hb.wait(hb_sec):
                    total += hb_sec
                    msg = (
                        f"Ollama generate still running ({total}s elapsed; model={self.model})"
                    )
                    logger.info(msg)
                    print(f"  … {msg}", flush=True)

            if hb_sec > 0:
                threading.Thread(target=_heartbeat, name="ollama-heartbeat", daemon=True).start()

            t0 = time.perf_counter()
            try:
                response = client.generate(
                    model=self.model,
                    prompt=prompt,
                    options=options,
                    format=fmt,
                )
            finally:
                stop_hb.set()

            elapsed = time.perf_counter() - t0
            out = response.get("response", "") or ""
            logger.info(
                "ollama.generate: done in %.2fs response_chars=%s",
                elapsed,
                len(out),
            )
            print(
                f"  … ollama: generate done in {elapsed:.1f}s ({len(out)} chars)",
                flush=True,
            )
            return out

        except Exception as e:
            raise LLMProviderError(f"Ollama generation failed: {e}") from e

    def summarize_text(self, text: str, max_chars: int = 300, org_name: str | None = None, job_title: str | None = None) -> str:
        """Summarize text using local LLM with the same prompt rules as production."""
        from llm.prompts import build_summary_prompt, build_summary_system_prompt

        max_words = max(10, max_chars // 6)
        prompt = build_summary_prompt(max_words, job_title=job_title) + f"{text[:10000]}"
        system = build_summary_system_prompt()

        full_prompt = f"{system}\n\n{prompt}"
        return self._generate_with_ollama(full_prompt)

    def complete(self, prompt: str, model: str | None = None, system: str | None = None, **kwargs) -> str:
        """Generate text using local LLM with optional grounding.

        Only uses Tavily search if grounding is enabled for this task type.
        """
        from llm.config import should_use_grounding

        # Check if we should use grounding via explicit task kwarg
        task_type = kwargs.get("task")
        use_grounding = should_use_grounding(task_type) if task_type else False

        t0 = time.perf_counter()
        if use_grounding:
            search_query = kwargs.get("search_query") or prompt[:200]
            print(f"  … local_grounded: Tavily search (task={task_type})…", flush=True)
            logger.info("local_grounded: tavily search query_len=%s", len(search_query))
            context = self._search_context(search_query)
            logger.info(
                "local_grounded: tavily returned in %.2fs context_chars=%s",
                time.perf_counter() - t0,
                len(context),
            )
            print(
                f"  … local_grounded: Tavily done in {time.perf_counter() - t0:.1f}s "
                f"(context {len(context)} chars)",
                flush=True,
            )

            full_prompt = f"""Using these search results as context:

{context}

Answer the following prompt: {prompt}"""
        else:
            full_prompt = prompt
            print(
                f"  … local_grounded: no web search (task={task_type or '—'}); "
                f"prompt → Ollama only",
                flush=True,
            )

        if system:
            full_prompt = f"{system}\n\n{full_prompt}"

        return self._generate_with_ollama(
            full_prompt, json_mode=(task_type in ("sse", "unified", "json"))
        )
