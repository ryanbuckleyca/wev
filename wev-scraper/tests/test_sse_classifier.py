"""SSEClassifier grounding policy tests."""

from unittest.mock import MagicMock, patch

from utils.sse_classifier import SSEClassifier


def _ok_sse_json() -> str:
    return """{
  "rating": "no",
  "confidence": 0.7,
  "reasoning": "Insufficient posting text; employer context from search only.",
  "must_haves_met": [],
  "nice_to_haves_met": [],
  "flags": []
}"""


def test_classify_job_blank_description_uses_tavily_grounding():
    """Blank/missing description must still classify with Tavily (not raise)."""
    provider = MagicMock()
    provider.complete.return_value = _ok_sse_json()

    with patch("utils.sse_classifier.get_sse_provider", return_value=provider):
        classifier = SSEClassifier()
        result = classifier.classify_job(
            {
                "org_name": "Park People",
                "title": "Coordinator",
                "location": "Toronto, ON",
                "description": "   ",
            }
        )

    assert result["rating"] == "no"
    provider.complete.assert_called_once()
    kwargs = provider.complete.call_args.kwargs
    assert kwargs.get("use_grounding") is True
    assert kwargs.get("search_query")
    assert "Park People" in kwargs["search_query"]
    assert kwargs.get("require_terms")  # entity tokens from org name
    prompt = provider.complete.call_args.args[0]
    assert "(no description provided)" in prompt


def test_classify_job_with_description_disables_grounding():
    """Posting body present → no Tavily / Google Search grounding."""
    provider = MagicMock()
    provider.complete.return_value = _ok_sse_json()

    with patch("utils.sse_classifier.get_sse_provider", return_value=provider):
        classifier = SSEClassifier()
        classifier.classify_job(
            {
                "org_name": "Park People",
                "title": "Coordinator",
                "location": "Toronto, ON",
                "description": "Help organize community park programs.",
            }
        )

    kwargs = provider.complete.call_args.kwargs
    assert kwargs.get("use_grounding") is False
    assert kwargs.get("search_query") is None
    assert kwargs.get("require_terms") is None


def test_classify_jobs_batch_disables_grounding():
    """Batch already requires descriptions — mirror single-job no-grounding policy."""
    provider = MagicMock()
    provider.complete.return_value = """[
  {
    "index": 0,
    "rating": "no",
    "confidence": 0.6,
    "reasoning": "Corporate role",
    "must_haves_met": [],
    "nice_to_haves_met": [],
    "flags": []
  }
]"""

    with patch("utils.sse_classifier.get_sse_provider", return_value=provider):
        classifier = SSEClassifier()
        results = classifier.classify_jobs_batch(
            [
                {
                    "org_name": "Acme Corp",
                    "title": "Engineer",
                    "location": "Toronto",
                    "description": "Build widgets for customers.",
                }
            ]
        )

    assert len(results) == 1
    kwargs = provider.complete.call_args.kwargs
    assert kwargs.get("use_grounding") is False
    assert kwargs.get("search_query") is None
