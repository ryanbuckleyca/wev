# Wev Monorepo

Welcome to the Wev project. This repository contains the Bulletin app, the Scraper service, and the Supabase infrastructure.

## Prerequisites (manual install)

These cannot be automated; install them first.

- **Node.js**: `>=20.12` (an `.nvmrc` is provided — run `nvm use`).
- **Python**: `>=3.10`.
- **Docker Desktop**: required for local Supabase. Must be running before `npm run migrate:local`.
- **Supabase CLI**: installed automatically as a dev dependency via `npm install`.

Run `make doctor` at any time to check that the above are correctly installed.

## Quick Start (local dev)

```bash
nvm use                     # pick the Node version pinned in .nvmrc
make setup                  # npm install + scraper venv + requirements (incl. -dev) + .env scaffold
# edit .env with your secrets
# start Docker Desktop
npm run migrate:local       # full DB reset + seed
npm run skills:index -- --upsert-db
npm run skills:embeddings   # populate ESCO embeddings (needed for skills matching)
npm run dev                 # http://localhost:3000
```

Local emails are intercepted by **Mailpit** at [http://localhost:54324](http://localhost:54324).

## Make targets

- `make setup` — full bootstrap: `npm install` + scraper venv + `requirements.txt` + `requirements-dev.txt` + scaffold `.env`.
- `make setup-py` / `make setup-py-dev` — Python deps only (dev adds torch/ruff/pyright/etc.).
- `make setup-env` — copy `.env.example` → `.env` if missing.
- `make doctor` — verify Node/Python/Docker/Supabase versions.
- `make clean-py` — wipe the scraper venv (use if it gets corrupted).
- `make reset` — `clean-py` then `setup`.

## Useful npm scripts

- `npm run dev` — start the Bulletin app.
- `npm run migrate:local` — full local DB reset & seed.
- `npx supabase status` — check local Supabase services.
- `npm run scrape` — run a local scrape iteration (uses `.env`, writes to local DB).
- `npm run scrape:publish` — local LLMs, **prod DB**. Pulls only Supabase credentials from `.env.production`; everything else (LLM keys, `ENV_MODE`, feature flags) stays from `.env`. Requires `requirements-dev.txt` (torch) since `ENV_MODE=local` is preserved. Prompts for `YES`.
- `npm run scrape:prod` — **full prod**. Loads all of `.env.production`, including `ENV_MODE=api`, so the Jina REST API is used and torch is not required. Prompts for `YES`.
- `npm run test` — full test suite (Bulletin + scraper).
- `npm run verify` — lint + tsc + tests (run automatically on `git push`; bypass with `npm run push:skip`).

## Notes

- `.env.production` is gitignored. It must contain at minimum the prod Supabase credentials and `ENV_MODE=api`. LLM keys (`JINA_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`) are inherited from `.env` unless explicitly overridden.
- Pre-push hook runs `npm run verify:fix`. If you need to bypass it: `SKIP_VERIFY=1 git push` or `npm run push:skip`.
