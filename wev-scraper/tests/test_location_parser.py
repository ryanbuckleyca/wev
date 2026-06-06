import pytest
from unittest.mock import MagicMock, patch
from utils.location_parser import (
    is_remote_location,
    is_hybrid_location,
    determine_work_type,
    _extract_explicit_location,
    _clean_location_for_geocoding,
    parse_address_with_geocodio
)

def test_is_remote_location():
    assert is_remote_location("Remote") is True
    assert is_remote_location("Télétravail") is True
    assert is_remote_location("Toronto, ON") is False
    assert is_remote_location(None) is False
    assert is_remote_location("   ") is False
    assert is_remote_location("Remote-only") is True
    assert is_remote_location("Work from home") is True

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

    # False positives / vague
    assert _extract_explicit_location("anywhere in Canada") is None
    assert _extract_explicit_location("Remote") is None
    assert _extract_explicit_location("Peel Region, Ontario") == "Peel Region, Ontario"

def test_clean_location_for_geocoding():
    assert _clean_location_for_geocoding("Toronto, ON, Canada") == "Toronto, ON"
    assert _clean_location_for_geocoding("Remote - Toronto") == "Toronto"
    assert _clean_location_for_geocoding("Hybrid in person at Toronto") == "Hybrid at Toronto"
    assert _clean_location_for_geocoding("Various locations in Ontario") == "in Ontario"
    assert _clean_location_for_geocoding("   Toronto   ") == "Toronto"

def test_parse_address_with_geocodio_remote_only():
    # Should skip geocoding if remote-only and no explicit location
    with patch('utils.location_parser._get_geocodio_client') as mock_client:
        result = parse_address_with_geocodio("Remote")
        assert result["municipality"] is None
        mock_client.assert_not_called()

@patch('utils.location_parser._geocode_with_geocodio')
def test_parse_address_with_geocodio_calls_geocoder(mock_geocode):
    mock_geocode.return_value = {"municipality": "Toronto", "province": "ON", "lat": 43.65, "lng": -79.38, "geocode_accuracy_type": "rooftop"}
    result = parse_address_with_geocodio("Toronto, ON")
    assert result["municipality"] == "Toronto"
    assert result["lat"] == 43.65
    mock_geocode.assert_called_with("Toronto, ON")

def test_parse_address_with_geocodio_empty():
    result = parse_address_with_geocodio("")
    assert result["municipality"] is None
    result = parse_address_with_geocodio(None)
    assert result["municipality"] is None
