"""Abstract base class for LLM providers.

Enables swapping between providers (Gemini, OpenAI, Anthropic, Groq, etc.)
without changing calling code. Use the factory in llm.factory to get a provider.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Callable

logger = logging.getLogger(__name__)

# Rough token estimation: 1 token ≈ 4 characters
_CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    """Rough token count estimate based on character length."""
    return max(1, len(text) // _CHARS_PER_TOKEN)


class LLMProviderError(Exception):
    """Raised when an LLM provider fails (rate limit, API error, etc.)."""

    pass


class BaseLLMProvider(ABC):
    """Abstract interface for LLM providers.

    Implementations must be swappable via the factory.
    """

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this provider is configured and can be used."""
        pass

    @abstractmethod
    def get_token_limits(self) -> dict:
        """Return token limits for this provider.

        Returns:
            Dict with keys:
            - 'context_window': Maximum tokens the model can process in total
            - 'max_tokens_per_request': Hard per-request token cap (input + output).
                                        For Groq free tier this equals TPM (tokens per minute)
                                        since a single request can consume the full minute budget.
                                        For Gemini this is ~90% of context_window.
                                        complete_batch() uses this as the hard ceiling.
            - 'tokens_per_minute': TPM limit (informational)
            - 'recommended_batch_size': Safe token budget per call (typically 80% of
                                        max_tokens_per_request). Used as the default
                                        budget in complete_batch().
        """
        pass

    @abstractmethod
    def summarize_text(self, text: str, max_chars: int = 300, org_name: str | None = None, job_title: str | None = None) -> str:
        """Summarize text (e.g. a job description) in one sentence if possible, up to max_chars."""
        pass

    @abstractmethod
    def complete(self, prompt: str, model: str | None = None, system: str | None = None, **kwargs) -> str:
        """Generate text for an arbitrary prompt.

        Args:
            prompt: The input prompt to the model.
            model: Optional model identifier; provider may ignore or use default.
            system: Optional system instruction (sets behavioural context).

        Returns:
            Raw text output from the model.

        Raises:
            LLMProviderError: On API errors or rate limits.
        """
        pass

    def complete_batch(
        self,
        items: list,
        build_prompt: Callable[[list], str],
        parse_response: Callable[[str, list], list],
        system: str | None = None,
        token_budget: int | None = None,
        fixed_overhead_tokens: int = 0,
        **kwargs,
    ) -> list:
        """Send items to the LLM in token-aware batches.

        Automatically splits `items` into sub-batches that fit within the
        provider's token budget, fires one LLM call per sub-batch, and
        reassembles results in the original order.

        Args:
            items: Arbitrary list of items to process (jobs, texts, etc.).
            build_prompt: Callable(batch) -> prompt string for that batch.
            parse_response: Callable(response_str, batch) -> list of results
                            in the same order as the batch.
            system: Optional system prompt passed to every call.
            token_budget: Max tokens per call. Defaults to provider's
                          recommended_batch_size from get_token_limits().
            fixed_overhead_tokens: Tokens shared across all items in a batch
                          (e.g. a candidate pool included once per call).
                          These are subtracted from the budget before sizing
                          per-item estimates, so batches are larger.
            **kwargs: Extra kwargs forwarded to complete().

        Returns:
            Flat list of results in the same order as `items`.
            Failed items produce None in their slot.
        """
        if not items:
            return []

        limits = self.get_token_limits()
        context_window = limits.get("context_window", 131_072)
        # Use explicit per-request cap if provided, otherwise fall back to 80% of context window
        max_per_request = limits.get("max_tokens_per_request") or int(context_window * 0.8)
        budget = min(
            token_budget or limits.get("recommended_batch_size", 8_000),
            max_per_request,
        )

        # Per-item budget: total budget minus shared overhead, but never less than half the budget
        item_budget = max(budget - fixed_overhead_tokens, budget // 2)

        # Split items into token-aware sub-batches.
        # We track item-only tokens for sizing, but validate the full prompt against
        # max_tokens_per_request before sending to catch cases where overhead is large.
        batches: list[list] = []
        current_batch: list = []
        current_tokens = 0

        for item in items:
            # Estimate tokens for this item alone (excluding shared overhead)
            item_prompt = build_prompt([item])
            item_tokens = max(1, estimate_tokens(item_prompt) - fixed_overhead_tokens)

            # If a single item exceeds the per-item budget, send it alone
            if item_tokens >= item_budget:
                if current_batch:
                    batches.append(current_batch)
                    current_batch = []
                    current_tokens = 0
                batches.append([item])
                continue

            if current_tokens + item_tokens > item_budget and current_batch:
                batches.append(current_batch)
                current_batch = []
                current_tokens = 0

            current_batch.append(item)
            current_tokens += item_tokens

        if current_batch:
            batches.append(current_batch)

        total_batches = len(batches)
        logger.info(f"[batch] {len(items)} items → {total_batches} LLM call(s) (budget: {budget}, overhead: {fixed_overhead_tokens})")

        results: list = []
        for i, batch in enumerate(batches, 1):
            prompt = build_prompt(batch)
            estimated = estimate_tokens(prompt)

            # Hard cap check: if the full prompt (overhead + items) exceeds max_tokens_per_request,
            # split this batch in half and retry recursively rather than sending an oversized request.
            if estimated > max_per_request and len(batch) > 1:
                logger.warning(
                    f"[batch {i}/{total_batches}] prompt too large ({estimated} > {max_per_request} tokens), "
                    f"splitting {len(batch)} items into two halves"
                )
                print(
                    f"  Batch {i}/{total_batches}: prompt too large ({estimated} est. tokens > {max_per_request} cap), "
                    f"splitting {len(batch)} items...",
                    flush=True,
                )
                sub_results = self.complete_batch(
                    items=batch,
                    build_prompt=build_prompt,
                    parse_response=parse_response,
                    system=system,
                    # Force a tighter budget so the recursive call splits further if needed
                    token_budget=max_per_request // 2,
                    fixed_overhead_tokens=fixed_overhead_tokens,
                    **kwargs,
                )
                results.extend(sub_results)
                continue

            logger.info(f"[batch {i}/{total_batches}] {len(batch)} items, ~{estimated} tokens")
            print(f"  Batch {i}/{total_batches}: {len(batch)} items, ~{estimated} estimated tokens", flush=True)

            try:
                raw = self.complete(prompt, system=system, **kwargs)
                batch_results = parse_response(raw, batch)
            except LLMProviderError as e:
                err_str = str(e)
                # 413 = request too large — split and retry rather than dropping results
                if "413" in err_str and len(batch) > 1:
                    logger.warning(f"[batch {i}/{total_batches}] 413 too large, splitting {len(batch)} items")
                    print(f"  Batch {i}/{total_batches}: 413 received, splitting {len(batch)} items...", flush=True)
                    sub_results = self.complete_batch(
                        items=batch,
                        build_prompt=build_prompt,
                        parse_response=parse_response,
                        system=system,
                        token_budget=max_per_request // 2,
                        fixed_overhead_tokens=fixed_overhead_tokens,
                        **kwargs,
                    )
                    results.extend(sub_results)
                    continue
                # 429 / quota exhausted — re-raise so the caller's fallback chain can try the next provider
                if "429" in err_str or "quota" in err_str.lower() or "resource_exhausted" in err_str.lower() or "rate limit" in err_str.lower():
                    logger.warning(f"[batch {i}/{total_batches}] quota/rate-limit, re-raising for fallback: {e}")
                    raise
                logger.warning(f"[batch {i}/{total_batches}] LLM call failed: {e}")
                print(f"  [batch {i}/{total_batches}] LLM call failed: {e}", flush=True)
                batch_results = [None] * len(batch)

            results.extend(batch_results)

        return results
