"""Tests for OrganizationResolver.

Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7, 2.11
"""

import json
from unittest.mock import MagicMock, call, patch

import pytest

from utils.organization_cache import OrganizationCache
from utils.organization_resolver import OrganizationResolver, _canonical_location

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_supabase(
    org_rows=None,
    insert_id=None,
    insert_raises=None,
    reselect_rows=None,
    slug_exists=False,
):
    """Build a minimal Supabase mock for resolver tests."""
    mock = MagicMock()

    # organizations.select (name lookup)
    select_resp = MagicMock()
    select_resp.data = org_rows or []

    # organizations.insert
    insert_resp = MagicMock()
    insert_resp.data = [{"id": insert_id}] if insert_id else []

    # organizations.select for slug existence check
    slug_resp = MagicMock()
    slug_resp.data = [{"id": 1}] if slug_exists else []

    # Track call sequences on table("organizations")
    org_table = MagicMock()

    select_chain = MagicMock()
    select_chain.ilike.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.execute.return_value = select_resp

    if insert_raises:
        org_table.insert.return_value.execute.side_effect = insert_raises
    else:
        org_table.insert.return_value.execute.return_value = insert_resp

    org_table.select.return_value = select_chain

    def table_side_effect(name):
        if name == "organizations":
            return org_table
        return MagicMock()

    mock.table.side_effect = table_side_effect
    mock._org_table = org_table
    mock._select_chain = select_chain
    return mock


def _make_resolver(
    supabase=None,
    cache=None,
    identifier=None,
    org_rows=None,
    insert_id=42,
    insert_raises=None,
):
    if supabase is None:
        supabase = _make_supabase(org_rows=org_rows, insert_id=insert_id, insert_raises=insert_raises)
    if cache is None:
        cache = OrganizationCache()
    return OrganizationResolver(supabase_client=supabase, cache=cache, identifier=identifier)


def _make_identifier(return_value):
    identifier = MagicMock()
    identifier.identify.return_value = return_value
    return identifier


# ── _canonical_location helper ────────────────────────────────────────────────


class TestCanonicalLocation:
    def test_municipality_and_province(self):
        assert _canonical_location("Montreal", "QC", None) == "Montreal QC"

    def test_municipality_only(self):
        assert _canonical_location("Montreal", None, None) == "Montreal"

    def test_province_only(self):
        assert _canonical_location(None, "QC", None) == "QC"

    def test_location_fallback(self):
        assert _canonical_location(None, None, "Toronto, ON") == "Toronto, ON"

    def test_empty_when_nothing(self):
        assert _canonical_location(None, None, None) == ""


# ── Cache hit path ────────────────────────────────────────────────────────────


