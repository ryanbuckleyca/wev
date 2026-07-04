#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-${ROOT}/../wev-export.tar.gz}"

tar -czf "${OUT}" \
  --exclude='node_modules' \
  --exclude='.venv' --exclude='venv' --exclude='ENV' --exclude='env' \
  --exclude='__pycache__' --exclude='*.pyc' --exclude='*.pyo' \
  --exclude='.pytest_cache' --exclude='.ruff_cache' \
  --exclude='.next' --exclude='build' --exclude='dist' --exclude='out' \
  --exclude='coverage' --exclude='htmlcov' --exclude='.coverage' \
  --exclude='.output' --exclude='results' --exclude='playwright-report' \
  --exclude='test-results' \
  --exclude='backups' --exclude='.branches' \
  --exclude='.ai' --exclude='.cursor' --exclude='.idea' --exclude='.vscode' \
  --exclude='.windsurf' --exclude='.trae' --exclude='.antigravity' \
  --exclude='.kiro' --exclude='.agent' \
  --exclude='.env*' --exclude='*.pem' \
  --exclude='*.log' --exclude='*.tmp' --exclude='*.temp' \
  --exclude='.DS_Store' --exclude='Thumbs.db' \
  --exclude='AGENTS.md' --exclude='.cursorrules' \
  --exclude='nohup.out' --exclude='trunk_output.txt' \
  --exclude='trunk_report.txt' --exclude='trunk_results.txt' \
  --exclude='rclone-log.txt' \
  --exclude='.git' \
  -C "${ROOT}" .

echo "→ Exported t${ $O}UT ($(du -sh${"$O}UT" | cut -f1))"
