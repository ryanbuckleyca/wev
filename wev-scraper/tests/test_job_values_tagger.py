"""Property and parametrized tests for JobValuesTagger serialization round-trip.

Validates: Requirements 1.7
Property: Serializing then deserializing `values_rated` produces an equivalent array
(same values, same confidence scores, same order).
"""

import json
import pytest
from unittest.mock import MagicMock, patch

from utils.job_values_tagger import JobRatedValue, JobValuesTagger
from utils.job_values_prompts import WORK_VALUES_SET


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_values_rated(value_names: list[str]) -> list[JobRatedValue]:
    """Build a `values_rated` array from a list of value name strings."""
    return [{"value": v, "confidence": i + 1} for i, v in enumerate(value_names)]


def _round_trip(values_rated: list[JobRatedValue]) -> list[JobRatedValue]:
    """Serialize to JSON then deserialize back."""
    return json.loads(json.dumps(values_rated))


# ---------------------------------------------------------------------------
# Property / parametrized test
# **Validates: Requirements 1.7**
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("value_names", [
    # empty list
    [],
    # single value
    ["Creativity"],
    # two values
    ["Knowledge", "Challenge"],
    # fewer than 5 (no padding expected)
    ["Security", "Stability", "Recognition"],
    # exactly 5 (max)
    ["Advancement", "Competence", "Creativity", "Knowledge", "Challenge"],
])
def test_values_rated_round_trip(value_names: list[str]):
    """Serializing then deserializing `values_rated` produces an equivalent array.

    **Validates: Requirements 1.7**
    """
    original = _make_values_rated(value_names)
    restored = _round_trip(original)

    # Same length — no padding or truncation
    assert len(restored) == len(original)

    for orig, rest in zip(original, restored):
        # Same value string
        assert rest["value"] == orig["value"]
        # Same confidence score
        assert rest["confidence"] == orig["confidence"]

    # Confidence scores are 1-based positions (1..N) with no gaps
    for idx, item in enumerate(restored):
        assert item["confidence"] == idx + 1


# ---------------------------------------------------------------------------
# Helpers (additional)
# ---------------------------------------------------------------------------

def _make_tagger() -> JobValuesTagger:
    """Create a JobValuesTagger with a mocked LLM provider."""
    with patch("utils.job_values_tagger.get_provider", return_value=MagicMock()):
        return JobValuesTagger()


# Pick 5 canonical values from the taxonomy for use in tests
_CANONICAL = list(WORK_VALUES_SET)[:5]


# ---------------------------------------------------------------------------
# Unit tests for confidence assignment
# **Validates: Requirements 1.2, 1.5**
# ---------------------------------------------------------------------------

def test_normalize_item_five_values_confidences():
    """5 values → values_rated has confidences [1, 2, 3, 4, 5].

    **Validates: Requirements 1.2**
    """
    tagger = _make_tagger()
    five_values = _CANONICAL[:5]
    item = {"values": five_values, "reasoning": "test"}

    result = tagger._normalize_item(item, max_values=5)

    assert len(result["values_rated"]) == 5
    assert [r["confidence"] for r in result["values_rated"]] == [1, 2, 3, 4, 5]
    assert [r["value"] for r in result["values_rated"]] == five_values


def test_normalize_item_two_values_no_padding():
    """2 values → values_rated has confidences [1, 2] with no padding.

    **Validates: Requirements 1.2, 1.5**
    """
    tagger = _make_tagger()
    two_values = _CANONICAL[:2]
    item = {"values": two_values, "reasoning": "test"}

    result = tagger._normalize_item(item, max_values=5)

    assert len(result["values_rated"]) == 2
    assert [r["confidence"] for r in result["values_rated"]] == [1, 2]
    assert [r["value"] for r in result["values_rated"]] == two_values


def test_normalize_item_zero_values_empty_array():
    """0 values → values_rated is an empty array.

    **Validates: Requirements 1.5**
    """
    tagger = _make_tagger()
    item = {"values": [], "reasoning": "test"}

    result = tagger._normalize_item(item, max_values=5)

    assert result["values_rated"] == []
    assert result["values"] == []
