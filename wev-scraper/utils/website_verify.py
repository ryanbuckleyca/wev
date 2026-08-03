"""Confirm employer websites before writing them to the DB.

A candidate URL is kept only when:
1. Its host appears in Tavily evidence URLs, OR it matches known_website, AND
2. Live verification succeeds (DNS resolves + HTTP returns 2xx/3xx, or 401/403
   after DNS — the domain exists), AND
3. Optional location gates pass (no foreign .gov for Canadian jobs; no strong
   geographic conflict between fetched homepage text and job/org province), AND
4. When *org_raw_name* is set: homepage text (or Tavily snippet for that URL)
   contains significant tokens from the org name (blocks wrong-entity hosts
   like a Magog plant for a numbered Québec corporation).

Invented domains that never appear in research must never be stored.
"""

from __future__ import annotations

import logging
import re
import socket
from typing import Iterable
from urllib.parse import urlparse

import requests

from utils.location_parser import _normalize_ca_province_code
from utils.organization_cache import domains_match, extract_domain

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s\]|>\"'<>]+", re.I)
_USER_AGENT = (
    "Mozilla/5.0 (compatible; WevOrgVerify/1.0; +https://wev.work)"
)

# Québec numbered corporations: "9076-5215 QUÉBEC Inc."
_QC_NUMBERED_RE = re.compile(
    r"\b(\d{4})-(\d{4})\s+QU[EÉ]BEC\b",
    re.I,
)
_NAME_TOKEN_RE = re.compile(r"[a-z0-9àâäæçéèêëïîôœùûüÿ]{3,}", re.I)
_NAME_LEGAL_STOP = frozenset(
    {
        "inc",
        "ltd",
        "llc",
        "corp",
        "corporation",
        "limited",
        "company",
        "quebec",
        "québec",
        "canada",
        "canadian",
        "canadien",
        "the",
        "and",
        "for",
        # Weak FR/EN fillers — keep distinctive brand tokens (télescope, architek).
        "des",
        "les",
        "pour",
        "une",
        "aux",
        "group",
        "groupe",
        "reseau",
        "réseau",
    }
)

# Strong US geo markers that conflict with a Canadian org/job province.
# Used as a post-gate on fetched homepage title/body (Foxhole OH, Georgia GBI).
_US_GEO_CONFLICT_RE = re.compile(
    r"\b("
    r"ohio|georgia|atlanta|brookville|"
    r"california|texas|florida|arizona|colorado|michigan|illinois|"
    r"new\s+york|massachusetts|pennsylvania|virginia|maryland|"
    r"washington\s*,?\s*d\.?c\.?|united\s+states|\bUSA\b|\bU\.S\.A\.?\b"
    r")\b",
    re.I,
)

# Canadian province / city cues that can redeem an otherwise ambiguous page.
_CA_GEO_HINT_RE = re.compile(
    r"\b("
    r"canada|canadian|ontario|quebec|québec|british\s+columbia|"
    r"alberta|manitoba|saskatchewan|nova\s+scotia|new\s+brunswick|"
    r"newfoundland|yukon|nunavut|northwest\s+territories|"
    r"toronto|montreal|montréal|vancouver|ottawa|calgary|edmonton|"
    r"winnipeg|halifax|victoria|hamilton|mississauga|brampton|"
    r"rockwood|guelph|\.ca\b"
    r")\b",
    re.I,
)


def url_host(url: str | None) -> str:
    """Return normalized hostname (no www.) or '' if unparseable."""
    host = extract_domain(url)
    return host or ""


def host_in_evidence(url: str | None, evidence_urls: Iterable[str] | None) -> bool:
    """True when *url*'s host matches any evidence URL host (incl. subdomain)."""
    candidate = url_host(url)
    if not candidate:
        return False
    for raw in evidence_urls or []:
        evidence_host = url_host(raw)
        if evidence_host and domains_match(candidate, evidence_host):
            return True
    return False


def urls_from_evidence_text(text: str | None) -> list[str]:
    """Extract http(s) URLs from a Tavily evidence block (title | url lines)."""
    if not text or not str(text).strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for match in _URL_RE.findall(str(text)):
        cleaned = match.rstrip(".,);]")
        if cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
    return out


def _dns_resolves(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError, ValueError):
        return False
    return bool(infos)


