"""Environment helpers."""

from __future__ import annotations

import os


def is_truthy_env(name: str) -> bool:
    """Return True if env var is explicitly truthy (1/true/yes/on)."""
    val = os.environ.get(name)
    if val is None:
        return False
    return str(val).strip().lower() in ("1", "true", "yes", "on")
