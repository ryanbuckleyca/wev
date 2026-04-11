"""URL utilities for job listing deduplication and comparison."""


def normalize_listing_url(url: str | None) -> str:
    """Return canonical form for DB/comparison (stripped, no trailing slash)."""
    url = (url or "").strip()
    return url.rstrip("/") if url else ""


def add_url_dedup_variants(url: str | None, url_set: set[str]) -> None:
    """Add canonical form and trailing-slash variant to a set for deduplication.

    Normalizes to base form first (strips all trailing slashes), then adds both
    base and base+"/" so in-memory checks catch listings regardless of slash form
    (e.g. .../job, .../job/, or .../job///).
    """
    base = normalize_listing_url(url)
    if not base:
        return
    url_set.add(base)
    url_set.add(base + "/")


def get_listing_url_variant(url: str | None) -> str:
    """Return the trailing-slash variant of a URL (with slash if absent, without if present).

    Used for fallback DB lookup when exact match fails.
    """
    url = (url or "").strip()
    if not url:
        return ""
    return url.rstrip("/") if url.endswith("/") else url + "/"
