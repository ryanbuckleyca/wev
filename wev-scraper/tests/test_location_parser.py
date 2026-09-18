from unittest.mock import MagicMock, patch

from utils.location_parser import (
    _clean_location_for_geocoding,
    _extract_explicit_location,
    determine_work_type,
    is_hybrid_location,
    is_remote_location,
    parse_address_with_geocodio,
)


def test_normalize_ca_province_code_french_and_abbrev():
    from utils.location_parser import _normalize_ca_province_code

    assert _normalize_ca_province_code("Nouveau-Brunswick") == "NB"
    assert _normalize_ca_province_code("Colombie-Britannique") == "BC"
    assert _normalize_ca_province_code("Terre-Neuve-et-Labrador") == "NL"
    assert _normalize_ca_province_code("Nfld") == "NL"
    assert _normalize_ca_province_code("P.E.I.") == "PE"
    assert _normalize_ca_province_code("Nouvelle-Écosse") == "NS"


def test_is_remote_location():
    assert is_remote_location("Remote") is True
    assert is_remote_location("Télétravail") is True
    assert is_remote_location("Toronto, ON") is False
    assert is_remote_location(None) is False
    assert is_remote_location("   ") is False
    assert is_remote_location("Remote-only") is True
    assert is_remote_location("Work from home") is True


def test_normalize_messy_location_and_aliases():
    from utils.location_parser import (
        apply_location_alias,
        is_country_only_location,
        is_province_only_location,
        normalize_messy_location,
    )

    assert normalize_messy_location("CalgaryCalgary") == "Calgary"
    assert normalize_messy_location("EloraEloraElora") == "Elora"
    assert normalize_messy_location("Canada +") == "Canada"
    assert normalize_messy_location("Ontario, Canada +") == "Ontario, Canada"
    assert "Sainte-" in normalize_messy_location("Ste-Adèle")
    assert normalize_messy_location("Whitchurch–Stouffville") == "Whitchurch-Stouffville"

    assert apply_location_alias("Jane & Eglinton West") == "Toronto, ON"
    assert apply_location_alias("Ste-Adèle") == "Sainte-Adèle, QC"
    assert apply_location_alias("Valleyfield") == "Salaberry-de-Valleyfield, QC"
    assert apply_location_alias("Saanich, BC").startswith("Saanich,")
    assert apply_location_alias("Saanich BC").startswith("Saanich,")
    assert apply_location_alias("Ladner").startswith("Ladner,")
    assert apply_location_alias("Ladner BC").startswith("Ladner,")
    assert apply_location_alias("Montréal and surrounding area") == "Montreal, QC"
    assert apply_location_alias(
        "National Capital Region, occasional travel required within Ontario"
    ) == "Ottawa, ON"

    assert is_province_only_location("Ontario, Canada +") is True
    assert is_province_only_location("Ontario, Canada, CA") is True
    assert is_province_only_location("Must be based in Ontario.") is True
    assert is_province_only_location("across Newfoundland and Labrador") is True
    assert is_country_only_location("Canada +") is True


def test_parse_province_only_canada_ca_and_saanich_alias():
    """Ontario,Canada,CA gets ON centroid; Saanich/Ladner must not become Buick."""
    from utils.location_parser import parse_address_with_geocodio

    on = parse_address_with_geocodio("Ontario, Canada, CA")
    assert on.get("province") == "ON"
    assert on.get("municipality") is None
    assert on.get("geocode_accuracy_type") == "state"
    assert on.get("lat") is not None

    # Geocodio historically returns Buick for bare Saanich/Ladner; aliases must
    # override the city name while keeping the anchored coords.
    fake = {
        "municipality": "Buick",
        "province": "BC",
        "lat": 48.456869,
        "lng": -123.471898,
        "geocode_accuracy_type": "place",
    }
    with patch("utils.location_parser._geocode_with_geocodio", return_value=dict(fake)):
        saanich = parse_address_with_geocodio("Saanich BC")
        ladner = parse_address_with_geocodio("Ladner BC")
    assert saanich.get("municipality") == "Saanich"
    assert saanich.get("province") == "BC"
    assert saanich.get("lat") == fake["lat"]
    assert ladner.get("municipality") == "Ladner"
    assert ladner.get("province") == "BC"


def test_is_remote_home_office_canada_wide():
    assert is_remote_location(
        "Home office (Canada-wide; priority given to candidates with a presence in British Columbia)"
    ) is True



