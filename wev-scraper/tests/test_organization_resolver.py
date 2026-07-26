"""Tests for OrganizationResolver.

Validates: Requirements 2.2, 2.3, 2.4, 2.6, 2.7, 2.11
"""

from unittest.mock import MagicMock

from utils.organization_cache import OrganizationCache
from utils.organization_repository import OrganizationRepository
from utils.organization_resolver import OrganizationResolver


def _make_repo(**kwargs) -> MagicMock:
    repo = MagicMock(spec=OrganizationRepository)
    repo.find_by_name.return_value = kwargs.get("find_by_name", [])
    repo.find_by_domain.return_value = kwargs.get("find_by_domain", [])
    repo.slug_exists.return_value = kwargs.get("slug_exists", False)
    repo.find_existing_slugs.return_value = kwargs.get("find_existing_slugs", set())
    insert_val = kwargs.get("insert", {"id": 42})
    if isinstance(insert_val, Exception):
        repo.insert.side_effect = insert_val
    else:
        repo.insert.return_value = insert_val
    repo.find_by_name_and_location.return_value = kwargs.get("find_by_name_and_location")
    return repo


def _make_resolver(repo=None, cache=None, assessor=None):
    if repo is None:
        repo = _make_repo()
    if cache is None:
        cache = OrganizationCache()
    return OrganizationResolver(repo=repo, cache=cache, assessor=assessor)


def _make_assessor(return_value):
    assessor = MagicMock()
    assessor.assess_and_build_row.return_value = return_value
    return assessor


# ── Cache hit path ────────────────────────────────────────────────────────────


class TestCacheHitPath:
    def test_cache_hit_returns_cached_id_without_db_call(self):
        cache = OrganizationCache()
        cache.set("test org", 99)

        repo = _make_repo()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 99
        repo.find_by_name.assert_not_called()


# ── DB match path ─────────────────────────────────────────────────────────────


class TestDBMatchPath:
    def test_single_compatible_match_returned_and_cached(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Montreal QC"}]
        repo = _make_repo(find_by_name=org_rows)
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result == 10
        assert cache.get("test org") == 10

    def test_ambiguous_match_does_not_create(self):
        org_rows = [
            {"id": 10, "name": "Test Org", "location": "Montreal QC", "website": None},
            {"id": 11, "name": "Test Org", "location": "Toronto ON", "website": None},
        ]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 99})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Test Org", "Montreal", "QC")

        assert result is None
        repo.insert.assert_not_called()

    def test_no_candidates_falls_to_minimal(self):
        repo = _make_repo(find_by_name=[], insert={"id": 55})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Unknown Org", "City", "ON")

        assert result == 55

    def test_same_org_different_location_reuses_existing(self):
        """Mindrift in Québec and Mindrift in Toronto share one organization_id."""
        org_rows = [{"id": 107, "name": "Mindrift", "location": "Québec", "website": None}]
        repo = _make_repo(find_by_name=org_rows)
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        result = resolver.resolve("Mindrift", "Toronto", "ON")

        assert result == 107
        assert cache.get("mindrift") == 107
        repo.insert.assert_not_called()

    def test_national_org_same_domain_merges_across_cities(self):
        org_rows = [
            {
                "id": 107,
                "name": "Mindrift",
                "location": "Québec",
                "website": "https://mindrift.ai/",
            },
            {
                "id": 461,
                "name": "Mindrift",
                "location": "Toronto ON",
                "website": None,
            },
        ]
        repo = _make_repo(find_by_name=org_rows)
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve(
            "Mindrift",
            "Toronto",
            "ON",
            website="https://mindrift.ai",
        )

        assert result == 107
        repo.insert.assert_not_called()

    def test_same_name_matching_domain_merges_to_domain_owner(self):
        org_rows = [
            {
                "id": 1,
                "name": "ABC Autobody",
                "location": "Québec",
                "website": "https://abcquebec.ca",
            },
            {
                "id": 2,
                "name": "ABC Autobody",
                "location": "Ontario",
                "website": "https://abcautobodyontario.ca",
            },
        ]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 99})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve(
            "ABC Autobody",
            "Toronto",
            "ON",
            website="https://abcautobodyontario.ca",
        )

        assert result == 2
        repo.insert.assert_not_called()

    def test_same_name_conflicting_domain_vs_single_candidate_allows_create(self):
        org_rows = [
            {
                "id": 1,
                "name": "ABC Autobody",
                "location": "Québec",
                "website": "https://abcquebec.ca",
            },
        ]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 99})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve(
            "ABC Autobody",
            "Toronto",
            "ON",
            website="https://abcautobodyontario.ca",
        )

        assert result == 99
        repo.insert.assert_called_once()

    def test_ambiguous_without_domain_evidence_does_not_merge_or_create(self):
        org_rows = [
            {
                "id": 1,
                "name": "ABC Autobody",
                "location": "Québec",
                "website": "https://abcquebec.ca",
            },
            {
                "id": 2,
                "name": "ABC Autobody",
                "location": "Ontario",
                "website": "https://abcautobodyontario.ca",
            },
        ]
        repo = _make_repo(find_by_name=org_rows, insert={"id": 99})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("ABC Autobody", "Toronto", "ON")

        assert result is None
        repo.insert.assert_not_called()


