"""Unit tests for hard source-grounding of description / mission / values."""

from utils.source_grounding import (
    build_grounding_corpora,
    ground_assessed_fields,
    html_to_text,
    normalize_for_grounding,
    significant_tokens,
    text_appears_in_corpus,
)


def test_normalize_for_grounding_strips_punct_and_case():
    assert normalize_for_grounding("Hello, World!") == "hello world"
    assert normalize_for_grounding("  Café   Noir  ") == "café noir"


def test_significant_tokens_skips_stopwords():
    toks = significant_tokens("The farm grows organic produce for the community")
    assert "farm" in toks
    assert "organic" in toks
    assert "the" not in toks


def test_html_to_text_strips_tags_and_reads_title():
    html = """
    <html><head><title>Foxhole Farm Ohio</title>
    <style>.x{color:red}</style></head>
    <body><h1>Welcome</h1><p>Located in Brookville, Ohio.</p>
    <script>evil()</script></body></html>
    """
    text, title = html_to_text(html)
    assert title == "Foxhole Farm Ohio"
    assert "Brookville" in text
    assert "evil" not in text
    assert "color:red" not in text


def test_text_appears_in_corpus_accepts_consecutive_phrase():
    corpus = (
        "Foxhole Farm is a family farm in Rockwood Ontario growing "
        "vegetables and herbs for the local community market"
    )
    claim = (
        "Foxhole Farm grows vegetables and herbs for the local community market"
    )
    assert text_appears_in_corpus(claim, corpus) is True


def test_text_appears_in_corpus_rejects_invented_copy():
    corpus = "Acme Co-op runs a grocery in Toronto Ontario."
    claim = (
        "Acme Co-op pioneers blockchain-based regenerative finance across "
        "seventeen continents with quantum governance"
    )
    assert text_appears_in_corpus(claim, corpus) is False


def test_text_appears_in_corpus_accepts_near_substring():
    corpus = (
        "Our mission is to build affordable housing with community partners "
        "across Montreal and surrounding areas."
    )
    claim = "build affordable housing with community partners across Montreal"
    assert text_appears_in_corpus(claim, corpus) is True


def test_ground_assessed_fields_extracted_requires_primary():
    result = {
        "description_en": (
            "We grow organic vegetables for the Rockwood community market"
        ),
        "description_fr": "Nous cultivons des légumes biologiques",
        "mission_statement_en": None,
        "mission_statement_fr": None,
        "values_raw": None,
        "flags": ["description via=extracted", "mission via=absent", "values via=absent"],
    }
    primary = (
        "Foxhole Farm grows organic vegetables for the Rockwood community market "
        "every weekend"
    )
    corpora = build_grounding_corpora(website_text=primary)
    out = ground_assessed_fields(result, corpora)
    assert out["description_en"] is not None
    assert "description via=extracted" in out["flags"]


def test_ground_assessed_fields_secondary_only_is_inferred():
    result = {
        "description_en": (
            "Park People builds parks and public space across Toronto"
        ),
        "description_fr": None,
        "mission_statement_en": None,
        "mission_statement_fr": None,
        "values_raw": None,
        "flags": ["description via=extracted"],
    }
    secondary = (
        "Park People | https://linkedin.com/company/x\n"
        "Park People builds parks and public space across Toronto with volunteers"
    )
    corpora = build_grounding_corpora(tavily_text=secondary)
    out = ground_assessed_fields(result, corpora)
    assert out["description_en"] is not None
    assert "description via=inferred" in out["flags"]
    assert "description via=extracted" not in out["flags"]


def test_ground_assessed_fields_rejects_ungrounded():
    result = {
        "description_en": (
            "Invented nonprofit that teleports food to Mars using solidarity"
        ),
        "description_fr": "Version française inventée complètement",
        "mission_statement_en": "Save the galaxy through co-ops",
        "mission_statement_fr": None,
        "values_raw": "Quantum kindness and astral solidarity",
        "flags": [
            "description via=extracted",
            "mission via=extracted",
            "values via=extracted",
        ],
    }
    corpora = build_grounding_corpora(
        website_text="A bakery in Montreal selling bread.",
        tavily_text="Bakery news snippet about croissants.",
    )
    out = ground_assessed_fields(result, corpora)
    assert out["description_en"] is None
    assert out["description_fr"] is None
    assert out["mission_statement_en"] is None
    assert out["values_raw"] is None
    assert "description via=absent" in out["flags"]
    assert "mission via=absent" in out["flags"]
    assert "values via=absent" in out["flags"]


def test_ground_keeps_fr_sibling_when_en_grounded_in_primary():
    result = {
        "description_en": (
            "Community kitchen serving free meals in Pointe-Saint-Charles"
        ),
        "description_fr": (
            "Cuisine communautaire servant des repas gratuits à Pointe-Saint-Charles"
        ),
        "mission_statement_en": None,
        "mission_statement_fr": None,
        "values_raw": None,
        "flags": [],
    }
    primary = (
        "Action-Gardien operates a community kitchen serving free meals in "
        "Pointe-Saint-Charles every weekday"
    )
    corpora = build_grounding_corpora(website_text=primary)
    out = ground_assessed_fields(result, corpora)
    assert out["description_en"] is not None
    assert out["description_fr"] is not None
    assert "description via=extracted" in out["flags"]
