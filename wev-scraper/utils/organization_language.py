"""Classify organization public language: en | fr | bilingual.

V1: stored name/description/mission + website URL path hints.
V2: neutral homepage fetch, hreflang/switcher discovery, dual EN/FR probe.

The deterministic classifier is the source of truth. LLM is only used when
signals are ambiguous (optional; callers pass an llm_fn).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Callable, Literal
from urllib.parse import urljoin, urlparse

import requests

logger = logging.getLogger(__name__)

OrgLanguage = Literal["en", "fr", "bilingual"]
VALID_ORG_LANGUAGES = frozenset({"en", "fr", "bilingual"})

_MIN_TEXT_CHARS = 40
_FETCH_TIMEOUT_SEC = 12
_MAX_PROBE_URLS = 4
_USER_AGENT = "wev-org-language/1.0 (+https://wevchange.org)"

# Strong French function words / markers uncommon as English tokens.
_FR_MARKERS = frozenset(
    """
    le la les un une des du au aux et ou mais donc car que qui dont
    pour dans sur avec sans sous chez par plus très aussi cette ces
    nous vous ils elles être avoir faire organisation organisme
    entreprise mission valeurs solidarité communautaire
    """.split()
)
# Keep accented letters as char signals separately
_FR_CHAR_RE = re.compile(r"[àâäæçéèêëïîôœùûüÿ]", re.I)
_EN_MARKERS = frozenset(
    """
    the a an and or but for with without from this that these those
    we you they are is was were been have has had will would can could
    organization organisation company mission values about our
    """.split()
)

_LOCALE_PATH_RE = re.compile(
    r"(?:^|/)(en|fr|en-ca|fr-ca|en-us|anglais|english|francais|français)(?:/|$)",
    re.I,
)
_HREFLANG_RE = re.compile(
    r"""<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']"""
    r"""|<link[^>]+hreflang=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["']""",
    re.I,
)
_HREF_SWITCHER_RE = re.compile(
    r"""href=["']([^"']*(?:/fr(?:-[a-z]+)?/|/en(?:-[a-z]+)?/|lang=(?:fr|en)|locale=(?:fr|en))[^"']*)["']""",
    re.I,
)


@dataclass(frozen=True)
class LanguageClassification:
    language: OrgLanguage | None
    confidence: float
    source: str
    reasons: tuple[str, ...] = ()


def classify_org_language(
    *,
    name: str | None = None,
    description: str | None = None,
    mission_statement: str | None = None,
    website: str | None = None,
    fetch_web: bool = False,
    llm_fn: Callable[[str], OrgLanguage | None] | None = None,
) -> LanguageClassification:
    """Classify org language. V1 unless fetch_web=True (enables V2 probes)."""
    reasons: list[str] = []

    url_signal = _url_locale_hints(website)
    if url_signal == "bilingual":
        return LanguageClassification(
            "bilingual", 0.9, "url_hints", ("website path suggests both en and fr",)
        )
    if url_signal in ("en", "fr"):
        reasons.append(f"url_hint={url_signal}")

    text = _join_text(name, description, mission_statement)
    text_signal = _detect_text_language(text)
    if text_signal.language:
        reasons.extend(text_signal.reasons)

    if fetch_web and website:
        web = _classify_from_website(website, stored_text_signal=text_signal.language)
        if web.language:
            return LanguageClassification(
                web.language,
                web.confidence,
                web.source,
                tuple([*reasons, *web.reasons]),
            )

    # Combine URL hint + text without fetch
    if text_signal.language == "bilingual":
        return LanguageClassification(
            "bilingual", text_signal.confidence, "stored_text", tuple(reasons)
        )
    if text_signal.language and url_signal and text_signal.language != url_signal:
        # Conflict: prefer bilingual if both locales evidenced
        return LanguageClassification(
            "bilingual",
            0.7,
            "text_url_conflict",
            tuple([*reasons, "text and url disagree → bilingual"]),
        )
    if text_signal.language:
        return LanguageClassification(
            text_signal.language,
            text_signal.confidence,
            "stored_text",
            tuple(reasons),
        )
    if url_signal in ("en", "fr"):
        return LanguageClassification(url_signal, 0.55, "url_hints", tuple(reasons))

    if llm_fn is not None:
        prompt_blob = text or (website or "")
        if prompt_blob.strip():
            try:
                llm_lang = llm_fn(prompt_blob)
            except Exception as exc:  # noqa: BLE001 — backfill must continue
                logger.warning("org language LLM fallback failed: %s", exc)
                llm_lang = None
            if llm_lang in VALID_ORG_LANGUAGES:
                return LanguageClassification(
                    llm_lang, 0.5, "llm", tuple([*reasons, "llm_fallback"])
                )

    return LanguageClassification(None, 0.0, "unknown", tuple(reasons or ("insufficient_signal",)))


