"""Environment helpers."""

from __future__ import annotations

import os


def is_truthy_env(name: str) -> bool:
    """Return True if env var is explicitly truthy (1/true/yes/on)."""
    val = os.environ.get(name)
    if val is None:
        return False
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def get_int_env(name: str) -> int | None:
    """Read an environment variable as an integer, returning None if absent or invalid."""
    val = os.environ.get(name)
    if not val:
        return None
    try:
        return int(val)
    except ValueError:
        return None
