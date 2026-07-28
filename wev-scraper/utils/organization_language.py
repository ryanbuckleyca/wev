"""Classify organization public language: en | fr | bilingual.

Signals (in priority order):
1. Optional LLM assessment of the organization name
2. Website URL / hreflang / locale probing (when fetch_web=True)

Synthetic LLM-generated description/mission text is intentionally excluded —
those fields are not evidence of the organization's public language.

LanguageClassification.source is for internal debugging only (not persisted).
"""

from __future__ import annotations

import ipaddress
import logging
import re
import socket
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
_MAX_REDIRECTS = 5
_USER_AGENT = "wev-org-language/1.0 (+https://wevchange.org)"
_BLOCKED_HOSTNAMES = frozenset({
    "localhost",
    "metadata.google.internal",
    "metadata",
})

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
    website: str | None = None,
    fetch_web: bool = True,
    llm_fn: Callable[[str], OrgLanguage | None] | None = None,
    use_llm: bool = True,
) -> LanguageClassification:
    """Classify org language from name / website signals (not generated prose).

    Both signals run by default: the website is fetched (``fetch_web``) and the
    organization name is assessed by an LLM (``use_llm``). Callers do not need to
    supply ``llm_fn`` — it is built lazily from the configured provider. Inject a
    fake ``llm_fn`` in tests, or pass ``use_llm=False`` to skip the name LLM.
    """
    reasons: list[str] = []

    if llm_fn is None and use_llm:
        llm_fn = make_llm_language_fn()

    # Fetch the site first: declared en+fr metadata is objective and independent
    # of which localized page our egress IP happens to be served.
    web: LanguageClassification | None = None
    if fetch_web and website:
        web = _classify_from_website(website)
        reasons.extend(web.reasons)
        # Confirmed substantial EN + FR website evidence is decisive bilingual.
        if web.language == "bilingual":
            return LanguageClassification("bilingual", web.confidence, web.source, tuple(reasons))
        if web.language:
            reasons.append(f"web_signal={web.language}")

    name_language: OrgLanguage | None = None
    if llm_fn is not None and name and name.strip():
        try:
            llm_language = llm_fn(name.strip())
        except Exception as exc:  # noqa: BLE001 — backfill must continue
            logger.warning("org language name LLM failed: %s", exc)
            llm_language = None
        if llm_language in VALID_ORG_LANGUAGES:
            name_language = llm_language
            reasons.append(f"name_llm={name_language}")

    # The name assessment is primary unless the website confirmed bilingual use.
    if name_language:
        return LanguageClassification(
            name_language,
            0.7,
            "llm_name",
            tuple(reasons),
        )

    if web and web.language:
        return LanguageClassification(
            web.language,
            web.confidence,
            web.source,
            tuple(reasons),
        )

    return LanguageClassification(None, 0.0, "unknown", tuple(reasons or ("insufficient_signal",)))


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
    """Lightweight website-text scorer. Not a general language detector."""
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) < _MIN_TEXT_CHARS:
        return LanguageClassification(None, 0.0, "text_markers", ("text_too_short",))

    tokens = re.findall(r"[A-Za-zÀ-ÿ']+", cleaned.lower())
    if not tokens:
        return LanguageClassification(None, 0.0, "text_markers", ("no_tokens",))

    fr_hits = sum(1 for t in tokens if t in _FR_MARKERS)
    en_hits = sum(1 for t in tokens if t in _EN_MARKERS)
    accent_hits = len(_FR_CHAR_RE.findall(cleaned))
    fr_score = fr_hits + accent_hits * 0.5
    en_score = float(en_hits)

    total = fr_score + en_score
    if total < 2:
        return LanguageClassification(None, 0.0, "text_markers", ("weak_marker_signal",))

    fr_ratio = fr_score / total
    en_ratio = en_score / total
    reasons = (
        f"fr_score={fr_score:.1f}",
        f"en_score={en_score:.1f}",
        f"accents={accent_hits}",
    )

    # Both languages clearly present in the same blob
    if fr_ratio >= 0.28 and en_ratio >= 0.28 and fr_score >= 3 and en_score >= 3:
        return LanguageClassification("bilingual", 0.75, "text_markers", reasons)
    if fr_ratio >= 0.62:
        return LanguageClassification("fr", min(0.95, 0.55 + fr_ratio / 2), "text_markers", reasons)
    if en_ratio >= 0.62:
        return LanguageClassification("en", min(0.95, 0.55 + en_ratio / 2), "text_markers", reasons)
    return LanguageClassification(None, 0.0, "text_markers", (*reasons, "ambiguous_mix"))


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