def test_is_province_only_location():
    from utils.location_parser import is_province_only_location

    assert is_province_only_location("ON") is True
    assert is_province_only_location("Ontario") is True
    assert is_province_only_location("Ontario, Canada") is True
    assert is_province_only_location("NS, CA") is True
    assert is_province_only_location("Newfoundland and Labrador") is True
    assert is_province_only_location("Toronto, ON") is False
    assert is_province_only_location("Remote") is False
    # Quebec City is a real municipality name
    assert is_province_only_location("Quebec") is False
    assert is_province_only_location("Québec") is False


def test_geo_row_needs_city_geocode():
    from utils.location_parser import geo_row_needs_city_geocode

    # Remote-only: never needs city geocode
    assert (
        geo_row_needs_city_geocode(
            {"location": "Remote from anywhere in Canada", "municipality": None}
        )
        is False
    )
    # Province-only with province+coords filled: complete
    assert (
        geo_row_needs_city_geocode(
            {
                "location": "Ontario, Canada",
                "municipality": None,
                "province": "ON",
                "lat": 50.4,
                "lng": -86.0,
                "geocode_accuracy_type": "state",
            }
        )
        is False
    )
    # Province-only with province set but no coords: still complete (Geocodio skips these)
    assert (
        geo_row_needs_city_geocode(
            {
                "location": "ON",
                "municipality": None,
                "province": "ON",
                "lat": None,
                "lng": None,
                "geocode_accuracy_type": None,
            }
        )
        is False
    )
    # Province-only missing province code: needs fill
    assert (
        geo_row_needs_city_geocode(
            {
                "location": "Ontario",
                "municipality": None,
                "province": None,
                "lat": None,
                "lng": None,
                "geocode_accuracy_type": None,
            }
        )
        is True
    )
    # Normal city incomplete
    assert (
        geo_row_needs_city_geocode(
            {
                "location": "Toronto, ON",
                "municipality": "Toronto",
                "province": "ON",
                "lat": None,
                "lng": None,
                "geocode_accuracy_type": None,
            }
        )
        is True
    )

def test_is_hybrid_location():
    assert is_hybrid_location("Hybrid") is True
    assert is_hybrid_location("Flexible") is True
    assert is_hybrid_location("Toronto, ON") is False
    assert is_hybrid_location(None) is False
    assert is_hybrid_location("Remote and office") is True

def test_determine_work_type():
    # Hybrid keywords
    assert determine_work_type("Hybrid") == "hybrid"

    # Remote + specific location (city mentioned)
    assert determine_work_type("Remote", municipality="Toronto", province="ON") == "hybrid"

    # Remote + province only
    assert determine_work_type("Remote in Ontario", province="ON") == "remote"

    # Remote + no specific location
    assert determine_work_type("Remote") == "remote"

    # Office
    assert determine_work_type("Toronto, ON", municipality="Toronto") == "office"
    assert determine_work_type(None) == "office"

def test_extract_explicit_location_rejects_province_as_city():
    """Province-only strings must not become 'ON, ON' / 'Nova Scotia, Nova Scotia'."""
    assert _extract_explicit_location("ON") is None
    assert _extract_explicit_location("NB") is None
    assert _extract_explicit_location("NS") is None
    assert _extract_explicit_location("Nova Scotia") is None
    assert _extract_explicit_location("Ontario") is None
    assert _extract_explicit_location("Manitoba") is None
    # Quebec City is a real municipality name
    assert _extract_explicit_location("Québec, QC") == "Québec, QC"
    assert _extract_explicit_location("Quebec, QC") == "Quebec, QC"


def test_is_province_like_municipality():
    from utils.location_parser import is_province_like_municipality

    assert is_province_like_municipality("ON") is True
    assert is_province_like_municipality("NB") is True
    assert is_province_like_municipality("Ontario") is True
    assert is_province_like_municipality("Nova Scotia") is True
    assert is_province_like_municipality("SK") is True
    assert is_province_like_municipality("Quebec") is False
    assert is_province_like_municipality("Québec") is False
    assert is_province_like_municipality("Montreal") is False
    assert is_province_like_municipality(None) is False


def test_canonicalize_city_province_query():
    from utils.location_parser import _canonicalize_city_province_query

    assert _canonicalize_city_province_query("Montreal, Quebec") == "Montreal, QC"
    assert _canonicalize_city_province_query("Toronto, Ontario") == "Toronto, ON"
    assert _canonicalize_city_province_query("Halifax, Nova Scotia") == "Halifax, NS"
    assert _canonicalize_city_province_query("ON, ON") == "ON"
    assert _canonicalize_city_province_query("Nova Scotia, Nova Scotia") == "NS"
    assert _canonicalize_city_province_query("Ontario") == "ON"