def verify_website_live(url: str, timeout: float = 10) -> bool:
    """DNS + HTTP check without proxies. Accepts 2xx/3xx and 401/403."""
    raw = (url or "").strip()
    if not raw:
        return False
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower().strip(".")
    if not host:
        return False

    if not _dns_resolves(host):
        return False

    session = requests.Session()
    session.trust_env = False  # no proxy
    headers = {"User-Agent": _USER_AGENT, "Accept": "*/*"}
    try:
        try:
            resp = session.head(
                raw,
                timeout=timeout,
                allow_redirects=True,
                headers=headers,
            )
            # Some hosts reject HEAD; fall through to GET on 405/501.
            if resp.status_code in (405, 501):
                resp = session.get(
                    raw,
                    timeout=timeout,
                    allow_redirects=True,
                    headers=headers,
                    stream=True,
                )
                resp.close()
        except requests.RequestException:
            resp = session.get(
                raw,
                timeout=timeout,
                allow_redirects=True,
                headers=headers,
                stream=True,
            )
            resp.close()

        code = int(resp.status_code)
        if 200 <= code < 400:
            return True
        # Domain exists but blocks bots / requires auth.
        if code in (401, 403):
            return True
        return False
    except requests.RequestException:
        return False
    finally:
        session.close()


def is_canadian_province(province: str | None) -> bool:
    """True when *province* normalizes to a Canadian province/territory code."""
    return _normalize_ca_province_code(province) is not None


def is_foreign_gov_host(url: str | None, *, province: str | None = None) -> bool:
    """True for US/foreign ``*.gov`` hosts when the job/org is Canadian.

    Canadian public hosts use ``.ca`` / ``.gc.ca`` / ``.gouv.qc.ca`` etc., not
    the bare ``.gov`` TLD. ``gbi.georgia.gov`` must not be adopted for Montreal.
    """
    if not is_canadian_province(province):
        return False
    host = url_host(url)
    if not host:
        return False
    # TLD is exactly ``gov`` (e.g. georgia.gov, fbi.gov).
    return host == "gov" or host.endswith(".gov")


def has_geographic_conflict(
    site_text: str | None,
    *,
    municipality: str | None = None,
    province: str | None = None,
    site_title: str | None = None,
) -> bool:
    """True when homepage text strongly points to a different country/region.

    For Canadian org/job provinces: reject pages that prominently mention US
    states/cities (Ohio, Georgia, Atlanta, …) unless the same page also clearly
    mentions Canada / the job city / province.
    """
    if not is_canadian_province(province):
        return False
    blob = " ".join(p for p in (site_title, site_text) if p and str(p).strip())
    if not blob.strip():
        return False
    if not _US_GEO_CONFLICT_RE.search(blob):
        return False

    # Redeem if page also clearly ties to Canada / this job location.
    mun = (municipality or "").strip()
    if mun and re.search(rf"\b{re.escape(mun)}\b", blob, re.I):
        return False
    prov_code = _normalize_ca_province_code(province)
    if prov_code and re.search(rf"\b{re.escape(prov_code)}\b", blob, re.I):
        return False
    if _CA_GEO_HINT_RE.search(blob):
        return False
    return True


def evidence_mentions_location(
    title: str | None,
    content: str | None,
    *,
    municipality: str | None = None,
    province: str | None = None,
) -> bool:
    """True when a Tavily title/snippet mentions the job/org city or province."""
    blob = f"{title or ''} {content or ''}"
    if not blob.strip():
        return False
    mun = (municipality or "").strip()
    if mun and re.search(rf"\b{re.escape(mun)}\b", blob, re.I):
        return True
    prov_code = _normalize_ca_province_code(province)
    if prov_code and re.search(rf"\b{re.escape(prov_code)}\b", blob, re.I):
        return True
    # Full province name from common aliases.
    if province and str(province).strip():
        raw = str(province).strip()
        if len(raw) > 2 and re.search(rf"\b{re.escape(raw)}\b", blob, re.I):
            return True
    return False


def quebec_numbered_corp_parts(raw_name: str | None) -> tuple[str, str] | None:
    """Return (NNNN, NNNN) when *raw_name* looks like a Québec numbered corp."""
    if not raw_name or not str(raw_name).strip():
        return None
    match = _QC_NUMBERED_RE.search(str(raw_name))
    if not match:
        return None
    return match.group(1), match.group(2)


def is_quebec_numbered_company(raw_name: str | None) -> bool:
    """True for names like ``9076-5215 QUÉBEC Inc.``."""
    return quebec_numbered_corp_parts(raw_name) is not None


