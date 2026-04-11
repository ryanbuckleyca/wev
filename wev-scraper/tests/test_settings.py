"""Tests for centralized scraper settings."""

from __future__ import annotations

import os
import sys
from pathlib import Path
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


def test_get_geocodio_api_key_reads_from_shared_settings():
    with patch.dict(os.environ, {"GEOCODIO_API_KEY": " test-key "}, clear=False):
        assert settings.get_geocodio_api_key() == "test-key"


def test_get_stripped_env_reads_from_shared_settings():
    with patch.dict(os.environ, {"JINA_API_KEY": " test-key "}, clear=False):
        assert settings.get_jina_api_key() == "test-key"


def test_utils_db_import_does_not_create_supabase_client(monkeypatch):
    import importlib
    import supabase as supabase_lib
    import utils.db as db
    from unittest.mock import MagicMock

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
