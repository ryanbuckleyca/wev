"""Shared --prod / --publish environment bootstrap for scraper scripts."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from settings import load_db_credentials_only, load_env_file


def has_prod_confirmation() -> bool:
    return os.environ.get("PROD_CONFIRMED") == "1" or os.environ.get("CONFIRM_PROD_RUN") == "YES"


def mark_prod_confirmed() -> None:
    os.environ["PROD_CONFIRMED"] = "1"
    os.environ["CONFIRM_PROD_RUN"] = "YES"


def confirm_prod_run(*, full_prod: bool) -> None:
    """Prompt or validate before targeting production infrastructure.

    run.ts sets PROD_CONFIRMED=1 after its prompt; CI may use CONFIRM_PROD_RUN=YES.
    """
    if has_prod_confirmation():
        mark_prod_confirmed()
        return

    mode = "PRODUCTION (full)" if full_prod else "PRODUCTION DB (publish — local LLMs)"
    if sys.stdin.isatty():
        confirm = input(f"⚠️  RUNNING AGAINST {mode}. Type 'YES' to continue: ")
        if confirm != "YES":
            sys.exit(0)
        mark_prod_confirmed()
        return

    print(
        "Refusing production run in non-interactive mode. "
        "Set CONFIRM_PROD_RUN=YES (or run via npm run scrape -- --prod).",
        file=sys.stderr,
    )
    sys.exit(1)


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


def resolve_staging_env_path(script_file: Path) -> Path:
    """Return the path to .env.staging (repo root or scraper package)."""
    scraper_dir = script_file.resolve().parent
    if scraper_dir.name == "scripts":
        root_dir = scraper_dir.parent.parent
        scraper_pkg = scraper_dir.parent
    else:
        root_dir = scraper_dir.parent
        scraper_pkg = scraper_dir
    for candidate in (root_dir / ".env.staging", scraper_pkg / ".env.staging"):
        if candidate.exists():
            return candidate
    return root_dir / ".env.staging"


def bootstrap_staging_from_argv(argv: list[str], script_file: Path) -> None:
    """Apply --staging overrides before DB/LLM imports."""
    if "--staging" not in argv:
        return
    if "--prod" in argv or "--publish" in argv:
        print(
            "Error: --staging cannot be combined with --prod or --publish.",
            file=sys.stderr,
        )
        sys.exit(2)

    staging_env = resolve_staging_env_path(script_file)
    if staging_env.exists():
        print(f"▶ Loading staging overrides from {staging_env.name}")
        load_env_file(staging_env)
    else:
        print(
            f"⚠️ Warning: --staging flag used but {staging_env} not found.",
            file=sys.stderr,
        )


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
