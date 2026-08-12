"""LRU cache for organization name → organization ID resolution.

Mirrors the existing location caching pattern. Scoped per scrape session
(not a module-level singleton) to keep testing straightforward.

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

from __future__ import annotations

import re
from collections import OrderedDict
from urllib.parse import urlparse

from utils.slug import nfkd_to_ascii

_WWW_PREFIX = re.compile(r"^www\.", re.IGNORECASE)


class OrganizationCache:
    """In-process LRU cache mapping normalized org keys to organization IDs.

    Requirements: 3.1, 3.3, 3.5
    """

    def __init__(self, max_size: int = 500) -> None:
        self._max_size = max_size
        self._cache: OrderedDict[str, int] = OrderedDict()
        self._blocked: set[str] = set()

    def get(self, key: str) -> int | None:
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: str, org_id: int) -> None:
        self._blocked.discard(key)
        if key in self._cache:
            self._cache.move_to_end(key)
            self._cache[key] = org_id
            return
        if len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        self._cache[key] = org_id

    def mark_blocked(self, key: str) -> None:
        """Remember an ambiguous resolve so the same session key skips DB."""
        self._cache.pop(key, None)
        self._blocked.add(key)

    def is_blocked(self, key: str) -> bool:
        return key in self._blocked

    def clear(self) -> None:
        self._cache.clear()
        self._blocked.clear()


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


def extract_domain(website: str | None) -> str | None:
    """Return a normalized hostname (no www.) from a website URL, or None."""
    if not website or not str(website).strip():
        return None
    raw = str(website).strip()
    if "://" not in raw:
        raw = "https://" + raw
    host = (urlparse(raw).hostname or "").lower().strip(".")
    if not host or not re.search(r"[a-z0-9]", host):
        return None
    return _WWW_PREFIX.sub("", host) or None


# Hosts shared across many unrelated orgs — never use as merge evidence.
_SHARED_DOMAIN_SUFFIXES = frozenset({
    "facebook.com",
    "fb.com",
    "linkedin.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "tiktok.com",
    "linktr.ee",
    "bit.ly",
    "sites.google.com",
    "wixsite.com",
    "wix.com",
    "squarespace.com",
    "wordpress.com",
    "shopify.com",
    "etsy.com",
    "panierdachat.app",
    "indeed.com",
    "glassdoor.com",
    "greenhouse.io",
    "lever.co",
    "workable.com",
    "bamboohr.com",
    "smartrecruiters.com",
    "jobvite.com",
    "icims.com",
    "myworkdayjobs.com",
    "dayforcehcm.com",
    "applytojob.com",
    # Eco Canada / JBoard employer profile hosts (not the hiring org).
    "ecoworks.eco.ca",
    "eco.ca",
})


def is_shared_domain(domain: str | None) -> bool:
    """True for social/ATS/hosting hosts that must not drive org identity."""
    if not domain:
        return False
    d = domain.lower().strip(".")
    if d in _SHARED_DOMAIN_SUFFIXES:
        return True
    return any(d.endswith("." + suffix) for suffix in _SHARED_DOMAIN_SUFFIXES)


# Multi-label public-suffix-like parents — not safe employer apexes.
_PUBLIC_SUFFIX_LIKE = frozenset({
    "co.uk",
    "org.uk",
    "ac.uk",
    "gov.uk",
    "com.au",
    "net.au",
    "org.au",
    "co.nz",
    "org.nz",
    "co.jp",
    "com.br",
    "co.in",
    "gc.ca",
})


def domains_match(a: str | None, b: str | None) -> bool:
    """True when hosts are equal or one is a subdomain of the other.

    ``careers.hatch.com`` matches ``hatch.com``; ``env.gc.ca`` does not match
    ``canada.gc.ca``. Parents that look like public suffixes (``gc.ca``,
    ``co.uk``) are not treated as employer apexes.
    """
    if not a or not b:
        return False
    left = a.lower().strip(".")
    right = b.lower().strip(".")
    if left == right:
        return True
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    if not longer.endswith("." + shorter):
        return False
    if "." not in shorter:
        return False
    if shorter in _PUBLIC_SUFFIX_LIKE:
        return False
    return True


def employer_apex(domain: str | None) -> str | None:
    """Strip vanity subdomains down to a plausible employer apex.

    ``careers.acme.com`` / ``jobs.acme.com`` → ``acme.com``. Stops before
    public-suffix-like parents so ``env.gc.ca`` stays ``env.gc.ca``.
    """
    if not domain:
        return None
    current = domain.lower().strip(".")
    if not current:
        return None
    while True:
        parts = current.split(".")
        if len(parts) <= 2:
            return current
        parent = ".".join(parts[1:])
        if parent in _PUBLIC_SUFFIX_LIKE or "." not in parent:
            return current
        current = parent


def evidence_domain(website: str | None) -> str | None:
    """Hostname usable as org-match evidence, or None if missing/shared."""
    domain = extract_domain(website)
    if not domain or is_shared_domain(domain):
        return None
    return domain


def evidence_domain_query_hosts(domain: str) -> list[str]:
    """Hosts to search when looking up ``domain`` (self + immediate parent)."""
    cleaned = (domain or "").lower().strip(".")
    if not cleaned:
        return []
    hosts = [cleaned]
    parts = cleaned.split(".")
    if len(parts) > 2:
        parent = ".".join(parts[1:])
        if parent and parent not in hosts:
            hosts.append(parent)
    return hosts


def extract_org_identity(url: str | None) -> str | None:
    """Extract a unique organization identifier from a URL.

    For employer-owned domains: returns the domain only.
    For shared hosting with subdomains: returns full subdomain.domain.
    For shared platforms with paths: returns domain/path.
    For subdomain + path combos: returns subdomain.domain/path.
    For non-identifiable URLs: returns None.

    Examples:
        "https://acmecorp.com" → "acmecorp.com"
        "https://wildlife-gardening.panierdachat.app" → "wildlife-gardening.panierdachat.app"
        "https://www.facebook.com/WildlifeGardening.ca" → "facebook.com/wildlifegardening.ca"
        "https://boards.greenhouse.io/acme" → "boards.greenhouse.io/acme"
    """
    if not url:
        return None

    normalized_url = str(url).lower().strip()
    if "://" not in normalized_url:
        normalized_url = "https://" + normalized_url

    try:
        parsed = urlparse(normalized_url)
        hostname = (parsed.hostname or "").strip(".")
    except Exception:
        return None

    if not hostname:
        return None

    # Remove www and mobile (m.) prefixes for normalization
    domain = hostname
    domain = _WWW_PREFIX.sub("", domain)
    if domain.startswith("m."):
        domain = domain[2:]

    # Validate domain has alphanumeric characters and at least one dot (TLD)
    if not domain or not re.search(r"[a-z0-9]", domain) or "." not in domain:
        return None

    # Check if this is a shared domain
    if not is_shared_domain(domain):
        # Employer-owned domain - just use the domain
        return domain

    # Shared domain - need to extract unique identifier

    # Check for subdomain-based uniqueness
    has_subdomain = False
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if domain == suffix:
            # Exact match - this IS the shared domain root
            break
        if domain.endswith("." + suffix):
            # Has subdomain before shared domain
            has_subdomain = True
            break

    # Extract and normalize path
    path = parsed.path.strip("/").split("?")[0].split("#")[0]
    normalized_path = "/".join(p for p in path.split("/") if p)

    # Determine identity based on what we have
    if has_subdomain and normalized_path:
        # Both subdomain AND path (e.g., boards.greenhouse.io/acme)
        return f"{domain}/{normalized_path}"
    elif has_subdomain:
        # Just subdomain (e.g., mysite.wixsite.com)
        return domain
    elif normalized_path:
        # Just path (e.g., facebook.com/OrgName)
        return f"{domain}/{normalized_path}"
    else:
        # Neither subdomain nor path - can't identify org
        return None


def classify_identity_type(identity: str | None) -> str:
    """Determine what type of identity this is.

    Returns one of: employer_owned, marketplace, social_media, ats_board,
    shared_hosting, invalid, unknown.
    """
    if not identity:
        return "unknown"

    # Check against shared domain list
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if identity == suffix:
            return "invalid"  # Root domain only, no org identifier

        # Has subdomain or path component indicating shared platform
        if identity.startswith(f"{suffix}/") or identity.endswith(f".{suffix}") or f".{suffix}/" in identity:
            # Determine platform category
            if suffix in {"facebook.com", "fb.com", "linkedin.com", "instagram.com",
                         "twitter.com", "x.com", "youtube.com", "tiktok.com"}:
                return "social_media"
            elif suffix in {"panierdachat.app", "etsy.com", "shopify.com",
                           "wixsite.com", "wix.com", "squarespace.com", "wordpress.com"}:
                return "marketplace"
            elif suffix in {"greenhouse.io", "lever.co", "workable.com",
                           "bamboohr.com", "smartrecruiters.com", "jobvite.com",
                           "icims.com", "myworkdayjobs.com", "dayforcehcm.com",
                           "applytojob.com"}:
                return "ats_board"
            else:
                return "shared_hosting"

    # No shared domain match = employer-owned
    return "employer_owned"


def extract_platform(identity: str | None) -> str:
    """Extract the platform name from an identity string.

    Returns the base shared platform domain (e.g., "facebook.com", "panierdachat.app").
    """
    if not identity:
        return "unknown"

    # For domain/path pattern (e.g., "facebook.com/orgname")
    if "/" in identity:
        base = identity.split("/")[0]
        # Check if this base is or ends with a shared domain
        for suffix in _SHARED_DOMAIN_SUFFIXES:
            if base == suffix or base.endswith("." + suffix):
                return suffix
        return base

    # For subdomain pattern (e.g., "myorg.panierdachat.app")
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if identity.endswith(f".{suffix}"):
            return suffix
        if identity == suffix:
            return suffix

    return "unknown"
