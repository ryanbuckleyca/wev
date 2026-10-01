"""
Location parser using Geocodio API.

Two separate methods:
1. is_remote_location(location) -> bool
2. parse_address_with_geocodio(location) -> {"municipality": str|None, "province": str|None}
"""

import logging
import re
import time
from typing import Optional

from geocodio import Geocodio

from settings import get_geocodio_api_key

logger = logging.getLogger(__name__)

REMOTE_INDICATORS = [
    r"\bremote\b", r"\bremotely\b", r"\bremote[- ]only\b", r"\bvirtual\b", r"\banywhere\b",
    r"\btélétravail\b", r"\btelework\b", r"\bwork from home\b",
    r"\bwork(?:ing)? remotely\b",
    r"\bwfh\b",
    r"\bhome office\b",
    r"\bcanada[- ]wide\b",
]

# Overrides for strings Geocodio mishandles or that are not real city names.
# Keys: lowercase ASCII after :func:`_alias_lookup_key` (Ste- expanded by
# :func:`normalize_messy_location` first). Prefix match covers "saanich bc".
LOCATION_ALIASES: dict[str, str] = {
    # Neighbourhood / region / blurbs
    "jane and eglinton west": "Toronto, ON",
    "norfolk county": "Simcoe, ON",
    "national capital region": "Ottawa, ON",
    "montreal and surrounding area": "Montreal, QC",
    # French short form / Sainte- after Ste- expand
    "valleyfield": "Salaberry-de-Valleyfield, QC",
    "sainte-adele": "Sainte-Adèle, QC",
    # Org name used as location
    "collectif bienvenue - welcome collective": "Montreal, QC",
    "welcome collective": "Montreal, QC",
    # Geocodio mis-resolves bare Saanich/Ladner → Buick, BC
    "saanich": "Saanich, Victoria, BC, Canada",
    "ladner": "Ladner, Delta, BC, Canada",
    # US HQs (allow_us)
    "peoria": "Peoria, IL, USA",
    "denver": "Denver, CO, USA",
    "malvern": "Malvern, PA, USA",
}

# Aliases eligible for prefix matching (Geocodio anchors + long-blurb regions).
# Everything else in LOCATION_ALIASES is matched exact-only.
_PREFIX_MATCH_ALIASES = ("saanich", "ladner", "national capital region")

# Approx province centroids when Geocodio skips province-only queries.
_CA_PROVINCE_CENTROIDS: dict[str, tuple[float, float]] = {
    "AB": (53.9333, -116.5765),
    "BC": (53.7267, -127.6476),
    "MB": (53.7609, -98.8139),
    "NB": (46.5653, -66.4619),
    "NL": (53.1355, -57.6604),
    "NS": (44.6820, -63.7443),
    "NT": (64.8255, -124.8457),
    "NU": (70.2998, -83.1076),
    "ON": (50.445, -86.047),
    "PE": (46.5107, -63.4168),
    "QC": (52.9399, -73.5491),
    "SK": (52.9399, -106.4509),
    "YT": (64.2823, -135.0000),
}

HYBRID_INDICATORS = [
    r"\bhybrid\b", r"\bflexible\b", r"\bflex\b",
    r"\bremote.*office\b", r"\boffice.*remote\b",
    r"\bdays.*office\b", r"\bdays.*on-?site\b",
    r"\bwork from home.*office\b", r"\boffice.*work from home\b",
]

# Initialize Geocodio client (API key from environment)
_geocodio_client = None
_geocodio_missing_logged = False

def _get_geocodio_client():
    """Get or create Geocodio client instance."""
    global _geocodio_client, _geocodio_missing_logged
    if _geocodio_client is None:
        api_key = get_geocodio_api_key()
        if not api_key:
            if not _geocodio_missing_logged:
                print("GEOCODIO_API_KEY not set; skipping geocoding.")
                _geocodio_missing_logged = True
            return None
        _geocodio_client = Geocodio(api_key)
    return _geocodio_client

# Simple rate limiting: track last request time
_last_request_time = 0.0

# In-memory cache: location string → result dict (or None)
_geocode_cache: dict[str, dict | None] = {}


def is_remote_location(location: Optional[str]) -> bool:
    """Detect if location indicates remote work."""
    if not location or not location.strip():
        return False
    location_lower = location.lower()
    return any(
        re.search(pattern, location_lower, re.IGNORECASE)
        for pattern in REMOTE_INDICATORS
    )


# Collapse glued repeated tokens: "CalgaryCalgary" / "EloraEloraElora" → single.
# A recurring scraper artifact: a page repeats the city across adjacent DOM nodes
# and Playwright ``inner_text()`` concatenates them with no separator.
_REPEATED_TOKEN_RE = re.compile(r"\b([A-Za-zÀ-ÿ]{3,}?)(?:\1){1,}\b", re.IGNORECASE)


def has_repeated_location_token(location: Optional[str]) -> bool:
    """True when *location* contains a glued, adjacent duplicated token.

    Detects the "EtobicokeEtobicokeEtobicoke" artifact (same repeats that
    :func:`normalize_messy_location` collapses). Space-separated repeats
    ("Etobicoke Etobicoke") are intentionally not treated as artifacts.
    """
    if not location:
        return False
    return _REPEATED_TOKEN_RE.search(str(location)) is not None


def normalize_messy_location(location: Optional[str]) -> str:
    """Fix common scraper artifacts before alias lookup / Geocodio.

    - Strip trailing ``+`` / junk commas
    - Unicode dashes → ASCII hyphen
    - Collapse repeated city tokens (``CalgaryCalgary``, ``EloraEloraElora``)
    - Expand ``Ste-`` / ``Ste `` → ``Sainte-`` (French Sainte-)
    """
    if not location:
        return ""
    text = str(location).strip()
    text = text.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[+\s,]+$", "", text).strip()
    # Collapse CamelCase repeats: CalgaryCalgary → Calgary, EloraEloraElora → Elora
    text = _REPEATED_TOKEN_RE.sub(r"\1", text)
    text = re.sub(r"(?i)\bste[\s.\-]+", "Sainte-", text)
    return text.strip()


