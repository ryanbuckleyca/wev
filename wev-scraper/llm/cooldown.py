"""Shared quota-cooldown helpers for LLM provider chains.

Both ``SSEFallbackProvider`` and ``UnifiedJobProcessor`` need identical logic for:
  - Detecting rate-limit / quota-exhausted errors.
  - Tracking per-provider cooldown windows.

Import ``ProviderCooldownMixin`` and mix it into any class that manages a
``_exhausted_until: dict[str, float]`` and ``_cooldown_seconds: int`` pair.
"""

from __future__ import annotations

import logging
import time

from settings import get_stripped_env

logger = logging.getLogger(__name__)

DEFAULT_COOLDOWN_MINUTES = 15


def get_cooldown_minutes() -> int:
    """Return the cooldown period (minutes) from env, defaulting to 15."""
    try:
        val = int(get_stripped_env("QUOTA_COOLDOWN_MINUTES") or DEFAULT_COOLDOWN_MINUTES)
        return val if val >= 0 else DEFAULT_COOLDOWN_MINUTES
    except (ValueError, TypeError):
        return DEFAULT_COOLDOWN_MINUTES


def is_quota_exhausted_error(exc: Exception) -> bool:
    """Return True when *exc* signals a quota / rate-limit exhaustion."""
    err = str(exc).lower()
    return (
        "429" in err
        or "resource_exhausted" in err
        or "quota" in err
        or "rate limit" in err
    )


def is_daily_quota_exhausted_error(exc: Exception) -> bool:
    """Return True for hard daily/free-tier quota (not soft RPM/TPM 429s).

    Free-tier day caps look like:
      429 RESOURCE_EXHAUSTED … free_tier_requests, limit: 20
      GenerateRequestsPerDayPerProjectPerModel-FreeTier

    Soft rate limits also return 429 but say "retry in Ns" without free_tier /
    per-day metrics — those should backoff, not abort the whole run.
    """
    err = str(exc).lower()
    if "429" not in err and "resource_exhausted" not in err:
        return False
    return (
        "free_tier" in err
        or "free tier" in err
        or "perday" in err
        or "per_day" in err
        or "requestsperday" in err
        or "daily quota" in err
        or "generaterequestsperday" in err
    )


class DailyQuotaExhaustedError(Exception):
    """Raised when every API backend in the chain has hit a daily/free-tier 429."""

    def __init__(self, providers: list[str], cause: Exception | None = None):
        self.providers = providers
        self.cause = cause
        names = ", ".join(providers) if providers else "(none)"
        detail = f" Last error: {cause}" if cause else ""
        super().__init__(
            f"All LLM backends exhausted daily/free-tier quota: {names}.{detail}"
        )


class ProviderCooldownMixin:
    """Mix-in that adds time-bounded quota-cooldown tracking.

    The host class must initialise (e.g. in ``__init__``):

        self._exhausted_until: dict[str, float] = {}
        self._cooldown_seconds: int = get_cooldown_minutes() * 60
    """

    _exhausted_until: dict[str, float]
    _cooldown_seconds: int

    def _is_provider_in_cooldown(self, name: str) -> bool:
        """Return True when *name* is still in its cooldown window."""
        if name not in self._exhausted_until:
            return False
        now = time.time()
        expires = self._exhausted_until[name]
        if now >= expires:
            del self._exhausted_until[name]
            logger.info("Provider %s cooldown expired, re-enabling", name)
            return False
        return True

    def _mark_provider_exhausted(self, name: str) -> None:
        """Mark *name* as quota-exhausted for ``_cooldown_seconds``."""
        expires = time.time() + self._cooldown_seconds
        self._exhausted_until[name] = expires
        logger.warning(
            "\U0001f6ab Rate limit hit for %s \u2014 cooling down for %d minutes",
            name,
            get_cooldown_minutes(),
        )
