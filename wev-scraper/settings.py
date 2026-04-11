"""Centralized runtime settings for wev-scraper.

Loads .env at most once per process, then exposes helpers for env-backed
configuration used across the scraper.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv, find_dotenv

from utils.env import is_truthy_env


SCRAPER_ROOT = Path(__file__).resolve().parent
_ENV_LOADED = False


def ensure_env_loaded() -> None:
    """Load scraper environment variables exactly once per process."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    load_dotenv(find_dotenv())
    _ENV_LOADED = True

def get_env(name: str, default: str | None = None) -> str | None:
    """Read a raw environment variable after ensuring env is loaded."""
    ensure_env_loaded()
    return os.environ.get(name, default)


def get_stripped_env(name: str) -> str:
    """Read and strip an environment variable, returning an empty string if absent."""
    value = get_env(name)
    return value.strip() if isinstance(value, str) else ""


def get_env_mode() -> str:
    """Return ENV_MODE normalized to lowercase."""
    return get_stripped_env("ENV_MODE").lower()


def is_test_env() -> bool:
    """Return True when running in ENV_MODE=test."""
    return get_env_mode() == "test"


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    secret_key: str


def _strip_trailing_slash(value: str | None) -> str:
    return ((value or "").rstrip("/") + "/") if value else ""


def get_supabase_settings() -> SupabaseSettings:
    """Return the active Supabase credentials for the current runtime mode."""
    raw_url = get_env("SUPABASE_URL")
    prod_url = get_env("SUPABASE_PROD_URL")
    raw_key = get_env("SUPABASE_SERVICE_ROLE_KEY")
    prod_key = get_env("SUPABASE_PROD_SERVICE_ROLE_KEY")

    if is_truthy_env("USE_PROD_DB"):
        url = _strip_trailing_slash(prod_url)
        secret_key = prod_key or ""
    else:
        url = _strip_trailing_slash(raw_url)
        secret_key = raw_key or ""

    if not url or not secret_key:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")

    return SupabaseSettings(url=url, secret_key=secret_key)


def get_geocodio_api_key() -> str:
    """Return the configured Geocodio API key or an empty string."""
    return get_stripped_env("GEOCODIO_API_KEY")


def get_gemini_api_key() -> str:
    """Return the configured Gemini API key or an empty string."""
    return get_stripped_env("GEMINI_API_KEY")


def get_jina_api_key() -> str:
    """Return the configured Jina API key or an empty string."""
    return get_stripped_env("JINA_API_KEY")
