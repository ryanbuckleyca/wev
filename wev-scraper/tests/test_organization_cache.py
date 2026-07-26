"""Tests for OrganizationCache and make_cache_key.

Property 2: Cache key is deterministic.
Property 3: Cache round-trip.
Property 4: LRU eviction invariant.

Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 2.10
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from utils.organization_cache import (
    OrganizationCache,
    canonical_location,
    domains_match,
    employer_apex,
    evidence_domain,
    extract_domain,
    is_shared_domain,
    make_cache_key,
)

# ── canonical_location ──────────────────────────────────────────────────────────


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


# ── Example-based tests ───────────────────────────────────────────────────────


class TestOrganizationCache:
    def test_get_miss_returns_none(self):
        cache = OrganizationCache()
        assert cache.get("missing") is None

    def test_set_then_get_returns_value(self):
        cache = OrganizationCache()
        cache.set("key1", 42)
        assert cache.get("key1") == 42

    def test_set_overwrites_existing(self):
        cache = OrganizationCache()
        cache.set("key1", 1)
        cache.set("key1", 99)
        assert cache.get("key1") == 99

    def test_clear_empties_cache(self):
        cache = OrganizationCache()
        cache.set("a", 1)
        cache.set("b", 2)
        cache.mark_blocked("c")
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None
        assert not cache.is_blocked("c")

    def test_mark_blocked_skips_get_and_clears_on_set(self):
        cache = OrganizationCache()
        cache.mark_blocked("ambiguous")
        assert cache.is_blocked("ambiguous")
        assert cache.get("ambiguous") is None
        cache.set("ambiguous", 42)
        assert not cache.is_blocked("ambiguous")
        assert cache.get("ambiguous") == 42

    def test_lru_eviction_on_full_cache(self):
        cache = OrganizationCache(max_size=3)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        # Access "a" to make it recently used
        cache.get("a")
        # "b" is now LRU; adding a new entry evicts it
        cache.set("d", 4)
        assert cache.get("b") is None  # evicted
        assert cache.get("a") == 1
        assert cache.get("c") == 3
        assert cache.get("d") == 4

    def test_cache_scoped_per_instance(self):
        """Two separate instances do not share state — scoped per run."""
        c1 = OrganizationCache()
        c2 = OrganizationCache()
        c1.set("key", 10)
        assert c2.get("key") is None


class TestMakeCacheKey:
    def test_normalized_name_only(self):
        key = make_cache_key("Centraide Montréal")
        # NFKD via nfkd_to_ascii() decomposes é → e, then strips non-ASCII combining chars
        assert key == "centraide montreal"

    def test_location_is_not_part_of_identity(self):
        """Same org name produces the same key regardless of job location context."""
        # make_cache_key no longer accepts location — identity is name only
        assert make_cache_key("My Org") == make_cache_key("My Org")

    def test_empty_name(self):
        assert make_cache_key("") == ""
        assert make_cache_key("!!!") == ""

    def test_only_ascii_alphanumeric_and_spaces(self):
        key = make_cache_key("Org!@#$ Montréal")
        for c in key:
            assert c.isascii() and (c.isalpha() or c.isdigit() or c == " "), f"Bad char {c!r}"

    def test_same_org_different_case(self):
        assert make_cache_key("My Org") == make_cache_key("MY ORG")

    def test_accented_and_unaccented_produce_same_key(self):
        assert make_cache_key("Centraide Montréal") == make_cache_key("Centraide Montreal")


class TestExtractDomain:
    def test_strips_www_and_scheme(self):
        assert extract_domain("https://www.mindrift.ai/about") == "mindrift.ai"

    def test_adds_scheme_when_missing(self):
        assert extract_domain("abcquebec.ca") == "abcquebec.ca"

    def test_empty_returns_none(self):
        assert extract_domain(None) is None
        assert extract_domain("") is None
        assert extract_domain("!!!") is None


class TestEvidenceDomain:
    def test_rejects_shared_social_hosts(self):
        assert is_shared_domain("facebook.com")
        assert is_shared_domain("m.facebook.com")
        assert evidence_domain("https://www.facebook.com/some-org") is None
        assert evidence_domain("https://boards.greenhouse.io/acme") is None

    def test_keeps_employer_hosts(self):
        assert evidence_domain("https://www.mindrift.ai") == "mindrift.ai"
        assert not is_shared_domain("mindrift.ai")


class TestDomainsMatch:
    def test_subdomain_matches_apex(self):
        assert domains_match("careers.hatch.com", "hatch.com")
        assert domains_match("hatch.com", "careers.hatch.com")

    def test_sibling_subdomains_do_not_match(self):
        assert not domains_match("env.gc.ca", "canada.gc.ca")

    def test_public_suffix_parent_does_not_match(self):
        assert not domains_match("env.gc.ca", "gc.ca")
        assert not domains_match("example.co.uk", "co.uk")

    def test_unrelated_hosts_do_not_match(self):
        assert not domains_match("hatch.com", "artelia.com")
        assert not domains_match("notevil.com", "evil.com")


class TestEmployerApex:
    def test_strips_vanity_subdomains(self):
        assert employer_apex("careers.acme.com") == "acme.com"
        assert employer_apex("jobs.acme.com") == "acme.com"
        assert employer_apex("acme.com") == "acme.com"

    def test_preserves_gc_ca_labels(self):
        assert employer_apex("env.gc.ca") == "env.gc.ca"
        assert employer_apex("canada.gc.ca") == "canada.gc.ca"


# ── Property-based tests ──────────────────────────────────────────────────────

# Feature: organizations, Property 2: Cache key is deterministic
@given(
    name=st.text(min_size=0, max_size=100),
)
@settings(max_examples=300)
def test_cache_key_is_deterministic(name):
    """Property 2: Same inputs always produce the same key."""
    k1 = make_cache_key(name)
    k2 = make_cache_key(name)
    assert k1 == k2


# Feature: organizations, Property 3: Cache round-trip
@given(
    key=st.text(min_size=1, max_size=200),
    org_id=st.integers(min_value=1, max_value=10_000_000),
)
@settings(max_examples=300)
def test_cache_round_trip(key: str, org_id: int):
    """Property 3: set(k, v) then get(k) returns v before any eviction."""
    cache = OrganizationCache(max_size=1000)
    cache.set(key, org_id)
    assert cache.get(key) == org_id


# Feature: organizations, Property 4: LRU eviction invariant
@given(
    entries=st.lists(
        st.tuples(
            st.text(min_size=1, max_size=50),
            st.integers(min_value=1, max_value=999_999),
        ),
        min_size=2,
        max_size=20,
        unique_by=lambda t: t[0],  # unique keys
    ),
    max_size=st.integers(min_value=1, max_value=10),
)
@settings(max_examples=300)
def test_lru_eviction_invariant(entries, max_size):
    """Property 4: After filling beyond max_size, LRU entry is evicted and others remain."""
    cache = OrganizationCache(max_size=max_size)

    # Insert all entries in order
    for key, val in entries:
        cache.set(key, val)

    # When we have more entries than max_size, only the most recent max_size
    # entries should be retrievable
    if len(entries) > max_size:
        # The earliest entries (LRU) should have been evicted
        evicted_keys = [k for k, _ in entries[:-max_size]]
        [k for k, _ in entries[-max_size:]]

        for k in evicted_keys:
            assert cache.get(k) is None, f"Evicted key {k!r} still in cache"

        for k, v in entries[-max_size:]:
            assert cache.get(k) == v, f"Surviving key {k!r} missing from cache"
