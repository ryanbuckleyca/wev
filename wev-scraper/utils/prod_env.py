"""Shared --prod / --publish environment bootstrap for scraper scripts."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from settings import load_db_credentials_only, load_env_file


def resolve_prod_env_path(script_file: Path) -> Path:
    """Return the path to .env.production (repo root or scraper package)."""
    scraper_dir = script_file.resolve().parent
    root_dir = scraper_dir.parent
    for candidate in (root_dir / ".env.production", scraper_dir / ".env.production"):
        if candidate.exists():
            return candidate
    return root_dir / ".env.production"


def apply_prod_overrides(prod_env: Path, *, full_prod: bool) -> None:
    """Load production credentials and set ENV_MODE / USE_PROD_DB."""
    if full_prod:
        print(f"▶ Loading production overrides from {prod_env.name}")
        load_env_file(prod_env)
        os.environ["ENV_MODE"] = "prod"
        print(
            "▶ LLM routing: ENV_MODE=prod (not local — use keys from .env.production)",
            flush=True,
        )
    else:
        applied = load_db_credentials_only(prod_env)
        print(
            f"▶ Publish mode: loaded {len(applied)} DB credential(s) from "
            f"{prod_env.name} ({', '.join(applied)}); LLM/feature config kept from .env"
        )
        os.environ["ENV_MODE"] = "local"
        print(
            "▶ LLM routing: ENV_MODE=local (--publish → local LLMs / embeddings)",
            flush=True,
        )
    os.environ["USE_PROD_DB"] = "1"


def bootstrap_prod_from_argv(argv: list[str], script_file: Path) -> None:
    """Apply --prod / --publish overrides before DB/LLM imports.

    Exits the process when flags are invalid or .env.production is missing.
    """
    has_prod = "--prod" in argv
    has_publish = "--publish" in argv
    if not has_prod and not has_publish:
        return
    if has_prod and has_publish:
        print("Error: --prod and --publish are mutually exclusive.", file=sys.stderr)
        sys.exit(2)

    prod_env = resolve_prod_env_path(script_file)
    if not prod_env.exists():
        print(
            f"❌ {prod_env} not found — required for --prod / --publish.",
            file=sys.stderr,
        )
        sys.exit(1)

    apply_prod_overrides(prod_env, full_prod=has_prod)
