# Wev Monorepo

Welcome to the Wev project. This repository contains the Bulletin app, the Scraper service, and the Supabase infrastructure.

## Prerequisites (manual install)

These cannot be automated; install them first.

- **Node.js**: `>=20.12` — `.nvmrc` is provided, so `nvm use` picks it up.
- **Python**: `3.10`, `3.11`, or `3.12` (Python 3.13 has no torch wheel on macOS x86_64). Python 3.11 is the safest choice on Intel Mac.
- **Docker Desktop**: required for local Supabase. Must be running before `npm run migrate:local`.
- **Supabase CLI**: installed automatically as a dev dependency via `npm install`.
- **Ollama** (optional): for local LLM during `*:publish` runs; see **LLM / embeddings** below. `make doctor` checks it.

Run `make doctor` to verify versions and venv/.env.

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
- `make setup-py` / `make setup-py-dev` — Python deps only. `setup-py-dev` adds **torch / transformers / einops** for **local Jina v3** skill embeddings. Required for any scrape that does skills tagging or vector embeddings.
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
- `npm run scrape:publish` — local LLMs / local Jina, **prod DB**. Pulls only Supabase credentials from `.env.production`; LLM keys and embedding setup stay from `.env`. Prompts for `YES`.
- `npm run scrape:prod` — **full prod**. Loads all of `.env.production` over `.env`, so any prod-specific overrides apply. Prompts for `YES`.
- `npm run process:publish` — run the **unified post-processor** (summary / values / SSE) with the same publish semantics: prod DB, config from `.env`. Use when a scrape finished but post-process failed or needs a re-run.
- `npm run process:prod` — unified post-processor with **full** `.env.production` overrides (same idea as `scrape:prod`). Prompts for `YES`.
- Extra CLI args pass through: `npm run process:publish -- --limit 50 --verbose`.
- `npm run test` — full test suite (Bulletin + scraper).
- `npm run verify` — lint + tsc + tests (run automatically on `git push`; bypass with `npm run push:skip`).

## LLM / embeddings (scraper)

- **Jina v3** (skill embeddings): runs **locally** via `transformers` + `torch` (`make setup-py-dev`, ~570MB model on first use).
- **Ollama** (optional, for local text LLM in `.env`): unified post-processor and SSE classifier try Ollama first when configured, then Gemini → Groq. Install from [ollama.com/download](https://ollama.com/download), run `ollama serve`, and pull `LOCAL_LLM_MODEL` (e.g. `ollama pull llama3.2:3b`).
- **`scrape:publish` / `process:publish`** keep your machine’s `.env` (local embeddings + local LLM setup if you use it) while writing to **production** Supabase.
- **`scrape:prod` / `process:prod`** load all of `.env.production`, so API keys and flags come from there—use when you intend a fully prod-configured run.
- **Gemini** / **Groq**: API keys as needed for cloud fallbacks or prod-mode runs. Gemini free tier can be tight on volume; consider paid tier or smaller batches (`--limit` on the post-processor).

## Notes

- `.env.production` is gitignored. It must contain prod Supabase credentials. In **`publish`** mode, only those DB keys are applied; the rest of the process still uses `.env`. In **`prod`** mode, `.env.production` overrides `.env` for all keys it defines.
- Pre-push hook runs `npm run verify:fix`. To bypass: `SKIP_VERIFY=1 git push` or `npm run push:skip`.
- Avoid wrapping scraper Python in `dotenv-cli` (**first-wins**). Use `npm run scrape:prod`, `scrape:publish`, `process:prod`, or `process:publish` so env layering matches `scrape.py` / `unified_post_processor.py`.
