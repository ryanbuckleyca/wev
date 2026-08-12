"""Shared Tavily web evidence for grounded LLM tasks.

Used by the SSE fallback chain so Gemini, Groq, and Ollama all see the *same*
search snippets instead of divergent Google Search tool results (or none).

Search evidence is **secondary** to the primary source in the prompt (job
posting text or ORGANIZATION DATA). Models must not replace the named
employer/role with a different org found in snippets.

Env:
  TAVILY_API_KEY          — required for evidence fetch
  TAVILY_MAX_RESULTS      — default 5
  TAVILY_SEARCH_DEPTH     — basic | advanced (default basic)
  TAVILY_MAX_CHARS        — default 4500 (cloud); Ollama uses a tighter trim
  TAVILY_OLLAMA_MAX_CHARS — default 1800
  TAVILY_TIMEOUT_SEC      — per-request search timeout (default 30)
  TAVILY_MAX_RETRIES      — retries after first failure (default 2)
  MAX_GROUNDED_PROMPT_CHARS — default 100000; head+tail cap for Gemini/Groq
                              combined prompt+evidence (Ollama uses its own budget)
"""

from __future__ import annotations

import logging
import os
import re
import time
from functools import lru_cache
from urllib.parse import urlparse

from llm.base import LLMProviderError

logger = logging.getLogger(__name__)

_WWW = re.compile(r"^www\.", re.I)

# Cloud backends (Gemini/Groq) get large context windows; still cap combined
# grounded prompts so runaway job text + evidence cannot grow unbounded.
# Ollama keeps its tighter path (trim_evidence + OLLAMA_MAX_PROMPT_CHARS).
DEFAULT_MAX_GROUNDED_PROMPT_CHARS = 100_000
DEFAULT_TAVILY_TIMEOUT_SEC = 30.0
DEFAULT_TAVILY_MAX_RETRIES = 2

_TRUNCATE_MARK = (
    "\n\n…[middle truncated — use rules above + data below]\n\n"
)

# Search is supporting context only — primary source lives in the prompt body.
_EVIDENCE_HEADER = """SUPPORTING WEB EVIDENCE (secondary — from search):
PRIORITY RULES (mandatory):
1. Interpretive fields (is_sse / rating, sector, language, type, mission, values,
   website) MUST come from official-website / this web research — never from a
   stored org blurb or job-listing SOURCE DESCRIPTION.
2. description_* may be taken from SOURCE DESCRIPTION when present; only when
   SOURCE DESCRIPTION is absent may these snippets supply description text.
3. NEVER substitute a different organization found in search for the one named
   in the prompt (ignore unrelated co-ops, NGOs, or similarly themed hits).
4. Prefer null / "no" over inventing facts not present in web research about
   that same named organization.
5. If snippets conflict with Known website / ORGANIZATION DATA identity fields,
   trust the named organization identity; still do not score SSE from listing copy.

"""


def tavily_api_key() -> str:
    return (os.environ.get("TAVILY_API_KEY") or "").strip()


def is_tavily_available() -> bool:
    return bool(tavily_api_key())


def _host(url: str | None) -> str | None:
    if not url or not str(url).strip():
        return None
    raw = str(url).strip()
    if "://" not in raw:
        raw = "https://" + raw
    host = (urlparse(raw).hostname or "").lower().strip(".")
    if not host:
        return None
    return _WWW.sub("", host) or None


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _tavily_timeout_sec() -> float:
    """Bounded per-request timeout for Tavily search (seconds)."""
    try:
        return max(1.0, float(os.environ.get("TAVILY_TIMEOUT_SEC", str(DEFAULT_TAVILY_TIMEOUT_SEC))))
    except (TypeError, ValueError):
        return DEFAULT_TAVILY_TIMEOUT_SEC


def _tavily_max_retries() -> int:
    """Retries after the first failed search attempt (capped)."""
    try:
        return max(0, min(5, int(os.environ.get("TAVILY_MAX_RETRIES", str(DEFAULT_TAVILY_MAX_RETRIES)))))
    except (TypeError, ValueError):
        return DEFAULT_TAVILY_MAX_RETRIES


@lru_cache(maxsize=1)
def _client():
    from tavily import TavilyClient

    key = tavily_api_key()
    if not key:
        raise LLMProviderError("TAVILY_API_KEY not set")
    return TavilyClient(api_key=key)


_TOKEN_RE = re.compile(r"[a-z0-9àâäæçéèêëïîôœùûüÿ]{3,}", re.I)
_STOP = frozenset(
    {
        "the",
        "and",
        "for",
        "inc",
        "ltd",
        "llc",
        "corp",
        "canada",
        "canadian",
        "official",
        "website",
        "mission",
        "governance",
    }
)


def entity_require_terms(name: str | None) -> list[str]:
    """Significant tokens from an org/employer name for snippet filtering."""
    if not name or not str(name).strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for tok in _TOKEN_RE.findall(str(name).lower()):
        if tok in _STOP or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    return out[:8]


