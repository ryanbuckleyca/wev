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


def test_compensation_guard_upgrades_nonprofit_false_no():
    from utils.sse_classifier import _apply_nonprofit_compensation_guard

    result = _apply_nonprofit_compensation_guard(
        {
            "rating": "no",
            "confidence": 0.9,
            "reasoning": (
                "A community-focused non-profit human services agency with a "
                "strong social mission. However, the job posting lacks transparent "
                "compensation or wage disclosure for a paid part-time contract."
            ),
            "must_haves_met": ["Clear purpose beyond profit"],
            "nice_to_haves_met": [],
            "flags": ["Missing transparent compensation"],
            "classified_at": "2026-08-04T00:00:00+00:00",
            "reviewed": False,
        },
        org_name="Agence Example Social Services",
    )
    assert result["rating"] == "weak_yes"
    assert any("compensation_guard" in f for f in result["flags"])


def test_compensation_guard_keeps_for_profit_no():
    from utils.sse_classifier import _apply_nonprofit_compensation_guard

    result = _apply_nonprofit_compensation_guard(
        {
            "rating": "no",
            "confidence": 0.9,
            "reasoning": (
                "Conventional for-profit construction firm. Also lacks salary disclosure."
            ),
            "must_haves_met": [],
            "nice_to_haves_met": [],
            "flags": ["for-profit employer", "opaque compensation"],
            "classified_at": "2026-08-04T00:00:00+00:00",
            "reviewed": False,
        },
        org_name="Cite Construction TM inc.",
    )
    assert result["rating"] == "no"


def test_compensation_guard_keeps_hidden_unpaid_no():
    from utils.sse_classifier import _apply_nonprofit_compensation_guard

    result = _apply_nonprofit_compensation_guard(
        {
            "rating": "no",
            "confidence": 0.8,
            "reasoning": (
                "Nonprofit agency posting hides an unpaid trial before any wage disclosure."
            ),
            "must_haves_met": [],
            "nice_to_haves_met": [],
            "flags": ["hidden unpaid trial", "missing compensation"],
            "classified_at": "2026-08-04T00:00:00+00:00",
            "reviewed": False,
        },
        org_name="Community Care Agency",
    )
    assert result["rating"] == "no"
