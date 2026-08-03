"""Tests for shared Tavily evidence helpers."""

from unittest.mock import MagicMock, patch

import pytest

from llm.local_grounded import _truncate_keep_ends
from llm.tavily_grounding import (
    TavilyUnavailableError,
    entity_require_terms,
    inject_grounding_evidence,
    is_tavily_available,
    require_tavily,
    trim_evidence,
)


def test_require_tavily_raises_when_api_key_unset():
    with patch("llm.tavily_grounding.tavily_api_key", return_value=""):
        with pytest.raises(TavilyUnavailableError, match="TAVILY_API_KEY"):
            require_tavily()


def test_require_tavily_raises_when_package_missing():
    with patch("llm.tavily_grounding.tavily_api_key", return_value="fake-key"), \
         patch(
             "llm.tavily_grounding._tavily_import_error",
             return_value="No module named 'tavily'",
         ):
        with pytest.raises(TavilyUnavailableError, match="not importable"):
            require_tavily()


def test_require_tavily_raises_when_client_construct_fails():
    with patch("llm.tavily_grounding.tavily_api_key", return_value="fake-key"), \
         patch("llm.tavily_grounding._tavily_import_error", return_value=None), \
         patch(
             "llm.tavily_grounding._client",
             side_effect=RuntimeError("bad credentials"),
         ):
        with pytest.raises(TavilyUnavailableError, match="could not be constructed"):
            require_tavily()


def test_is_tavily_available_false_without_key():
    with patch("llm.tavily_grounding.tavily_api_key", return_value=""):
        assert is_tavily_available() is False


def test_is_tavily_available_false_when_import_fails():
    with patch("llm.tavily_grounding.tavily_api_key", return_value="fake-key"), \
         patch(
             "llm.tavily_grounding._tavily_import_error",
             return_value="No module named 'tavily'",
         ):
        assert is_tavily_available() is False



def test_fetch_tavily_evidence_returns_urls():
    from llm.tavily_grounding import TavilyEvidence, fetch_tavily_evidence

    fake_client = MagicMock()
    fake_client.search.return_value = {
        "results": [
            {
                "title": "Acme",
                "url": "https://acme.org/about",
                "content": "Acme does good work.",
            },
            {
                "title": "News",
                "url": "https://news.ca/acme",
                "content": "Acme mentioned.",
            },
        ]
    }
    with patch("llm.tavily_grounding.is_tavily_available", return_value=True), \
         patch("llm.tavily_grounding._client", return_value=fake_client):
        ev = fetch_tavily_evidence('"Acme" official website')
    assert isinstance(ev, TavilyEvidence)
    assert "Acme does good work" in ev.text
    assert ev.urls == ["https://acme.org/about", "https://news.ca/acme"]
    assert len(ev.results) == 2
    assert ev.results[0].title == "Acme"
    assert ev.results[0].url == "https://acme.org/about"
    assert "good work" in ev.results[0].content


def test_fetch_tavily_evidence_ranks_location_mentions():
    from llm.tavily_grounding import fetch_tavily_evidence

    fake_client = MagicMock()
    fake_client.search.return_value = {
        "results": [
            {
                "title": "Foxhole Farm Ohio",
                "url": "https://foxholefarmohio.com",
                "content": "Brookville Ohio vegetables",
            },
            {
                "title": "Foxhole Farm Rockwood",
                "url": "https://example.ca/foxhole",
                "content": "CSA near Rockwood Ontario Canada",
            },
        ]
    }
    with patch("llm.tavily_grounding.is_tavily_available", return_value=True), \
         patch("llm.tavily_grounding._client", return_value=fake_client):
        ev = fetch_tavily_evidence(
            '"Foxhole Farm" Rockwood Ontario',
            location_terms=["rockwood", "ontario", "canada"],
        )
    assert ev.urls[0] == "https://example.ca/foxhole"


def test_inject_grounding_evidence_marks_search_as_secondary():
    out = inject_grounding_evidence("PROMPT BODY", "snippet about org")
    assert out.startswith("SUPPORTING WEB EVIDENCE")
    assert "PRIMARY" in out or "primary" in out.lower()
    assert "NEVER invent" in out or "never invent" in out.lower()
    assert "SOURCE DESCRIPTION" in out
    assert "snippet about org" in out
    assert out.endswith("PROMPT BODY")


def test_inject_grounding_evidence_skips_blank():
    assert inject_grounding_evidence("PROMPT", "  ") == "PROMPT"
    assert inject_grounding_evidence("PROMPT", "") == "PROMPT"


def test_trim_evidence_respects_budget():
    long = "word " * 500
    trimmed = trim_evidence(long, max_chars=40)
    assert len(trimmed) <= 41  # ellipsis
    assert trimmed.endswith("…")


def test_entity_require_terms_skips_stopwords():
    terms = entity_require_terms("Goparity Canada Inc")
    assert "goparity" in terms
    assert "canada" not in terms
    assert "inc" not in terms


def test_truncate_keep_ends_preserves_tail_json():
    head = "RULES " * 200
    tail = '{"is_sse": true, "sse_rating": "strong_yes"}'
    full = head + "MIDDLE NOISE " * 400 + tail
    out = _truncate_keep_ends(full, max_chars=800, head_ratio=0.2)
    assert len(out) <= 800
    assert "RULES" in out
    assert '"sse_rating"' in out
    assert "truncated" in out.lower()


def test_org_assessment_prompt_keeps_description_out_of_interpretive_fields():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Park People",
        "Toronto",
        "ON",
        job_title="Coordinator",
        description="listing should be identity only",
        existing_description="Stored org blurb about parks.",
        listing_notes="listing should be identity only",
    )
    assert "SOURCE DESCRIPTION vs INTERPRETIVE FIELDS" in prompt
    assert "NEVER use SOURCE DESCRIPTION" in prompt
    assert "Stored org blurb about parks." in prompt
    assert "listing should be identity only" in prompt
    assert "not for interpretive fields" in prompt


def test_org_prompt_keeps_entity_after_local_truncate():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Park People",
        "Toronto",
        "ON",
        "Coordinator",
        "park notes",
        known_website="https://parkpeople.ca",
    )
    assert "ORGANIZATION DATA" in prompt
    # Entity block must sit near the end so head+tail truncation keeps it.
    assert prompt.rfind("ORGANIZATION DATA") > prompt.find("ALLOWED VALUES")
    truncated = _truncate_keep_ends(prompt, max_chars=8000)
    assert "Park People" in truncated
    assert "canonical_name" in truncated
    assert "parkpeople.ca" in truncated.lower()
