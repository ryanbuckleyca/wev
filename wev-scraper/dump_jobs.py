"""Dump jobs from a scraper as JSON for debugging."""

import argparse
import json
import sys

from scrapers.registry import SCRAPER_MAP


def dump(slug: str, max_jobs: int = 3, headed: bool = False):
    source = {"id": f"mock-{slug}", "slug": slug, "name": slug}
    scraper_class = SCRAPER_MAP.get(slug)
    if not scraper_class:
        print(f"No scraper registered for slug: {slug}", file=sys.stderr)
        print(f"Available: {list(SCRAPER_MAP.keys())}", file=sys.stderr)
        sys.exit(1)

    scraper = scraper_class(source)
    if headed:
        scraper.force_headed = True

    jobs = []
    for job in scraper.fetch_jobs():
        jobs.append(job)
        if len(jobs) >= max_jobs:
            break

    print(json.dumps(jobs, indent=2, default=str))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dump jobs from a scraper as JSON")
    parser.add_argument("--slug", required=True, help="Scraper slug (e.g. charityvillage)")
    parser.add_argument("--max-jobs", type=int, default=3, help="Max jobs to dump (default: 3)")
    parser.add_argument("--headed", action="store_true", help="Show browser window")
    args = parser.parse_args()
    dump(args.slug, args.max_jobs, args.headed)
