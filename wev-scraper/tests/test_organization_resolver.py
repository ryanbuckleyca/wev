"""Tests for OrganizationResolver.

Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7, 2.11
"""

from unittest.mock import MagicMock

import pytest

from utils.organization_cache import OrganizationCache
from utils.organization_repository import OrganizationRepository
from utils.organization_resolver import OrganizationResolver
from utils.organization_cache import canonical_location


def _make_repo(**kwargs) -> MagicMock:
    repo = MagicMock(spec=OrganizationRepository)
    repo.find_by_name.return_value = kwargs.get("find_by_name", [])
    repo.slug_exists.return_value = kwargs.get("slug_exists", False)
    repo.find_existing_slugs.return_value = kwargs.get("find_existing_slugs", set())
    insert_val = kwargs.get("insert", {"id": 42})
    if isinstance(insert_val, Exception):
        repo.insert.side_effect = insert_val
    else:
        repo.insert.return_value = insert_val
    repo.find_by_name_and_location.return_value = kwargs.get("find_by_name_and_location")
    return repo


def _make_resolver(repo=None, cache=None, identifier=None):
    if repo is None:
        repo = _make_repo()
    if cache is None:
        cache = OrganizationCache()
    return OrganizationResolver(repo=repo, cache=cache, identifier=identifier)


def _make_identifier(return_value):
    identifier = MagicMock()
    identifier.identify.return_value = return_value
    return identifier


# ── canonical_location helper ─────────────────────────────────────────────────


class TestCanonicalLocation:
    def test_municipality_and_province(self):
        assert canonical_location("Montreal", "QC", None) == "Montreal QC"

    def test_municipality_only(self):
        assert canonical_location("Montreal", None, None) == "Montreal"

    def test_province_only(self):
        assert canonical_location(None, "QC", None) == "QC"

    def test_location_fallback(self):
        assert canonical_location(None, None, "Toronto, ON") == "Toronto, ON"

    def test_empty_when_nothing(self):
        assert canonical_location(None, None, None) == ""


# ── Cache hit path ────────────────────────────────────────────────────────────


