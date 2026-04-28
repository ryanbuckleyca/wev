#!/usr/bin/env bash
# Verify required dev tools are installed at supported versions.
# Exits 0 if everything looks fine; non-zero if anything is missing/wrong.

set -u

OK=0
FAIL=0
WARN=0

ok()    { printf "  \033[0;32m✓\033[0m %s\n" "$*"; OK=$((OK+1)); }
warn()  { printf "  \033[0;33m!\033[0m %s\n" "$*"; WARN=$((WARN+1)); }
bad()   { printf "  \033[0;31m✗\033[0m %s\n" "$*"; FAIL=$((FAIL+1)); }

# --- Node -------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_RAW="$(node --version)"
  NODE_MAJOR="$(printf '%s\n' "$NODE_RAW" | sed -E 's/^v([0-9]+).*/\1/')"
  NODE_MINOR="$(printf '%s\n' "$NODE_RAW" | sed -E 's/^v[0-9]+\.([0-9]+).*/\1/')"
  if [ "${NODE_MAJOR:-0}" -gt 20 ] || { [ "${NODE_MAJOR:-0}" -eq 20 ] && [ "${NODE_MINOR:-0}" -ge 12 ]; }; then
    ok "node $NODE_RAW (>=20.12 required)"
  else
    bad "node $NODE_RAW — need >=20.12 (try: nvm use)"
  fi
else
  bad "node not found"
fi

# --- npm --------------------------------------------------------------------
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm --version)"
else
  bad "npm not found"
fi

# --- Python -----------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
  PY_RAW="$(python3 --version 2>&1 | awk '{print $2}')"
  PY_MAJOR="$(printf '%s\n' "$PY_RAW" | cut -d. -f1)"
  PY_MINOR="$(printf '%s\n' "$PY_RAW" | cut -d. -f2)"
  if [ "${PY_MAJOR:-0}" -gt 3 ] || { [ "${PY_MAJOR:-0}" -eq 3 ] && [ "${PY_MINOR:-0}" -ge 10 ]; }; then
    ok "python3 $PY_RAW (>=3.10 required)"
  else
    bad "python3 $PY_RAW — need >=3.10"
  fi
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
if [ -x ./node_modules/.bin/supabase ]; then
  ok "supabase CLI (local devDependency)"
elif command -v supabase >/dev/null 2>&1; then
  ok "supabase CLI ($(supabase --version | head -n1))"
else
  warn "supabase CLI missing — run: npm install"
fi

# --- Scraper venv -----------------------------------------------------------
if [ -x wev-scraper/venv/bin/python3 ]; then
  ok "wev-scraper venv exists"
else
  warn "wev-scraper venv missing — run: make setup-py-dev"
fi

# --- .env -------------------------------------------------------------------
if [ -f .env ]; then
  ok ".env present"
else
  warn ".env missing — run: make setup-env"
fi

echo ""
printf "Summary: \033[0;32m%d ok\033[0m, \033[0;33m%d warn\033[0m, \033[0;31m%d fail\033[0m\n" "$OK" "$WARN" "$FAIL"
[ "$FAIL" -eq 0 ]
