"""LLM service layer — provider factory and utilities.

Usage:
    from llm import get_provider, get_job_summary_provider, PROVIDERS

    provider = get_provider()           # uses LLM_PROVIDER env (default: gemini)
    summary = provider.summarize_text(raw_text)
"""

from llm.base import BaseLLMProvider, LLMProviderError
from llm.factory import (
    PROVIDERS,
    get_job_summary_provider,
    get_provider,
)

__all__ = [
    "BaseLLMProvider",
    "LLMProviderError",
    "get_provider",
    "get_job_summary_provider",
    "PROVIDERS",
]
