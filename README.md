# Wev Monorepo

Welcome to the Wev project. This repository contains the Bulletin app, the Scraper service, and the Supabase infrastructure.

## Prerequisites (manual install)

These cannot be automated; install them first.

- **Node.js**: `>=20.12` — `.nvmrc` is provided, so `nvm use` picks it up.
- **Python**: `3.10`, `3.11`, or `3.12` (Python 3.13 has no torch wheel on macOS x86_64). Python 3.11 is the safest choice on Intel Mac.
- **Docker Desktop**: required for local Supabase. Must be running before `npm run migrate:local`.
- **Supabase CLI**: installed automatically as a dev dependency via `npm install`.

Run `make doctor` at any time to verify everything's installed at the right versions.

## Quick Start (local dev)

```bash
nvm use                     # pick the Node version pinned in .nvmrc
make setup                  # npm install + scraper venv + requirements (incl. -dev) + .env scaffold
# edit .env with your secrets
# start Docker Desktop
npm run migrate:local       # full DB reset + seed (loads the "Community Builder N" fixtures)
npm run skills:index -- --upsert-db
npm run skills:embeddings   # populate ESCO embeddings (needed for skills matching)
npm run dev                 # http://localhost:3000
```

Local emails are intercepted by **Mailpit** at [http://localhost:54324](http://localhost:54324).

## Make targets

- `make setup` — full bootstrap: `npm install` + scraper venv + `requirements.txt` (editable install) + `requirements-dev.txt` + scaffold `.env`.
- `make setup-py` / `make setup-py-dev` — Python deps only. `setup-py-dev` adds **torch / transformers / einops** for the local Jina v3 embedding model used by `ENV_MODE=local`. Required for any scrape that does skills tagging or vector embeddings.
- `make setup-env` — copy `.env.example` → `.env` if missing.
- `make doctor` — verify Node/Python/Docker/Supabase versions and venv/.env presence.
- `make clean-py` — wipe the scraper venv (use if it gets corrupted).
- `make reset` — `clean-py` then `setup`.

The Makefile auto-detects a torch-compatible Python (`python3.11` → `python3.12` → `python3.10` → `python3`). Override with `make setup PYTHON_BIN=python3.12`.

## Useful npm scripts

- `npm run dev` — start the Bulletin app.
- `npm run migrate:local` — full local DB reset & seed (uses fixture data from `supabase/src/dataset.ts`).
- `npx supabase status` — check local Supabase services.
- `npm run scrape` — local scrape iteration: uses `.env`, writes to local DB.
- `npm run scrape:publish` — local LLMs, **prod DB**. Pulls only Supabase credentials from `.env.production`; everything else (LLM keys, `ENV_MODE`, feature flags) stays from `.env`. Prompts for `YES`.
- `npm run scrape:prod` — **full prod**. Loads all of `.env.production` over `.env`, so any prod-specific overrides apply. Prompts for `YES`.
- `npm run test` — full test suite (Bulletin + scraper).
- `npm run verify` — lint + tsc + tests (run automatically on `git push`; bypass with `npm run push:skip`).

## LLM providers used by the scraper (`ENV_MODE=local` default)

- **Jina v3** (skill embeddings): runs locally via `transformers`+`torch`. Installed by `make setup-py-dev`. To call the Jina REST API instead, set `ENV_MODE=api` and provide `JINA_API_KEY`.
- **Gemini** (job summarization, values tagging, SSE classification): always called via API. Requires `GEMINI_API_KEY`. **Note**: the free tier is capped at 20 requests/day per model — large backlogs need a paid tier or staggered runs.
- **Groq** (CV → values inference in the bulletin): API-only. Requires `GROQ_API_KEY`.

## Notes

- `.env.production` is gitignored. It must contain the prod Supabase credentials and any prod-specific overrides. LLM keys (`JINA_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`) are inherited from `.env` unless explicitly overridden.
- Pre-push hook runs `npm run verify:fix`. To bypass: `SKIP_VERIFY=1 git push` or `npm run push:skip`.
- Avoid wrapping scraper Python scripts in `dotenv-cli`: it is **first-wins** and will not override `.env` values from `.env.production`. Scripts that need to target prod (`scrape.py`, `unified_post_processor.py`) load `.env.production` themselves when `--prod` is passed.
