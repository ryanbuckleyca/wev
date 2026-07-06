#!/usr/bin/env python3
"""Repo-root launcher for the unified post-processor script.

This wrapper makes the command
    python scripts/unified_post_processor.py ...
work from the repository root by dispatching to the scraper project with Python 3
and the correct working directory.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRAPER_ROOT = REPO_ROOT / "wev-scraper"
TARGET = SCRAPER_ROOT / "scripts" / "unified_post_processor.py"


def _find_python3() -> str:
    candidates = []
    venv_python = SCRAPER_ROOT / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)

    env_python = os.environ.get("PYTHON3")
    if env_python:
        candidates.append(env_python)

    candidates.extend(["python3", "python3.12", "python3.11", "python3.10"])
    for candidate in candidates:
        if shutil.which(candidate):
            return candidate
    return sys.executable


def main() -> int:
    python_exe = _find_python3()
    cmd = [python_exe, str(TARGET), *sys.argv[1:]]
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(
        part for part in [str(SCRAPER_ROOT), env.get("PYTHONPATH", "")] if part
    )
    completed = subprocess.run(cmd, cwd=SCRAPER_ROOT, env=env)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