class TestCacheHitPath:
    def test_cache_hit_returns_cached_id_without_db_call(self):
        cache = OrganizationCache()
        cache.set("test org|montreal qc", 99)

        supabase = _make_supabase()
        resolver = OrganizationResolver(supabase_client=supabase, cache=cache, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")
        assert result == 99
        # No DB call should have been made
        supabase._org_table.select.assert_not_called()


# ── DB match path ─────────────────────────────────────────────────────────────


class TestDBMatchPath:
    def test_single_compatible_match_returned_and_cached(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Montreal QC"}]
        cache = OrganizationCache()
        supabase = _make_supabase(org_rows=org_rows)
        resolver = OrganizationResolver(supabase_client=supabase, cache=cache, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")
        assert result == 10

        # Result should be cached for next call
        cache_key_hit = cache.get("test org|montreal qc")
        assert cache_key_hit == 10

    def test_ambiguous_match_falls_to_llm_step(self):
        """Two candidates with compatible location → ambiguous → falls to LLM (identifier=None → minimal)."""
        org_rows = [
            {"id": 10, "name": "Test Org", "location": "Montreal QC"},
            {"id": 11, "name": "Test Org", "location": "Montreal QC"},
        ]
        cache = OrganizationCache()
        supabase = _make_supabase(org_rows=org_rows, insert_id=99)
        resolver = OrganizationResolver(supabase_client=supabase, cache=cache, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")
        # Fell through to minimal insert (identifier=None)
        assert result == 99

    def test_no_candidates_falls_to_llm(self):
        supabase = _make_supabase(org_rows=[], insert_id=55)
        resolver = _make_resolver(supabase=supabase, identifier=None)
        result = resolver.resolve("Unknown Org", "City", "ON")
        assert result == 55

    def test_incompatible_location_falls_to_llm(self):
        """Candidate exists but location doesn't match → falls through."""
        org_rows = [{"id": 10, "name": "Test Org", "location": "Vancouver BC"}]
        supabase = _make_supabase(org_rows=org_rows, insert_id=77)
        resolver = _make_resolver(supabase=supabase, identifier=None)
        result = resolver.resolve("Test Org", "Montreal", "QC")
        # Location incompatible → fell to minimal insert
        assert result == 77


# ── LLM success path ──────────────────────────────────────────────────────────


class TestLLMSuccessPath:
    def test_llm_success_inserts_new_org_and_caches(self):
        from utils.organization_identifier import OrgIdentificationResult

        llm_result = OrgIdentificationResult(
            canonical_name="Le Depot Community",
            slug="le-depot-community",
            website="https://depot.ca",
            description="A community food centre",
            type="nonprofit",
        )
        identifier = _make_identifier(llm_result)
        supabase = _make_supabase(org_rows=[], insert_id=201)
        cache = OrganizationCache()
        resolver = OrganizationResolver(supabase_client=supabase, cache=cache, identifier=identifier)

        result = resolver.resolve("Le Depot", "Montreal", "QC", "Food Coordinator", "description here")
        assert result == 201
        identifier.identify.assert_called_once()

    def test_llm_success_calls_generate_unique_slug_not_generate_slug(self):
        """Spec requirement: generate_unique_slug must be used (not generate_slug directly)."""
        from utils.organization_identifier import OrgIdentificationResult

        llm_result = OrgIdentificationResult(
            canonical_name="My New Org",
            slug="",  # empty slug forces generate_unique_slug from name
            website=None,
            description=None,
            type=None,
        )
        identifier = _make_identifier(llm_result)

        with patch("utils.organization_resolver.generate_unique_slug") as mock_unique:
            mock_unique.return_value = "my-new-org"
            supabase = _make_supabase(org_rows=[], insert_id=300)
            resolver = OrganizationResolver(supabase_client=supabase, cache=OrganizationCache(), identifier=identifier)
            resolver.resolve("My New Org", "City", "QC")
            mock_unique.assert_called()


# ── Identity conflict path ────────────────────────────────────────────────────


class TestIdentityConflictPath:
    def test_insert_conflict_reselects_and_returns_existing(self):
        """INSERT raises unique violation → re-select the existing org → return its ID."""
        conflict_error = Exception("duplicate key value violates unique constraint")
        org_rows = [{"id": 55, "name": "Existing Org", "location": "Montreal QC"}]

        # First select (name lookup) returns empty (cache miss, DB miss)
        # Insert raises conflict
        # Re-select (identity reuse) returns existing row
        mock_sb = MagicMock()

        call_count = {"n": 0}

        def select_execute():
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First ilike lookup: no candidates
                r = MagicMock()
                r.data = []
                return r
            else:
                # Re-select after conflict
                r = MagicMock()
                r.data = org_rows
                return r

        ilike_chain = MagicMock()
        ilike_chain.execute.side_effect = select_execute
        ilike_chain.ilike.return_value = ilike_chain
        ilike_chain.eq.return_value = ilike_chain

        org_table = MagicMock()
        org_table.select.return_value = ilike_chain
        org_table.insert.return_value.execute.side_effect = conflict_error

        mock_sb.table.return_value = org_table

        resolver = OrganizationResolver(
            supabase_client=mock_sb,
            cache=OrganizationCache(),
            identifier=None,
        )
        result = resolver.resolve("Existing Org", "Montreal", "QC")
        assert result == 55


# ── LLM failure path ─────────────────────────────────────────────────────────


class TestLLMFailurePath:
    def test_llm_none_result_uses_minimal_fallback(self):
        identifier = _make_identifier(None)  # LLM returns None
        supabase = _make_supabase(org_rows=[], insert_id=500)
        resolver = OrganizationResolver(
            supabase_client=supabase, cache=OrganizationCache(), identifier=identifier
        )
        result = resolver.resolve("Some Org", "City", "ON", "Title", "desc")
        assert result == 500

    def test_identifier_none_skips_llm_goes_to_minimal(self):
        supabase = _make_supabase(org_rows=[], insert_id=600)
        resolver = OrganizationResolver(
            supabase_client=supabase, cache=OrganizationCache(), identifier=None
        )
        result = resolver.resolve("Some Org", "City", "ON")
        assert result == 600

    def test_minimal_insert_uses_generate_unique_slug(self):
        with patch("utils.organization_resolver.generate_unique_slug") as mock_unique:
            mock_unique.return_value = "some-org"
            supabase = _make_supabase(org_rows=[], insert_id=700)
            resolver = OrganizationResolver(
                supabase_client=supabase, cache=OrganizationCache(), identifier=None
            )
            resolver.resolve("Some Org", "City", "ON")
            mock_unique.assert_called()


# ── Unexpected exception path ─────────────────────────────────────────────────


class TestUnexpectedExceptionPath:
    def test_unexpected_exception_logs_error_and_returns_none(self, caplog):
        import logging

        mock_sb = MagicMock()
        mock_sb.table.side_effect = RuntimeError("something exploded")

        resolver = OrganizationResolver(
            supabase_client=mock_sb, cache=OrganizationCache(), identifier=None
        )

        with caplog.at_level(logging.ERROR):
            result = resolver.resolve("Some Org", "City", "ON", job_id="job-123")

        assert result is None
        assert any("job-123" in r.message or "Some Org" in r.message for r in caplog.records)

    def test_unexpected_exception_does_not_raise(self):
        mock_sb = MagicMock()
        mock_sb.table.side_effect = RuntimeError("kaboom")

        resolver = OrganizationResolver(
            supabase_client=mock_sb, cache=OrganizationCache(), identifier=None
        )
        # Must not raise
        result = resolver.resolve("Org", "City", "ON")
        assert result is None


# ── Same run dedup (requirement 2.11) ────────────────────────────────────────


class TestSameRunDedup:
    def test_same_normalized_key_second_call_uses_cache(self):
        """Two jobs with same org name + location → same org_id, no second DB query."""
        org_rows = [{"id": 77, "name": "Centraide", "location": "Montreal QC"}]
        supabase = _make_supabase(org_rows=org_rows)
        cache = OrganizationCache()
        resolver = OrganizationResolver(supabase_client=supabase, cache=cache, identifier=None)

        id1 = resolver.resolve("Centraide", "Montreal", "QC")
        id2 = resolver.resolve("Centraide", "Montreal", "QC")

        assert id1 == id2
        # Second call hit the cache — ilike was only called once
        ilike_calls = supabase._select_chain.ilike.call_count
        assert ilike_calls == 1
