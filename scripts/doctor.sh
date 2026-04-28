#!/usr/bin/env bash
# Verify required dev tools are installed at supported versions.
# Exits 0 if everything looks fine; non-zero if anything is missing/wrong.

set -u

OK=0
FAIL=0
WARN=0

ok() {
	printf "  \033[0;32m✓\033[0m %s\n" "$*"
	OK=$((OK + 1))
}
warn() {
	printf "  \033[0;33m!\033[0m %s\n" "$*"
	WARN=$((WARN + 1))
}
bad() {
	printf "  \033[0;31m✗\033[0m %s\n" "$*"
	FAIL=$((FAIL + 1))
}

# --- Node -------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
	NODE_RAW="$(node --version)"
	NODE_MAJOR="$(printf '%s\n' "${NODE_RAW}" | sed -E 's/^v([0-9]+).*/\1/')"
	NODE_MINOR="$(printf '%s\n' "${NODE_RAW}" | sed -E 's/^v[0-9]+\.([0-9]+).*/\1/')"
	if [[ ${NODE_MAJOR:-0} -gt 20 ]] || { [[ ${NODE_MAJOR:-0} -eq 20 ]] && [[ ${NODE_MINOR:-0} -ge 12 ]]; }; then
		ok "node ${NODE_RAW} (>=20.12 required)"
	else
		bad "node ${NODE_RAW} — need >=20.12 (try: nvm use)"
	fi
else
	bad "node not found"
fi

# --- npm --------------------------------------------------------------------
if command -v npm >/dev/null 2>&1; then
	NPM_VER="$(npm --version)"
	ok "npm ${NPM_VER}"
else
	bad "npm not found"
fi

# --- Python -----------------------------------------------------------------
# We need a Python in the 3.10–3.12 range for the scraper venv, because
# torch (used by ENV_MODE=local Jina embeddings) only ships wheels for those
# versions on macOS x86_64. Python 3.13 has no torch wheel there.
SCRAPER_PY=""
for cand in python3.11 python3.12 python3.10; do
	if command -v "${cand}" >/dev/null 2>&1; then
		SCRAPER_PY="${cand}"
		break
	fi
done

if [[ -n ${SCRAPER_PY} ]]; then
	SCRAPER_PY_VER="$(${SCRAPER_PY} --version 2>&1)"
	ok "${SCRAPER_PY} available for scraper venv (${SCRAPER_PY_VER})"
elif command -v python3 >/dev/null 2>&1; then
	PY_RAW="$(python3 --version 2>&1 | awk '{print $2}' || true)"
	bad "no python3.10/3.11/3.12 found — system python3 is ${PY_RAW} (torch wheels unavailable for 3.13+)"
else
	bad "python3 not found"
fi

# --- Docker -----------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
	if docker info >/dev/null 2>&1; then
		ok "docker is running"
	else
		warn "docker installed but daemon not running (start Docker Desktop)"
	fi
else
	bad "docker not found (install Docker Desktop)"
fi

# --- Supabase CLI -----------------------------------------------------------
# We use the npm-package supabase, so verify via npx.
if [[ -x ./node_modules/.bin/supabase ]]; then
	ok "supabase CLI (local devDependency)"
elif command -v supabase >/dev/null 2>&1; then
	SUPA_VER="$(supabase --version | head -n1 || true)"
	ok "supabase CLI (${SUPA_VER})"
else
	warn "supabase CLI missing — run: npm install"
fi

# --- Scraper venv -----------------------------------------------------------
if [[ -x wev-scraper/venv/bin/python3 ]]; then
	ok "wev-scraper venv exists"
else
	warn "wev-scraper venv missing — run: make setup-py-dev"
fi

# --- .env -------------------------------------------------------------------
if [[ -f .env ]]; then
	ok ".env present"
else
	warn ".env missing — run: make setup-env"
fi

# --- Ollama (optional, for ENV_MODE=local LLM) ------------------------------
# When ENV_MODE=local, the unified post-processor and SSE classifier prefer
# Ollama over Gemini/Groq. Without Ollama, they silently fall back to the API
# providers — so this is a warn, not a bad.
if command -v ollama >/dev/null 2>&1; then
	OLLAMA_VER="$(ollama --version 2>&1 | head -n1 || true)"
	if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
		LOCAL_MODEL="${LOCAL_LLM_MODEL:-llama3.2:3b}"
		MODEL_BASE="${LOCAL_MODEL%%:*}"
		if ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -q "^${MODEL_BASE}"; then
			ok "ollama running (${OLLAMA_VER}); model ${LOCAL_MODEL} pulled"
		else
			warn "ollama running but model ${LOCAL_MODEL} not pulled — run: ollama pull ${LOCAL_MODEL}"
		fi
	else
		warn "ollama installed but daemon not running — run: ollama serve (or open the desktop app)"
	fi
else
	warn "ollama not found (optional) — install from ollama.com/download for ENV_MODE=local LLM"
fi

echo ""
printf "Summary: \033[0;32m%d ok\033[0m, \033[0;33m%d warn\033[0m, \033[0;31m%d fail\033[0m\n" "${OK}" "${WARN}" "${FAIL}"
[[ ${FAIL} -eq 0 ]]