def _join_text(*parts: str | None) -> str:
    return "\n".join(p.strip() for p in parts if p and p.strip())


def _url_locale_hints(website: str | None) -> OrgLanguage | None:
    if not website:
        return None
    path = (urlparse(website).path or "").lower()
    found = set()
    for match in _LOCALE_PATH_RE.finditer(path):
        token = match.group(1).lower()
        if token.startswith("fr") or token in {"francais", "français"}:
            found.add("fr")
        elif token.startswith("en") or token in {"anglais", "english"}:
            found.add("en")
    # Also scan query-less full URL for /en/ and /fr/ segments
    lowered = website.lower()
    if re.search(r"/fr(?:-[a-z]+)?(?:/|$)", lowered):
        found.add("fr")
    if re.search(r"/en(?:-[a-z]+)?(?:/|$)", lowered):
        found.add("en")
    if found == {"en", "fr"}:
        return "bilingual"
    if found == {"fr"}:
        return "fr"
    if found == {"en"}:
        return "en"
    return None


def _detect_text_language(text: str) -> LanguageClassification:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) < _MIN_TEXT_CHARS:
        return LanguageClassification(None, 0.0, "stored_text", ("text_too_short",))

    tokens = re.findall(r"[A-Za-zÀ-ÿ']+", cleaned.lower())
    if not tokens:
        return LanguageClassification(None, 0.0, "stored_text", ("no_tokens",))

    fr_hits = sum(1 for t in tokens if t in _FR_MARKERS)
    en_hits = sum(1 for t in tokens if t in _EN_MARKERS)
    accent_hits = len(_FR_CHAR_RE.findall(cleaned))
    fr_score = fr_hits + accent_hits * 0.5
    en_score = float(en_hits)

    total = fr_score + en_score
    if total < 2:
        return LanguageClassification(None, 0.0, "stored_text", ("weak_marker_signal",))

    fr_ratio = fr_score / total
    en_ratio = en_score / total
    reasons = (
        f"fr_score={fr_score:.1f}",
        f"en_score={en_score:.1f}",
        f"accents={accent_hits}",
    )

    # Both languages clearly present in the same blob
    if fr_ratio >= 0.28 and en_ratio >= 0.28 and fr_score >= 3 and en_score >= 3:
        return LanguageClassification("bilingual", 0.75, "stored_text", reasons)
    if fr_ratio >= 0.62:
        return LanguageClassification("fr", min(0.95, 0.55 + fr_ratio / 2), "stored_text", reasons)
    if en_ratio >= 0.62:
        return LanguageClassification("en", min(0.95, 0.55 + en_ratio / 2), "stored_text", reasons)
    return LanguageClassification(None, 0.0, "stored_text", (*reasons, "ambiguous_mix"))


class _HrefCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.lang_attr: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and ad.get("lang") and not self.lang_attr:
            self.lang_attr = ad["lang"]
        if tag == "a" and ad.get("href"):
            self.hrefs.append(ad["href"])


def _classify_from_website(
    website: str,
    *,
    stored_text_signal: OrgLanguage | None,
) -> LanguageClassification:
    html, final_url = _neutral_fetch(website)
    if not html:
        return LanguageClassification(None, 0.0, "web_fetch", ("fetch_failed",))

    reasons = [f"fetched={final_url}"]
    locales = _discover_locale_urls(html, final_url or website)

    # Redirect into /en or /fr is a weak hint only
    landing_hint = _url_locale_hints(final_url)
    if landing_hint in ("en", "fr"):
        reasons.append(f"landing_hint={landing_hint}")

    if locales.get("en") and locales.get("fr"):
        # Probe both sides
        en_ok = _page_has_language(locales["en"], "en")
        fr_ok = _page_has_language(locales["fr"], "fr")
        reasons.append(f"probe_en={en_ok}")
        reasons.append(f"probe_fr={fr_ok}")
        if en_ok and fr_ok:
            return LanguageClassification("bilingual", 0.95, "web_dual_probe", tuple(reasons))
        if fr_ok and not en_ok:
            return LanguageClassification("fr", 0.8, "web_dual_probe", tuple(reasons))
        if en_ok and not fr_ok:
            return LanguageClassification("en", 0.8, "web_dual_probe", tuple(reasons))

    page_lang = _detect_text_language(_html_to_text(html))
    if page_lang.language == "bilingual":
        return LanguageClassification("bilingual", 0.85, "web_text", tuple([*reasons, *page_lang.reasons]))

    if page_lang.language and stored_text_signal and page_lang.language != stored_text_signal:
        if {page_lang.language, stored_text_signal} == {"en", "fr"}:
            return LanguageClassification(
                "bilingual",
                0.8,
                "web_text_conflict",
                tuple([*reasons, "stored vs page language disagree"]),
            )

    if page_lang.language:
        return LanguageClassification(
            page_lang.language,
            page_lang.confidence,
            "web_text",
            tuple([*reasons, *page_lang.reasons]),
        )

    if locales.get("fr") and not locales.get("en"):
        return LanguageClassification("fr", 0.6, "web_structure", tuple(reasons))
    if locales.get("en") and not locales.get("fr"):
        return LanguageClassification("en", 0.6, "web_structure", tuple(reasons))

    return LanguageClassification(None, 0.0, "web_fetch", tuple([*reasons, "inconclusive"]))


