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
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from urllib.parse import urlparse

from llm.base import LLMProviderError

logger = logging.getLogger(__name__)

_WWW = re.compile(r"^www\.", re.I)

# Search is supporting context only — primary source lives in the prompt body.
_EVIDENCE_HEADER = """SUPPORTING WEB EVIDENCE (secondary — from search):
PRIORITY RULES (mandatory):
1. The organization's own confirmed website is PRIMARY for description / mission /
   values. LinkedIn, Glassdoor, news, and directories are SUPPORTING only.
2. website MUST be copied from a URL host that appears in these evidence links
   (or Known website) — NEVER invent or guess a domain from the org name.
3. Interpretive fields (is_sse / rating, sector, language, type, mission, values,
   website) MUST come from official-website / this web research — never from a
   stored org blurb or job-listing SOURCE DESCRIPTION.
4. description_* may be taken from SOURCE DESCRIPTION when present; only when
   SOURCE DESCRIPTION is absent may these snippets supply description text.
5. NEVER substitute a different organization found in search for the one named
   in the prompt (ignore unrelated co-ops, NGOs, or similarly themed hits).
6. The assessed org MUST be the employer of THIS job in THIS location (city /
   province in ORGANIZATION DATA). Reject same-name orgs in other countries or
   cities (e.g. a US farm or US state agency is wrong for an Ontario / Quebec job).
   If evidence only shows a same-name org elsewhere, return website null and weak
   / no / insufficient evidence — do NOT adopt the foreign entity.
7. Prefer null / "no" over inventing facts not present in web research about
   that same named organization.
8. If snippets conflict with Known website / ORGANIZATION DATA identity fields,
   trust the named organization identity; still do not score SSE from listing copy.

"""


@dataclass(frozen=True)
class TavilyResult:
    """One Tavily search hit."""

    title: str = ""
    url: str = ""
    content: str = ""


@dataclass(frozen=True)
class TavilyEvidence:
    """Structured Tavily search pack: text for the prompt + source URLs."""

    text: str = ""
    urls: list[str] = field(default_factory=list)
    results: list[TavilyResult] = field(default_factory=list)


class TavilyUnavailableError(LLMProviderError):
    """Tavily is required but broken (missing package, key, or client).

    Production org assessment / website backfill must hard-fail on this — never
    continue with empty evidence (models hallucinate websites without research).
    """


def tavily_api_key() -> str:
    return (os.environ.get("TAVILY_API_KEY") or "").strip()


def _tavily_import_error() -> str | None:
    """Return an error string if the ``tavily`` package cannot be imported."""
    try:
        import tavily  # noqa: F401
    except ImportError as exc:
        return str(exc) or "No module named 'tavily'"
    return None


def is_tavily_available() -> bool:
    """True when API key is set and the ``tavily`` package imports.

    Soft/optional callers may still use ``fetch_tavily_context`` (empty on
    failure). Production assessment must call ``require_tavily()`` instead.
    """
    if not tavily_api_key():
        return False
    return _tavily_import_error() is None


def require_tavily() -> None:
    """Hard-require a working Tavily client for grounded assessment / backfill.

    Raises ``TavilyUnavailableError`` when the package is missing, ``TAVILY_API_KEY``
    is unset, or the client cannot be constructed. Distinct from soft-empty
    ``fetch_tavily_context`` used by optional/dev paths.
    """
    key = tavily_api_key()
    if not key:
        raise TavilyUnavailableError(
            "Tavily is required for org assessment / website backfill but "
            "TAVILY_API_KEY is unset. Refusing to continue without web research "
            "(hallucinated websites are not acceptable)."
        )
    import_err = _tavily_import_error()
    if import_err:
        raise TavilyUnavailableError(
            "Tavily is required for org assessment / website backfill but the "
            f"package is not importable ({import_err}). Install tavily-python "
            "and refuse to continue without web research "
            "(hallucinated websites are not acceptable)."
        )
    try:
        _client()
    except TavilyUnavailableError:
        raise
    except Exception as exc:
        raise TavilyUnavailableError(
            "Tavily is required for org assessment / website backfill but the "
            f"client could not be constructed: {exc}. Refusing to continue "
            "without web research (hallucinated websites are not acceptable)."
        ) from exc


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