class TestCacheHitPath:
    def test_cache_hit_returns_cached_id_without_db_call(self):
        cache = OrganizationCache()
        cache.set("test org|montreal qc", 99)

        repo = _make_repo()
        resolver = OrganizationResolver(repo=repo, cache=cache, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 99
        repo.find_by_name.assert_not_called()


# ── DB match path ─────────────────────────────────────────────────────────────


class TestDBMatchPath:
    def test_single_compatible_match_returned_and_cached(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Montreal QC"}]
        repo = _make_repo(find_by_name=org_rows)
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 10
        assert cache.get("test org|montreal qc") == 10

    def test_ambiguous_match_falls_to_minimal(self):
        org_rows = [
            {"id": 10, "name": "Test Org", "location": "Montreal QC"},
            {"id": 11, "name": "Test Org", "location": "Montreal QC"},
        ]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 99})
        resolver = _make_resolver(repo=repo, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 99  # fell through to minimal insert

    def test_no_candidates_falls_to_minimal(self):
        repo = _make_repo(find_by_name=[], insert={"id": 55})
        resolver = _make_resolver(repo=repo, identifier=None)

        result = resolver.resolve("Unknown Org", "City", "ON")

        assert result == 55

    def test_incompatible_location_falls_to_minimal(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Vancouver BC"}]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 77})
        resolver = _make_resolver(repo=repo, identifier=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 77  # location incompatible → minimal fallback


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
        repo = _make_repo(find_by_name=[], insert={"id": 201})
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, identifier=identifier)

        result = resolver.resolve("Le Depot", "Montreal", "QC", "Food Coordinator", "description here")

        assert result == 201
        assert cache.get("le depot|montreal qc") == 201
        identifier.identify.assert_called_once()

    def test_llm_slug_empty_uses_canonical_name(self):
        from utils.organization_identifier import OrgIdentificationResult

        llm_result = OrgIdentificationResult(
            canonical_name="My New Org",
            slug="",
            website=None,
            description=None,
            type=None,
        )
        identifier = _make_identifier(llm_result)
        repo = _make_repo(find_by_name=[], slug_exists=False, insert={"id": 300})
        resolver = OrganizationResolver(repo=repo, cache=OrganizationCache(), identifier=identifier)

        result = resolver.resolve("My New Org", "City", "QC")

        assert result == 300
        # Should check slug against "my-new-org" (from canonical_name, not empty slug)
        repo.slug_exists.assert_called_with("my-new-org")


# ── Identity conflict path ────────────────────────────────────────────────────


class TestIdentityConflictPath:
    def test_insert_conflict_reselects_and_returns_existing(self):
        repo = _make_repo(
            find_by_name=[],
            insert=Exception("duplicate key value violates unique constraint"),
            find_by_name_and_location=55,
        )
        resolver = _make_resolver(repo=repo, identifier=None)

        result = resolver.resolve("Existing Org", "Montreal", "QC")

        assert result == 55
        repo.find_by_name_and_location.assert_called_once_with("Existing Org", "Montreal QC")

    def test_non_duplicate_insert_error_returns_none(self):
        repo = _make_repo(
            find_by_name=[],
            insert=Exception("connection timeout"),
        )
        resolver = _make_resolver(repo=repo, identifier=None)

        result = resolver.resolve("Some Org", "City", "ON")

        assert result is None


# ── LLM failure path ──────────────────────────────────────────────────────────


class TestLLMFailurePath:
    def test_llm_none_result_uses_minimal_fallback(self):
        identifier = _make_identifier(None)
        repo = _make_repo(find_by_name=[], insert={"id": 500})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), identifier=identifier
        )

        result = resolver.resolve("Some Org", "City", "ON", "Title", "desc")

        assert result == 500

    def test_identifier_none_skips_llm_goes_to_minimal(self):
        repo = _make_repo(find_by_name=[], insert={"id": 600})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), identifier=None
        )

        result = resolver.resolve("Some Org", "City", "ON")

        assert result == 600

    def test_minimal_uses_repo_slug_exists(self):
        repo = _make_repo(find_by_name=[], slug_exists=True, find_existing_slugs={"minimal-org-2"}, insert={"id": 700})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), identifier=None
        )

        resolver.resolve("Minimal Org", "City", "ON")

        repo.slug_exists.assert_called()
        repo.find_existing_slugs.assert_called()


# ── Unexpected exception path ─────────────────────────────────────────────────


class TestUnexpectedExceptionPath:
    def test_unexpected_exception_logs_error_and_returns_none(self, caplog):
        import logging

        repo = _make_repo()
        repo.find_by_name.side_effect = RuntimeError("something exploded")
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), identifier=None
        )

        with caplog.at_level(logging.ERROR):
            result = resolver.resolve("Some Org", "City", "ON", job_id="job-123")

        assert result is None
        assert any("job-123" in r.message for r in caplog.records)

    def test_unexpected_exception_does_not_raise(self):
        repo = _make_repo()
        repo.find_by_name.side_effect = RuntimeError("kaboom")
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), identifier=None
        )

        result = resolver.resolve("Org", "City", "ON")
        assert result is None


# ── Same run dedup (requirement 2.11) ─────────────────────────────────────────


class TestSameRunDedup:
    def test_same_normalized_key_second_call_uses_cache(self):
        repo = _make_repo(find_by_name=[{"id": 77, "name": "Centraide", "location": "Montreal QC"}])
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, identifier=None)

        id1 = resolver.resolve("Centraide", "Montreal", "QC")
        id2 = resolver.resolve("Centraide", "Montreal", "QC")

        assert id1 == id2
        # Second call hit the cache — find_by_name only called once
        repo.find_by_name.assert_called_once()
