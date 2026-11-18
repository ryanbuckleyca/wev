"""Tests for hard daily-quota classification vs soft RPM/TPM 429s."""

import pytest

from llm.base import BaseLLMProvider, LLMProviderError
from llm.cooldown import (
    ProviderCooldownMixin,
    clear_permission_denied_providers,
    fallback_reason,
    get_cooldown_seconds,
    is_auth_permission_error,
    is_daily_quota_exhausted_error,
    is_provider_daily_exhausted,
    is_provider_permission_denied,
    is_quota_exhausted_error,
    mark_provider_permission_denied,
    permission_key,
)
from llm.unified_provider import UnifiedJobProcessor


def test_daily_quota_requires_explicit_per_day_marker():
    daily = Exception(
        "429 RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProjectPerModel-FreeTier"
    )
    assert is_daily_quota_exhausted_error(daily) is True
    assert is_quota_exhausted_error(daily) is True

    soft_free_tier_rpm = Exception(
        "429 RESOURCE_EXHAUSTED free_tier_requests limit: 20 Please retry in 15s"
    )
    # Generic free_tier without a per-day marker is soft (cooldown), not day-burn.
    assert is_daily_quota_exhausted_error(soft_free_tier_rpm) is False
    assert is_quota_exhausted_error(soft_free_tier_rpm) is True


def test_daily_quota_detects_current_gemini_free_tier_wording():
    """Wording seen from Gemini on 2026-11-18 (previously treated as a 15s cooldown)."""
    day_cap = Exception(
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your "
        "current quota ... Quota exceeded for metric: generativelanguage.googleapis.com/"
        "generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash, "
        "description: Generate content requests per day limit exceeded on Free Tier.'}}"
    )
    assert is_daily_quota_exhausted_error(day_cap) is True
    assert fallback_reason(day_cap) == "free-tier daily quota"


def test_daily_quota_disables_provider_across_chains():
    first = _Chain()
    assert first._mark_provider_failure(
        "gemini-x",
        Exception("429 RESOURCE_EXHAUSTED requests per day limit exceeded"),
        perm_key="gemini-x@abc",
    ) is True
    assert is_provider_daily_exhausted("gemini-x@abc") is True
    second = _Chain()
    assert second._is_provider_in_cooldown("gemini-x", perm_key="gemini-x@abc") is True
    assert second._provider_skip_reason("gemini-x", perm_key="gemini-x@abc") == (
        "free-tier daily quota"
    )
    assert second._is_provider_in_cooldown("gemini-x", perm_key="gemini-x@other") is False


def test_daily_quota_not_rejected_when_per_minute_also_present():
    both = Exception(
        "429 RESOURCE_EXHAUSTED RequestsPerDay and RequestsPerMinute FreeTier"
    )
    assert is_daily_quota_exhausted_error(both) is True


def test_auth_permission_error_detection_and_fallback_reason():
    denied = Exception(
        "403 PERMISSION_DENIED. {'error': {'code': 403, 'message': "
        "'The caller does not have permission', 'status': 'PERMISSION_DENIED'}}"
    )
    assert is_auth_permission_error(denied) is True
    assert is_quota_exhausted_error(denied) is False
    assert fallback_reason(denied) == "permission denied"

    soft = Exception("429 RESOURCE_EXHAUSTED rate limit")
    assert is_auth_permission_error(soft) is False


def test_auth_permission_error_uses_structured_status_through_wrappers():
    class _ApiError(Exception):
        def __init__(self, code):
            super().__init__("upstream error")
            self.code = code

    try:
        try:
            raise _ApiError(403)
        except _ApiError as inner:
            raise RuntimeError("Gemini completion error") from inner
    except RuntimeError as wrapped:
        assert is_auth_permission_error(wrapped) is True

    assert is_auth_permission_error(_ApiError(429)) is False


def test_auth_permission_error_ignores_incidental_403_text():
    assert is_auth_permission_error(Exception("503 UNAVAILABLE request id 40312a")) is False
    assert is_auth_permission_error(
        Exception("500 INTERNAL see https://example.com/errors/403 for details")
    ) is False
    assert is_auth_permission_error(Exception("API key not valid. Please pass a valid API key.")) is True


class _Chain(ProviderCooldownMixin):
    def __init__(self):
        self._exhausted_until = {}
        self._cooldown_seconds = get_cooldown_seconds()


