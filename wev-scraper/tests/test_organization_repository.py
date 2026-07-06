"""Tests for OrganizationRepository.

Validates: Requirements 2.5, 2.7
"""

from unittest.mock import MagicMock

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

# ── sse methods ─────────────────────────────────────────────────────────────

class TestSSEMethods:
    def test_update_sse(self):
        sb = MagicMock()
        repo = OrganizationRepository(sb)

        repo.update_sse(
            org_id=123,
            sse_rating="strong_yes",
            is_sse=True,
            sse_details={"confidence": 0.9}
        )

        table_mock = sb.table.return_value
        update_mock = table_mock.update.return_value
        eq_mock = update_mock.eq.return_value

        sb.table.assert_called_with("organizations")
        table_mock.update.assert_called_with({
            "sse_rating": "strong_yes",
            "is_sse": True,
            "sse_details": {"confidence": 0.9}
        })
        update_mock.eq.assert_called_with("id", 123)
        eq_mock.execute.assert_called_once()

    def test_update_sse_without_details(self):
        sb = MagicMock()
        repo = OrganizationRepository(sb)

        repo.update_sse(
            org_id=456,
            sse_rating="no",
            is_sse=False,
        )

        table_mock = sb.table.return_value
        update_mock = table_mock.update.return_value

        table_mock.update.assert_called_with({
            "sse_rating": "no",
            "is_sse": False,
        })

    def test_update_sse_logs_warning_on_no_rows(self):
        sb = MagicMock()
        repo = OrganizationRepository(sb)
        table_mock = sb.table.return_value
        update_mock = table_mock.update.return_value
        eq_mock = update_mock.eq.return_value
        eq_mock.execute.return_value.data = []

        repo.update_sse(org_id=789, sse_rating="weak_yes", is_sse=True)

        eq_mock.execute.assert_called_once()

    def test_fetch_unrated_orgs(self):
        sb = MagicMock()
        repo = OrganizationRepository(sb)
        # Mock the chain
        table_mock = sb.table.return_value
        select_mock = table_mock.select.return_value
        is_mock = select_mock.is_.return_value
        order_mock = is_mock.order.return_value
        gt_mock = order_mock.gt.return_value
        limit_mock = gt_mock.limit.return_value
        execute_mock = limit_mock.execute
        
        execute_mock.return_value.data = [{"id": 456, "name": "Test Org"}]

        rows = repo.fetch_unrated_orgs(after_id=400, limit=10)

        assert rows == [{"id": 456, "name": "Test Org"}]
        
        sb.table.assert_called_with("organizations")
        table_mock.select.assert_called_with("id, name, description, type, website, values")
        select_mock.is_.assert_called_with("sse_rating", "null")
        is_mock.order.assert_called_with("id")
        order_mock.gt.assert_called_with("id", 400)
        gt_mock.limit.assert_called_with(10)
        execute_mock.assert_called_once()