def _classify_from_website(website: str) -> LanguageClassification:
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
        # Probe both sides. Only dual confirmation is positive evidence.
        # Partial confirmation (one side fails) is inconclusive — fall through.
        en_ok = _page_has_language(locales["en"], "en")
        fr_ok = _page_has_language(locales["fr"], "fr")
        reasons.append(f"probe_en={en_ok}")
        reasons.append(f"probe_fr={fr_ok}")
        if en_ok and fr_ok:
            return LanguageClassification("bilingual", 0.95, "web_dual_probe", tuple(reasons))
        reasons.append("dual_probe_partial_inconclusive")

    page_lang = _detect_text_language(_html_to_text(html))
    if page_lang.language == "bilingual":
        return LanguageClassification("bilingual", 0.85, "web_text", tuple([*reasons, *page_lang.reasons]))

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
    if not _is_safe_public_url(url):
        logger.info("org language fetch blocked unsafe URL %s", url)
        return None, None
    try:
        current = url
        for _ in range(_MAX_REDIRECTS + 1):
            if not _is_safe_public_url(current):
                logger.info("org language fetch blocked redirect to %s", current)
                return None, None
            resp = requests.get(
                current,
                timeout=_FETCH_TIMEOUT_SEC,
                headers={
                    "User-Agent": _USER_AGENT,
                    # Equal preference — never English-biased browser default
                    "Accept-Language": "en, fr;q=1.0, *;q=0.5",
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                },
                allow_redirects=False,
            )
            if resp.is_redirect or resp.is_permanent_redirect:
                location = resp.headers.get("Location")
                if not location:
                    return None, None
                current = urljoin(current, location)
                continue
            if resp.status_code >= 400:
                logger.info("org language fetch HTTP %s for %s", resp.status_code, current)
                return None, None
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype and "text" not in ctype and ctype:
                return None, None
            return resp.text, str(resp.url)
        logger.info("org language fetch exceeded redirect limit for %s", url)
        return None, None
    except requests.RequestException as exc:
        err_msg = type(exc).__name__
        if "SSLError" in str(exc):
            err_msg = "SSLError (misconfigured certificate)"
        logger.info("org language fetch failed for %s: %s", url, err_msg)
        return None, None


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _is_safe_public_url(url: str) -> bool:
    """Reject non-http(s) and private/loopback/link-local/metadata targets."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    if host.lower().strip(".") in _BLOCKED_HOSTNAMES:
        return False
    # Literal IP in the URL
    try:
        if _is_blocked_ip(ipaddress.ip_address(host)):
            return False
        return True
    except ValueError:
        pass
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError, ValueError):
        return False
    if not infos:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if _is_blocked_ip(ip):
            return False
    return True


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

    # Only guess the missing counterpart when hreflang/switcher already confirmed
    # at least one locale — do not seed both /en and /fr on monolingual sites.
    if not found:
        return {}

    parsed = urlparse(base_url)
    apex = f"{parsed.scheme}://{parsed.netloc}"
    if "en" in found and "fr" not in found:
        found["fr"] = urljoin(apex + "/", "fr")
    elif "fr" in found and "en" not in found:
        found["en"] = urljoin(apex + "/", "en")

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
            "Infer the likely primary public-language leaning of this Canadian "
            "organization from its official name. Reply with ONLY one token: "
            "en, fr, bilingual, or null.\n"
            "- en = the name is clearly English-leaning\n"
            "- fr = the name is clearly French-leaning\n"
            "- bilingual = the official name contains substantial English and French "
            "wording, including translated versions of the same name\n"
            "- null = the name is ambiguous, invented, or language-neutral\n\n"
            f"ORGANIZATION NAME:\n{text[:1000]}"
        )
        # This classifier expects one plain token, not Groq's default JSON-object mode.
        raw = provider.complete(prompt, json_mode=False)
        if raw is None:
            return None
        token = str(raw).strip().lower().split()[0].strip(".,\"'")
        if token in VALID_ORG_LANGUAGES:
            return token  # type: ignore[return-value]
        return None

    return _fn
