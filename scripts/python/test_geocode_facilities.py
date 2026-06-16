import pytest

from geocode_facilities import (
    component_city_candidates,
    extract_city_from_formatted_address,
    normalize_city,
    resolve_verified_city,
)


MUMBAI_COMPONENTS = [
    {"long_name": "W", "short_name": "W", "types": ["locality", "political"]},
    {"long_name": "Mumbai", "short_name": "Mumbai", "types": ["administrative_area_level_2", "political"]},
    {"long_name": "Maharashtra", "short_name": "MH", "types": ["administrative_area_level_1", "political"]},
    {"long_name": "400028", "short_name": "400028", "types": ["postal_code"]},
    {"long_name": "IN", "short_name": "IN", "types": ["country", "political"]},
]

MUMBAI_FORMATTED = (
    "N.C.Kelkar Marg, R.G. Gadkari Chowk, Shivaji Park, Kasaravadi, "
    "Dadar, W, Mumbai, Maharashtra 400028, India"
)

CHANDIGARH_COMPONENTS = [
    {"long_name": "D", "short_name": "D", "types": ["locality", "political"]},
    {"long_name": "Chandigarh", "short_name": "CH", "types": ["administrative_area_level_1", "political"]},
    {"long_name": "160015", "short_name": "160015", "types": ["postal_code"]},
    {"long_name": "IN", "short_name": "IN", "types": ["country", "political"]},
]

CHANDIGARH_FORMATTED = "45, Sector 16 D, Sector 16, D, Chandigarh, 160015, India"


def test_normalize_city_rejects_single_letter():
    assert normalize_city("W") is None
    assert normalize_city("D") is None
    assert normalize_city("Mumbai") == "Mumbai"


def test_component_city_candidates_skips_invalid_locality():
    candidates = component_city_candidates(MUMBAI_COMPONENTS)
    assert "W" in candidates
    assert "Mumbai" in candidates


def test_extract_mumbai_from_formatted_address():
    city = extract_city_from_formatted_address(MUMBAI_FORMATTED, state="Maharashtra", country_code="IN")
    assert city == "Mumbai"


def test_extract_chandigarh_from_formatted_address():
    city = extract_city_from_formatted_address(CHANDIGARH_FORMATTED, state="Chandigarh", country_code="IN")
    assert city == "Chandigarh"


def test_resolve_mumbai_when_locality_is_zone_suffix():
    city = resolve_verified_city(
        components=MUMBAI_COMPONENTS,
        formatted_address=MUMBAI_FORMATTED,
        state="Maharashtra",
        country_code="IN",
        raw_city="Mumbai",
    )
    assert city == "Mumbai"


def test_resolve_mumbai_prefers_formatted_over_konkan_division():
    components = MUMBAI_COMPONENTS + [
        {
            "long_name": "Konkan Division",
            "short_name": "Konkan Division",
            "types": ["administrative_area_level_2", "political"],
        },
    ]
    city = resolve_verified_city(
        components=components,
        formatted_address=MUMBAI_FORMATTED,
        state="Maharashtra",
        country_code="IN",
        raw_city="Mumbai",
    )
    assert city == "Mumbai"


def test_resolve_chandigarh_when_locality_is_sector_suffix():
    city = resolve_verified_city(
        components=CHANDIGARH_COMPONENTS,
        formatted_address=CHANDIGARH_FORMATTED,
        state="Chandigarh",
        country_code="IN",
        raw_city="Chandigarh",
    )
    assert city == "Chandigarh"


def test_resolve_chandigarh_prefers_formatted_over_sector_sublocality():
    components = CHANDIGARH_COMPONENTS + [
        {
            "long_name": "Sector 16",
            "short_name": "Sector 16",
            "types": ["sublocality_level_1", "political"],
        },
    ]
    city = resolve_verified_city(
        components=components,
        formatted_address=CHANDIGARH_FORMATTED,
        state="Chandigarh",
        country_code="IN",
        raw_city="Chandigarh",
    )
    assert city == "Chandigarh"


def test_resolve_falls_back_to_raw_city():
    city = resolve_verified_city(
        components=[{"long_name": "X", "short_name": "X", "types": ["locality"]}],
        formatted_address="X, 000000, India",
        state=None,
        country_code="IN",
        raw_city="Pune",
    )
    assert city == "Pune"