# ── LLM success path ──────────────────────────────────────────────────────────


class TestLLMSuccessPath:
    def test_llm_success_inserts_new_org_and_caches(self):
        assessor_result = {
            "name": "Le Depot Community",
            "slug": "le-depot-community",
            "location": "Montreal QC",
            "website": "https://depot.ca",
            "description": "A community food centre",
            "mission_statement": None,
            "type": "nonprofit",
            "values": None,
            "values_list": [],
            "values_rated": None,
            "sse_rating": "no",
            "is_sse": False,
            "sse_details": None,
        }
        assessor = _make_assessor(assessor_result)
        repo = _make_repo(find_by_name=[], insert={"id": 201})
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=assessor)

        result = resolver.resolve("Le Depot", "Montreal", "QC", job_title="Food Coordinator", description="description here")

        assert result == 201
        assert cache.get("le depot") == 201
        assessor.assess_and_build_row.assert_called_once()

    def test_llm_slug_empty_uses_canonical_name(self):
        assessor_result = {
            "name": "My New Org",
            "slug": "",
            "location": "City QC",
            "website": None,
            "description": None,
            "mission_statement": None,
            "type": None,
            "values": None,
            "values_list": [],
            "values_rated": None,
            "sse_rating": "no",
            "is_sse": False,
            "sse_details": None,
        }
        assessor = _make_assessor(assessor_result)
        repo = _make_repo(find_by_name=[], slug_exists=False, insert={"id": 300})
        resolver = OrganizationResolver(repo=repo, cache=OrganizationCache(), assessor=assessor)

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
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Existing Org", "Montreal", "QC")

        assert result == 55
        repo.find_by_name_and_location.assert_called_once_with("Existing Org", "Montreal QC")

    def test_non_duplicate_insert_error_returns_none(self):
        repo = _make_repo(
            find_by_name=[],
            insert=Exception("connection timeout"),
        )
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Some Org", "City", "ON")

        assert result is None


# ── LLM failure path ──────────────────────────────────────────────────────────


class TestLLMFailurePath:
    def test_llm_none_result_uses_minimal_fallback(self):
        assessor = _make_assessor(None)
        repo = _make_repo(find_by_name=[], insert={"id": 500})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=assessor
        )

        result = resolver.resolve("Some Org", "City", "ON", job_title="Title", description="desc")

        assert result == 500

    def test_assessor_none_skips_llm_goes_to_minimal(self):
        repo = _make_repo(find_by_name=[], insert={"id": 600})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=None
        )

        result = resolver.resolve("Some Org", "City", "ON")

        assert result == 600

    def test_minimal_uses_repo_slug_exists(self):
        repo = _make_repo(find_by_name=[], slug_exists=True, find_existing_slugs={"minimal-org-2"}, insert={"id": 700})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=None
        )

        result = resolver.resolve("Minimal Org", "City", "ON")

        assert result == 700
        repo.slug_exists.assert_called()
        repo.find_existing_slugs.assert_called()

    def test_find_available_slug_empty_base_uses_seed(self):
        repo = _make_repo(find_by_name=[], slug_exists=False, find_existing_slugs=set(), insert={"id": 800})
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=None
        )
        result = resolver.resolve("!!!", "Gatineau", "QC", job_id="seed-val")
        assert result == 800
        slug_arg = repo.slug_exists.call_args[0][0]
        assert "unnamed" in slug_arg


# ── Unexpected exception path ─────────────────────────────────────────────────


