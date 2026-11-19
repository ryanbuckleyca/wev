"""Sector taxonomy crosswalk: reverse lookup + prompt surface."""

from __future__ import annotations

from utils.sector_crosswalk import (
    build_source_categories_payload,
    merge_source_categories_into_extra,
    normalize_crosswalk_term,
    parse_crosswalk_cell,
    resolve_crosswalk_matches,
    resolve_sector_from_crosswalk,
)
from utils.sector_prompts import (
    CROSSWALK_SOURCE_IDS,
    get_formatted_sector_taxonomy,
    get_sector_ids_set,
    get_sector_taxonomy,
    get_sector_taxonomy_document,
)


def test_taxonomy_document_has_crosswalk_metadata():
    doc = get_sector_taxonomy_document()
    assert doc.get("version")
    assert set(doc["crosswalk_sources"]) == set(CROSSWALK_SOURCE_IDS)
    assert len(doc["sectors"]) == 11


def test_every_sector_has_definition_and_labels():
    for sector in get_sector_taxonomy():
        assert sector.id in get_sector_ids_set()
        assert sector.label_en
        assert sector.label_fr
        assert sector.definition_en
        assert sector.definition_fr
        assert set(sector.term_crosswalk) == set(CROSSWALK_SOURCE_IDS)


def test_parse_crosswalk_cell_splits_and_skips_soft_cells():
    assert parse_crosswalk_cell("Agriculture") == ["Agriculture"]
    assert parse_crosswalk_cell("Financial; Insurance") == ["Financial", "Insurance"]
    assert parse_crosswalk_cell("Arts et culture; Médias et communication") == [
        "Arts et culture",
        "Médias et communication",
    ]
    assert parse_crosswalk_cell("(No direct equivalent)") == []
    assert parse_crosswalk_cell("(Included in Community)") == []
    assert parse_crosswalk_cell("(Covered under Distribution)") == []
    # Trailing parenthetical kept + bare head indexed.
    assert parse_crosswalk_cell("Formation (Services aux entreprises)") == [
        "Formation (Services aux entreprises)",
        "Formation",
    ]


def test_normalize_crosswalk_term_is_accent_and_punct_insensitive():
    assert normalize_crosswalk_term("Santé & Services aux personnes") == (
        normalize_crosswalk_term("Sante and Services aux personnes")
    )


def test_resolve_exact_chantier_and_cmc_terms():
    assert (
        resolve_sector_from_crosswalk("Agroalimentaire", source="chantier")
        == "agriculture-food-systems"
    )
    assert resolve_sector_from_crosswalk("Housing", source="cmc") == (
        "housing-collective-real-estate"
    )
    assert resolve_sector_from_crosswalk("TIC", source="chantier") == (
        "technology-digital-infrastructure"
    )


def test_resolve_returns_none_for_unknown_or_soft_terms():
    assert resolve_sector_from_crosswalk("Totally Fake Sector") is None
    assert resolve_sector_from_crosswalk("Community", source="cmc") == (
        "community-civic-infrastructure"
    )
    # Soft "Included in Community" on arts must NOT claim CMC Community alone.
    arts_hits = [
        m
        for m in resolve_crosswalk_matches("Community", source="cmc")
        if m.sector_id == "arts-culture-information"
    ]
    assert arts_hits == []


def test_ripess_media_digital_commons_is_ambiguous():
    """Same RIPESS label maps to arts and technology in the MASTER sheet."""
    matches = resolve_crosswalk_matches(
        "Media & Digital Commons", source="ripess"
    )
    assert {m.sector_id for m in matches} == {
        "arts-culture-information",
        "technology-digital-infrastructure",
    }
    assert all(m.confidence == "ambiguous" for m in matches)
    assert resolve_sector_from_crosswalk("Media & Digital Commons", source="ripess") is None


def test_build_source_categories_payload_partitions_results():
    payload = build_source_categories_payload(
        ["Agroalimentaire", "Media & Digital Commons", "Not A Real Category"],
        vocab="chantier",
    )
    # Agroalimentaire is chantier; Media… is ripess-only so unresolved under chantier vocab.
    assert payload["resolved_sector_ids"] == ["agriculture-food-systems"]
    assert payload["unresolved_terms"] == [
        "Media & Digital Commons",
        "Not A Real Category",
    ]
    assert payload["vocab"] == "chantier"

    ambiguous_payload = build_source_categories_payload(
        ["Media & Digital Commons"], vocab="ripess"
    )
    assert ambiguous_payload["resolved_sector_ids"] == []
    assert ambiguous_payload["ambiguous_terms"][0]["term"] == "Media & Digital Commons"
    assert set(ambiguous_payload["ambiguous_terms"][0]["sector_ids"]) == {
        "arts-culture-information",
        "technology-digital-infrastructure",
    }


def test_merge_source_categories_into_extra_preserves_source_dump():
    extra = merge_source_categories_into_extra(
        {"source_dump": {"id": 1}},
        "Environnement",
        vocab="chantier",
    )
    assert extra["source_dump"] == {"id": 1}
    assert extra["source_categories"]["resolved_sector_ids"] == [
        "environment-circular-economy"
    ]


def test_formatted_taxonomy_includes_definitions_and_aliases():
    text = get_formatted_sector_taxonomy()
    assert "[agriculture-food-systems] Agriculture & Food Systems" in text
    assert "Definition: Organizations engaged in growing" in text
    assert "Source aliases:" in text
    assert "Chantier: Agroalimentaire" in text
    assert "CMC: Agriculture" in text