def org_name_identity_tokens(raw_name: str | None) -> list[str]:
    """Significant identity tokens from an org raw name (no legal suffixes)."""
    if not raw_name or not str(raw_name).strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for tok in _NAME_TOKEN_RE.findall(str(raw_name).lower()):
        if tok in _NAME_LEGAL_STOP or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    return out


def page_mentions_org_name(
    site_text: str | None,
    *,
    org_raw_name: str | None,
    site_title: str | None = None,
    evidence_snippet: str | None = None,
) -> bool:
    """True when homepage / snippet contains significant org-name tokens.

    Québec numbered corps require **both** digit groups (e.g. ``9076`` and
    ``5215``) so a same-city plant page cannot pass. Other names need at least
    one strong identity token (two when the name has 2+ tokens). Weak fillers
    (group/réseau/des/…) are stripped so short brand pages like Architek or
    Télescope can pass on the distinctive token alone.
    """
    if not org_raw_name or not str(org_raw_name).strip():
        return True
    blob = " ".join(
        p for p in (site_title, site_text, evidence_snippet) if p and str(p).strip()
    )
    if not blob.strip():
        return False
    # Fold accents lightly so Télescope ↔ Telescope still matches.
    blob_l = (
        blob.lower()
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ù", "u")
        .replace("û", "u")
        .replace("ô", "o")
        .replace("î", "i")
        .replace("ï", "i")
        .replace("ç", "c")
    )

    numbered = quebec_numbered_corp_parts(org_raw_name)
    if numbered:
        a, b = numbered
        return a in blob_l and b in blob_l

    tokens = [
        t.replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ù", "u")
        .replace("û", "u")
        .replace("ô", "o")
        .replace("î", "i")
        .replace("ï", "i")
        .replace("ç", "c")
        for t in org_name_identity_tokens(org_raw_name)
    ]
    if not tokens:
        return True
    hits = sum(1 for t in tokens if t in blob_l)
    if len(tokens) == 1:
        return hits >= 1
    # 2+: any two identity tokens (blocks unrelated city plants; allows acronym sites).
    return hits >= 2


def confirm_website(
    candidate: str | None,
    *,
    evidence_urls: list[str] | None = None,
    known_website: str | None = None,
    timeout: float = 10,
    municipality: str | None = None,
    province: str | None = None,
    site_text: str | None = None,
    site_title: str | None = None,
    org_raw_name: str | None = None,
    evidence_snippet: str | None = None,
    relax_name_check: bool = False,
) -> str | None:
    """Return *candidate* only when evidence (or known) + live check (+ gates) pass.

    *known_website* may satisfy the evidence-host gate when its host matches
    *candidate*, but live verification is still required.

    When *province* is Canadian, foreign ``*.gov`` hosts are rejected. When
    *site_text* / *site_title* are provided, strong geographic conflict also
    rejects the candidate. When *org_raw_name* is set, the page (or
    *evidence_snippet* for that URL) must mention significant name tokens —
    unless *relax_name_check* is True (known employer host soft-pass).
    """
    url = (candidate or "").strip() or None
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url

    host = url_host(url)
    if not host:
        logger.info("website rejected (unparseable host): %s", url)
        return None

    if is_foreign_gov_host(url, province=province):
        logger.info(
            "website rejected (foreign .gov for Canadian province %s): %s",
            province,
            url,
        )
        return None

    known_host = url_host(known_website)
    known_match = bool(known_host and domains_match(host, known_host))
    in_evidence = host_in_evidence(url, evidence_urls)

    if not known_match and not in_evidence:
        logger.info("website rejected (not in tavily evidence): %s", url)
        return None

    if not verify_website_live(url, timeout=timeout):
        logger.info("website rejected (DNS/HTTP failed): %s", url)
        return None

    if has_geographic_conflict(
        site_text,
        municipality=municipality,
        province=province,
        site_title=site_title,
    ):
        logger.info(
            "website rejected (geographic conflict vs province=%s municipality=%s): %s",
            province,
            municipality,
            url,
        )
        return None

    if org_raw_name and str(org_raw_name).strip():
        if not page_mentions_org_name(
            site_text,
            org_raw_name=org_raw_name,
            site_title=site_title,
            evidence_snippet=evidence_snippet,
        ):
            if relax_name_check or known_match:
                logger.info(
                    "website name-token soft-pass for known host %r: %s",
                    org_raw_name,
                    url,
                )
            else:
                logger.info(
                    "website rejected (org name tokens missing for %r): %s",
                    org_raw_name,
                    url,
                )
                return None

    logger.info("website confirmed: %s", url)
    return url
