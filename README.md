# Wev Monorepo

Welcome to the Wev project. This repository contains the Bulletin app, the Scraper service, and the Supabase infrastructure.

## Prerequisites (manual install)

These cannot be automated; install them first.

- **Node.js**: v22.22.2+ (the repo pins Node 22.22.2 in `.nvmrc`; use `nvm use` before running installs or tests).
- **Python**: `3.10`, `3.11`, or `3.12` (Python 3.13 has no torch wheel on macOS x86_64). Python 3.11 is the safest choice on Intel Mac.
- **Docker Desktop**: Required for local Supabase. Must be running before `npm run migrate`.
- **Supabase CLI**: installed automatically as a dev dependency via `npm install`.
- **Ollama** (optional): for local LLM during `*:publish` runs; see **LLM / embeddings** below. `make doctor` checks it.

Run `make doctor` to verify versions and venv/.env.

```bash
nvm use                     # pick the Node version pinned in .nvmrc
make setup                  # npm install + scraper venv + requirements (incl. -dev) + .env scaffold
# edit .env with your secrets
# start Docker Desktop
npm run migrate             # full DB reset + seed (loads the "Community Builder N" fixtures)
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

- `npm run help` — cheat sheet for scripts and flags (`npm run` alone only lists script names).
- `npm run dev` — start the Bulletin app.
- `npm run migrate` — full local DB reset & seed (uses fixture data from `supabase/src/dataset.ts`).
- `npm run migrate -- --staging` — push migrations to staging.
- `npm run migrate -- --prod` — push migrations to production.
- `npm run restore` — restore backup JSON into local Supabase.
- `npm run restore -- --staging` — restore backups into staging.
- `npm run seed` — seed local DB (without full migrate reset).
- `npm run seed -- --staging` — seed staging.
- `npx supabase status` — check local Supabase services.

### Script naming

| Pattern | When to use | Examples |
|---------|-------------|----------|
| `command` + `npm run cmd -- --flag` | One tool, options vary (env, limits, slugs) | `scrape`, `process`, `migrate`, `restore`, `seed` |
| `family:member` (colon) | **Different tasks** under one namespace | `skills:index`, `skills:embeddings`, `test:bulletin`, `test:e2e` |
| `family:member:mode` (colon) | Sub-variant of a **different task** (not an env flag) | `test:e2e:debug`, `coverage:guidelines:strict` |
| Hyphen **inside** a segment | Multi-word name for one script | `test:mutation-smoke`, `apply-migrations` |

**Colons** = npm's namespace separator (`family:thing`). **Hyphens** = word breaks within a name (`mutation-smoke`). Don't use colons for env targeting — use `--staging` / `--prod` after `--`.

`skills:embeddings` vs `skills:index` are separate scripts (index builds JSON, embeddings writes vectors) — colon grouping is right. `test:*` scripts are separate suites — keep colons, don't fold into `npm run test -- bulletin`.

**Examples:**

```bash
npm run scrape:list-sources            # fast: Supabase JS, no Python bootstrap
```

Each command has one npm entry point. Pass **flags after `--`** to choose the DB target, source, and other options.

**DB targets** (mutually exclusive):

| Flag | Database | LLM / embeddings |
|------|----------|------------------|
| *(none)* | Local (`.env`) | From `.env` |
| `--staging` | Staging (`.env.staging`) | From `.env` + staging overrides |
| `--prod` | Production (`.env.production`) | From `.env.production` (`ENV_MODE=prod`) |
| `--publish` | Production (`.env.production`) | From `.env` (`ENV_MODE=local`) — see below |

`--publish` is **not** an environment like staging. It's a hybrid workflow for **scrape only**: write to the **production database**, but run LLMs and embeddings **on your machine** (Ollama, local Jina). `npm run process` is **local/staging only** — it does not accept `--prod` or `--publish`.

| Command | Prod DB writes? |
|---------|-----------------|
| `npm run scrape -- --publish` | Yes (with YES prompt) |
| `npm run scrape -- --prod` | Yes (with YES prompt) |
| `npm run process` | No — local or `--staging` only |

**Examples:**

```bash
npm run scrape:list-sources            # list source slugs (fast)
npm run scrape                              # local, all sources
npm run scrape -- --source mac              # local, one source (--slug also works)
npm run scrape -- --staging --source cent
npm run scrape -- --publish --source goodwork # prod DB, local LLMs
npm run scrape -- --prod                    # full prod

npm run process -- --staging --limit 50

npm run skills:index                        # ESCO API → JSON file only
npm run skills:index -- --upsert-db         # upsert skills to local DB
npm run skills:index -- --upsert-db --staging
npm run skills:embeddings                   # embed skills in local DB
npm run skills:embeddings -- --staging
npm run skills:embeddings -- --prod         # prompts for YES
```

- `npm run test` — full test suite (Bulletin + scraper).
- `npm run verify` — lint + tsc + tests (run automatically on `git push`; bypass with `npm run push:skip`).

## LLM / embeddings (scraper)

- **Jina v3** (skill embeddings): runs **locally** when `ENV_MODE=local` (via `transformers` + `torch`; `make setup-py-dev`, ~570MB model on first use). Any other `ENV_MODE` (e.g. `prod` or unset after a prod overlay) uses the REST API path when configured.
- **Ollama** (optional): used for unified / local LLM work when `ENV_MODE=local`. Install from [ollama.com/download](https://ollama.com/download), run `ollama serve`, and pull `LOCAL_LLM_MODEL` (e.g. `ollama pull llama3.2:3b`).
- **`--publish`:** prod Supabase credentials from `.env.production`; `ENV_MODE=local` so embeddings + text LLM stay on your machine.
- **`--prod`:** loads `.env.production` over `.env` and sets `ENV_MODE=prod` (cloud keys, no local-first routing).
- **Gemini** / **Groq**: API keys as needed for `*:prod` and cloud fallbacks. Gemini free tier can be tight on volume; consider paid tier or smaller batches (`--limit` on the post-processor).

## Notes

- In **`publish`** mode, only prod Supabase keys are applied from `.env.production`; the runner sets `ENV_MODE=local` so **prod DB + local LLMs/embeddings** (typical “push from my machine” workflow). In **`prod`** mode, the full prod file is layered on `.env`, then `ENV_MODE=prod` so you don’t accidentally keep `ENV_MODE=local` from `.env` when you meant a fully prod-configured run.
- Pre-push hook runs `npm run verify:fix`. To bypass: `SKIP_VERIFY=1 git push` or `npm run push:skip`.
- Avoid wrapping scraper Python in `dotenv-cli` (**first-wins**). Use `npm run scrape -- --prod` or `npm run scrape -- --publish` so env layering matches `scrape.py`.

## Architectural Roadmap

- **CV Uploads**: Currently implemented as a synchronous API route with inline `worker_threads` for parsing to avoid event loop blocking. As scale increases, this should be moved to a decoupled Background Job / Microservice architecture (uploading to Supabase Storage -> async queue processing) to fully resolve potential HTTP load-balancer timeouts.
