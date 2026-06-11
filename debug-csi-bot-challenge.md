# Debug Session: csi-bot-challenge [OPEN]

## Symptom

- `Centre for Social Innovation` fails during listing collection.
- First attempt shows `Page.content: Unable to retrieve content because the page is navigating and changing the content.`
- Subsequent attempts fail with `Bot challenge page detected`.

## Expected

- CSI listings page loads normally and `get_listing_items()` returns listing nodes.

## Hypotheses

1. CSI is serving a challenge/interstitial page to the scraper, and the current detector is accurately catching it.
2. CSI now requires the proxy path, but its scraper is still launching without proxy support.
3. CSI is landing on a different anti-bot branch depending on browser mode or fingerprinting path.
4. The page is redirecting during early load, causing `page.content()` to race against navigation before stabilizing.
5. A consent/modal/intermediate layer is present and hides listings, making the page look like a challenge.

## Evidence Plan

- Inspect CSI scraper launch/navigation behavior.
- Add minimal instrumentation around page URL/title/error-page detection and browser launch mode.
- Reproduce CSI scrape and compare logs across retries.

## Status

- Instrumentation added and evidence collected.

## Evidence

- Pre-fix logs showed CSI launching with `use_proxy=false` and then redirecting to `https://socialinnovation.org/.well-known/sgcaptcha/...`.
- First failure mode was a transient `Page.content()` navigation race; subsequent failures consistently showed `robot challenge screen`.
- Local environment reproduction confirmed `PROXY_SERVER` was not set during verification, so enabling proxy mode in code could not actually route traffic through a proxy here.

## Confirmed / Rejected Hypotheses

1. Confirmed: CSI is serving a bot/challenge interstitial to the scraper.
2. Confirmed: CSI was not using the proxy-capable path before the fix.
3. Not confirmed: browser mode mismatch was not the primary differentiator in collected logs.
4. Partially confirmed: early navigation races did happen, but they were secondary to the challenge redirect.
5. Rejected: no evidence of a benign consent/modal masking otherwise healthy listings.

## Fix Applied

- Updated `CSIScraper.start_browser()` to request `use_proxy=True`.
- Updated `CSIScraper.open_listings_page()` to use `_goto_with_networkidle(...)` instead of raw `page.goto(...)`.
- Added focused regression tests for both behaviors.

## Verification

- Automated tests passed after the change.
- Post-change debug logs show CSI now launching with `use_proxy=true`.
- Runtime verification in this sandbox still redirects to `sgcaptcha` because no proxy credentials/server are configured in this environment.

## Next User Check

- Re-run CSI in the real environment where the proxy is configured and confirm whether the challenge redirect disappears.
