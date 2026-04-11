#!/usr/bin/env python
"""Test LLM location extraction with sample jobs."""

import os
import sys
# Ensure project root is on sys.path so `utils` is importable when running scripts directly
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.llm_location_extractor import extract_locations_for_jobs

# Test with all problematic examples including the new ones found
test_jobs = [
    {"location": "Port Rowan, ON (Norfolk County)"},
    {"location": "Bureau situé à Lévis, Quebec"},
    {"location": "Remote in Peel Region, ON"},
    {"location": "Peel Region, ON"},
    {"location": "GTA, Ontario"},
    {"location": "Pointe-Claire, Quebec, Canada"},
    {"location": "Hybrid (3 days in office) - Toronto, ON"},
    {"location": "Remote, ON"},
    {"location": "Remote, anywhere in Canada"},
    {"location": "Remote in Ontario"},
    {"location": "Toronto, Ontario"},
    {"location": "Montreal"},
    {"location": "Montréal"},
    {"location": "Gatineau, QC"},
    {"location": "Ottawa"},
    {"location": "Virtual and/or in person, anywhere in Canada"},
    {"location": "Must live within the Great Lakes-St. Lawrence Watershed, with office space available at Canadian Geographic's headquarters in Ottawa if desired."},
    {"location": "Montreal (5151de l'Assomption Boulevard)"},
    {"location": "Pt.St.Charles, Montreal"},
    {"location": "Côte des Neiges (Montréal)"},
    {"location": "Ville Mont Royal"},
    {"location": "Option to work onsite at any Birds Canada office (Port Rowan, ON or elsewhere) or remote at your home office in Canada"},
]

print("Testing LLM location extraction...\n")
print("Input locations:")
print("-" * 80)
for i, job in enumerate(test_jobs, 1):
    print(f"{i:2}. {job['location'][:70]}")

print("\nExtracting locations with LLM...")
extract_locations_for_jobs(test_jobs)

print("\nResults:")
print("-" * 80)
errors = []
for i, job in enumerate(test_jobs, 1):
    location = job.get("location", "")
    municipality = job.get("municipality") or "null"
    province = job.get("province") or "null"
    work_type = job.get("work_type", "office")
    
    work_tag = f" [{work_type.upper()}]" if work_type != "office" else ""
    print(f"{i:2}. {location[:60]:60}")
    print(f"    → municipality: {municipality}, province: {province}{work_tag}")
    
    if "Montreal" in location or "Montréal" in location:
        if work_type != "remote" and province != "QC":
            errors.append(f"Line {i}: Montreal missing QC province code")
    if "Ottawa" in location and work_type != "remote" and province != "ON":
        errors.append(f"Line {i}: Ottawa missing ON province code")
    if "Gatineau" in location and municipality != "Gatineau":
        errors.append(f"Line {i}: Gatineau changed to {municipality}")
    if "anywhere in Canada" in location and work_type != "remote":
        errors.append(f"Line {i}: 'anywhere in Canada' should be remote")
    if "option to work" in location.lower() or "or remote" in location.lower():
        if work_type != "remote":
            errors.append(f"Line {i}: Optional office should be marked remote")
    if "hybrid" in location.lower() and work_type != "hybrid":
        errors.append(f"Line {i}: Hybrid position not marked as hybrid")
    
    print()

if errors:
    print("❌ ERRORS FOUND:")
    for error in errors:
        print(f"  - {error}")
else:
    print("✓ All tests passed!")
