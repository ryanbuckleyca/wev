"""Tests for organization headquarters location backfill helpers."""

from scripts.backfill_org_locations import _build_location_update_fields


def test_build_location_update_fields_does_not_wipe_existing_coordinates():
    org = {
        "municipality": None,
        "province": "ON",
        "lat": 43.6532,
        "lng": -79.3832,
        "geocode_accuracy_type": "city",
    }

    payload = _build_location_update_fields(
        org,
        municipality="Ottawa",
        province="ON",
        geo_data={
            "municipality": None,
            "province": None,
            "lat": None,
            "lng": None,
            "geocode_accuracy_type": None,
        },
    )

    assert payload == {"municipality": "Ottawa"}


def test_build_location_update_fields_fills_only_missing_non_null_values():
    org = {
        "municipality": None,
        "province": None,
        "lat": None,
        "lng": None,
        "geocode_accuracy_type": None,
    }

    payload = _build_location_update_fields(
        org,
        municipality="Ottawa",
        province="ON",
        geo_data={
            "municipality": "Ottawa",
            "province": "ON",
            "lat": 45.4215,
            "lng": -75.6972,
            "geocode_accuracy_type": "city",
        },
    )

    assert payload == {
        "municipality": "Ottawa",
        "province": "ON",
        "lat": 45.4215,
        "lng": -75.6972,
        "geocode_accuracy_type": "city",
    }
