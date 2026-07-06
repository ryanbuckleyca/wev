#!/usr/bin/env python
"""Repo-root launcher for the unified post-processor script.

This wrapper makes the command
    python scripts/unified_post_processor.py ...
work from the repository root by dispatching to the scraper project with Python 3
and the correct working directory.
"""

import os
import subprocess
import sys
from distutils.spawn import find_executable


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
        if find_executable(candidate):
            return candidate

    return sys.executable


def main():
    python_exe = _find_python3()
    cmd = [python_exe, TARGET] + sys.argv[1:]
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(
        part for part in [SCRAPER_ROOT, env.get("PYTHONPATH", "")] if part
    )
    return subprocess.call(cmd, cwd=SCRAPER_ROOT, env=env)


if __name__ == "__main__":
    sys.exit(main())
