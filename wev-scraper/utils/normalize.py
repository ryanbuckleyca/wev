"""
Data normalization utilities for standardizing scraped job data.
"""

import re
from typing import Optional

from dateutil import parser

from utils.env import is_truthy_env
from utils.location_parser import determine_work_type, parse_address_with_geocodio
from utils.log import scraper_log
from utils.municipality_canonical import canonicalize_municipality


def normalize_text(text: Optional[str]) -> Optional[str]:
    """Normalize text fields."""
    if not text:
        return None
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
    text = ' '.join(text.split())
    text = text.strip()
    return text if text else None


def normalize_date(date_str: Optional[str]) -> Optional[str]:
    """Normalize date strings to ISO format (YYYY-MM-DD)."""
    if not date_str:
        return None
    try:
        parsed_date = parser.parse(date_str)
        return parsed_date.date().isoformat()
    except (ValueError, TypeError) as e:
        print(f"\tNotice: Could not parse date '{date_str}': {e}")
        return None


def normalize_organization(org: Optional[str]) -> Optional[str]:
    """Normalize organization names."""
    if not org:
        return None
    return normalize_text(org)


def normalize_employment_type(emp_type: Optional[str]) -> Optional[str]:
    """Normalize employment type to standard values. Returns None when unknown."""
    if not emp_type:
        return None
    emp_type = normalize_text(emp_type)
    if not emp_type:
        return None
    emp_type_lower = emp_type.lower()
    type_mapping = {
        "volunteer": "volunteer", "volunteering": "volunteer",
        "intern": "internship", "internship": "internship",
        "contract": "contract", "contractor": "contract",
        "temporary": "temporary", "temp": "temporary",
        "seasonal": "seasonal",
        "casual": "casual",
        "part-time": "part-time", "part time": "part-time",
        "full-time": "full-time", "full time": "full-time",
    }
    for key, value in type_mapping.items():
        if key in emp_type_lower:
            return value
    return None


def normalize_wage(wage: Optional[str]) -> Optional[str]:
    """Basic wage normalization."""
    if not wage:
        return None
    wage = normalize_text(wage)
    if not wage:
        return None
    # Strip common leading labels like "Compensation:" or "Salary:"
    lowered = wage.lower()
    for label in ("compensation:", "salary:", "wage:", "pay:"):
        if lowered.startswith(label):
            wage = wage.split(":", 1)[-1].strip()
            break
    return wage or None


def normalize_job_data(job_data: dict) -> dict:
    """
    Normalize all fields in a job data dictionary.
    Location parsing happens here using Geocodio (with 1 second rate limiting).
    """
    normalized = {}
    normalized["job_title"] = normalize_text(job_data.get("job_title"))
    normalized["organization"] = normalize_organization(job_data.get("organization"))
    normalized["location"] = normalize_text(job_data.get("location"))
    
    # Parse location (Geocodio call with rate limiting)
    location = normalized["location"]
    existing_municipality = job_data.get("municipality")
    existing_province = job_data.get("province")
    existing_is_remote = job_data.get("is_remote")
    existing_work_type = job_data.get("work_type")
    
    should_geocode = is_truthy_env("SHOULD_GEOCODE")
    should_re_geocode = is_truthy_env("SHOULD_RE_GEOCODE")
    reuse_existing_location = (
        (not should_geocode)
        or (
            not should_re_geocode
            and existing_municipality
            and existing_province
        )
    )
    
    if reuse_existing_location:
        if not should_geocode:
            # Only log this once per run to avoid spam
            if not hasattr(normalize_job_data, '_geocode_disabled_logged'):
                scraper_log("\tGeocoding: disabled (SHOULD_GEOCODE=0)")
                normalize_job_data._geocode_disabled_logged = True
        normalized["municipality"] = existing_municipality
        normalized["province"] = existing_province
        normalized["lat"] = job_data.get("lat")
        normalized["lng"] = job_data.get("lng")
        normalized["geocode_accuracy_type"] = job_data.get("geocode_accuracy_type")
    else:
        address = parse_address_with_geocodio(location)
        normalized["municipality"] = address.get("municipality")
        normalized["province"] = address.get("province")
        normalized["lat"] = address.get("lat")
        normalized["lng"] = address.get("lng")
        normalized["geocode_accuracy_type"] = address.get("geocode_accuracy_type")

    normalized["municipality"] = canonicalize_municipality(
        normalized["municipality"],
        normalized["province"],
    )

    if existing_work_type:
        normalized["work_type"] = existing_work_type
    else:
        normalized["work_type"] = determine_work_type(
            location,
            normalized["municipality"],
            normalized["province"],
        )
    
    if reuse_existing_location and existing_is_remote is not None:
        normalized["is_remote"] = existing_is_remote
    else:
        normalized["is_remote"] = (normalized["work_type"] == "remote")
    
    normalized["date_posted"] = normalize_date(job_data.get("date_posted"))
    normalized["close_date"] = normalize_date(job_data.get("close_date"))
    employment_type = normalize_employment_type(job_data.get("employment_type"))
    if not employment_type:
        wage_text = job_data.get("wage")
        title_text = job_data.get("job_title")
        desc_text = job_data.get("description")
        title_lower = str(title_text).lower() if title_text else ""
        desc_lower = str(desc_text).lower() if desc_text else ""
        wage_lower = str(wage_text).lower() if wage_text else ""
        if "volunteer" in wage_lower or "volunteer" in title_lower or "volunteer" in desc_lower:
            employment_type = "volunteer"
    normalized["employment_type"] = employment_type
    normalized["wage"] = normalize_wage(job_data.get("wage"))
    normalized["description"] = normalize_text(job_data.get("description")) or ""
    normalized["summary"] = normalize_text(job_data.get("summary")) or None
    normalized["listing_url"] = normalize_text(job_data.get("listing_url"))
    return normalized