def _neutral_fetch(url: str) -> tuple[str | None, str | None]:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        resp = requests.get(
            url,
            timeout=_FETCH_TIMEOUT_SEC,
            headers={
                "User-Agent": _USER_AGENT,
                # Equal preference — never English-biased browser default
                "Accept-Language": "en, fr;q=1.0, *;q=0.5",
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            },
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            logger.info("org language fetch HTTP %s for %s", resp.status_code, url)
            return None, None
        ctype = (resp.headers.get("Content-Type") or "").lower()
        if "html" not in ctype and "text" not in ctype and ctype:
            return None, None
        return resp.text, str(resp.url)
    except requests.RequestException as exc:
        logger.info("org language fetch failed for %s: %s", url, exc)
        return None, None


def _discover_locale_urls(html: str, base_url: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for m in _HREFLANG_RE.finditer(html):
        lang = (m.group(1) or m.group(3) or "").lower()
        href = m.group(2) or m.group(4) or ""
        abs_url = urljoin(base_url, href)
        if lang.startswith("fr"):
            found.setdefault("fr", abs_url)
        elif lang.startswith("en"):
            found.setdefault("en", abs_url)

    for m in _HREF_SWITCHER_RE.finditer(html):
        href = m.group(1)
        abs_url = urljoin(base_url, href)
        hint = _url_locale_hints(abs_url)
        if hint in ("en", "fr"):
            found.setdefault(hint, abs_url)

    # Common path probes from apex
    parsed = urlparse(base_url)
    apex = f"{parsed.scheme}://{parsed.netloc}"
    for code, path in (("en", "/en"), ("fr", "/fr"), ("en", "/en-ca"), ("fr", "/fr-ca")):
        found.setdefault(code, urljoin(apex + "/", path.lstrip("/")))

    # Cap distinct probes
    limited: dict[str, str] = {}
    for code in ("en", "fr"):
        if code in found:
            limited[code] = found[code]
        if len(limited) >= _MAX_PROBE_URLS:
            break
    return limited


def _page_has_language(url: str, expected: OrgLanguage) -> bool:
    html, _final = _neutral_fetch(url)
    if not html:
        return False
    text = _html_to_text(html)
    if _looks_like_soft_404(text, html):
        return False
    detected = _detect_text_language(text)
    return detected.language in {expected, "bilingual"}


def _looks_like_soft_404(text: str, html: str) -> bool:
    lower = (text or "").lower()
    if len(lower) < 80:
        return True
    markers = (
        "page not found",
        "404",
        "coming soon",
        "under construction",
        "page introuvable",
        "bientôt disponible",
        "bientot disponible",
    )
    return any(m in lower for m in markers)


def _html_to_text(html: str) -> str:
    # Strip scripts/styles then tags
    no_script = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", no_script)
    return re.sub(r"\s+", " ", text).strip()


def make_llm_language_fn() -> Callable[[str], OrgLanguage | None] | None:
    """Optional LLM fallback using the SSE/org provider when available."""
    try:
        from llm.factory import get_sse_provider
    except Exception:  # noqa: BLE001
        return None

    provider = get_sse_provider()
    if not provider:
        return None

    def _fn(text: str) -> OrgLanguage | None:
        prompt = (
            "Classify the PRIMARY public language of this Canadian organization "
            "from the text below. Reply with ONLY one token: en, fr, or bilingual.\n"
            "- en = primarily English materials\n"
            "- fr = primarily French materials\n"
            "- bilingual = substantial public presence in both English and French\n\n"
            f"TEXT:\n{text[:4000]}"
        )
        raw = provider.complete(prompt)
        if raw is None:
            return None
        token = str(raw).strip().lower().split()[0].strip(".,\"'")
        if token in VALID_ORG_LANGUAGES:
            return token  # type: ignore[return-value]
        return None

    return _fn
