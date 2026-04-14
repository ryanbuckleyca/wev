"""Date utilities for scraper workflows."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from dateutil import parser

try:
    import dateparser as _dateparser  # optional, handles localized dates
except Exception:
    _dateparser = None


def get_within_weeks(default: int = 2) -> int:
    """Read WITHIN_WEEKS from the environment, falling back to `default`."""
    import os
    env_val = os.environ.get("WITHIN_WEEKS")
    if not env_val:
        return default
    try:
        return int(env_val)
    except ValueError:
        return default


_FRENCH_MONTH_PATTERNS = [
    (r"\bjanv(?:\.|ier)?\b", "january"),
    (r"\bf[ée]vr(?:\.|ier)?\b", "february"),
    (r"\bmars\b", "march"),
    (r"\bavr(?:\.|il)?\b", "april"),
    (r"\bmai\b", "may"),
    (r"\bjuin\b", "june"),
    (r"\bjuil(?:\.|let)?\b", "july"),
    (r"\bao[uû]t\b", "august"),
    (r"\bsept(?:\.|embre)?\b", "september"),
    (r"\boct(?:\.|obre)?\b", "october"),
    (r"\bnov(?:\.|embre)?\b", "november"),
    (r"\bd[ée]c(?:\.|embre)?\b", "december"),
]


def _translate_french_date(s: str) -> str:
    """Translate common French month names/abbreviations to English for parsing."""
    out = re.sub(r"\b1er\b", "1", s, flags=re.IGNORECASE)
    for pattern, repl in _FRENCH_MONTH_PATTERNS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out


def _parse_localized_date(s: str, lang: str = "en"):
    """Attempt to parse localized (French) date strings.

    Behavior:
    - If `dateparser` is installed, use it with `languages=['fr']`.
    - Otherwise, fall back to `dateutil.parser.parse` on the original string.

    Note: `dateutil.parser` does not understand French month names; installing
    `dateparser` is recommended for robust localized parsing.
    Returns a `datetime` or raises the underlying exception.
    """
    if not s or not str(s).strip():
        raise ValueError("Empty date string")
    # Try dateparser first (supports languages param)
    if _dateparser:
        try:
            dt = _dateparser.parse(str(s), languages=[lang])
            if dt:
                return dt
        except Exception:
            pass

    # Fallback: try dateutil.parse on the original string; this may fail for
    # French month names. If it does, surface a helpful message recommending
    # `dateparser`. We also attempt a light French->English month translation
    # when dateparser is not available.
    if lang and lang.lower().startswith("fr") and _dateparser is None:
        try:
            translated = _translate_french_date(str(s))
            if translated != s:
                return parser.parse(translated)
        except Exception:
            pass
    try:
        return parser.parse(str(s))
    except Exception as e:
        # If the caller requested a non-English language and `dateparser` is
        # not available, provide a helpful error message recommending
        # installation instead of exposing the low-level parser error.
        if lang and lang != "en" and _dateparser is None:
            raise ValueError(
                f"Could not parse localized date '{s}'. Install 'dateparser' for robust localized parsing (pip install dateparser). Original error: {e}"
            ) from e
        raise


def is_recent_job(date_posted_str: str | None, weeks: int = 2, lang: str | None = None) -> bool:
    """Return True if job is within `weeks` weeks, False if older or invalid."""
    if date_posted_str is None:
        print("\tNotice: No date provided, skipping date check.")
        return False

    is_recent = False
    try:
        # Default language is English unless caller specifies otherwise
        lang_to_use = lang or "en"
        date_posted = _parse_localized_date(date_posted_str, lang=lang_to_use)
        # Normalize to aware UTC to avoid naive/aware comparison errors.
        if date_posted.tzinfo is None:
            date_posted = date_posted.replace(tzinfo=timezone.utc)
        else:
            date_posted = date_posted.astimezone(timezone.utc)
        cutoff_date = datetime.now(timezone.utc) - timedelta(weeks=weeks)
        is_recent = date_posted >= cutoff_date
    except (ValueError, TypeError) as e:
        print(f"\tNotice: Skipping a job posted on '{date_posted_str}' because its date could not be formatted: {e}")
        is_recent = False
    if not is_recent and date_posted_str:
        print(f"\tNotice: Skipping a job posted on {date_posted_str} because it is older than {weeks}-week cutoff.")
    return is_recent
