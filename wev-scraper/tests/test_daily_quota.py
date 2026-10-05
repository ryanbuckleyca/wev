"""Tests for hard daily-quota classification vs soft RPM/TPM 429s."""

from llm.cooldown import is_daily_quota_exhausted_error, is_quota_exhausted_error


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
