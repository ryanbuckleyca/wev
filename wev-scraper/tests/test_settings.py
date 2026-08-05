"""Tests for centralized scraper settings."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

import settings


@pytest.fixture(autouse=True)
def reset_settings_state(monkeypatch):
    monkeypatch.setattr(settings, "_ENV_LOADED", False)


def test_ensure_env_loaded_only_loads_dotenv_once(monkeypatch):
    calls: list[str | None] = []

    def fake_load_dotenv(path: str | None = None):
        calls.append(path)
        return True

    def fake_find_dotenv():
        return str(settings.SCRAPER_ROOT / ".env")

    monkeypatch.setattr(settings, "load_dotenv", fake_load_dotenv)
    monkeypatch.setattr(settings, "find_dotenv", fake_find_dotenv)

    settings.ensure_env_loaded()
    settings.ensure_env_loaded()

    assert calls == [str(settings.SCRAPER_ROOT / ".env")]


def test_get_supabase_settings_uses_prod_credentials_when_enabled():
    with patch.dict(
        os.environ,
        {
            "USE_PROD_DB": "1",
            "SUPABASE_URL": "http://localhost:54321",
            "SUPABASE_SERVICE_ROLE_KEY": "local-key",
            "SUPABASE_PROD_URL": "https://prod.example.supabase.co",
            "SUPABASE_PROD_SERVICE_ROLE_KEY": "prod-key",
        },
        clear=False,
    ):
        config = settings.get_supabase_settings()

    assert config.url == "https://prod.example.supabase.co/"
    assert config.secret_key == "prod-key"


def test_get_supabase_settings_falls_back_to_unprefixed_when_prod_vars_missing(monkeypatch):
    """When USE_PROD_DB=1 and SUPABASE_PROD_* aren't set, fall back to
    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. This supports the override-file
    pattern where `.env.production` rewrites the unprefixed names in place."""
    # Skip dotenv loading so the developer's actual .env doesn't leak in
    monkeypatch.setattr(settings, "_ENV_LOADED", True)
    monkeypatch.delenv("SUPABASE_PROD_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PROD_SERVICE_ROLE_KEY", raising=False)
    with patch.dict(
        os.environ,
        {
            "USE_PROD_DB": "1",
            "SUPABASE_URL": "https://prod.example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "prod-key-from-override",
        },
        clear=False,
    ):
        config = settings.get_supabase_settings()

    assert config.url == "https://prod.example.supabase.co/"
    assert config.secret_key == "prod-key-from-override"


def test_load_db_credentials_only_swaps_db_keys_only(tmp_path, monkeypatch):
    """`--publish` uses this to swap the DB target without touching LLM keys."""
    prod_env = tmp_path / ".env.production"
    prod_env.write_text(
        "SUPABASE_URL=https://prod.example.supabase.co\n"
        "SUPABASE_SERVICE_ROLE_KEY=prod-key\n"
        "SUPABASE_PROJECT_REF=teuvfoftdjfsnkkbnzps\n"
        "GROQ_API_KEY=should-not-be-applied\n"
        "ENV_MODE=should-not-be-applied\n"
    )
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "local-key")
    monkeypatch.setenv("GROQ_API_KEY", "local-groq-key")
    monkeypatch.setenv("ENV_MODE", "local")

    applied = settings.load_db_credentials_only(prod_env)

    assert set(applied) == {
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_PROJECT_REF",
    }
    assert os.environ["SUPABASE_URL"] == "https://prod.example.supabase.co"
    assert os.environ["SUPABASE_SERVICE_ROLE_KEY"] == "prod-key"
    assert os.environ["SUPABASE_PROJECT_REF"] == "teuvfoftdjfsnkkbnzps"
    assert os.environ["GROQ_API_KEY"] == "local-groq-key"
    assert os.environ["ENV_MODE"] == "local"


def test_get_geocodio_api_key_reads_from_shared_settings():
    with patch.dict(os.environ, {"GEOCODIO_API_KEY": " test-key "}, clear=False):
        assert settings.get_geocodio_api_key() == "test-key"


def test_get_stripped_env_reads_from_shared_settings():
    with patch.dict(os.environ, {"JINA_API_KEY": " test-key "}, clear=False):
        assert settings.get_jina_api_key() == "test-key"


def test_get_groq_api_key_strips_whitespace():
    with patch.dict(os.environ, {"GROQ_API_KEY": " gsk_test "}, clear=False):
        assert settings.get_groq_api_key() == "gsk_test"


def test_utils_db_import_does_not_create_supabase_client(monkeypatch):
    import importlib
    from unittest.mock import MagicMock

    import supabase as supabase_lib

    import utils.db as db

    calls: list[tuple[str, str]] = []

    def fake_create_client(url: str, key: str):
        calls.append((url, key))
        client = MagicMock()
        client.table = MagicMock()
        return client

    monkeypatch.setattr(supabase_lib, "create_client", fake_create_client)
    monkeypatch.setattr(settings, "_ENV_LOADED", False)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-secret-key")

    db = importlib.reload(db)

    assert calls == []

    _ = db.supabase.table

    assert calls == [("http://localhost:54321/", "test-secret-key")]
