# Wev dev-environment helpers.
# Manual prerequisites (Node 20+, Python 3.10+, Docker Desktop, Supabase CLI)
# are documented in README.md. Targets here automate the rest.

SHELL := /bin/bash
SCRAPER_DIR := wev-scraper
VENV := $(SCRAPER_DIR)/venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python3

.PHONY: help setup setup-node setup-py setup-py-dev setup-env doctor clean-py reset

help:
	@echo "Wev dev targets:"
	@echo "  make setup       Full local-dev bootstrap (node + python + python-dev + .env)"
	@echo "  make setup-node  npm install only"
	@echo "  make setup-py    Create scraper venv + install requirements.txt"
	@echo "  make setup-py-dev  Also install requirements-dev.txt (torch, ruff, pyright, etc.)"
	@echo "  make setup-env   Copy .env.example -> .env if .env is missing"
	@echo "  make doctor      Check tool versions (node, python, docker, supabase)"
	@echo "  make clean-py    Remove the scraper venv (use if it gets corrupted)"
	@echo "  make reset       clean-py then setup"

setup: setup-node setup-py-dev setup-env
	@echo ""
	@echo "✓ Setup complete. Next steps (manual):"
	@echo "    1. Edit .env with your secrets"
	@echo "    2. Start Docker Desktop"
	@echo "    3. npm run migrate:local"
	@echo "    4. npm run skills:index -- --upsert-db && npm run skills:embeddings"
	@echo "    5. npm run dev"

setup-node:
	npm install

$(VENV):
	cd $(SCRAPER_DIR) && python3 -m venv venv

setup-py: $(VENV)
	$(PIP) install --quiet --upgrade pip
	$(PIP) install --quiet -r $(SCRAPER_DIR)/requirements.txt

setup-py-dev: setup-py
	$(PIP) install --quiet -r $(SCRAPER_DIR)/requirements-dev.txt

setup-env:
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo "✓ Created .env from .env.example — fill in your secrets."; \
	else \
	  echo "✓ .env already exists, leaving it alone."; \
	fi

doctor:
	@./scripts/doctor.sh

clean-py:
	rm -rf $(VENV)

reset: clean-py setup
