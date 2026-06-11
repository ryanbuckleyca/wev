"""
Shared constants for the scraper.
"""

# User-Agent string injected into all browser contexts.
# MUST stay in sync with the installed Chrome version to avoid bot-detection
# mismatches (Cloudflare compares the UA version against Sec-CH-UA and the
# real TLS ClientHello).  Run `chrome --version` to check.
BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