def _alias_lookup_key(location: str) -> str:
    """Fold accents/& for LOCATION_ALIASES lookup (after messy normalize)."""
    from utils.slug import nfkd_to_ascii

    key = nfkd_to_ascii(location).lower().replace("&", " and ")
    return re.sub(r"\s+", " ", key).strip()


def apply_location_alias(location: Optional[str]) -> Optional[str]:
    """Map known neighbourhood / typo / short forms to a geocodeable string."""
    if not location or not str(location).strip():
        return None
    key = _alias_lookup_key(normalize_messy_location(location))
    if not key:
        return None
    if key in LOCATION_ALIASES:
        return LOCATION_ALIASES[key]
    # Prefix matching only for intentionally-incomplete aliases (Geocodio anchor
    # / long blurbs), e.g. "saanich bc", "National Capital Region, occasional…".
    # All other aliases (peoria, denver, malvern, …) stay exact-only so that
    # "Peoria, AZ" is not mapped to "Peoria, IL, USA".
    for alias_key in _PREFIX_MATCH_ALIASES:
        if key.startswith(f"{alias_key},") or key.startswith(f"{alias_key} "):
            return LOCATION_ALIASES[alias_key]
    return None


def _peel_trailing_country_tokens(text: str) -> str:
    """Strip repeated trailing ``Canada`` / ``CA`` tokens (``Ontario, Canada, CA``)."""
    out = text
    while True:
        nxt = re.sub(r",?\s*canada\s*$", "", out, flags=re.IGNORECASE).strip()
        nxt = re.sub(r",?\s*ca\s*$", "", nxt, flags=re.IGNORECASE).strip()
        nxt = nxt.rstrip(",").strip()
        if nxt == out:
            return out
        out = nxt


def _province_code_from_province_only_text(text: str) -> Optional[str]:
    """Normalize a province-only string to a 2-letter code after peeling country tokens."""
    text = _peel_trailing_country_tokens(normalize_messy_location(text))
    if not text:
        return None
    if "," in text:
        left, _, right = text.partition(",")
        left, right = left.strip(), right.strip()
        if not right:
            text = left
        elif _normalize_ca_province_code(left) and (
            is_province_like_municipality(right) or _normalize_ca_province_code(right)
        ):
            text = left
        else:
            return None
    return _normalize_ca_province_code(text)


def _province_scoped_from_phrase(location: str) -> Optional[str]:
    """Extract a province-only code from phrases like 'Must be based in Ontario.'"""
    text = normalize_messy_location(location)
    m = re.match(
        r"(?is)^(?:must be (?:based )?in|across|throughout|based (?:in|within)|"
        r"within|preferably in)\s+(.+?)(?:\.|$)",
        text,
    )
    if not m:
        return None
    rest = m.group(1).strip()
    rest = _peel_trailing_country_tokens(rest)
    # Drop trailing preference clauses
    rest = re.split(r"\b(?:or|and|,|;)\b", rest, maxsplit=1)[0].strip()
    code = _normalize_ca_province_code(rest)
    if code:
        return code
    if is_province_like_municipality(rest):
        return _normalize_ca_province_code(rest)
    return None


def is_province_only_location(location: Optional[str]) -> bool:
    """True when *location* is only a province/territory (no city).

    Accepts ``ON``, ``Ontario``, ``Ontario, Canada``, ``NS, CA``,
    ``Ontario, Canada +``, ``Must be based in Ontario.``,
    ``across Newfoundland and Labrador``, etc.
    Rejects city+province strings and Quebec City (``Quebec`` / ``Québec`` alone
    is treated as the city via :func:`is_province_like_municipality` exceptions).
    """
    if not location or not str(location).strip():
        return False
    text = normalize_messy_location(location)
    if _province_scoped_from_phrase(text):
        return True
    text = _peel_trailing_country_tokens(text)
    if not text:
        return False
    if "," in text:
        # "Ontario, Canada" already stripped; "ON, ON" / "Nova Scotia, Nova Scotia"
        left, _, right = text.partition(",")
        left, right = left.strip(), right.strip()
        if not right:
            text = left
        elif _normalize_ca_province_code(left) and (
            is_province_like_municipality(right) or _normalize_ca_province_code(right)
        ):
            text = left
        else:
            return False
    # Same rules as municipality: ON/Ontario yes; Quebec/Québec no (Quebec City).
    return is_province_like_municipality(text)


def is_country_only_location(location: Optional[str]) -> bool:
    """True for bare ``Canada`` / ``CA`` with no city or province."""
    if not location or not str(location).strip():
        return False
    text = normalize_messy_location(location)
    text = re.sub(r"[.]+$", "", text).strip()
    return bool(re.fullmatch(r"(?i)canada|ca", text))


# Explicit US country markers. Bare "US"/"us" omitted (too many English false positives).
_US_COUNTRY_RE = re.compile(
    r"(?i)\b(?:united\s+states(?:\s+of\s+america)?|u\.s\.a\.|usa|u\.s\.)\b"
)

# Full US state / DC names. Abbreviations alone are risky (CA ≠ California here).
_US_STATE_NAMES = (
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
    "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "new york",
    "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
    "pennsylvania", "rhode island", "south carolina", "south dakota",
    "tennessee", "texas", "utah", "vermont", "virginia", "washington",
    "west virginia", "wisconsin", "wyoming", "district of columbia",
)
_US_STATE_NAME_RE = re.compile(
    r"(?i)\b(?:" + "|".join(re.escape(n) for n in _US_STATE_NAMES) + r")\b"
)