class TestUnexpectedExceptionPath:
    def test_unexpected_exception_logs_error_and_returns_none(self, caplog):
        import logging

        repo = _make_repo()
        repo.find_by_name.side_effect = RuntimeError("something exploded")
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=None
        )

        with caplog.at_level(logging.ERROR):
            result = resolver.resolve("Some Org", "City", "ON", job_id="job-123")

        assert result is None
        assert any("job-123" in r.message for r in caplog.records)

    def test_unexpected_exception_does_not_raise(self):
        repo = _make_repo()
        repo.find_by_name.side_effect = RuntimeError("kaboom")
        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=None
        )

        result = resolver.resolve("Org", "City", "ON")
        assert result is None


# ── Same run dedup (requirement 2.11) ─────────────────────────────────────────


class TestSameRunDedup:
    def test_same_normalized_key_second_call_uses_cache(self):
        repo = _make_repo(find_by_name=[{"id": 77, "name": "Centraide", "location": "Montreal QC"}])
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        id1 = resolver.resolve("Centraide", "Montreal", "QC")
        id2 = resolver.resolve("Centraide", "Montreal", "QC")

        assert id1 == id2
        # Second call hit the cache — find_by_name only called once
        repo.find_by_name.assert_called_once()

    def test_same_org_different_location_second_call_uses_cache(self):
        repo = _make_repo(find_by_name=[{"id": 107, "name": "Mindrift", "location": "Québec"}])
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        id1 = resolver.resolve("Mindrift", "Québec", "QC")
        id2 = resolver.resolve("Mindrift", "Toronto", "ON")

        assert id1 == id2 == 107
        repo.find_by_name.assert_called_once()
        repo.insert.assert_not_called()


# ── Location-only path (no municipality/province) ─────────────────────────────


class TestLocationOnlyPath:
    def test_cache_hit_with_location_only(self):
        cache = OrganizationCache()
        cache.set("test org", 99)
        repo = _make_repo()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        result = resolver.resolve("Test Org", location="Montreal QC")

        assert result == 99
        repo.find_by_name.assert_not_called()

    def test_db_match_with_location_only(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Montreal QC"}]
        repo = _make_repo(find_by_name=org_rows)
        cache = OrganizationCache()
        resolver = OrganizationResolver(repo=repo, cache=cache, assessor=None)

        result = resolver.resolve("Test Org", location="Montreal QC")

        assert result == 10
        assert cache.get("test org") == 10

    def test_different_location_still_reuses_single_name_match(self):
        org_rows = [{"id": 10, "name": "Test Org", "location": "Vancouver BC"}]
        repo = _make_repo(find_by_name=org_rows)
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Test Org", location="Montreal QC")

        assert result == 10
        repo.insert.assert_not_called()

    def test_location_fallback_in_canonical_location(self):
        repo = _make_repo(find_by_name=[], insert={"id": 88})
        resolver = _make_resolver(repo=repo, assessor=None)

        result = resolver.resolve("Org", location="Montreal QC")

        assert result == 88
        # minimal inserts with canonical_loc="Montreal QC"
        repo.insert.assert_called_once()
        assert repo.insert.call_args[0][0]["location"] == "Montreal QC"


# ── LLM resolve path ────────────────────────────────────────────────────────────


class TestLLMResolvePath:
    _ASSESS_RESULT = {
        "name": "Test Org AI",
        "slug": "test-org-ai",
        "location": "City ON",
        "website": "https://test.ai",
        "description": "An AI org.",
        "mission_statement": None,
        "type": "nonprofit",
        "values": "Values.",
        "values_list": ["Creativity"],
        "values_rated": [{"value": "Creativity", "rank": 1}],
        "sse_rating": "no",
        "is_sse": False,
        "sse_details": None,
    }

    def test_llm_resolve_success(self):
        repo = _make_repo(find_by_name=[], slug_exists=False, find_existing_slugs=set(), insert={"id": 999})
        assessor = MagicMock()
        assessor.assess_and_build_row.return_value = self._ASSESS_RESULT

        resolver = OrganizationResolver(
            repo=repo, cache=OrganizationCache(), assessor=assessor
        )

        result = resolver.resolve("Test Org AI", "City", "ON")

        assert result == 999
        assessor.assess_and_build_row.assert_called_once()
        repo.insert.assert_called_once()

        call_kwargs = repo.insert.call_args[0][0]
        assert call_kwargs["name"] == "Test Org AI"
        assert call_kwargs["slug"] == "test-org-ai"
        assert call_kwargs["website"] == "https://test.ai"
        assert call_kwargs["type"] == "nonprofit"
        assert call_kwargs["values"] == "Values."
        assert call_kwargs["values_list"] == ["Creativity"]
        assert call_kwargs["values_rated"] == [{"value": "Creativity", "rank": 1}]