def test_permission_denied_disables_provider_for_process():
    clear_permission_denied_providers()
    try:
        name = "test-permission-model-fresh"
        assert is_provider_permission_denied(name) is False

        first = _Chain()
        assert first._is_provider_in_cooldown(name) is False
        assert first._mark_provider_failure(
            name,
            Exception("403 PERMISSION_DENIED The caller does not have permission"),
        ) is True
        assert is_provider_permission_denied(name) is True

        second = _Chain()
        assert second._is_provider_in_cooldown(name) is True
        assert second._provider_skip_reason(name) == "permission denied"
    finally:
        clear_permission_denied_providers()


def test_permission_denied_is_keyed_by_model_and_credential():
    class _Provider:
        def __init__(self, key):
            self._api_key = key

    clear_permission_denied_providers()
    try:
        key_a = permission_key("gemini-x", _Provider("secret-key-a"))
        key_b = permission_key("gemini-x", _Provider("secret-key-b"))
        assert key_a != key_b
        assert "secret-key-a" not in key_a

        mark_provider_permission_denied(key_a)
        chain = _Chain()
        assert chain._is_provider_in_cooldown("gemini-x", perm_key=key_a) is True
        assert chain._is_provider_in_cooldown("gemini-x", perm_key=key_b) is False
        assert permission_key("gemini-y", _Provider("secret-key-a")) != key_a
    finally:
        clear_permission_denied_providers()


def test_cooldown_seconds_default_and_env(monkeypatch):
    monkeypatch.delenv("QUOTA_COOLDOWN_SECONDS", raising=False)
    monkeypatch.delenv("QUOTA_COOLDOWN_MINUTES", raising=False)
    assert get_cooldown_seconds() == 15

    monkeypatch.setenv("QUOTA_COOLDOWN_MINUTES", "2")
    monkeypatch.setenv("QUOTA_COOLDOWN_SECONDS", "23")
    assert get_cooldown_seconds() == 23

    monkeypatch.delenv("QUOTA_COOLDOWN_SECONDS", raising=False)
    assert get_cooldown_seconds() == 120


class _FailingProvider(BaseLLMProvider):
    def __init__(self, exc: Exception):
        self._exc = exc

    def is_available(self) -> bool:
        return True

    def get_token_limits(self) -> dict:
        return {"max_tokens_per_request": 8000, "recommended_batch_size": 4000}

    def summarize_text(self, text, max_chars=300, org_name=None, job_title=None):
        raise self._exc

    def complete(self, prompt, model=None, system=None, **kwargs):
        raise self._exc


def _unified_with(*providers: tuple[str, BaseLLMProvider]) -> UnifiedJobProcessor:
    proc = UnifiedJobProcessor.__new__(UnifiedJobProcessor)
    proc._exhausted_until = {}
    proc._cooldown_seconds = 15
    proc._daily_quota_exhausted = set()
    proc.providers = [
        {"name": n, "provider": p, "description": n} for n, p in providers
    ]
    proc.last_successful_provider = None
    return proc


def test_complete_batch_reraises_auth_error_for_fallback():
    provider = _FailingProvider(LLMProviderError("403 PERMISSION_DENIED denied"))
    with pytest.raises(LLMProviderError):
        provider.complete_batch(
            items=[{"id": 1}],
            build_prompt=lambda batch: "prompt",
            parse_response=lambda raw, batch: [raw],
            raise_for_fallback=True,
        )
    assert provider.complete_batch(
        items=[{"id": 1}],
        build_prompt=lambda batch: "prompt",
        parse_response=lambda raw, batch: [raw],
    ) == [None]


def test_unified_daily_quota_abort_ignores_permission_denied_tiers():
    clear_permission_denied_providers()
    try:
        primary = _FailingProvider(LLMProviderError("unused"))
        lite = _FailingProvider(LLMProviderError("unused"))
        proc = _unified_with(("gemini-primary", primary), ("gemini-lite", lite))
        proc._daily_quota_exhausted.add("gemini-lite")
        assert proc._all_api_daily_quotas_exhausted() is False

        mark_provider_permission_denied(proc._perm_key(proc.providers[0]))
        assert proc._all_api_daily_quotas_exhausted() is True
    finally:
        clear_permission_denied_providers()


def test_unified_all_skipped_reports_permission_denied():
    clear_permission_denied_providers()
    try:
        proc = _unified_with(("gemini-primary", _FailingProvider(LLMProviderError("unused"))))
        mark_provider_permission_denied(proc._perm_key(proc.providers[0]))
        result = proc.process_jobs([{"id": 1, "title": "x", "description": "y"}])
        assert result["results"] == []
        assert "permission denied" in result["error"]
        assert "None" not in result["error"]
    finally:
        clear_permission_denied_providers()