def fetch_tavily_evidence(
    query: str,
    *,
    max_results: int | None = None,
    max_chars: int | None = None,
    include_domains: list[str] | None = None,
    prefer_hosts: list[str] | None = None,
    require_terms: list[str] | None = None,
    location_terms: list[str] | None = None,
) -> TavilyEvidence:
    """Return Tavily snippets + source URLs for *query*, or empty on soft failure.

    When *prefer_hosts* / *include_domains* are set (e.g. known employer site),
    matching URLs are ranked first so models see the right org before noise.

    When *require_terms* is set, drop snippets that mention none of those terms
    (soft: if every hit would be dropped, keep the unfiltered ranked list).

    When *location_terms* is set (city / province), hits whose title/content
    mention those terms are ranked ahead of other non-preferred hosts.
    """
    q = (query or "").strip()
    if not q:
        return TavilyEvidence()
    if not is_tavily_available():
        # Soft-empty for optional/dev callers only. Production assessment /
        # backfill must call require_tavily() first and never reach here broken.
        reason = (
            "TAVILY_API_KEY missing"
            if not tavily_api_key()
            else f"package unavailable ({_tavily_import_error()})"
        )
        logger.warning("Tavily unavailable (%s) — no shared evidence", reason)
        return TavilyEvidence()

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
    loc_terms = [
        t.lower().strip()
        for t in (location_terms or [])
        if t and str(t).strip() and len(str(t).strip()) >= 2
    ]
    loc_terms = list(dict.fromkeys(loc_terms))

    try:
        n = max_results if max_results is not None else _env_int("TAVILY_MAX_RESULTS", 5)
        depth = (os.environ.get("TAVILY_SEARCH_DEPTH") or "basic").strip().lower()
        if depth not in ("basic", "advanced"):
            depth = "basic"

        search_kwargs: dict = {
            "search_depth": depth,
            "max_results": max(1, n),
        }
        # Bias the API toward the employer domain when we know it.
        domains = []
        for d in include_domains or []:
            host = _host(d) or str(d).strip().lower()
            if host:
                domains.append(host)
        if domains:
            search_kwargs["include_domains"] = domains[:5]

        results = _client().search(q, **search_kwargs)
        # rank: 0 preferred host, 1 location mention, 2 other
        ranked: list[tuple[int, str, str, TavilyResult]] = []
        for item in results.get("results") or []:
            content = (item.get("content") or "").strip()
            url = (item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            if not content:
                continue
            host = _host(url)
            blob_l = f"{title}\n{content}".lower()
            if host and host in prefer_hosts_norm:
                rank = 0
            elif loc_terms and any(t in blob_l for t in loc_terms):
                rank = 1
            else:
                rank = 2
            header = " | ".join(p for p in (title, url) if p)
            block = f"{header}\n{content}" if header else content
            hit = TavilyResult(title=title, url=url, content=content)
            ranked.append((rank, block, url, hit))

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

        pieces = [block for _, block, _, _ in ranked]
        urls = [u for _, _, u, _ in ranked if u]
        hits = [hit for _, _, _, hit in ranked]
        # Stable unique URLs preserving rank order.
        seen_urls: set[str] = set()
        unique_urls: list[str] = []
        for u in urls:
            if u in seen_urls:
                continue
            seen_urls.add(u)
            unique_urls.append(u)

        text = "\n\n".join(pieces).strip()
        if len(text) > max_chars:
            text = text[:max_chars].rsplit(" ", 1)[0] + "…"
        logger.info(
            "tavily: query_chars=%s results=%s preferred_hits=%s location_hits=%s "
            "context_chars=%s urls=%s",
            len(q),
            len(pieces),
            sum(1 for r, _, _, _ in ranked if r == 0),
            sum(1 for r, _, _, _ in ranked if r == 1),
            len(text),
            len(unique_urls),
        )
        return TavilyEvidence(text=text, urls=unique_urls, results=hits)
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        return TavilyEvidence()


def fetch_tavily_context(
    query: str,
    *,
    max_results: int | None = None,
    max_chars: int | None = None,
    include_domains: list[str] | None = None,
    prefer_hosts: list[str] | None = None,
    require_terms: list[str] | None = None,
    location_terms: list[str] | None = None,
) -> str:
    """Return concatenated Tavily snippets for *query*, or '' on soft failure."""
    return fetch_tavily_evidence(
        query,
        max_results=max_results,
        max_chars=max_chars,
        include_domains=include_domains,
        prefer_hosts=prefer_hosts,
        require_terms=require_terms,
        location_terms=location_terms,
    ).text


def trim_evidence(evidence: str, *, max_chars: int) -> str:
    """Hard-trim evidence for small-context backends (Ollama)."""
    text = (evidence or "").strip()
    if not text or len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "…"


def ollama_evidence_budget() -> int:
    return _env_int("TAVILY_OLLAMA_MAX_CHARS", 1800)


def inject_grounding_evidence(prompt: str, evidence: str) -> str:
    """Prepend shared evidence block so every backend sees identical context."""
    evidence = (evidence or "").strip()
    if not evidence:
        return prompt
    return f"{_EVIDENCE_HEADER}{evidence}\n\n---\n\n{prompt}"