# US state codes that do not collide with Canadian province codes.
# (CA provinces: AB BC MB NB NL NS NT NU ON PE QC SK YT — none match US codes
# except we still exclude CA to avoid "Toronto, CA" / country-code confusion.)
_US_STATE_CODES = (
    "AL", "AK", "AZ", "AR", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA",
    "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO",
    "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI",
    "WV", "WY",
)
_US_STATE_CODE_RE = re.compile(
    r"(?i)(?:,|\s)\s*(" + "|".join(_US_STATE_CODES) + r")\s*(?:,|$|\s+united|\s+usa|\s+u\.s)"
)


def looks_like_us_location(location: Optional[str]) -> bool:
    """True when *location* is a United States–only place string.

    Used to (a) refuse Canada-biased Geocodio queries that snap to lookalikes
    (Boston→Boiestown NB, Carolina→Caroline AB) and (b) drop US-only jobs on save.

    Hybrid CA/US remote strings (``Remote in Canada or USA``, ``Western Canada
    or Western USA``) return False so Canadian-eligible roles are kept.
    """
    if not location or not str(location).strip():
        return False
    text = str(location).strip()
    has_us = bool(
        _US_COUNTRY_RE.search(text)
        or _US_STATE_NAME_RE.search(text)
        or _US_STATE_CODE_RE.search(text)
    )
    if not has_us:
        return False
    # Canada also named as an allowed region → not US-only
    if re.search(r"(?i)\bcanad(?:a|ian)s?\b", text):
        return False
    return True


def _is_intentional_us_geocode_query(query: str) -> bool:
    """True for org-HQ style queries we *do* want to resolve in the US (…, USA)."""
    return bool(re.search(r",\s*USA\s*$", query, re.I)) or query.rstrip().upper().endswith("USA")


def location_has_no_geocodeable_city(location: Optional[str]) -> bool:
    """True when Geocodio cannot be expected to return a municipality.

    Remote-only, province-only, and country-only strings are "complete enough"
    without a city — missing municipality is not a data-quality bug.
    """
    if not location or not str(location).strip():
        return True
    if is_province_only_location(location) or is_country_only_location(location):
        return True
    if is_remote_location(location):
        try:
            return _extract_explicit_location(location) is None
        except Exception:
            return True
    return False


def geo_row_needs_city_geocode(row: dict) -> bool:
    """Whether a job/org row still needs city-level Geocodio backfill.

    Province-only rows need province (+ optional state-level lat/lng), not a
    municipality. Remote-only / country-only rows need no geocode fields.
    """
    loc = (row.get("location") or "").strip()
    if not loc:
        return False

    def _empty(v) -> bool:
        return v is None or (isinstance(v, str) and not str(v).strip())

    if is_remote_location(loc) and location_has_no_geocodeable_city(loc):
        return False
    if is_country_only_location(loc):
        return False
    if is_province_only_location(loc):
        # Municipality intentionally absent. Province code is enough; Geocodio
        # often skips province-only queries so lat/lng are optional.
        return _empty(row.get("province"))

    return any(
        _empty(row.get(k))
        for k in ("municipality", "province", "lat", "lng", "geocode_accuracy_type")
    )


def is_hybrid_location(location: Optional[str]) -> bool:
    """Detect if location indicates hybrid work (mix of remote and office)."""
    if not location or not location.strip():
        return False
    location_lower = location.lower()
    return any(
        re.search(pattern, location_lower, re.IGNORECASE)
        for pattern in HYBRID_INDICATORS
    )


def determine_work_type(location: Optional[str], municipality: Optional[str] = None, province: Optional[str] = None) -> str:
    """
    Determine work type from location string and extracted location data.

    Args:
        location: Raw location string from job posting
        municipality: Extracted city/town (if any)
        province: Extracted province (if any)

    Returns:
        "remote", "hybrid", or "office"

    Logic:
        1. Explicit "hybrid" keywords → hybrid
        2. Remote keywords + specific location mentioned → hybrid (why mention location if fully remote?)
        3. Remote keywords + no specific location → remote
        4. No remote keywords → office
    """
    if not location:
        return "office"

    # Check for explicit hybrid indicators
    if is_hybrid_location(location):
        return "hybrid"

    # Check for remote indicators
    has_remote_keywords = is_remote_location(location)
    has_specific_location = bool(municipality or province)

    if has_remote_keywords:
        # If remote keywords but also mentions a specific city/town, likely hybrid
        if has_specific_location and municipality:
            # "Remote in Ontario" (province only) → remote
            # "Remote - Toronto, ON" (city mentioned) → hybrid
            return "hybrid"
        else:
            # "Remote, anywhere in Canada" → remote
            return "remote"

    # No remote indicators → office-based
    return "office"


