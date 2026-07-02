"""LRU cache for organization name → organization ID resolution.

Mirrors the existing location caching pattern. Scoped per scrape session
(not a module-level singleton) to keep testing straightforward.

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

from __future__ import annotations

from collections import OrderedDict


class OrganizationCache:
    """In-process LRU cache mapping normalized org keys to organization IDs.

    Requirements: 3.1, 3.3, 3.5
    """

    def __init__(self, max_size: int = 500) -> None:
        self._max_size = max_size
        self._cache: OrderedDict[str, int] = OrderedDict()

    def get(self, key: str) -> int | None:
        """Return the cached organization ID for key, or None if not present.

        Accessing an entry marks it as most-recently used.
        """
        if key not in self._cache:
            return None
        # Move to end (most recently used)
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: str, org_id: int) -> None:
        """Store org_id under key, evicting the LRU entry if the cache is full."""
        if key in self._cache:
            self._cache.move_to_end(key)
            self._cache[key] = org_id
            return
        if len(self._cache) >= self._max_size:
            # Evict least-recently-used (first item)
            self._cache.popitem(last=False)
        self._cache[key] = org_id

    def clear(self) -> None:
        """Remove all entries from the cache."""
        self._cache.clear()


def make_cache_key(
    name: str,
    municipality: str | None,
    province: str | None,
    location: str | None,
) -> str:
    """Produce a deterministic, normalized cache key for an org name + location.

    Derives the same canonical location string used for DB identity rules:
      - municipality + province when both are present
      - raw location string when municipality/province are absent
      - empty string when no location evidence exists

    Then lowercases both name and canonical location, strips all characters
    except ASCII letters, digits, and spaces, and joins with '|'.

    Example:
      make_cache_key("Centraide Montréal", "Montreal", "QC", None)
      → "centraide montreal|montreal qc"

    Requirements: 2.2, 3.2
    """
    # Derive canonical location (same logic as resolver)
    if municipality and province:
        canonical_location = f"{municipality} {province}"
    elif municipality:
        canonical_location = municipality
    elif province:
        canonical_location = province
    elif location:
        canonical_location = location
    else:
        canonical_location = ""

    def _normalize(s: str) -> str:
        lowered = s.lower()
        return "".join(c for c in lowered if c.isascii() and (c.isalpha() or c.isdigit() or c == " "))

    normalized_name = _normalize(name or "")
    normalized_location = _normalize(canonical_location)
    return f"{normalized_name}|{normalized_location}"
