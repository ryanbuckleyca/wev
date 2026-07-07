#!/usr/bin/env python
"""Repo-root launcher for the unified post-processor script.

This wrapper makes the command
    python scripts/unified_post_processor.py ...
work from the repository root by dispatching to the scraper project with Python 3
and the correct working directory.
"""

import os
import subprocess  # trunk-ignore(bandit/B404)
import sys


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
SCRAPER_ROOT = os.path.join(REPO_ROOT, "wev-scraper")
TARGET = os.path.join(SCRAPER_ROOT, "scripts", "unified_post_processor.py")


def _find_python3():
    venv_python = os.path.join(SCRAPER_ROOT, ".venv", "bin", "python")
    if os.path.exists(venv_python):
        return venv_python

    env_python = os.environ.get("PYTHON3")
    if env_python:
        return env_python

    for candidate in ("python3", "python3.12", "python3.11", "python3.10"):
        for path_dir in os.environ.get("PATH", "").split(os.pathsep):
            candidate_path = os.path.join(path_dir, candidate)
            if os.path.isfile(candidate_path) and os.access(candidate_path, os.X_OK):
                return candidate_path

    return sys.executable


def main():
    python_exe = _find_python3()
    cmd = [python_exe, TARGET] + sys.argv[1:]
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(
        part for part in [SCRAPER_ROOT, env.get("PYTHONPATH", "")] if part
    )
    # trunk-ignore(bandit/B603)
    return subprocess.call(cmd, cwd=SCRAPER_ROOT, env=env)


if __name__ == "__main__":
    sys.exit(main())
