"""Tests for slug generation utilities.

Property 11: Slug generation produces valid URL-safe kebab-case.

Validates: Requirements 10.1, 10.2, 10.4, 10.5, 4.3
"""

import re

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from utils.slug import generate_slug, generate_unique_slug

# ── Helpers ──────────────────────────────────────────────────────────────────

VALID_CHARS = re.compile(r"^[a-z0-9\-]*$")


def _is_valid_slug(s: str) -> bool:
    """Return True when s satisfies all slug invariants."""
    return (
        VALID_CHARS.match(s) is not None
        and not s.startswith("-")
        and not s.endswith("-")
        and "--" not in s
        and s == s.lower()
    )


# ── Example-based tests ───────────────────────────────────────────────────────


class TestGenerateSlugExamples:
    def test_basic_ascii(self):
        assert generate_slug("Test Organization") == "test-organization"

    def test_french_accent_e_acute(self):
        # é decomposes to e + combining acute under NFKD; combining char is stripped
        assert generate_slug("Centraide Montréal") == "centraide-montreal"

    def test_french_accents_full(self):
        # Apostrophe is not a space so "l'École" → "lecole" (apostrophe stripped, no hyphen)
        assert generate_slug("Café de l'École") == "cafe-de-lecole"

    def test_special_chars_removed(self):
        assert generate_slug("Hello, World!") == "hello-world"

    def test_consecutive_hyphens_collapsed(self):
        # Multiple spaces → multiple hyphens → collapsed to one
        assert generate_slug("foo   bar") == "foo-bar"

    def test_leading_trailing_stripped(self):
        assert generate_slug("--hello--") == "hello"

    def test_numbers_preserved(self):
        assert generate_slug("Team 2025") == "team-2025"

    def test_empty_string(self):
        assert generate_slug("") == ""

    def test_all_special_chars(self):
        # Only special chars → empty slug after stripping
        assert generate_slug("!@#$%") == ""

    def test_mixed_case(self):
        assert generate_slug("Hello World") == "hello-world"

    def test_unicode_beyond_french(self):
        # CJK characters have no ASCII equivalent — stripped entirely
        result = generate_slug("你好 World")
        assert result == "world"

    def test_cedilla(self):
        # ç decomposes to c + combining cedilla; combining char stripped → c
        assert generate_slug("François") == "francois"

    def test_all_french_accents(self):
        # é è ê à ù ô î û ç
        result = generate_slug("éèêàùôîûç")
        assert result == "eeeauoiuc"


class TestGenerateUniqueSlugExamples:
    def test_base_slug_when_not_taken(self):
        slug = generate_unique_slug("Test Org", exists_fn=lambda s: False)
        assert slug == "test-org"

    def test_appends_2_when_base_taken(self):
        taken = {"test-org"}
        slug = generate_unique_slug("Test Org", exists_fn=lambda s: s in taken)
        assert slug == "test-org-2"

    def test_appends_3_when_2_also_taken(self):
        taken = {"test-org", "test-org-2"}
        slug = generate_unique_slug("Test Org", exists_fn=lambda s: s in taken)
        assert slug == "test-org-3"

    def test_hash_fallback_when_max_attempts_exceeded(self):
        # All attempts from base through base-10 are taken
        def always_taken(s):
            return True

        slug = generate_unique_slug("Test Org", exists_fn=always_taken, max_attempts=10)
        # Fallback slug must not be empty and must be unique (the function returns it)
        assert slug  # non-empty
        assert "--" not in slug
        assert not slug.startswith("-")
        assert not slug.endswith("-")

    def test_hash_fallback_does_not_return_unsuffixed_base(self):
        """If max_attempts exceeded, must NOT return the plain base slug."""
        calls = []

        def exists_fn(s):
            calls.append(s)
            return True  # everything taken

        slug = generate_unique_slug("My Org", exists_fn=exists_fn, max_attempts=3)
        base = "my-org"
        # The hash fallback is always returned (never just the base)
        assert slug != base

    def test_empty_name_produces_hash_fallback(self):
        slug = generate_unique_slug("", exists_fn=lambda s: True, max_attempts=2)
        # Should not raise; returns some non-empty fallback
        assert isinstance(slug, str)
        assert slug

    def test_empty_name_not_taken_also_produces_non_empty(self):
        """When base is empty and not taken, still never returns empty string."""
        slug = generate_unique_slug("!@#$", exists_fn=lambda s: False)
        assert isinstance(slug, str)
        assert slug


# ── Property-based tests ──────────────────────────────────────────────────────

# Feature: organizations, Property 11: Slug generation produces valid URL-safe kebab-case
@given(st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "S"),
        whitelist_characters=" éèêàùôîûçÉÈÊÀÙÔÎÛÇ",
    ),
    min_size=0,
    max_size=200,
))
@settings(max_examples=500)
def test_generate_slug_invariants(name: str):
    """Property 11: For any org name string, generate_slug produces a valid slug.

    Asserts:
      a) all-lowercase
      b) only [a-z0-9\\-]
      c) no leading or trailing hyphens
      d) no consecutive hyphens
    """
    slug = generate_slug(name)
    assert _is_valid_slug(slug), f"Invalid slug {slug!r} for input {name!r}"


@given(
    name=st.text(min_size=1, max_size=100),
    n_taken=st.integers(min_value=0, max_value=9),
)
@settings(max_examples=300)
def test_generate_unique_slug_invariants(name: str, n_taken: int):
    """Property 11 (uniqueness): generate_unique_slug always returns a valid unique slug.

    For any N pre-existing variants (0 ≤ N ≤ 9), the function finds the next
    available slug by appending -{N+1}.
    """
    base = generate_slug(name)
    taken: set[str] = set()
    if base:
        taken.add(base)
        for i in range(2, n_taken + 2):
            taken.add(f"{base}-{i}")

    slug = generate_unique_slug(name, exists_fn=lambda s: s in taken)
    assert _is_valid_slug(slug), f"Invalid slug {slug!r}"
    assert slug not in taken, f"Returned a taken slug {slug!r}"
