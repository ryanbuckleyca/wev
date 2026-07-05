"""Tests for OrganizationSSEClassifier.

Validates: Requirements 5.1, 5.2, 5.3
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_org(
    name="Test Org",
    description="A community nonprofit",
    org_type="nonprofit",
    website="https://example.org",
    values="Community empowerment",
):
    return {
        "name": name,
        "description": description,
        "type": org_type,
        "website": website,
        "values": values,
    }


def _make_valid_response(
    rating="strong_yes",
    confidence=0.85,
    reasoning="SSE-aligned nonprofit",
):
    return json.dumps({
        "rating": rating,
        "confidence": confidence,
        "reasoning": reasoning,
        "must_haves_met": ["clear_mission"],
        "nice_to_haves_met": ["cooperative_governance"],
        "flags": [],
    })


def _make_classifier(provider_response=None, provider_side_effect=None):
    """Build a classifier with a mocked provider."""
    mock_provider = MagicMock()
    if provider_side_effect:
        mock_provider.complete.side_effect = provider_side_effect
    else:
        mock_provider.complete.return_value = provider_response or _make_valid_response()

    with patch(
        "utils.organization_sse_classifier.get_sse_provider",
        return_value=mock_provider,
    ):
        from utils.organization_sse_classifier import OrganizationSSEClassifier
        classifier = OrganizationSSEClassifier()

    return classifier, mock_provider


# ── Property-based tests ──────────────────────────────────────────────────────


# Feature: organizations, Property 7
@given(rating=st.sampled_from(["strong_yes", "weak_yes", "no"]))
@settings(max_examples=50, deadline=None)
def test_is_sse_consistent_with_rating(rating):
    """Property 7: is_sse is always consistent with sse_rating.

    For any rating in {strong_yes, weak_yes, no}, is_sse is True iff
    rating is strong_yes or weak_yes.
    """
    from utils.organization_sse_classifier import is_sse_from_rating

    result = is_sse_from_rating(rating)

    if rating in ("strong_yes", "weak_yes"):
        assert result is True, f"is_sse should be True for rating={rating}"
    else:
        assert result is False, f"is_sse should be False for rating={rating}"


# Feature: organizations, Property 7
@given(rating=st.sampled_from(["strong_yes", "weak_yes", "no"]))
@settings(max_examples=50, deadline=None)
def test_classifier_result_is_sse_consistency(rating):
    """Property 7 applied to classifier output: classifying with a mocked
    provider that returns a valid response with the given rating produces
    is_sse consistent with that rating.
    """
    from utils.organization_sse_classifier import is_sse_from_rating

    classifier, _ = _make_classifier(provider_response=_make_valid_response(rating=rating))
    result = classifier.classify(_make_org())

    assert result["rating"] == rating
    assert is_sse_from_rating(result["rating"]) == (rating in ("strong_yes", "weak_yes"))


# ── Example-based tests ──────────────────────────────────────────────────────


class TestClassifierInit:
    def test_raises_when_no_provider_available(self):
        from utils.organization_sse_classifier import OrganizationSSEClassifier
        from utils.sse_classifier import SSEClassificationError

        with patch(
            "utils.organization_sse_classifier.get_sse_provider",
            return_value=None,
        ):
            with pytest.raises(SSEClassificationError, match="not available"):
                OrganizationSSEClassifier()


class TestClassifySuccess:
    def test_valid_response_returns_correct_result(self):
        classifier, _ = _make_classifier(
            provider_response=_make_valid_response(
                rating="strong_yes", confidence=0.9, reasoning="Clear SSE alignment",
            ),
        )
        result = classifier.classify(_make_org())

        assert result["rating"] == "strong_yes"
        assert result["confidence"] == 0.9
        assert result["reasoning"] == "Clear SSE alignment"
        assert "classified_at" in result
        assert result["reviewed"] is False

    def test_prompt_includes_org_name(self):
        classifier, mock_provider = _make_classifier()
        classifier.classify(_make_org(name="Le Depot Community"))

        prompt = mock_provider.complete.call_args[0][0]
        assert "Le Depot Community" in prompt

    def test_prompt_includes_analyze_this_organization(self):
        classifier, mock_provider = _make_classifier()
        classifier.classify(_make_org())

        prompt = mock_provider.complete.call_args[0][0]
        assert "ANALYZE THIS ORGANIZATION" in prompt

    def test_prompt_does_not_include_analyze_this_job(self):
        classifier, mock_provider = _make_classifier()
        classifier.classify(_make_org())

        prompt = mock_provider.complete.call_args[0][0]
        assert "ANALYZE THIS JOB" not in prompt

    def test_search_query_includes_org_name(self):
        classifier, mock_provider = _make_classifier()
        classifier.classify(_make_org(name="Centraide Montréal"))

        search_query = mock_provider.complete.call_args[1].get("search_query", "")
        assert '"Centraide Montréal"' in search_query

    def test_system_prompt_mentions_organizations(self):
        classifier, mock_provider = _make_classifier()
        classifier.classify(_make_org())

        system = mock_provider.complete.call_args[1].get("system", "")
        assert "organization" in system.lower()

    def test_response_wrapped_in_markdown_fences_parsed_correctly(self):
        response = '```json\n' + _make_valid_response(rating="weak_yes") + '\n```'
        classifier, _ = _make_classifier(provider_response=response)

        result = classifier.classify(_make_org())
        assert result["rating"] == "weak_yes"

    def test_confidence_clamped_to_0_1_range(self):
        classifier, _ = _make_classifier(
            provider_response=_make_valid_response(confidence=1.5),
        )
        result = classifier.classify(_make_org())
        assert result["confidence"] == 1.0


class TestClassifyFailure:
    def test_unparseable_response_falls_back_to_default(self):
        classifier, _ = _make_classifier(provider_response="not valid json at all")

        result = classifier.classify(_make_org())

        assert result["rating"] == "no"
        assert "classification_failed" in result["flags"]

    def test_missing_required_field_falls_back_to_default(self):
        bad_response = json.dumps({"rating": "strong_yes"})  # missing confidence, etc.
        classifier, _ = _make_classifier(provider_response=bad_response)

        result = classifier.classify(_make_org())

        assert result["rating"] == "no"
        assert "classification_failed" in result["flags"]

    def test_invalid_rating_value_falls_back_to_default(self):
        bad_response = json.dumps({
            "rating": "maybe",
            "confidence": 0.5,
            "reasoning": "Unsure",
            "must_haves_met": [],
            "flags": [],
        })
        classifier, _ = _make_classifier(provider_response=bad_response)

        result = classifier.classify(_make_org())

        assert result["rating"] == "no"
        assert "classification_failed" in result["flags"]

    def test_provider_rate_limit_raises_sse_error(self):
        from llm.base import LLMProviderError
        from utils.sse_classifier import SSEClassificationError

        classifier, _ = _make_classifier(
            provider_side_effect=LLMProviderError("429 rate limited"),
        )

        with pytest.raises(SSEClassificationError, match="LLM provider error"):
            classifier.classify(_make_org())

    def test_provider_quota_error_raises_sse_error(self):
        from utils.sse_classifier import SSEClassificationError

        classifier, _ = _make_classifier(
            provider_side_effect=Exception("resource_exhausted: quota exceeded"),
        )

        with pytest.raises(SSEClassificationError, match="LLM API error"):
            classifier.classify(_make_org())

    def test_provider_permission_error_raises_sse_error(self):
        from utils.sse_classifier import SSEClassificationError

        classifier, _ = _make_classifier(
            provider_side_effect=Exception("403 permission denied"),
        )

        with pytest.raises(SSEClassificationError, match="permission denied"):
            classifier.classify(_make_org())

    def test_two_parse_failures_returns_default_classification(self):
        """After 2 attempts both failing to parse, returns default 'no'."""
        classifier, mock_provider = _make_classifier()
        mock_provider.complete.return_value = "garbage"

        result = classifier.classify(_make_org())

        assert result["rating"] == "no"
        assert "classification_failed" in result["flags"]
        assert mock_provider.complete.call_count == 2

    def test_first_parse_failure_retries_and_succeeds(self):
        classifier, mock_provider = _make_classifier()
        mock_provider.complete.side_effect = [
            "bad json",
            _make_valid_response(rating="weak_yes"),
        ]

        result = classifier.classify(_make_org())

        assert result["rating"] == "weak_yes"
        assert mock_provider.complete.call_count == 2
