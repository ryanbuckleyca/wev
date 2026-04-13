"""Tests for URL normalization and deduplication utilities."""

from utils.url import (
    add_url_dedup_variants,
    get_listing_url_variant,
    normalize_listing_url,
)


class TestNormalizeListingUrl:
    def test_none_returns_empty(self):
        assert normalize_listing_url(None) == ""

    def test_empty_string_returns_empty(self):
        assert normalize_listing_url("") == ""

    def test_whitespace_only_returns_empty(self):
        assert normalize_listing_url("   \t  ") == ""

    def test_strips_leading_trailing_whitespace(self):
        assert normalize_listing_url("  https://x.com/job  ") == "https://x.com/job"

    def test_removes_trailing_slash(self):
        assert normalize_listing_url("https://x.com/job/") == "https://x.com/job"

    def test_no_slash_unchanged(self):
        assert normalize_listing_url("https://x.com/job") == "https://x.com/job"

    def test_multiple_trailing_slashes_removed(self):
        assert normalize_listing_url("https://x.com/job///") == "https://x.com/job"


class TestAddUrlDedupVariants:
    def test_empty_url_adds_nothing(self):
        s = set()
        add_url_dedup_variants("", s)
        add_url_dedup_variants(None, s)
        assert s == set()

    def test_adds_both_slash_variants(self):
        s = set()
        add_url_dedup_variants("https://x.com/job", s)
        assert "https://x.com/job" in s
        assert "https://x.com/job/" in s
        assert len(s) == 2

    def test_url_with_trailing_slash_adds_both(self):
        s = set()
        add_url_dedup_variants("https://x.com/job/", s)
        assert "https://x.com/job" in s
        assert "https://x.com/job/" in s
        assert len(s) == 2

    def test_strips_whitespace_before_adding(self):
        s = set()
        add_url_dedup_variants("  https://x.com/job  ", s)
        assert "https://x.com/job" in s
        assert "https://x.com/job/" in s


class TestGetListingUrlVariant:
    def test_none_returns_empty(self):
        assert get_listing_url_variant(None) == ""

    def test_empty_returns_empty(self):
        assert get_listing_url_variant("") == ""

    def test_no_slash_adds_slash(self):
        assert get_listing_url_variant("https://x.com/job") == "https://x.com/job/"

    def test_with_slash_removes_slash(self):
        assert get_listing_url_variant("https://x.com/job/") == "https://x.com/job"

    def test_strips_whitespace_first(self):
        assert get_listing_url_variant("  https://x.com/job  ") == "https://x.com/job/"
