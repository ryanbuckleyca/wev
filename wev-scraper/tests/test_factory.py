import pytest
from unittest.mock import patch, MagicMock
from llm.factory import get_job_summary_provider, PROVIDERS

def test_get_job_summary_provider_local():
    with patch("llm.factory._is_local_mode", return_value=True):
        with patch.dict(PROVIDERS, {"local_grounded": MagicMock()}):
            provider = get_job_summary_provider()
            assert provider is not None

def test_get_job_summary_provider_remote_env():
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_stripped_env", return_value="gemini"):
            with patch.dict(PROVIDERS, {"gemini": MagicMock()}):
                provider = get_job_summary_provider()
                assert provider is not None

def test_get_job_summary_provider_default():
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_stripped_env", return_value=None):
            with patch.dict(PROVIDERS, {"groq": MagicMock()}):
                provider = get_job_summary_provider()
                assert provider is not None