def fetch_tavily_context(
    query: str,
    *,
    max_results: int | None = None,
    max_chars: int | None = None,
    include_domains: list[str] | None = None,
    prefer_hosts: list[str] | None = None,
    require_terms: list[str] | None = None,
) -> str:
    """Return concatenated Tavily snippets for *query*, or '' on soft failure.

    When *prefer_hosts* / *include_domains* are set (e.g. known employer site),
    matching URLs are ranked first so models see the right org before noise.

    When *require_terms* is set, drop snippets that mention none of those terms
    (soft: if every hit would be dropped, keep the unfiltered ranked list).
    """
    q = (query or "").strip()
    if not q:
        return ""
    if not is_tavily_available():
        logger.error("Tavily unavailable (TAVILY_API_KEY missing) — FAILING HARD (grounding required)")
        raise LLMProviderError("Tavily unavailable: TAVILY_API_KEY not set")

    if max_chars is None:
        max_chars = _env_int("TAVILY_MAX_CHARS", 4500)

    prefer = {
        _WWW.sub("", h.lower().strip("."))
        for h in (prefer_hosts or [])
        if h and str(h).strip()
    }
    prefer |= {
        _host(d) or _WWW.sub("", d.lower().strip("."))
        for d in (include_domains or [])
        if d and str(d).strip()
    }
    prefer.discard(None)  # type: ignore[arg-type]
    prefer_hosts_norm = {h for h in prefer if h}

    terms = [t.lower().strip() for t in (require_terms or []) if t and str(t).strip()]
    terms = list(dict.fromkeys(terms))  # stable unique

    n = max_results if max_results is not None else _env_int("TAVILY_MAX_RESULTS", 5)
    depth = (os.environ.get("TAVILY_SEARCH_DEPTH") or "basic").strip().lower()
    if depth not in ("basic", "advanced"):
        depth = "basic"

    search_kwargs: dict = {
        "search_depth": depth,
        "max_results": max(1, n),
        # TavilyClient.search(timeout=…) — fail fast so SSE chain continues
        # without evidence (same pattern as requests timeout= on Groq/Jina).
        "timeout": _tavily_timeout_sec(),
    }
    # Bias the API toward the employer domain when we know it.
    domains = []
    for d in include_domains or []:
        host = _host(d) or str(d).strip().lower()
        if host:
            domains.append(host)
    if domains:
        search_kwargs["include_domains"] = domains[:5]

    max_retries = _tavily_max_retries()
    results: dict | None = None
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            results = _client().search(q, **search_kwargs)
            break
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                backoff = min(2.0, 0.5 * (2**attempt))
                logger.warning(
                    "Tavily search failed (attempt %s/%s): %s — retrying in %.1fs",
                    attempt + 1,
                    max_retries + 1,
                    exc,
                    backoff,
                )
                time.sleep(backoff)
                continue
            logger.error(
                "Tavily search failed after %s attempts: %s — FAILING HARD (grounding required)",
                max_retries + 1,
                exc,
            )
            raise LLMProviderError(f"Tavily search failed after {max_retries + 1} attempts: {exc}")

    if results is None:
        logger.error(
            "Tavily search returned no response (%s) — FAILING HARD (grounding required)",
            last_exc,
        )
        raise LLMProviderError(f"Tavily search returned no response: {last_exc}")

    try:
        ranked: list[tuple[int, str]] = []
        for item in results.get("results") or []:
            content = (item.get("content") or "").strip()
            url = (item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            if not content:
                continue
            host = _host(url)
            # Prefer known employer hosts (0), then everything else (1).
            rank = 0 if host and host in prefer_hosts_norm else 1
            header = " | ".join(p for p in (title, url) if p)
            block = f"{header}\n{content}" if header else content
            ranked.append((rank, block))

        ranked.sort(key=lambda pair: pair[0])
        if terms:
            filtered = [
                pair
                for pair in ranked
                if any(t in pair[1].lower() for t in terms)
            ]
            dropped = len(ranked) - len(filtered)
            if filtered:
                ranked = filtered
                if dropped:
                    logger.info(
                        "tavily: dropped %s snippets missing require_terms=%s",
                        dropped,
                        terms[:5],
                    )
            else:
                logger.info(
                    "tavily: require_terms=%s matched 0/%s — keeping unfiltered",
                    terms[:5],
                    len(ranked),
                )

        pieces = [block for _, block in ranked]
        text = "\n\n".join(pieces).strip()
        if len(text) > max_chars:
            text = text[:max_chars].rsplit(" ", 1)[0] + "…"
        logger.info(
            "tavily: query_chars=%s results=%s preferred_hits=%s context_chars=%s",
            len(q),
            len(pieces),
            sum(1 for r, _ in ranked if r == 0),
            len(text),
        )
        return text
    except Exception as exc:
        logger.warning("Tavily result processing failed: %s", exc)
        return ""


def trim_evidence(evidence: str, *, max_chars: int) -> str:
    """Hard-trim evidence for small-context backends (Ollama)."""
    text = (evidence or "").strip()
    if not text or len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "…"


def ollama_evidence_budget() -> int:
    return _env_int("TAVILY_OLLAMA_MAX_CHARS", 1800)


def max_grounded_prompt_chars() -> int:
    """Max chars for combined prompt+evidence on cloud (Gemini/Groq) backends."""
    return _env_int("MAX_GROUNDED_PROMPT_CHARS", DEFAULT_MAX_GROUNDED_PROMPT_CHARS)


def truncate_keep_ends(text: str, max_chars: int, *, head_ratio: float = 0.2) -> str:
    """Keep prompt head (instructions) and tail (entity data / JSON schema).

    Head-only truncation drops the payload models must answer from.
    """
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    mark = _TRUNCATE_MARK
    budget = max_chars - len(mark)
    if budget < 64:
        return text[: max(0, max_chars - 1)] + "…"
    head_len = max(32, int(budget * head_ratio))
    tail_len = budget - head_len
    if tail_len < 32:
        head_len = budget // 2
        tail_len = budget - head_len
    return text[:head_len] + mark + text[-tail_len:]


def inject_grounding_evidence(prompt: str, evidence: str) -> str:
    """Prepend shared evidence block so every backend sees identical context."""
    evidence = (evidence or "").strip()
    if not evidence:
        return prompt
    return f"{_EVIDENCE_HEADER}{evidence}\n\n---\n\n{prompt}"
