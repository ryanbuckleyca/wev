#!/usr/bin/env python3
"""
Test script for work_type detection in location_parser.py
"""

import os
import sys
# Ensure project root is on sys.path so `utils` is importable when running scripts directly
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.location_parser import determine_work_type, is_hybrid_location, is_remote_location

# Test cases: (location, municipality, province, expected_work_type)
test_cases = [
    ("Hybrid - Toronto, ON", "Toronto", "ON", "hybrid"),
    ("Flexible work arrangement, Vancouver", "Vancouver", "BC", "hybrid"),
    ("Remote with 2 days in office - Montreal", "Montreal", "QC", "hybrid"),
    ("Work from home or office - Ottawa", "Ottawa", "ON", "hybrid"),
    ("Remote - Toronto, ON", "Toronto", "ON", "hybrid"),
    ("Remote position, Vancouver, BC", "Vancouver", "BC", "hybrid"),
    ("Work from home - Calgary, AB", "Calgary", "AB", "hybrid"),
    ("Remote in Ontario", None, "ON", "remote"),
    ("Remote - British Columbia", None, "BC", "remote"),
    ("Work from home, anywhere in Alberta", None, "AB", "remote"),
    ("Remote", None, None, "remote"),
    ("Remote, anywhere in Canada", None, None, "remote"),
    ("Virtual position", None, None, "remote"),
    ("Work from home", None, None, "remote"),
    ("Toronto, ON", "Toronto", "ON", "office"),
    ("123 Main St, Vancouver, BC", "Vancouver", "BC", "office"),
    ("Ottawa Office", "Ottawa", "ON", "office"),
    ("", None, None, "office"),
    (None, None, None, "office"),
    ("Hybrid position", None, None, "hybrid"),
    ("Remote/Hybrid", None, None, "hybrid"),
]

print("Testing work_type detection...\n")
print(f"{'Location':<45} {'Municipality':<15} {'Province':<10} {'Expected':<10} {'Actual':<10} {'Status'}")
print("-" * 110)

passed = 0
failed = 0

for location, municipality, province, expected in test_cases:
    actual = determine_work_type(location, municipality, province)
    status = "✓ PASS" if actual == expected else "✗ FAIL"
    
    if actual == expected:
        passed += 1
    else:
        failed += 1
    
    loc_display = (location or "(None)")[:45]
    muni_display = (municipality or "-")[:15]
    prov_display = (province or "-")[:10]
    
    print(f"{loc_display:<45} {muni_display:<15} {prov_display:<10} {expected:<10} {actual:<10} {status}")

print("-" * 110)
print(f"\nResults: {passed} passed, {failed} failed out of {passed + failed} tests")

if failed > 0:
    print("\n⚠️  Some tests failed!")
else:
    print("\n✓ All tests passed!")

print("\n" + "="*110)
print("Testing individual indicator functions:\n")

hybrid_tests = [
    ("Hybrid - Toronto", True),
    ("Flexible work", True),
    ("Remote with office days", True),
    ("Office with remote option", True),
    ("Remote only", False),
    ("Toronto, ON", False),
]

print("is_hybrid_location() tests:")
for location, expected in hybrid_tests:
    actual = is_hybrid_location(location)
    status = "✓" if actual == expected else "✗"
    print(f"  {status} '{location}' -> {actual} (expected {expected})")

remote_tests = [
    ("Remote", True),
    ("Virtual position", True),
    ("Work from home", True),
    ("Anywhere in Canada", True),
    ("Toronto, ON", False),
    ("Hybrid", False),
]

print("\nis_remote_location() tests:")
for location, expected in remote_tests:
    actual = is_remote_location(location)
    status = "✓" if actual == expected else "✗"
    print(f"  {status} '{location}' -> {actual} (expected {expected})")
