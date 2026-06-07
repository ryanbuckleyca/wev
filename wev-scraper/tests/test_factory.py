from unittest.mock import MagicMock, patch

from llm.factory import get_job_summary_provider


def test_get_job_summary_provider_local():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=True):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with(name="local_grounded")

def test_get_job_summary_provider_remote_env():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with()

def test_get_job_summary_provider_default():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with()
