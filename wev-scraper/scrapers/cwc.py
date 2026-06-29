import re

import feedparser

from scrapers.base_feed import BaseFeedScraper

# Pattern: "Job Title | Organization Name" or "Job Title – Organization Name"
_TITLE_ORG_SEPARATOR = re.compile(r"\s*[|–—]\s*")


class CWCScraper(BaseFeedScraper):
    """Canadian Worker Co-op Federation job postings RSS feed.

    Feed URL: https://canadianworker.coop/category/news-events/job-postings/feed/

    Standard WordPress RSS 2.0 feed. Titles often contain the organization
    name separated by a pipe, e.g. "Executive Director | Some Org".
    """

    is_chronological = True

    def parse_entry(self, entry: feedparser.FeedParserDict) -> dict | None:
        """Extract job fields from a CWCF RSS entry."""
        fields = super().parse_entry(entry)
        if fields is None:
            return None

        raw_title = fields.get("job_title", "")

        # Parse "Title | Organization" pattern
        parts = _TITLE_ORG_SEPARATOR.split(raw_title, maxsplit=1)
        if len(parts) == 2:
            fields["job_title"] = parts[0].strip()
            fields["organization"] = parts[1].strip()
        else:
            # Fall back to the feed's dc:creator or default org
            getattr(entry, "author", None)
            # dc:creator is often the post author, not the hiring org — use
            # the source name as a safer default
            fields["organization"] = (self.source or {}).get(
                "name", "Canadian Worker Co-op Federation"
            )

        return fields
