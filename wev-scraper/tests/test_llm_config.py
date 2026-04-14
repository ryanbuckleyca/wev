"""Tests for grounding configuration logic."""

import os
from unittest.mock import patch

from llm.config import should_use_grounding


def test_should_use_grounding_default():
    """Default should only be True for SSE."""
    with patch.dict(os.environ, {"FORCE_GROUNDING": ""}):
        assert should_use_grounding("sse") is True
        assert should_use_grounding("summarization") is False
        assert should_use_grounding("location_extraction") is False

def test_should_use_grounding_force_true():
    """FORCE_GROUNDING=1 should enable grounding for all tasks."""
    with patch.dict(os.environ, {"FORCE_GROUNDING": "1"}):
        assert should_use_grounding("sse") is True
        assert should_use_grounding("summarization") is True
        assert should_use_grounding("any_task") is True

def test_should_use_grounding_force_false():
    """FORCE_GROUNDING=0 should disable grounding even for SSE."""
    with patch.dict(os.environ, {"FORCE_GROUNDING": "0"}):
        assert should_use_grounding("sse") is False
        assert should_use_grounding("summarization") is False