def parse_address_with_geocodio(location: Optional[str]) -> dict:
    """Use Geocodio to extract municipality, province, lat, lng, and geocode_accuracy_type."""
    _empty = {"municipality": None, "province": None, "lat": None, "lng": None, "geocode_accuracy_type": None}
    if not location or not location.strip():
        return _empty

    cleaned = normalize_messy_location(location)
    aliased = apply_location_alias(cleaned)
    query = aliased or cleaned

    # Province-scoped phrases → fill province (+ optional centroid), no city.
    scoped = _province_scoped_from_phrase(cleaned)
    if scoped and not aliased:
        latlng = _CA_PROVINCE_CENTROIDS.get(scoped)
        out = dict(_empty)
        out["province"] = scoped
        if latlng:
            out["lat"], out["lng"] = latlng
            out["geocode_accuracy_type"] = "state"
        return out

    if is_province_only_location(cleaned) and not aliased:
        code = _province_code_from_province_only_text(cleaned) or _province_scoped_from_phrase(
            cleaned
        )
        if code:
            latlng = _CA_PROVINCE_CENTROIDS.get(code)
            out = dict(_empty)
            out["province"] = code
            if latlng:
                out["lat"], out["lng"] = latlng
                out["geocode_accuracy_type"] = "state"
            return out

    if is_country_only_location(query):
        return _empty

    # If it's remote-only with no explicit location, skip geocoding entirely.
    try:
        if is_remote_location(query):
            explicit_location = _extract_explicit_location(query)
            if not explicit_location:
                # Prefer province from "priority … British Columbia" style blurbs
                for prov_name, code in (
                    ("british columbia", "BC"),
                    ("ontario", "ON"),
                    ("quebec", "QC"),
                    ("québec", "QC"),
                ):
                    if re.search(rf"\b{re.escape(prov_name)}\b", query, re.I):
                        latlng = _CA_PROVINCE_CENTROIDS.get(code)
                        out = dict(_empty)
                        out["province"] = code
                        if latlng:
                            out["lat"], out["lng"] = latlng
                            out["geocode_accuracy_type"] = "state"
                        return out
                logger.debug("Skipped geocoding (remote-only location)")
                return _empty
            query = explicit_location
    except Exception:
        # Fall through to normal geocoding if checks fail
        pass

    allow_us = _is_intentional_us_geocode_query(query)

    # US job strings must not be Canada-suffixed — Geocodio then returns lookalikes
    # (Boston→Boiestown NB, South Carolina→Caroline AB). Org HQ aliases end in
    # ", USA" and keep allow_us geocoding.
    if looks_like_us_location(location) or looks_like_us_location(query):
        if not allow_us:
            print(f"\tGeocoding '{location}'... skipped (US location)")
            return _empty

    try:
        result = _geocode_with_geocodio(query, allow_us=allow_us)
        if not result:
            return _empty
        # Prefer the alias city when Geocodio omits it (regions/counties) or
        # returns a wrong place (e.g. Saanich/Ladner → Buick).
        if aliased:
            city = aliased.split(",")[0].strip()
            if city and not is_province_like_municipality(city):
                got = (result.get("municipality") or "").strip()
                if not got or got.casefold() != city.casefold():
                    result = dict(result)
                    result["municipality"] = city
        return result
    except Exception as e:
        logger.warning(f"Geocodio call failed for location '{location}': {e}")
        return _empty


