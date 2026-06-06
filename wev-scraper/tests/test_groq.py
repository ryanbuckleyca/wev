import pytest
import json
import time
from unittest.mock import MagicMock, patch
from llm.groq import GroqProvider, _strip_org_name, LLMProviderError

def test_strip_org_name():
    # Test with simple name
    assert _strip_org_name("Developer at OrgName", "OrgName") == "Developer at"
    # Test with name containing spaces
    assert _strip_org_name("Developer Org Name", "Org Name") == "Developer"
    # Test with aliases
    assert _strip_org_name("Developer Org", "Org | Alias") == "Developer"
    # Test with acronyms
    assert _strip_org_name("Role CELA", "Canadian Environmental Law Association (CELA)") == "Role"

def test_groq_init_and_availability():
    provider = GroqProvider(api_key="test-key")
    assert provider.is_available() is True

    with patch.dict("os.environ", {"GROQ_API_KEY": ""}):
        provider2 = GroqProvider(api_key="")
        assert provider2.is_available() is False

def test_get_next_model():
    provider = GroqProvider(api_key="key")
    first = provider._model
    provider._mark_model_exhausted(first)
    assert provider._model != first
    assert provider._model in ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant", "qwen/qwen3-32b", "moonshotai/kimi-k2-instruct-0905"]

@patch("requests.post")
def test_request_success(mock_post):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.ok = True
    mock_resp.json.return_value = {"choices": [{"message": {"content": "hello"}}]}
    mock_post.return_value = mock_resp

    provider = GroqProvider(api_key="key")
    res = provider._request("/v1/chat", {"messages": []})
    assert res["choices"][0]["message"]["content"] == "hello"

@patch("requests.post")
@patch("time.sleep")
def test_request_rate_limit_tpm(mock_sleep, mock_post):
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.text = "Rate limit reached for tokens per minute"
    mock_resp_429.headers = {"retry-after": "1"}

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.ok = True
    mock_resp_200.json.return_value = {"ok": True}

    mock_post.side_effect = [mock_resp_429, mock_resp_200]

    provider = GroqProvider(api_key="key")
    res = provider._request("/v1/chat", {"messages": []})
    assert res["ok"] is True
    assert mock_sleep.called

@patch("requests.post")
def test_request_daily_quota_fallback(mock_post):
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.text = "Daily quota reached for tokens per day"

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.ok = True
    mock_resp_200.json.return_value = {"ok": True}

    mock_post.side_effect = [mock_resp_429, mock_resp_200]

    provider = GroqProvider(api_key="key")
    initial_model = provider._model
    res = provider._request("/v1/chat", {"messages": []})
    assert res["ok"] is True
    assert provider._model != initial_model

def test_complete():
    provider = GroqProvider(api_key="key")
    with patch.object(provider, "_request") as mock_req:
        mock_req.return_value = {"choices": [{"message": {"content": "response"}}]}
        res = provider.complete("hello")
        assert res == "response"

def test_summarize_and_tag_values():
    provider = GroqProvider(api_key="key")
    # The regex for summary: expects it to end with newline or }
    mock_response = (
        "summary: This is a summary.\n"
        "skills: [python, testing]\n"
        "values: [Ambition, Integrity]\n"
    )
    # We also need to mock the taxonomy for values check
    with patch("utils.job_values_prompts.WORK_VALUES_TAXONOMY", [("Ambition", "desc"), ("Integrity", "desc")]):
        with patch.object(provider, "complete", return_value=mock_response):
            res = provider.summarize_and_tag_values("job text", org_name="Test Org")
            assert res["summary"] == "This is a summary."
            assert "python" in res["skills"]
            assert "Ambition" in res["values"]

def test_summarize_and_tag_values_batch():
    provider = GroqProvider(api_key="key")
    batch_data = [
        {"index": 1, "summary": "Sum 1", "skills": ["s1"], "values": ["Ambition"]},
        {"index": 2, "summary": "Sum 2", "skills": ["s2"], "values": ["Integrity"]}
    ]
    mock_response = f"Here is JSON: {json.dumps(batch_data)}"

    with patch("utils.job_values_prompts.WORK_VALUES_TAXONOMY", [("Ambition", "desc"), ("Integrity", "desc")]):
        with patch.object(provider, "complete", return_value=mock_response):
            jobs = [{"job_title": "J1"}, {"job_title": "J2"}]
            res = provider.summarize_and_tag_values_batch(jobs)
            assert len(res) == 2
            assert res[0]["summary"] == "Sum 1"
            assert res[1]["summary"] == "Sum 2"
            assert "Ambition" in res[0]["values"]

def test_summarize_text():
    provider = GroqProvider(api_key="key")
    with patch.object(provider, "complete", return_value="Summary: A nice job"):
        res = provider.summarize_text("text")
        assert res == "A nice job"
