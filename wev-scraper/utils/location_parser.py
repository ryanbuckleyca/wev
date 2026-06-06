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
]

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
    # If it's remote-only with no explicit location, skip geocoding entirely.
    try:
        if is_remote_location(location):
            explicit_location = _extract_explicit_location(location)
            if not explicit_location:
                logger.debug("Skipped geocoding (remote-only location)")
                return _empty
    except Exception:
        # Fall through to normal geocoding if checks fail
        pass

    try:
        result = _geocode_with_geocodio(location.strip())
        return result if result else _empty
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
        ]
        if text_lower in non_city_terms:
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

    # Pattern 2b: "in/at/headquarter_in City" followed by non-province words, but province exists explicitly
    # E.g., "office in Ottawa if desired" - only return if a province is also mentioned
    # This avoids false positives where we extract a city but no province is stated
    for prep in prepositions:
        # Match: preposition + city (allowing accents, hyphens) + (non-province word or end)
        # Use flexible city pattern that handles French names
        pattern = rf'{re.escape(prep)}\s*([A-Z][A-Za-zÀ-ÿ\-\'\.\ ]+?)\s+(?:if|or|and|when|where|$)'
        match = re.search(pattern, location, re.IGNORECASE)
        if match:
            city = match.group(1).strip()
            if is_valid_city_name(city):
                # Only return if a province is explicitly mentioned in the full location
                for province in provinces:
                    # Use strict word boundaries for 2-letter abbreviations
                    province_pattern = rf'\b{re.escape(province)}\b' if len(province) == 2 else rf'\b{re.escape(province)}\b'
                    if re.search(province_pattern, location, re.IGNORECASE):
                        return f"{city}, {province}"
                # If no province found in location string, don't guess - skip this extraction


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


def _geocode_with_geocodio(location: str) -> Optional[dict]:
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

    # Return cached result if we've seen this location string before
    if location in _geocode_cache:
        cached = _geocode_cache[location]
        if cached:
            print(f"\tGeocoding '{location}'... ✓ (cached)")
        return cached

    result = _geocode_with_geocodio_uncached(location)
    _geocode_cache[location] = result
    return result


def _geocode_with_geocodio_uncached(location: str) -> Optional[dict]:
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

        # Use the location (either explicit or cleaned) for geocoding
        # Add ", Canada" back to help with country detection and avoid US matches
        query = location_to_geocode if ", Canada" in location_to_geocode else f"{location_to_geocode}, Canada"
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

        # Validate that this is a Canadian address (reject US addresses)
        country = _safe_get(address_components, "country")
        country_code = _safe_get(address_components, "country_code")
        if country and country.upper() not in ["CANADA", "CA"]:
            print(f"Skipped (not Canadian: {country})")
            _last_request_time = time.time()
            return None
        if country_code and country_code.upper() != "CA":
            print(f"Skipped (not Canadian: country_code={country_code})")
            _last_request_time = time.time()
            return None

        # Extract municipality (city/town/village) using safe getter
        municipality = (
            _safe_get(address_components, "city")
            or _safe_get(address_components, "town")
            or _safe_get(address_components, "village")
        )

        # Extract province (state code for Canadian addresses)
        # Geocodio returns 2-letter province codes for Canada (ON, QC, BC, etc.)
        province = _safe_get(address_components, "state")
        if province:
            # Ensure uppercase 2-letter code
            province = province.upper()[:2] if len(province) > 2 else province.upper()

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
