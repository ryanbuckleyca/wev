"""Unit tests for JinaEmbeddingService.

Tests cover:
- ConfigurationError when JINA_API_KEY is absent
- DimensionMismatchError when API returns wrong-dimension vectors
- Retry-After header respected on 429
- Auto-chunking: 200 texts → 2 API calls (ceil(200/128) = 2)
"""

from __future__ import annotations

import math
import os
import time
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_embedding(dim: int = 1024) -> list[float]:
    return [0.1] * dim


def _make_api_response(texts: list[str], dim: int = 1024):
    """Build a mock requests.Response for a Jina API call."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "data": [
            {"index": i, "embedding": _make_fake_embedding(dim)}
            for i in range(len(texts))
        ]
    }
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# ConfigurationError
# ---------------------------------------------------------------------------

def test_configuration_error_when_no_api_key(monkeypatch):
    """ConfigurationError raised when JINA_API_KEY is absent in API mode."""
    from llm.jina_embedding import ConfigurationError, JinaEmbeddingService

    # Patch os.environ.get directly so load_dotenv at import time doesn't interfere
    original_get = os.environ.get

    def patched_get(key, default=""):
        if key == "JINA_API_KEY":
            return ""
        if key == "ENV_MODE":
            return "prod"
        return original_get(key, default)

    monkeypatch.setattr(os, "environ", {**os.environ, "JINA_API_KEY": "", "ENV_MODE": "prod"})

    with pytest.raises(ConfigurationError, match="JINA_API_KEY"):
        JinaEmbeddingService()


def test_no_error_in_local_mode_without_api_key(monkeypatch):
    """No ConfigurationError in local mode even without JINA_API_KEY."""
    monkeypatch.delenv("JINA_API_KEY", raising=False)
    monkeypatch.setenv("ENV_MODE", "test")

    from llm.jina_embedding import JinaEmbeddingService

    svc = JinaEmbeddingService()
    assert svc.is_local is True


# ---------------------------------------------------------------------------
# DimensionMismatchError
# ---------------------------------------------------------------------------

def test_dimension_mismatch_error(monkeypatch):
    """DimensionMismatchError raised when API returns wrong-dimension vector."""
    monkeypatch.setenv("JINA_API_KEY", "fake-key")
    monkeypatch.setenv("ENV_MODE", "prod")

    from llm.jina_embedding import DimensionMismatchError, JinaEmbeddingService

    bad_resp = MagicMock()
    bad_resp.status_code = 200
    bad_resp.json.return_value = {
        "data": [{"index": 0, "embedding": [0.1] * 512}]  # wrong dim
    }
    bad_resp.raise_for_status = MagicMock()

    with patch("requests.post", return_value=bad_resp):
        svc = JinaEmbeddingService()
        with pytest.raises(DimensionMismatchError, match="512"):
            svc.embed(["hello"])


# ---------------------------------------------------------------------------
# Retry-After on 429
# ---------------------------------------------------------------------------

def test_retry_after_header_respected(monkeypatch):
    """Service waits Retry-After seconds before retrying on 429."""
    monkeypatch.setenv("JINA_API_KEY", "fake-key")
    monkeypatch.setenv("ENV_MODE", "prod")

    from llm.jina_embedding import JinaEmbeddingService

    rate_limit_resp = MagicMock()
    rate_limit_resp.status_code = 429
    rate_limit_resp.headers = {"Retry-After": "2"}

    ok_resp = _make_api_response(["hello"])

    sleep_calls: list[float] = []

    def fake_sleep(secs):
        sleep_calls.append(secs)

    with patch("requests.post", side_effect=[rate_limit_resp, ok_resp]):
        with patch("time.sleep", side_effect=fake_sleep):
            svc = JinaEmbeddingService()
            result = svc.embed(["hello"])

    assert len(result) == 1
    assert len(sleep_calls) == 1
    assert sleep_calls[0] == 2.0


# ---------------------------------------------------------------------------
# Auto-chunking
# ---------------------------------------------------------------------------

def test_auto_chunk_over_128(monkeypatch):
    """200 texts → exactly 2 API calls (ceil(200/128) = 2)."""
    monkeypatch.setenv("JINA_API_KEY", "fake-key")
    monkeypatch.setenv("ENV_MODE", "prod")

    from llm.jina_embedding import JinaEmbeddingService

    texts = [f"text {i}" for i in range(200)]
    call_count = 0

    def fake_post(url, json, headers, timeout):
        nonlocal call_count
        call_count += 1
        return _make_api_response(json["input"])

    with patch("requests.post", side_effect=fake_post):
        svc = JinaEmbeddingService()
        result = svc.embed(texts)

    expected_calls = math.ceil(200 / 128)  # 2
    assert call_count == expected_calls
    assert len(result) == 200
