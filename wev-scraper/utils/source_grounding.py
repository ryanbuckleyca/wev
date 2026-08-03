"""Hard grounding: description / mission / values must appear in fetched sources.

After the LLM returns copy, we verify each field against a source corpus built from:
- Confirmed org website HTML→text (primary — required for via=extracted)
- Tavily evidence snippets (secondary)
- Optional SOURCE DESCRIPTION on the org/listing (secondary)

Unverified fields are nulled. Prefer null over invented copy.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from html.parser import HTMLParser
from typing import Iterable, Mapping, MutableMapping, Sequence
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (compatible; WevOrgVerify/1.0; +https://wev.work)"
)

# Light punctuation strip for overlap checks (keep accents / letters / digits).
_PUNCT_RE = re.compile(r"[^\w\sàâäæçéèêëïîôœùûüÿÀÂÄÆÇÉÈÊËÏÎÔŒÙÛÜŸ-]+", re.UNICODE)
_WS_RE = re.compile(r"\s+")
_TOKEN_RE = re.compile(r"[a-z0-9àâäæçéèêëïîôœùûüÿ]{3,}", re.I)

_STOP = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "are",
        "was",
        "were",
        "been",
        "have",
        "has",
        "had",
        "not",
        "but",
        "our",
        "their",
        "its",
        "une",
        "des",
        "les",
        "dans",
        "pour",
        "avec",
        "que",
        "qui",
        "est",
        "sont",
        "nous",
        "vous",
        "aux",
        "sur",
        "par",
        "plus",
        "also",
        "into",
        "than",
        "then",
        "when",
        "which",
        "will",
        "can",
        "may",
        "inc",
        "ltd",
        "llc",
        "corp",
    }
)

# Default thresholds — tuned for short org blurbs (~40–80 words).
_DEFAULT_MIN_CONSECUTIVE = 4
_DEFAULT_SEQ_RATIO = 0.55
_DEFAULT_TOKEN_OVERLAP = 0.55
_SHORT_CLAIM_SEQ_RATIO = 0.72


class _HTMLTextExtractor(HTMLParser):
    """Minimal HTML→visible text (no BeautifulSoup dependency)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip_depth = 0
        self.title: str = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg", "template"}:
            self._skip_depth += 1
        if t == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg", "template"} and self._skip_depth:
            self._skip_depth -= 1
        if t == "title":
            self._in_title = False
        if t in {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "section"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        self._chunks.append(text)
        self._chunks.append(" ")

    def text(self) -> str:
        return _WS_RE.sub(" ", " ".join(self._chunks)).strip()


def normalize_for_grounding(text: str | None) -> str:
    """Lowercase, strip light punctuation, collapse whitespace."""
    if not text:
        return ""
    cleaned = _PUNCT_RE.sub(" ", str(text).lower())
    return _WS_RE.sub(" ", cleaned).strip()


def significant_tokens(text: str | None) -> list[str]:
    """Tokens length ≥ 3 excluding stopwords, in order."""
    norm = normalize_for_grounding(text)
    out: list[str] = []
    for tok in _TOKEN_RE.findall(norm):
        if tok in _STOP:
            continue
        out.append(tok)
    return out


def html_to_text(html: str | None) -> tuple[str, str]:
    """Return (visible_text, title) from HTML."""
    if not html or not str(html).strip():
        return "", ""
    parser = _HTMLTextExtractor()
    try:
        parser.feed(str(html))
        parser.close()
    except Exception:
        # Extremely malformed HTML — fall back to regex tag strip.
        stripped = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", str(html))
        stripped = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", stripped)
        stripped = re.sub(r"(?is)<[^>]+>", " ", stripped)
        return _WS_RE.sub(" ", stripped).strip(), ""
    return parser.text(), parser.title.strip()


@dataclass
class WebsiteFetchCache:
    """Per-assess-call cache for homepage fetches."""

    _store: dict[str, tuple[str, str]] = field(default_factory=dict)

    def get(self, url: str) -> tuple[str, str] | None:
        key = _cache_key(url)
        return self._store.get(key) if key else None

    def set(self, url: str, body: str, title: str) -> None:
        key = _cache_key(url)
        if key:
            self._store[key] = (body, title)


def _cache_key(url: str | None) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower().strip(".")
    if not host:
        return None
    # Cache by scheme+host+path (ignore query/fragment).
    path = parsed.path or "/"
    return f"{parsed.scheme or 'https'}://{host}{path}".rstrip("/") or None


def fetch_website_text(
    url: str | None,
    *,
    timeout: float = 8.0,
    cache: WebsiteFetchCache | None = None,
    max_bytes: int = 500_000,
) -> tuple[str, str]:
    """Fetch URL (no proxy) and return (text, title). Empty on failure.

    Cached per *cache* instance (one assess call).
    """
    raw = (url or "").strip()
    if not raw:
        return "", ""
    if "://" not in raw:
        raw = "https://" + raw

    if cache is not None:
        hit = cache.get(raw)
        if hit is not None:
            return hit

    session = requests.Session()
    session.trust_env = False  # no proxy
    headers = {
        "User-Agent": _USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    }
    body, title = "", ""
    try:
        resp = session.get(
            raw,
            timeout=timeout,
            allow_redirects=True,
            headers=headers,
            stream=True,
        )
        try:
            # Only attempt HTML decode for successful-ish responses.
            if int(resp.status_code) >= 400 and int(resp.status_code) not in (401, 403):
                logger.info(
                    "website fetch skipped (HTTP %s): %s",
                    resp.status_code,
                    raw,
                )
            else:
                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_content(chunk_size=16_384):
                    if not chunk:
                        continue
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= max_bytes:
                        break
                raw_bytes = b"".join(chunks)
                charset = resp.encoding or "utf-8"
                try:
                    html = raw_bytes.decode(charset, errors="replace")
                except LookupError:
                    html = raw_bytes.decode("utf-8", errors="replace")
                body, title = html_to_text(html)
        finally:
            resp.close()
    except requests.RequestException as exc:
        logger.info("website fetch failed: %s (%s)", raw, exc)
    finally:
        session.close()

    if cache is not None:
        cache.set(raw, body, title)
    return body, title


def text_appears_in_corpus(
    claim: str | None,
    corpus: str | None,
    *,
    min_consecutive: int = _DEFAULT_MIN_CONSECUTIVE,
    seq_ratio: float = _DEFAULT_SEQ_RATIO,
    token_overlap: float = _DEFAULT_TOKEN_OVERLAP,
) -> bool:
    """True when *claim* is substantially supported by *corpus*.

    Accepts when any of:
    - A significant normalized substring of the claim appears in the corpus
    - ≥ *min_consecutive* consecutive significant tokens from claim appear
    - SequenceMatcher ratio ≥ threshold (stricter for very short claims)
    - Token containment / overlap ≥ *token_overlap*
    """
    claim_n = normalize_for_grounding(claim)
    corpus_n = normalize_for_grounding(corpus)
    if not claim_n:
        return True
    if not corpus_n:
        return False

    # Direct / substantial substring (prefer longer spans).
    if len(claim_n) >= 24 and claim_n in corpus_n:
        return True
    # Sliding windows of the claim (for light paraphrase / truncation).
    claim_tokens = significant_tokens(claim_n)
    if not claim_tokens:
        # Only stopwords / tiny claim — require high sequence match.
        return SequenceMatcher(None, claim_n, corpus_n).ratio() >= _SHORT_CLAIM_SEQ_RATIO

    n = min_consecutive
    if len(claim_tokens) < n:
        # Short claim: require all significant tokens present, or high ratio.
        if all(tok in corpus_n for tok in claim_tokens):
            return True
        # Best local ratio against corpus windows roughly claim-sized.
        window = max(len(claim_n), 20)
        best = 0.0
        step = max(1, window // 4)
        for i in range(0, max(1, len(corpus_n) - window + 1), step):
            piece = corpus_n[i : i + window]
            best = max(best, SequenceMatcher(None, claim_n, piece).ratio())
            if best >= _SHORT_CLAIM_SEQ_RATIO:
                return True
        return SequenceMatcher(None, claim_n, corpus_n).ratio() >= _SHORT_CLAIM_SEQ_RATIO

    # Consecutive significant-word phrase must appear in corpus.
    for i in range(0, len(claim_tokens) - n + 1):
        phrase = " ".join(claim_tokens[i : i + n])
        if phrase in corpus_n:
            return True

    # Token overlap (containment of claim tokens in corpus tokens).
    corpus_toks = set(significant_tokens(corpus_n))
    if corpus_toks:
        hit = sum(1 for t in claim_tokens if t in corpus_toks)
        if hit / len(claim_tokens) >= token_overlap:
            return True

    # ROUGE-ish / SequenceMatcher on full normalized strings.
    if SequenceMatcher(None, claim_n, corpus_n).ratio() >= seq_ratio:
        return True

    # Local window match for longer corpora.
    window = max(len(claim_n), 40)
    step = max(1, window // 3)
    for i in range(0, max(1, len(corpus_n) - window + 1), step):
        piece = corpus_n[i : i + window + window // 2]
        if SequenceMatcher(None, claim_n, piece).ratio() >= seq_ratio:
            return True
    return False


def join_corpus(*parts: str | None) -> str:
    """Join non-empty corpus parts with blank lines."""
    chunks = [p.strip() for p in parts if p and str(p).strip()]
    return "\n\n".join(chunks)


@dataclass(frozen=True)
class GroundingCorpora:
    """Primary (confirmed site) vs secondary (Tavily / SOURCE DESCRIPTION)."""

    primary: str = ""
    secondary: str = ""

    @property
    def combined(self) -> str:
        return join_corpus(self.primary, self.secondary)


# Result field keys → provenance flag stem.
_FIELD_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("description", ("description_en", "description_fr")),
    ("mission", ("mission_statement_en", "mission_statement_fr")),
    ("values", ("values_raw",)),
)


def _set_via_flag(flags: list[str], field: str, status: str) -> list[str]:
    """Replace any existing via= flag for *field* with the new status."""
    field_l = field.lower()
    kept: list[str] = []
    for raw in flags:
        if not isinstance(raw, str):
            kept.append(raw)
            continue
        fl = raw.strip().lower()
        if fl.startswith(f"{field_l} via="):
            continue
        if fl in {
            f"{field_l}_extracted",
            f"{field_l}_inferred",
            f"{field_l}_absent",
        }:
            continue
        kept.append(raw)
    kept.append(f"{field} via={status}")
    return kept


def ground_assessed_fields(
    result: MutableMapping[str, object],
    corpora: GroundingCorpora,
) -> dict:
    """Null ungrounded description/mission/values; fix via= flags.

    Rules:
    - via=extracted only when grounded in *primary* (confirmed org website)
    - via=inferred when grounded only in *secondary* (Tavily / SOURCE DESCRIPTION)
    - otherwise null the field(s) and via=absent

    For bilingual pairs: if one locale is grounded, keep the sibling as a
    translation of verified copy; if neither is grounded, null both.
    """
    out = dict(result)
    flags = list(out.get("flags") or []) if isinstance(out.get("flags"), list) else []
    primary = corpora.primary
    secondary = corpora.secondary
    has_primary = bool(normalize_for_grounding(primary))

    reject_labels = {
        "description": "description rejected (not found in sources)",
        "mission": "mission rejected (not found in sources)",
        "values": "values rejected (not found in sources)",
    }

    for flag_stem, keys in _FIELD_GROUPS:
        present = {
            k: (v if isinstance(v, str) and v.strip() else None)
            for k, v in ((k, out.get(k)) for k in keys)
        }
        if not any(present.values()):
            flags = _set_via_flag(flags, flag_stem, "absent")
            continue

        any_primary = False
        any_secondary = False
        for text in present.values():
            if text is None:
                continue
            if has_primary and text_appears_in_corpus(text, primary):
                any_primary = True
            elif text_appears_in_corpus(text, secondary):
                any_secondary = True

        if any_primary and has_primary:
            # Keep all present locales (FR may be translation of grounded EN).
            flags = _set_via_flag(flags, flag_stem, "extracted")
            continue

        if any_secondary:
            # Supported only by secondaries — never claim extracted.
            flags = _set_via_flag(flags, flag_stem, "inferred")
            continue

        for k, text in present.items():
            if text is not None:
                out[k] = None
        logger.info("%s", reject_labels.get(flag_stem, f"{flag_stem} rejected (not found in sources)"))
        flags = _set_via_flag(flags, flag_stem, "absent")
        flags.append(f"{flag_stem}_ungrounded")

    out["flags"] = flags
    return out


def build_grounding_corpora(
    *,
    website_text: str | None = None,
    website_title: str | None = None,
    tavily_snippets: Sequence[str] | None = None,
    tavily_text: str | None = None,
    source_description: str | None = None,
) -> GroundingCorpora:
    """Assemble primary (site) and secondary (search + SOURCE DESCRIPTION) corpora."""
    primary = join_corpus(website_title, website_text)
    secondary_parts: list[str] = []
    if tavily_snippets:
        secondary_parts.extend(s for s in tavily_snippets if s and str(s).strip())
    if tavily_text and str(tavily_text).strip():
        secondary_parts.append(str(tavily_text).strip())
    if source_description and str(source_description).strip():
        secondary_parts.append(str(source_description).strip())
    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for part in secondary_parts:
        key = normalize_for_grounding(part)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(part)
    return GroundingCorpora(primary=primary, secondary=join_corpus(*unique))


def evidence_snippets_from_results(
    results: Iterable[Mapping[str, object]] | None,
) -> list[str]:
    """Flatten Tavily-like {title,url,content} rows into grounding snippets."""
    out: list[str] = []
    for item in results or []:
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        content = str(item.get("content") or "").strip()
        header = " | ".join(p for p in (title, url) if p)
        block = f"{header}\n{content}".strip() if header else content
        if block:
            out.append(block)
    return out
