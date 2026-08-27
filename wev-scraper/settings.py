"""Centralized runtime settings for wev-scraper.

Loads .env at most once per process via ensure_env_loaded().
Use load_env_file(path) to explicitly load an override file (e.g. .env.staging).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values, find_dotenv, load_dotenv

from utils.env import is_truthy_env

SCRAPER_ROOT = Path(__file__).resolve().parent
_ENV_LOADED = False


def ensure_env_loaded() -> None:
    """Load the base .env exactly once per process via dotenv discovery.

    Subsequent calls are no-ops. Use load_env_file() to explicitly load
    an override file (e.g. .env.staging) on top of the base env.
    """
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    load_dotenv(find_dotenv())
    _ENV_LOADED = True


def load_env_file(env_file: str | Path) -> None:
    """Load a specific env file with override=True.

    Unlike ensure_env_loaded(), this always runs and is intended for
    layering environment-specific overrides (staging, prod) on top of
    the base env. May be called multiple times with different files.
    """
    load_dotenv(env_file, override=True)


# Keys that identify which Supabase target to use. `load_db_credentials_only`
# reads only these from a target env file so local LLM/feature config in the
# active env (`ENV_MODE=local`, `JINA_API_KEY`, `GROQ_API_KEY`, etc.) is left
# intact when "publishing" results to a different DB.
_SUPABASE_DB_KEYS: tuple[str, ...] = (
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PROD_URL",
    "SUPABASE_PROD_SECRET_KEY",
    "SUPABASE_PROJECT_REF",
)


def load_db_credentials_only(env_file: str | Path) -> list[str]:
    """Apply only Supabase DB credentials from env_file to os.environ.

    Used by `scrape.py --publish` to swap the DB target while keeping the
    rest of the active env (LLM keys, feature flags, ENV_MODE, etc.) untouched.
    Returns the list of keys that were actually applied.
    """
    values = dotenv_values(env_file)
    applied: list[str] = []
    for key in _SUPABASE_DB_KEYS:
        value = values.get(key)
        if value is not None:
            os.environ[key] = value
            applied.append(key)
    return applied

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


def is_local_env() -> bool:
    """Return True when running in ENV_MODE=local."""
    return get_env_mode() == "local"


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    secret_key: str


def _strip_trailing_slash(value: str | None) -> str:
    return ((value or "").rstrip("/") + "/") if value else ""


def get_supabase_settings() -> SupabaseSettings:
    """Return the active Supabase credentials for the current runtime mode.

    When USE_PROD_DB=1, prefer the SUPABASE_PROD_* prefixed credentials. If those
    aren't set, fall back to SUPABASE_URL / SUPABASE_SECRET_KEY — this
    supports the override-file pattern where `.env.production` is loaded with
    override=True and rewrites the unprefixed names in place (see scrape.py).
    """
    raw_url = get_env("SUPABASE_URL")
    prod_url = get_env("SUPABASE_PROD_URL")
    raw_key = get_env("SUPABASE_SECRET_KEY")
    prod_key = get_env("SUPABASE_PROD_SECRET_KEY")

    use_prod = is_truthy_env("USE_PROD_DB")
    if use_prod:
        url = _strip_trailing_slash(prod_url or raw_url)
        secret_key = prod_key or raw_key or ""
    else:
        url = _strip_trailing_slash(raw_url)
        secret_key = raw_key or ""

    if not url or not secret_key:
        if use_prod:
            raise ValueError(
                "Production Supabase credentials not set. Provide either "
                "SUPABASE_PROD_URL/SUPABASE_PROD_SECRET_KEY or override "
                "SUPABASE_URL/SUPABASE_SECRET_KEY via .env.production."
            )
        raise ValueError("SUPABASE_URL or SUPABASE_SECRET_KEY not set")

    return SupabaseSettings(url=url, secret_key=secret_key)


def get_geocodio_api_key() -> str:
    """Return the configured Geocodio API key or an empty string."""
    return get_stripped_env("GEOCODIO_API_KEY")


def get_gemini_api_key() -> str:
    """Return the configured Gemini API key or an empty string."""
    return get_stripped_env("GEMINI_API_KEY")


def get_groq_api_key() -> str:
    """Return the configured Groq API key or an empty string."""
    return get_stripped_env("GROQ_API_KEY")


def get_jina_api_key() -> str:
    """Return the configured Jina API key or an empty string."""
    return get_stripped_env("JINA_API_KEY")