def _safe_get(obj, key, default=None):
    """Safely get a value from an object or dict."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    elif hasattr(obj, key):
        return getattr(obj, key, default)
    elif hasattr(obj, "__dict__") and key in obj.__dict__:
        return obj.__dict__[key]
    return default


_CA_PROVINCE_ALIASES = {
    "AB": "AB",
    "ALBERTA": "AB",
    "BC": "BC",
    "BRITISH COLUMBIA": "BC",
    "COLOMBIE-BRITANNIQUE": "BC",
    "COLOMBIE BRITANNIQUE": "BC",
    "MB": "MB",
    "MANITOBA": "MB",
    "NB": "NB",
    "NEW BRUNSWICK": "NB",
    "NOUVEAU-BRUNSWICK": "NB",
    "NOUVEAU BRUNSWICK": "NB",
    "NL": "NL",
    "NFLD": "NL",
    "NEWFOUNDLAND": "NL",
    "NEWFOUNDLAND AND LABRADOR": "NL",
    "TERRE-NEUVE-ET-LABRADOR": "NL",
    "TERRE NEUVE ET LABRADOR": "NL",
    "TERRE-NEUVE": "NL",
    "NS": "NS",
    "NOVA SCOTIA": "NS",
    "NOUVELLE-ÉCOSSE": "NS",
    "NOUVELLE-ECOSSE": "NS",
    "NOUVELLE ÉCOSSE": "NS",
    "NOUVELLE ECOSSE": "NS",
    "NT": "NT",
    "NORTHWEST TERRITORIES": "NT",
    "TERRITOIRES DU NORD-OUEST": "NT",
    "NU": "NU",
    "NUNAVUT": "NU",
    "ON": "ON",
    "ONTARIO": "ON",
    "PE": "PE",
    "PEI": "PE",
    "P.E.I.": "PE",
    "P.E.I": "PE",
    "PRINCE EDWARD ISLAND": "PE",
    "ÎLE-DU-PRINCE-ÉDOUARD": "PE",
    "ILE-DU-PRINCE-EDOUARD": "PE",
    "ÎLE DU PRINCE ÉDOUARD": "PE",
    "ILE DU PRINCE EDOUARD": "PE",
    "QC": "QC",
    "QUEBEC": "QC",
    "QUÉBEC": "QC",
    "SK": "SK",
    "SASKATCHEWAN": "SK",
    "YT": "YT",
    "YUKON": "YT",
    "YUKON TERRITORY": "YT",
}

# 2-letter codes only — never valid municipality names.
_CA_PROVINCE_CODES = frozenset({
    "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
})

# Quebec / Québec is both a province name and the common English/French label for
# Quebec City — allow it as a municipality when province is QC.
_MUNICIPALITY_PROVINCE_NAME_EXCEPTIONS = frozenset({"QUEBEC", "QUÉBEC"})


def _normalize_ca_province_code(raw: Optional[str]) -> Optional[str]:
    """Map Geocodio state/province text to a 2-letter Canadian code."""
    if not raw:
        return None
    key = re.sub(r"\s+", " ", str(raw).strip()).upper()
    return _CA_PROVINCE_ALIASES.get(key)


def is_province_like_municipality(name: Optional[str]) -> bool:
    """True when *name* is a province/territory code or name, not a city.

    Rejects ``ON``, ``NB``, ``Ontario``, ``Nova Scotia``, etc. Allows
    ``Quebec`` / ``Québec`` (Quebec City).
    """
    if not name or not str(name).strip():
        return False
    key = re.sub(r"\s+", " ", str(name).strip()).upper()
    if key in _MUNICIPALITY_PROVINCE_NAME_EXCEPTIONS:
        return False
    if key in _CA_PROVINCE_CODES:
        return True
    return _normalize_ca_province_code(name) is not None


def _canonicalize_city_province_query(location: str) -> str:
    """Rewrite ``City, Ontario`` → ``City, ON`` so Geocodio does not confuse
    province names with cities (notably ``Quebec`` → Quebec City).
    """
    if not location or "," not in location:
        # Province-only: prefer the 2-letter code when we recognize it.
        code = _normalize_ca_province_code(location)
        return code or location.strip()

    city, _, rest = location.partition(",")
    city = city.strip()
    rest = rest.strip()
    # Drop trailing ", Canada" before normalizing the province token.
    rest_no_country = re.sub(r",?\s*canada\s*$", "", rest, flags=re.IGNORECASE).strip()
    # Province may itself contain commas ("Newfoundland and Labrador"); take first segment.
    prov_token = rest_no_country.split(",")[0].strip()
    code = _normalize_ca_province_code(prov_token)
    if code and city:
        if is_province_like_municipality(city):
            # "ON, ON" / "Nova Scotia, Nova Scotia" → just the province code.
            return code
        return f"{city}, {code}"
    return location.strip()


def _extract_explicit_location(location: str) -> Optional[str]:
    """
    Extract explicit city/province mentions from location text.
    Looks for patterns like "City, Province" or "City, ON" or "based in City".
    Returns the first match, or None if no explicit location found.

    Examples:
    - "Hybrid – based in Halifax, Nova Scotia" → "Halifax, Nova Scotia"
    - "office in Toronto, ON" → "Toronto, ON"
    - "Peel Region, Ontario" → "Peel Region, Ontario"
    - "anywhere in Canada" → None (too vague)
    - "1766 QC 148, Luskville, QC" → "Luskville, QC" (skips street address)
    """
    if not location:
        return None

    # Canadian provinces (full and abbreviated) - define early for all patterns
    provinces = [
        "Ontario", "ON",
        "Quebec", "QC", "Québec",
        "British Columbia", "BC",
        "Alberta", "AB",
        "Manitoba", "MB",
        "Saskatchewan", "SK",
        "Nova Scotia", "NS",
        "New Brunswick", "NB",
        "Prince Edward Island", "PE", "PEI",
        "Newfoundland and Labrador", "NL",
        "Northwest Territories", "NT",
        "Yukon", "YT",
        "Nunavut", "NU",
    ]

    def is_valid_city_name(text: str) -> bool:
        """Check if text looks like a real city name (not a street address or geographic descriptor).

        This filters out:
        - Generic geographic descriptors (region, area, county, etc.)
        - Regional abbreviations (GTA, Greater Toronto, etc.)
        - Work arrangement descriptors (office, space, etc.)
        - Common sentence fragments that get matched by loose patterns
        - Words that don't start with capital letter (catches IGNORECASE false matches)
        """
        text_lower = text.lower()

        # CRITICAL: Ensure the name actually starts with uppercase letter, not matched by IGNORECASE
        # This prevents "remote" or "anywhere" from matching [A-Z] when using re.IGNORECASE
        if not text or not text[0].isupper():
            return False

        # Filter out geographic descriptors and non-city terms
        # These commonly appear in job postings but aren't actual municipality names
        non_city_terms = [
            'region', 'area', 'watershed', 'zone', 'office', 'space',
            'gta', 'greater', 'metropolis', 'metropolitan', 'county',
            'districts', 'territories', 'province', 'state', 'districts',
            # Common sentence fragments that get matched as cities
            'please', 'note', 'your', 'location', 'anywhere', 'work', 'home',
            'application', 'office', 'onsite', 'person', 'option',
            # Country / credential abbreviations mistaken for municipalities
            # ("US PE license", "UK PE", etc.)
            'us', 'uk', 'usa', 'eu',
            # Country / work-mode words that Pattern 2b otherwise captures
            'canada', 'remote', 'remotely', 'hybrid', 'virtual',
        ]
        if text_lower in non_city_terms:
            return False
        # Reject captures that include a country / work-mode token
        # ("Remote Canada") without blocking compounds like "Peel Region".
        if any(
            w in {"canada", "remote", "remotely", "hybrid", "virtual", "us", "uk", "usa"}
            for w in text_lower.split()
        ):
            return False
        # Sentence fragments / clauses never look like a city. Semicolons are
        # always rejected; periods too — except known place abbreviations such
        # as "St. John's", "Ste. Agathe", "Mt. Pearl", "Ft. McMurray", "Pt.
        # Edward" (abbrev dot followed by a capitalized word).
        if ";" in text:
            return False
        if "." in text:
            residual = re.sub(r"\b(?:St|Ste|Mt|Ft|Pt)\.\s+(?=[A-Z])", "", text)
            if "." in residual:
                return False

        # Province codes/names are not municipalities ("ON, ON", "Nova Scotia, NS").
        # Exception: Quebec / Québec (Quebec City).
        if is_province_like_municipality(text):
            return False

        # Filter out street addresses (purely numeric or starting with numbers)
        if text.isdigit():  # Pure numbers like "1766"
            return False
        if re.match(r'^\d+\s', text):  # Starts with number like "1766 QC 148"
            return False

        # Filter out postal codes (like "J0X2G0")
        if re.match(r'^[A-Z]\d[A-Z]\d[A-Z]\d$', text):
            return False

        return True

    # === LOCATION EXTRACTION STRATEGY ===
    # We use a multi-pattern hierarchy to extract city/province from job description location strings.
    # This handles edge cases while avoiding false positives.
    #
    # GENERAL PRINCIPLES (apply universally to prevent future false positives):
    # 1. Extracted cities must START WITH UPPERCASE LETTER - filters lowercase words like "remote", "anywhere"
    # 2. Province matching uses strict word boundaries for 2-letter codes (\bON\b not ON\b)
    # 3. Character class supports accents (À-ÿ), hyphens, apostrophes for international names
    # 4. Multi-word cities use explicit spacing: (?: +[A-Z]...) to avoid greedy matching
    # 5. All extracted results validated through is_valid_city_name() with comprehensive term filtering
    # 6. Non-city terms list includes common sentence fragments from job postings (please, note, your, etc.)
    # 7. Generic prepositions ('in ', 'at ') avoided - use specific ones (based in, located in, situé à)
    #
    # PATTERN HIERARCHY (most specific to least specific):
    # - Pattern 0: Extract from parentheses (common for street addresses: "City (street address)")
    # - Pattern 0b: Extract from text before parentheses with province validation
    # - Pattern 2: Preposition-based ("based in City, Province", "situé à City, Province")
    # - Pattern 2b: Preposition + city with province verification elsewhere
    # - Pattern 1: Simple "City, Province" or "City, ON" format
    # - Pattern 3: Liberal fallback with multi-word support
    #
    # Examples of edge cases handled by these general principles:
    # - Accented names: Lévis, Québec → capital letter check + accent support
    # - Hyphenated cities: Pointe-Claire, Saint-Jean → hyphen in character class
    # - Multi-word cities: "Saint Jean" → (?: +[A-Z]...) spacing pattern
    # - Remote work: "remote in Peel" → "remote" rejected by capital letter check
    # - Generic descriptors: "Peel Region" → "Region" filtered by non_city_terms
    # - Word boundaries: "application ON" → \bON\b prevents mid-word matches
    # - Sentence fragments: "Please note your location" → all words in non_city_terms list

    # Pattern 0 FIRST: Extract city/province from parentheses (street addresses often in parens)
    # E.g., "(Port Rowan, ON or elsewhere)" or "(5151 de l'Assomption Boulevard)"
    # Look for "City, Province" inside parentheses
    paren_match = re.search(r'\(([^)]+)\)', location)
    if paren_match:
        inside_parens = paren_match.group(1)
        # Try to find "City, Province" inside parentheses
        for province in provinces:
            # City: capital letter + letters/accents/hyphens, can be multiple words separated by spaces
            # NOTE: removed re.IGNORECASE to ensure [A-Z] only matches capital letters
            pattern = rf'\b([A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+(?: +[A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+)*)\s*,?\s*{re.escape(province)}\b'
            match = re.search(pattern, inside_parens)
            if match:
                city = match.group(1).strip()
                if is_valid_city_name(city):
                    return f"{city}, {province}"

    # Pattern 0b: Extract city before parentheses if it's part of "in City (street address)"
    # E.g., "Montreal (5151 de l'Assomption Boulevard)" → "Montreal"
    # Only extract if there's a province mentioned somewhere in the location
    before_paren = re.match(r'([^()]+)', location)
    if before_paren:
        text_before_paren = before_paren.group(1).strip()
        # Look for "City, Province" patterns (most common)
        for province in provinces:
            # City: capital letter + letters/accents/hyphens, can be multiple words separated by spaces
            pattern = rf'\b([A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+(?: +[A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+)*)\s*,?\s*{re.escape(province)}\b'
            match = re.search(pattern, text_before_paren)
            if match:
                city = match.group(1).strip()
                if is_valid_city_name(city):
                    return f"{city}, {province}"

        # If no province before parens, look for just city name + province elsewhere in string
        # Apply stricter rules: must look like real city name (1-2 capitalized words, no "office", "option", etc)
        first_part = text_before_paren.split(',')[0].strip()
        # Only accept if it's something that looks like a real place name (ends the sentence or is clearly separate)
        for province in provinces:
            if re.search(rf'\b{re.escape(province)}\b', location, re.IGNORECASE):
                # Check if first_part looks like it ends near a sentence boundary or colon
                words = first_part.split()
                if len(words) <= 2 and is_valid_city_name(first_part):
                    # Additional check: must NOT be preceded by common location indicators
                    if not any(indicator in text_before_paren.lower() for indicator in ['office', 'option', 'must', 'great', 'within']):
                        return f"{first_part}, {province}"


    # Pattern 2 FIRST: "based in City, Province" or "located in City, Province" (most specific)
    # Includes English and French prepositions
    # NOTE: We deliberately exclude 'in ' and 'at ' prepositions as they cause too many false positives
    # with phrases like "remote in Peel Region" or "work at Toronto". The more specific patterns
    # (based in, located in, situé à, etc.) are sufficient, plus Pattern 1 handles simple "City, Province"
    prepositions = [
        'based in', 'located in', 'headquarters in', 'office in',
        # French prepositions
        'situé à', 'situé au', 'situé en', 'situés à', 'situés au',
        'localisé à', 'localisé au', 'localisés à',
        'basé à', 'basé au', 'basés à',
        'bureau à', 'bureaux à',
    ]
    # Pattern for city names: Capital letter + letters/accents/hyphens, can be multiple words

    for prep in prepositions:
        for province in provinces:
            # More specific: require comma or space before province, and limit to 1-2 word cities
            # For 2-letter abbreviations, require word boundary on BOTH sides to prevent matching inside words
            province_pattern = rf'\b{re.escape(province)}\b' if len(province) == 2 else rf'{re.escape(province)}\b'
            # City: capital letter + letters/accents/hyphens, can be multiple words separated by spaces
            pattern = rf'{re.escape(prep)}\s+([A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+(?: +[A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+)?)\s*,?\s*{province_pattern}'
            match = re.search(pattern, location, re.IGNORECASE)
            if match:
                city = match.group(1).strip()
                if is_valid_city_name(city):
                    return f"{city}, {province}"

    # Pattern 2b: "based in City supporting … Province" within the same sentence.
    # Do not search the rest of a multi-sentence blob for a province.
    _city_1_2 = (
        r"([A-Z][A-Za-zÀ-ÿ\'\-]+(?:\s+[A-Z][A-Za-zÀ-ÿ\'\-]+)?)"
    )

    def _same_sentence(text: str, start: int, end: int) -> str:
        left = 0
        for i in range(start - 1, -1, -1):
            if text[i] in ".!?;":
                left = i + 1
                break
        right = len(text)
        for i in range(end, len(text)):
            if text[i] in ".!?;":
                right = i
                break
        return text[left:right]

    for prep in prepositions:
        # Prep case-insensitive; city capture stays case-sensitive so [A-Z] is real.
        pattern = (
            rf"(?i)(?:{re.escape(prep)})\s+"
            rf"(?-i:{_city_1_2})\b"
            rf"(?:\s+(?i:if|or|and|when|where|supporting|for|with|to|on)\b|\s*[.;,]|\s*$)"
        )
        match = re.search(pattern, location)
        if match:
            city = match.group(1).strip()
            if is_valid_city_name(city):
                # Bound the sentence on the city span — not trailing .;, which would
                # push the window into the next sentence.
                sentence = _same_sentence(location, match.start(), match.end(1))
                for province in provinces:
                    province_pattern = rf"\b{re.escape(province)}\b"
                    if re.search(province_pattern, sentence, re.IGNORECASE):
                        return f"{city}, {province}"

    # Pattern 2c removed: Pattern 2b now covers "based in City supporting … Province"
    # without matching across sentence boundaries.


    # Pattern 1: "City, Province" or "City, ON" (less specific, but limited to 1-2 words)
    for province in provinces:
        # Use non-greedy match limited to 1-2 words to avoid capturing too much
        # Require word boundary before city name to avoid matching mid-word
        # For 2-letter abbreviations, require word boundary on BOTH sides to prevent matching inside words
        # Pattern: Starts with capital, includes letters, hyphens, accents, spaces between words only
        province_pattern = rf'\b{re.escape(province)}\b' if len(province) == 2 else rf'{re.escape(province)}\b'
        # Removed re.IGNORECASE here to ensure [A-Z] only matches uppercase
        pattern = rf'\b([A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+(?: +[A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+)?)\s*,?\s*{province_pattern}'
        match = re.search(pattern, location)
        if match:
            city = match.group(1).strip()
            if is_valid_city_name(city):
                return f"{city}, {province}"

    # Pattern 3: More liberal search (fallback) - but still require capitalized city name
    # to avoid matching random words. Handles accents and hyphens.
    for province in provinces:
        # For 2-letter abbreviations, require word boundary on BOTH sides to prevent matching inside words
        province_pattern = rf'\b{re.escape(province)}\b' if len(province) == 2 else rf'{re.escape(province)}\b'
        # Removed re.IGNORECASE here to ensure [A-Z] only matches uppercase
        pattern = rf'\b([A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+(?: +[A-Z][A-Za-z\u00c0-\u00ff\-\'\.]+)*),?\s*{province_pattern}'
        match = re.search(pattern, location)
        if match:
            city = match.group(1).strip()
            if not any(x in city.lower() for x in ['region', 'area', 'watershed', 'zone', 'office', 'space', 'gta', 'greater', 'lakes']):
                if is_valid_city_name(city):
                    return f"{city}, {province}"

    return None


def infer_location_string_from_text(text: Optional[str]) -> Optional[str]:
    """Infer a geocodeable 'City, Province' string from free text (e.g. job description).

    Strips light HTML/whitespace, then reuses the explicit-location patterns
    (based in / located in / City, ON, etc.).
    """
    if not text or not str(text).strip():
        return None
    cleaned = re.sub(r"(?i)<br\s*/?>", " ", str(text))
    cleaned = re.sub(r"(?i)</p\s*>", " ", cleaned)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None
    # Early body usually has "based in …"; keep enough trailing text for province.
    return _extract_explicit_location(cleaned[:4000])


def _clean_location_for_geocoding(location: str) -> str:
    """
    Clean location string before sending to Geocodio API.
    Removes:
    - "Canada" (redundant, causes false matches)
    - Remote-related words (from REMOTE_INDICATORS)
    - Generic modifiers: "and/or", "in person", "throughout", "anywhere", "various", etc.
    """
    cleaned = location

    # Remove "Canada" (case insensitive, whole word)
    cleaned = re.sub(r'\bcanada\b', '', cleaned, flags=re.IGNORECASE)

    # Remove remote indicator words using existing REMOTE_INDICATORS patterns
    for pattern in REMOTE_INDICATORS:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)

    # Remove generic modifiers that don't represent actual locations
    generic_words = [
        r'\band/or\b', r'\bor\b',              # Separators
        r'\bin person\b', r'\bin-person\b',    # Work arrangement
        r'\bthroughout\b', r'\banywhere\b',    # Vague locations
        r'\bvarious\b', r'\bmultiple\b',       # Multiple locations
        r'\bcities\b', r'\blocation(s)?\b',    # Generic location words
        r'\bwithin\b', r'\baround\b',          # Vague directions
    ]
    for word in generic_words:
        cleaned = re.sub(word, '', cleaned, flags=re.IGNORECASE)

    # Clean up extra whitespace and punctuation
    cleaned = re.sub(r'\s+', ' ', cleaned)  # Multiple spaces to single space
    cleaned = re.sub(r'[,\s–\-]+$', '', cleaned)  # Remove trailing commas/spaces/dashes
    cleaned = re.sub(r'^[,\s–\-]+', '', cleaned)  # Remove leading commas/spaces/dashes
    cleaned = cleaned.strip()

    return cleaned


def _geocode_with_geocodio(location: str, *, allow_us: bool = False) -> Optional[dict]:
    """
    Use Geocodio to parse location.
    Strategy:
    1. Try to extract explicit "City, Province" mention from the text
    2. If that fails, use the cleaned location string
    3. Skip if nothing usable remains
    Ensures at least 1 second between requests (Geocodio free tier allows 2,500/day).
    Results are cached in-memory to avoid redundant API calls for repeated locations.
    """
    global _last_request_time

    cache_key = f"{location}|us={int(allow_us)}"
    # Return cached result if we've seen this location string before
    if cache_key in _geocode_cache:
        cached = _geocode_cache[cache_key]
        if cached:
            print(f"\tGeocoding '{location}'... ✓ (cached)")
        return cached
    # Also check legacy key without us flag for CA-only callers
    if not allow_us and location in _geocode_cache:
        cached = _geocode_cache[location]
        if cached:
            print(f"\tGeocoding '{location}'... ✓ (cached)")
        return cached

    result = _geocode_with_geocodio_uncached(location, allow_us=allow_us)
    _geocode_cache[cache_key] = result
    _geocode_cache[location] = result
    return result


def _geocode_with_geocodio_uncached(location: str, *, allow_us: bool = False) -> Optional[dict]:
    """Internal: perform the actual Geocodio API call without cache."""
    global _last_request_time

    # Ensure at least 1 second has passed since last request
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    try:
        client = _get_geocodio_client()
        if not client:
            return None

        # Strategy 1: Try to extract explicit "City, Province" from the messy location string
        explicit_location = _extract_explicit_location(location)

        if explicit_location:
            # Use the explicit extraction - much more likely to be accurate
            print(f"\tGeocoding '{location}' (extracted: '{explicit_location}')...", end=" ", flush=True)
            location_to_geocode = explicit_location
        else:
            # Strategy 2: Fall back to cleaning the full location string
            cleaned_location = _clean_location_for_geocoding(location)

            # Skip geocoding if cleaned location is empty or too short
            if not cleaned_location or len(cleaned_location.strip()) < 3:
                print("Skipped (location too generic after cleaning)")
                _last_request_time = time.time()
                return None

            if cleaned_location != location:
                print(f"\tGeocoding '{location}' (cleaned: '{cleaned_location}')...", end=" ", flush=True)
            else:
                print(f"\tGeocoding '{location}'...", end=" ", flush=True)
            location_to_geocode = cleaned_location

        # Record start time for this request (for rate limiting)
        request_start = time.time()

        # Normalize "City, Quebec" → "City, QC" before the API call. Geocodio
        # resolves "Montreal, Quebec, Canada" to Quebec City; codes are reliable.
        location_to_geocode = _canonicalize_city_province_query(location_to_geocode)

        # Strip trailing USA marker for the query builder
        us_query = re.sub(r",?\s*USA\s*$", "", location_to_geocode, flags=re.IGNORECASE).strip()
        if allow_us:
            query = us_query
            if not re.search(r"\bUSA\b|\bUnited States\b", query, re.I):
                query = f"{query}, USA"
        else:
            query = (
                location_to_geocode
                if ", Canada" in location_to_geocode
                else f"{location_to_geocode}, Canada"
            )
        response = client.geocode(query)

        # Handle different response structures
        if hasattr(response, "results"):
            results = response.results
        elif isinstance(response, dict) and "results" in response:
            results = response["results"]
        elif isinstance(response, list):
            results = response
        else:
            print("No results (unexpected response structure)")
            _last_request_time = time.time()
            return None

        if not results:
            print("No results")
            _last_request_time = time.time()
            return None

        # Get the first (most accurate) result
        result = results[0]

        # Access address_components using safe getter
        address_components: dict = _safe_get(result, "address_components", {})

        # Validate country
        country = _safe_get(address_components, "country")
        country_code = _safe_get(address_components, "country_code")
        country_u = (country or "").upper()
        code_u = (country_code or "").upper()
        is_ca = country_u in {"CANADA", "CA"} or code_u == "CA"
        is_us = country_u in {"UNITED STATES", "US", "USA"} or code_u == "US"
        if allow_us:
            if country and not (is_ca or is_us):
                print(f"Skipped (unsupported country: {country})")
                _last_request_time = time.time()
                return None
        else:
            if country and not is_ca:
                print(f"Skipped (not Canadian: {country})")
                _last_request_time = time.time()
                return None
            if country_code and code_u != "CA":
                print(f"Skipped (not Canadian: country_code={country_code})")
                _last_request_time = time.time()
                return None

        # Extract municipality (city/town/village) using safe getter
        municipality = (
            _safe_get(address_components, "city")
            or _safe_get(address_components, "town")
            or _safe_get(address_components, "village")
        )

        # Geocodio REST uses "state"; the geocodio Python client maps it to
        # "state_province". Accept all three so dict mocks and live clients work.
        province_raw = (
            _safe_get(address_components, "state")
            or _safe_get(address_components, "state_province")
            or _safe_get(address_components, "province")
        )
        province = _normalize_ca_province_code(province_raw)
        if not province and allow_us and is_us and province_raw:
            # Keep US state abbreviation as-is
            prov_token = str(province_raw).strip().upper()
            if re.fullmatch(r"[A-Z]{2}", prov_token):
                province = prov_token


        # Never persist province codes/names as municipality ("ON"/"NS"/…).
        # Quebec/Québec is allowed (Quebec City).
        if is_province_like_municipality(municipality):
            municipality = None

        # Ensure total time (including API call) is at least 1 second
        request_duration = time.time() - request_start
        if request_duration < 1.0:
            time.sleep(1.0 - request_duration)

        _last_request_time = time.time()

        # Extract lat/lng from location field
        location_data = _safe_get(result, "location", {})
        lat = _safe_get(location_data, "lat") if location_data else None
        lng = _safe_get(location_data, "lng") if location_data else None

        # Extract accuracy_type
        geocode_accuracy_type = _safe_get(result, "accuracy_type")

        if municipality or province:
            result_str = f"municipality={municipality}, province={province}, lat={lat}, lng={lng}, accuracy_type={geocode_accuracy_type}"
            print(f"✓ ({result_str})")
            return {
                "municipality": municipality,
                "province": province,
                "lat": lat,
                "lng": lng,
                "geocode_accuracy_type": geocode_accuracy_type,
            }

        print("No municipality/province found")
        return None

    except Exception as e:
        print(f"✗ Error: {type(e).__name__}: {e}")
        # Debug: print more details about the error
        if "get" in str(e).lower() or "AttributeError" in str(type(e).__name__):
            print(f"\tDebug: address_components type: {type(address_components) if 'address_components' in locals() else 'N/A'}")
        _last_request_time = time.time()
        return None
