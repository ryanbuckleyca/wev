"""Sector taxonomy crosswalk v2.5: MASTER sheet import + reverse lookup."""

from __future__ import annotations

from utils.sector_crosswalk import (
    build_source_categories_payload,
    merge_source_categories_into_extra,
    normalize_crosswalk_term,
    resolve_sector_from_crosswalk,
)
from utils.sector_prompts import (
    canonicalize_sector_id,
    get_formatted_sector_taxonomy,
    get_sector_facets,
    get_sector_ids_set,
    get_sector_taxonomy,
    get_sector_taxonomy_document,
)


def test_taxonomy_has_seventeen_sectors_and_three_facets():
    doc = get_sector_taxonomy_document()
    assert doc["version"] == "2.5"
    assert len(doc["sectors"]) == 17
    assert len(doc["facets"]) == 3
    assert len(get_sector_taxonomy()) == 17
    assert len(get_sector_facets()) == 3
    assert len(get_sector_ids_set()) == 17


def test_master_category_ids_and_definitions_present():
    sectors = get_sector_taxonomy()
    assert [s.category_id for s in sectors] == [f"SSE_SEC_{i:02d}" for i in range(1, 18)]
    for sector in sectors:
        assert sector.label_en
        assert sector.label_fr
        assert sector.definition_en
        assert sector.scope_note_en
        assert sector.aliases


def test_facets_are_not_valid_sector_ids():
    for facet in get_sector_facets():
        assert facet.id not in get_sector_ids_set()
        assert facet.kind == "facet"


def test_legacy_ids_canonicalize():
    assert canonicalize_sector_id("care-health-social-services") == (
        "social-health-care-services"
    )
    assert canonicalize_sector_id("arts-culture-information") == "arts-culture-media"
    assert canonicalize_sector_id("community-civic-infrastructure") == (
        "community-development-philanthropy-volunteering"
    )
    assert canonicalize_sector_id("not-a-real-sector") is None


def test_master_category_ids_canonicalize():
    assert canonicalize_sector_id("SSE_SEC_01") == "social-health-care-services"
    assert canonicalize_sector_id("SSE_SEC_04") == "housing-collective-real-estate"
    assert canonicalize_sector_id("SSE_SEC_14") == "advocacy-rights-representation"
    assert canonicalize_sector_id("SSE_FAC_18") is None
    assert canonicalize_sector_id("housing-collective-real-estate") == (
        "housing-collective-real-estate"
    )


def test_resolve_unified_labels_en_and_fr():
    assert (
        resolve_sector_from_crosswalk("Agriculture & Food Systems")
        == "agriculture-food-systems"
    )
    assert (
        resolve_sector_from_crosswalk("Agriculture durable et systèmes alimentaires")
        == "agriculture-food-systems"
    )
    assert (
        resolve_sector_from_crosswalk("Employment & Workforce Integration")
        == "employment-workforce-integration"
    )


def test_resolve_scraped_board_style_alias():
    assert (
        resolve_sector_from_crosswalk(
            "CharityVillage: Housing & Collective Real Estate jobs"
        )
        == "housing-collective-real-estate"
    )
    assert (
        resolve_sector_from_crosswalk(
            "Housing & Collective Real Estate", source="charityvillage"
        )
        == "housing-collective-real-estate"
    )


def test_cmc_source_terms_do_not_match_goodwork_lookups():
    assert (
        resolve_sector_from_crosswalk(
            "CMC Housing & Collective Real Estate", source="cmc"
        )
        == "housing-collective-real-estate"
    )
    assert (
        resolve_sector_from_crosswalk(
            "CMC Housing & Collective Real Estate", source="goodwork"
        )
        is None
    )
    assert (
        resolve_sector_from_crosswalk(
            "Housing & Collective Real Estate", source="goodwork"
        )
        == "housing-collective-real-estate"
    )


def test_normalize_is_accent_insensitive():
    assert normalize_crosswalk_term("Éducation, petite enfance et savoirs") == (
        normalize_crosswalk_term("Education, petite enfance et savoirs")
    )


def test_build_source_categories_payload_partitions():
    payload = build_source_categories_payload(
        [
            "Agriculture & Food Systems",
            "Not a sector: role / function",
            "Totally Fake Category",
        ]
    )
    assert payload["resolved_sector_ids"] == ["agriculture-food-systems"]
    assert payload["facet_ids"] == ["facet-role-function"]
    assert payload["unresolved_terms"] == ["Totally Fake Category"]


def test_merge_source_categories_into_extra_preserves_source_dump():
    extra = merge_source_categories_into_extra(
        {"source_dump": {"id": 1}},
        "Environment & Circular Economy",
        vocab="goodwork",
    )
    assert extra["source_dump"] == {"id": 1}
    assert extra["source_categories"]["resolved_sector_ids"] == [
        "environment-circular-economy"
    ]


def test_formatted_taxonomy_includes_definitions_rules_and_facets():
    text = get_formatted_sector_taxonomy()
    assert (
        "ID `agriculture-food-systems` — Agriculture & Food Systems (MASTER SSE_SEC_07)"
        in text
    )
    assert "Definition:" in text
    assert "DECISION RULES" in text
    assert "RULE_02" in text
    assert "NON-SECTOR FACETS" in text
    assert "facet-role-function" in text