@patch('utils.location_parser._get_geocodio_client')
def test_geocode_uses_province_codes_not_full_names(mock_get_client):
    """Geocodio mis-resolves 'Montreal, Quebec' to Quebec City; we must send QC."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    mock_result = {
        "address_components": {"city": "Montreal", "state": "QC", "country": "Canada"},
        "location": {"lat": 45.5, "lng": -73.6},
        "accuracy_type": "place",
    }
    mock_client.geocode.return_value = {"results": [mock_result]}

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("Montreal, Quebec")
    assert result["municipality"] == "Montreal"
    assert result["province"] == "QC"
    mock_client.geocode.assert_called_with("Montreal, QC, Canada")


@patch('utils.location_parser._get_geocodio_client')
def test_geocode_strips_province_code_as_municipality(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    mock_result = {
        "address_components": {"city": "ON", "state": "ON", "country": "Canada"},
        "location": {"lat": 50.0, "lng": -86.0},
        "accuracy_type": "state",
    }
    mock_client.geocode.return_value = {"results": [mock_result]}

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("Toronto, ON")
    assert result["municipality"] is None
    assert result["province"] == "ON"


def test_extract_explicit_location():
    # City, Province
    assert _extract_explicit_location("Toronto, ON") == "Toronto, ON"
    assert _extract_explicit_location("Montreal, Quebec") == "Montreal, Quebec"

    # Prepositions
    assert _extract_explicit_location("based in Halifax, Nova Scotia") == "Halifax, Nova Scotia"
    assert _extract_explicit_location("situé à Lévis, QC") == "Lévis, QC"

    # Parentheses
    # Pattern 0 matches inside parentheses
    assert _extract_explicit_location("Working from (Port Rowan, ON)") == "Port Rowan, ON"

    # Pattern 0b matches before parentheses if province exists
    assert _extract_explicit_location("Montreal (5151 de l'Assomption Boulevard), QC") == "Montreal, QC"

    # Complex cases
    assert _extract_explicit_location("Hybrid – based in Halifax, Nova Scotia") == "Halifax, Nova Scotia"

    # Accents and hyphens
    assert _extract_explicit_location("Saint-Jean-sur-Richelieu, QC") == "Saint-Jean-sur-Richelieu, QC"
    assert _extract_explicit_location("Pointe-Claire, Québec") == "Pointe-Claire, Québec"

    # Prepositions (French)
    assert _extract_explicit_location("situé à Montréal, QC") == "Montréal, QC"
    assert _extract_explicit_location("basé à Québec, QC") == "Québec, QC"

    # False positives / vague
    assert _extract_explicit_location("anywhere in Canada") is None
    assert _extract_explicit_location("Remote") is None
    assert _extract_explicit_location("Peel Region, Ontario") == "Peel Region, Ontario"

def test_extract_explicit_location_parentheses():
    assert _extract_explicit_location("Montreal (5151 de l'Assomption Boulevard), QC") == "Montreal, QC"
    assert _extract_explicit_location("Toronto (Downtown), ON") == "Toronto, ON"
    assert _extract_explicit_location("Working from (Port Rowan, ON)") == "Port Rowan, ON"

def test_extract_explicit_location_no_province_suffix():
    # Test Pattern 2b: preposition + city + (if/or/...) and province exists elsewhere
    assert _extract_explicit_location("office in Ottawa if desired, Ontario") == "Ottawa, Ontario"
    assert _extract_explicit_location("based in Vancouver or anywhere in BC") == "Vancouver, BC"
    assert (
        _extract_explicit_location(
            "Role based in Hamilton supporting projects across Ontario."
        )
        == "Hamilton, Ontario"
    )


def test_extract_explicit_location_rejects_sentence_spanning_junk():
    assert (
        _extract_explicit_location(
            "This position is based in Canada. We work with partners across Ontario."
        )
        is None
    )
    assert (
        _extract_explicit_location(
            "We are based in Remote Canada; team members live in Nova Scotia and Ontario."
        )
        is None
    )
    # Valid city must still not adopt a province from a later sentence.
    assert (
        _extract_explicit_location(
            "This position is based in Calgary. We work with partners across Ontario."
        )
        is None
    )
    assert (
        _extract_explicit_location(
            "Role based in Hamilton supporting projects across Ontario."
        )
        == "Hamilton, Ontario"
    )
    assert (
        _extract_explicit_location(
            "Based in Hamilton supporting projects across Ontario."
        )
        == "Hamilton, Ontario"
    )


def test_extract_explicit_location_ignores_us_pe_license():
    assert _extract_explicit_location("P.Eng. license is required.US PE license may be required") is None
    assert _extract_explicit_location("US PE license may be required") is None


def test_is_valid_city_name():
    from utils.location_parser import _extract_explicit_location
    # This is internal, but we can test it via _extract_explicit_location if we find patterns
    assert _extract_explicit_location("Remote in Toronto, ON") == "Toronto, ON"
    # "remote" (lowercase) shouldn't be extracted as a city even if it's before a province
    assert _extract_explicit_location("remote, ON") is None

def test_clean_location_for_geocoding():
    assert _clean_location_for_geocoding("Toronto, ON, Canada") == "Toronto, ON"
    assert _clean_location_for_geocoding("Remote - Toronto") == "Toronto"
    assert _clean_location_for_geocoding("Hybrid in person at Toronto") == "Hybrid at Toronto"
    assert _clean_location_for_geocoding("Various locations in Ontario") == "in Ontario"
    assert _clean_location_for_geocoding("Work from home in Montreal") == "in Montreal"

def test_parse_address_with_geocodio_remote_only():
    # Should skip geocoding if remote-only and no explicit location
    with patch('utils.location_parser._get_geocodio_client') as mock_client:
        result = parse_address_with_geocodio("Remote")
        assert result["municipality"] is None
        mock_client.assert_not_called()

@patch('utils.location_parser._geocode_with_geocodio_uncached')
def test_parse_address_with_geocodio_caching(mock_geocode):
    mock_geocode.return_value = {"municipality": "Toronto", "province": "ON"}

    # First call
    parse_address_with_geocodio("Toronto, ON")
    # Second call (should be cached)
    parse_address_with_geocodio("Toronto, ON")

    assert mock_geocode.call_count == 1

@patch('utils.location_parser._get_geocodio_client')
def test_geocode_with_geocodio_uncached_success(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    # Mock response
    mock_result = {
        "address_components": {"city": "Toronto", "state": "ON", "country": "Canada"},
        "location": {"lat": 43.65, "lng": -79.38},
        "accuracy_type": "rooftop"
    }
    mock_client.geocode.return_value = {"results": [mock_result]}

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("Toronto, ON")

    assert result["municipality"] == "Toronto"
    assert result["province"] == "ON"
    assert result["lat"] == 43.65


@patch('utils.location_parser._get_geocodio_client')
def test_geocode_normalizes_full_province_name(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_result = {
        "address_components": {
            "city": "Montreal",
            "state": "Quebec",
            "country": "Canada",
        },
        "location": {"lat": 45.5, "lng": -73.6},
        "accuracy_type": "place",
    }
    mock_client.geocode.return_value = {"results": [mock_result]}

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("Montreal, Quebec")
    assert result["municipality"] == "Montreal"
    assert result["province"] == "QC"


@patch('utils.location_parser._get_geocodio_client')
def test_geocode_reads_state_province_from_client_model(mock_get_client):
    """geocodio Python client uses AddressComponents.state_province, not state."""
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    ac = MagicMock()
    ac.city = "Boucherville"
    ac.town = None
    ac.village = None
    ac.state = None
    ac.province = None
    ac.state_province = "QC"
    ac.country = "CA"
    ac.country_code = None

    result_obj = MagicMock()
    result_obj.address_components = ac
    result_obj.location = MagicMock(lat=45.59, lng=-73.41)
    result_obj.accuracy_type = "place"

    response = MagicMock()
    response.results = [result_obj]
    mock_client.geocode.return_value = response

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("Boucherville")
    assert result["municipality"] == "Boucherville"
    assert result["province"] == "QC"


@patch('utils.location_parser._get_geocodio_client')
def test_geocode_with_geocodio_uncached_non_canadian(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_result = {
        "address_components": {"city": "New York", "state": "NY", "country": "US"},
        "location": {"lat": 40.71, "lng": -74.00},
        "accuracy_type": "rooftop"
    }
    mock_client.geocode.return_value = {"results": [mock_result]}

    from utils.location_parser import _geocode_with_geocodio_uncached
    result = _geocode_with_geocodio_uncached("New York, NY")
    assert result is None
