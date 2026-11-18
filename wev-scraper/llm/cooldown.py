"""Shared quota-cooldown helpers for LLM provider chains.

Both ``SSEFallbackProvider`` and ``UnifiedJobProcessor`` need identical logic for:
  - Detecting rate-limit / quota-exhausted errors.
  - Detecting auth / permission errors (403) that should disable a model.
  - Tracking per-provider cooldown windows.

Import ``ProviderCooldownMixin`` and mix it into any class that manages a
``_exhausted_until: dict[str, float]`` and ``_cooldown_seconds: int`` pair.

Permission-denied disables are process-scoped (module-level) so every chain
instance skips the bad model after the first 403. They are keyed by model plus
a non-secret credential fingerprint (``permission_key``), so a chain built with
a different API key is not blocked by another key's denial. Fixing access on
the *same* key (e.g. enabling the model on the Google project) still needs a
process restart or ``clear_permission_denied_providers``.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time

from settings import get_stripped_env

logger = logging.getLogger(__name__)

# Soft RPM/TPM backoff; 15s matches typical provider retry hints (was 15 min).
DEFAULT_COOLDOWN_SECONDS = 15
# Legacy minutes knob still honored when QUOTA_COOLDOWN_SECONDS is unset.
DEFAULT_COOLDOWN_MINUTES = 15

# ``permission_key`` values that returned 403 / PERMISSION_DENIED this process.
_permission_denied_providers: set[str] = set()

# Status-shaped auth markers only; a bare "403" inside a URL, id, or body is not enough.
_AUTH_ERROR_TEXT_RE = re.compile(
    r"(?:^|[\s:(])(?:401|403)\s+(?:permission_denied|forbidden|unauthenticated|unauthorized)\b"
    r"|['\"](?:code|status_code)['\"]\s*:\s*(?:401|403)\b"
    r"|['\"]status['\"]\s*:\s*['\"](?:permission_denied|unauthenticated)['\"]"
    r"|\bapi_key_invalid\b"
    r"|\bapi key not valid\b",
    re.IGNORECASE,
)


def _exception_chain(exc: BaseException):
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        yield cur
        cur = cur.__cause__ or cur.__context__


def _structured_status(exc: BaseException) -> int | str | None:
    for attr in ("status_code", "code", "status"):
        val = getattr(exc, attr, None)
        if isinstance(val, int) and not isinstance(val, bool):
            return val
        if isinstance(val, str) and val.strip():
            return val.strip().upper()
    return None


def get_cooldown_seconds() -> int:
    """Return cooldown seconds from env (default 15).

    Preference:
      1. ``QUOTA_COOLDOWN_SECONDS`` if set
      2. ``QUOTA_COOLDOWN_MINUTES`` (legacy) × 60 if set
      3. ``DEFAULT_COOLDOWN_SECONDS``
    """
    raw_sec = get_stripped_env("QUOTA_COOLDOWN_SECONDS")
    if raw_sec not in (None, ""):
        try:
            val = int(raw_sec)
            return val if val >= 0 else DEFAULT_COOLDOWN_SECONDS
        except (ValueError, TypeError):
            return DEFAULT_COOLDOWN_SECONDS
    raw_min = get_stripped_env("QUOTA_COOLDOWN_MINUTES")
    if raw_min not in (None, ""):
        try:
            val = int(raw_min)
            minutes = val if val >= 0 else DEFAULT_COOLDOWN_MINUTES
            return minutes * 60
        except (ValueError, TypeError):
            return DEFAULT_COOLDOWN_SECONDS
    return DEFAULT_COOLDOWN_SECONDS


def get_cooldown_minutes() -> int:
    """Return cooldown minutes (ceil of seconds / 60). Prefer ``get_cooldown_seconds``."""
    seconds = get_cooldown_seconds()
    if seconds <= 0:
        return 0
    return max(1, (seconds + 59) // 60)


def is_auth_permission_error(exc: Exception) -> bool:
    """Return True when *exc* signals API key / model permission denial (403).

    Distinct from soft 429 cooldowns: access is not expected to recover mid-run
    without a new key or enabling the model on the Google project.

    Prefers structured status (``status_code`` / ``code`` / ``status`` on the
    exception or anything it wraps, e.g. ``google.genai.errors.APIError``).
    Falls back to status-shaped text such as ``403 PERMISSION_DENIED`` or
    ``'code': 403`` for providers that only surface a message.
    """
    for err in _exception_chain(exc):
        status = _structured_status(err)
        if status in (401, 403, "PERMISSION_DENIED", "UNAUTHENTICATED"):
            return True
        if _AUTH_ERROR_TEXT_RE.search(str(err)):
            return True
    return False


def credential_fingerprint(provider: object | None) -> str:
    """Short non-reversible id for *provider*'s API key ("" when unknown)."""
    secret = getattr(provider, "_api_key", None) or getattr(provider, "api_key", None)
    if not isinstance(secret, str) or not secret.strip():
        return ""
    return hashlib.sha256(secret.strip().encode("utf-8")).hexdigest()[:12]


