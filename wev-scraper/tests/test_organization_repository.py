"""Tests for OrganizationRepository.

Validates: Requirements 2.5, 2.7
"""

from unittest.mock import MagicMock

import pytest

from utils.organization_repository import OrganizationRepository, _escape_like


# ── _escape_like ────────────────────────────────────────────────────────────────


class TestEscapeLike:
    def test_no_special_chars(self):
        assert _escape_like("hello") == "hello"

    def test_escapes_percent(self):
        assert _escape_like("100% Organic") == r"100\% Organic"

    def test_escapes_underscore(self):
        assert _escape_like("test_name") == r"test\_name"

    def test_escapes_backslash(self):
        assert _escape_like("foo\\bar") == r"foo\\bar"

    def test_mixed_special_chars(self):
        assert _escape_like("100%_organic") == r"100\%\_organic"


# ── find_by_name_and_location ───────────────────────────────────────────────────


class TestFindByNameAndLocation:
    def test_with_location_matches(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = [{"id": 77}]
        query = MagicMock()
        query.ilike.return_value = query
        query.execute.return_value = resp
        sb.table.return_value.select.return_value = query
        repo = OrganizationRepository(sb)
        assert repo.find_by_name_and_location("Test Org", "Montreal, QC") == 77

    def test_no_match_returns_none(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = []
        query = MagicMock()
        query.ilike.return_value = query
        query.execute.return_value = resp
        sb.table.return_value.select.return_value = query
        repo = OrganizationRepository(sb)
        assert repo.find_by_name_and_location("Unknown Org", "Nowhere") is None

    def test_with_location_none_uses_or_filter(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = [{"id": 42}]
        query = MagicMock()
        query.ilike.return_value = query
        query.or_.return_value = query
        query.execute.return_value = resp
        sb.table.return_value.select.return_value = query

        repo = OrganizationRepository(sb)
        result = repo.find_by_name_and_location("Test Org", None)

        assert result == 42
        query.or_.assert_called_once_with("location.is.null,location.eq.")

    def test_with_empty_location_uses_or_filter(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = [{"id": 42}]
        query = MagicMock()
        query.ilike.return_value = query
        query.or_.return_value = query
        query.execute.return_value = resp
        sb.table.return_value.select.return_value = query

        repo = OrganizationRepository(sb)
        result = repo.find_by_name_and_location("Test Org", "")

        assert result == 42
        query.or_.assert_called_once_with("location.is.null,location.eq.")

    def test_db_error_returns_none(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.ilike.side_effect = Exception("DB down")
        repo = OrganizationRepository(sb)
        assert repo.find_by_name_and_location("Test Org", "QC") is None

    def test_db_error_in_or_path_returns_none(self):
        sb = MagicMock()
        select = sb.table.return_value.select.return_value
        select.ilike.return_value = select
        select.or_.side_effect = Exception("DB down")
        repo = OrganizationRepository(sb)
        assert repo.find_by_name_and_location("Test Org", None) is None

    def test_db_error_in_or_path_empty_location_returns_none(self):
        sb = MagicMock()
        select = sb.table.return_value.select.return_value
        select.ilike.return_value = select
        select.or_.side_effect = Exception("DB down")
        repo = OrganizationRepository(sb)
        assert repo.find_by_name_and_location("Test Org", "") is None


# ── find_by_name with special chars ─────────────────────────────────────────────


class TestFindByName:
    def test_percent_in_name_is_escaped(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = [{"id": 10, "name": "100% Organic", "location": "QC"}]
        sb.table.return_value.select.return_value.ilike.return_value.execute.return_value = resp
        repo = OrganizationRepository(sb)
        result = repo.find_by_name("100% Organic")
        assert len(result) == 1
        assert result[0]["id"] == 10

    def test_underscore_in_name_is_escaped(self):
        sb = MagicMock()
        resp = MagicMock()
        resp.data = [{"id": 20, "name": "Test_Name", "location": "ON"}]
        sb.table.return_value.select.return_value.ilike.return_value.execute.return_value = resp
        repo = OrganizationRepository(sb)
        result = repo.find_by_name("Test_Name")
        assert len(result) == 1
        assert result[0]["id"] == 20
