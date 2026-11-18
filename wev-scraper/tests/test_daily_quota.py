"""Tests for hard daily-quota classification vs soft RPM/TPM 429s."""

from llm.cooldown import (
    ProviderCooldownMixin,
    clear_permission_denied_providers,
    fallback_reason,
    get_cooldown_seconds,
    is_auth_permission_error,
    is_daily_quota_exhausted_error,
    is_provider_permission_denied,
    is_quota_exhausted_error,
    mark_provider_permission_denied,
)


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


def test_permission_denied_disables_provider_for_process():
    clear_permission_denied_providers()
    try:
        name = "gemini-3.6-flash"
        assert is_provider_permission_denied(name) is False
        mark_provider_permission_denied(name)
        assert is_provider_permission_denied(name) is True

        class _Chain(ProviderCooldownMixin):
            def __init__(self):
                self._exhausted_until = {}
                self._cooldown_seconds = get_cooldown_seconds()

        chain = _Chain()
        assert chain._is_provider_in_cooldown(name) is True
        assert chain._provider_skip_reason(name) == "permission denied"
        assert chain._mark_provider_failure(
            name,
            Exception("403 PERMISSION_DENIED The caller does not have permission"),
        ) is True
    finally:
        clear_permission_denied_providers()


def test_cooldown_seconds_default_and_env(monkeypatch):
    monkeypatch.delenv("QUOTA_COOLDOWN_SECONDS", raising=False)
    monkeypatch.delenv("QUOTA_COOLDOWN_MINUTES", raising=False)
    assert get_cooldown_seconds() == 15

    monkeypatch.setenv("QUOTA_COOLDOWN_SECONDS", "15")
    assert get_cooldown_seconds() == 15

    monkeypatch.delenv("QUOTA_COOLDOWN_SECONDS", raising=False)
    monkeypatch.setenv("QUOTA_COOLDOWN_MINUTES", "2")
    assert get_cooldown_seconds() == 120