def permission_key(model: str, provider: object | None = None) -> str:
    """Key for permission-denied tracking: effective model + credential fingerprint."""
    fp = credential_fingerprint(provider)
    return f"{model}@{fp}" if fp else model


def is_provider_permission_denied(key: str) -> bool:
    """Return True when *key* was hard-disabled after a 403 this process."""
    return key in _permission_denied_providers


def mark_provider_permission_denied(key: str) -> None:
    """Skip *key* (see ``permission_key``) for the rest of the process."""
    if key in _permission_denied_providers:
        return
    _permission_denied_providers.add(key)
    logger.warning(
        "\U0001f6ab Permission denied for %s \u2014 skipping for rest of process "
        "(restart after fixing key/model access to retry)",
        key,
    )


def clear_permission_denied_providers() -> None:
    """Re-enable every model disabled by 403 in this process.

    Existing chains re-check the shared set on each call, so this takes effect
    immediately; it does not reload API keys already captured by providers.
    """
    _permission_denied_providers.clear()


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

    Day caps look like:
      GenerateRequestsPerDayPerProjectPerModel-FreeTier
      429 … requestsPerDay / per_day / daily quota

    Soft rate limits also return 429 (sometimes mentioning free-tier RPM) but
    lack an explicit per-day marker — those should backoff, not burn the
    backend for the rest of the run. A per-minute marker coexisting with a
    per-day marker still counts as daily.
    """
    err = str(exc).lower()
    if "429" not in err and "resource_exhausted" not in err:
        return False
    return (
        "perday" in err
        or "per_day" in err
        or "requestsperday" in err
        or "daily quota" in err
        or "generaterequestsperday" in err
    )


def fallback_reason(exc: Exception) -> str:
    """Short label for why a provider was skipped in a fallback chain."""
    if is_auth_permission_error(exc):
        return "permission denied"
    if is_daily_quota_exhausted_error(exc):
        return "free-tier daily quota"
    if is_quota_exhausted_error(exc):
        return "rate limit"
    text = str(exc).strip().splitlines()[0] if str(exc).strip() else "error"
    if "not available" in text.lower():
        return "unavailable"
    if len(text) > 140:
        return text[:137] + "..."
    return text


def format_fallback_chain(fallbacks: list[dict], succeeded: str | None = None) -> str:
    """Render skipped providers and the backend that eventually succeeded.

    ``fallbacks`` items are ``{"provider": name, "reason": why}``.
    """
    parts: list[str] = []
    seen: set[str] = set()
    for item in fallbacks:
        provider = str(item.get("provider") or "unknown")
        reason = str(item.get("reason") or "error")
        parts.append(f"{provider} ({reason})")
        seen.add(provider)
    chain = " → ".join(parts)
    if succeeded and succeeded not in seen:
        return f"{chain} → {succeeded}" if chain else succeeded
    return chain


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
        self._cooldown_seconds: int = get_cooldown_seconds()
    """

    _exhausted_until: dict[str, float]
    _cooldown_seconds: int

    def _is_provider_in_cooldown(self, name: str, *, perm_key: str | None = None) -> bool:
        """Return True when permission-denied (*perm_key*, default *name*) or rate-limited."""
        if is_provider_permission_denied(perm_key or name):
            return True
        if name not in self._exhausted_until:
            return False
        now = time.time()
        expires = self._exhausted_until[name]
        if now >= expires:
            del self._exhausted_until[name]
            logger.info("Provider %s cooldown expired, re-enabling", name)
            return False
        return True

    def _provider_skip_reason(self, name: str, *, perm_key: str | None = None) -> str:
        """Label for a provider skipped before the HTTP call."""
        if is_provider_permission_denied(perm_key or name):
            return "permission denied"
        return "rate-limit cooldown"

    def _mark_provider_exhausted(self, name: str) -> None:
        """Mark *name* as quota-exhausted for ``_cooldown_seconds``."""
        expires = time.time() + self._cooldown_seconds
        self._exhausted_until[name] = expires
        logger.warning(
            "\U0001f6ab Rate limit hit for %s \u2014 cooling down for %ds",
            name,
            self._cooldown_seconds,
        )

    def _mark_provider_failure(
        self, name: str, exc: Exception, *, perm_key: str | None = None,
    ) -> bool:
        """Apply cooldown (by *name*) or process-lifetime disable (by *perm_key*).

        Returns True when auth/quota handling applied; False if the caller
        should log the failure itself.
        """
        if is_auth_permission_error(exc):
            mark_provider_permission_denied(perm_key or name)
            return True
        if is_quota_exhausted_error(exc):
            self._mark_provider_exhausted(name)
            return True
        return False
