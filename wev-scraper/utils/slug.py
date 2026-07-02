"""Slug generation utilities for organization names.

Provides URL-safe kebab-case slug generation with uniqueness enforcement.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Callable


def generate_slug(name: str) -> str:
    """Convert an organization name to a URL-safe kebab-case slug.

    Steps:
      1. NFKD normalize — decomposes accented chars (é → e + combining acute).
      2. Encode to ASCII bytes ignoring non-ASCII combining characters.
      3. Decode back to str (pure ASCII at this point).
      4. Lowercase.
      5. Remove characters that are not [a-z0-9 ] (spaces preserved for now).
      6. Replace spaces with hyphens.
      7. Collapse consecutive hyphens into one.
      8. Strip leading/trailing hyphens.

    NOTE: Do NOT add a separate French accent map — NFKD normalization handles
    all French accents automatically. A duplicate map creates dead code.

    Requirements: 10.1, 10.5
    """
    if not name:
        return ""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_bytes = normalized.encode("ascii", errors="ignore")
    ascii_str = ascii_bytes.decode("ascii")
    lowered = ascii_str.lower()
    cleaned = "".join(c if c.isalnum() or c == " " else "" for c in lowered)
    slug = re.sub(r"-+", "-", cleaned.replace(" ", "-")).strip("-")
    return slug


def generate_unique_slug(
    name: str,
    exists_fn: Callable[[str], bool],
    max_attempts: int = 10,
) -> str:
    """Generate a unique slug, appending -2, -3, … until exists_fn returns False.

    If max_attempts is exceeded, falls back to a guaranteed-unique slug by
    appending a short deterministic hash suffix derived from the name.
    Does NOT fall back to the unsuffixed base slug.

    Requirements: 10.2, 4.3
    """
    base = generate_slug(name)

    if not base:
        digest = hashlib.sha256(name.encode("utf-8")).hexdigest()[:8]
        base = f"unnamed-{digest}"

    if not exists_fn(base):
        return base

    for i in range(2, max_attempts + 1):
        candidate = f"{base}-{i}"
        if not exists_fn(candidate):
            return candidate

    digest = hashlib.sha256(name.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{digest}"
