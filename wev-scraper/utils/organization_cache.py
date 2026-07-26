"""LRU cache for organization name → organization ID resolution.

Mirrors the existing location caching pattern. Scoped per scrape session
(not a module-level singleton) to keep testing straightforward.

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

from __future__ import annotations

from collections import OrderedDict

from utils.slug import nfkd_to_ascii


class OrganizationCache:
    """In-process LRU cache mapping normalized org keys to organization IDs.

    Requirements: 3.1, 3.3, 3.5
    """

    def __init__(self, max_size: int = 500) -> None:
        self._max_size = max_size
        self._cache: OrderedDict[str, int] = OrderedDict()

    def get(self, key: str) -> int | None:
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: str, org_id: int) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
            self._cache[key] = org_id
            return
        if len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        self._cache[key] = org_id

    def clear(self) -> None:
        self._cache.clear()


def _normalize(s: str) -> str:
    ascii_str = nfkd_to_ascii(s)
    lowered = ascii_str.lower()
    return "".join(c for c in lowered if c.isascii() and (c.isalpha() or c.isdigit() or c == " "))


def canonical_location(
    municipality: str | None,
    province: str | None,
    location: str | None,
) -> str:
    if municipality and province:
        return f"{municipality} {province}"
    if municipality:
        return municipality
    if province:
        return province
    if location:
        return location
    return ""


def make_cache_key(name: str) -> str:
    """Cache identity is organization name only — location is not part of identity."""
    return _normalize(name or "")
