#!/usr/bin/env python3
"""Test organization identity extraction from various URL formats"""
import re
from urllib.parse import urlparse

# Replicate the shared domains list
_SHARED_DOMAIN_SUFFIXES = frozenset({
    "facebook.com",
    "fb.com",
    "linkedin.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "tiktok.com",
    "linktr.ee",
    "bit.ly",
    "sites.google.com",
    "wixsite.com",
    "wix.com",
    "squarespace.com",
    "wordpress.com",
    "etsy.com",  # Added - marketplace
    "shopify.com",  # Added - marketplace
    "myshopify.com",  # Shopify stores use storename.myshopify.com
    "panierdachat.app",  # Added - marketplace
    "indeed.com",
    "glassdoor.com",
    "greenhouse.io",
    "lever.co",
    "workable.com",
    "bamboohr.com",
    "smartrecruiters.com",
    "jobvite.com",
    "icims.com",
    "myworkdayjobs.com",
    "dayforcehcm.com",
    "applytojob.com",
    "ecoworks.eco.ca",
    "eco.ca",
})

_WWW_PREFIX = re.compile(r"^www\.", re.I)


def is_shared_domain(domain: str | None) -> bool:
    """True for social/ATS/hosting hosts that must not drive org identity."""
    if not domain:
        return False
    d = domain.lower().strip(".")
    if d in _SHARED_DOMAIN_SUFFIXES:
        return True
    return any(d.endswith("." + suffix) for suffix in _SHARED_DOMAIN_SUFFIXES)


def employer_apex(domain: str | None) -> str | None:
    """Strip vanity subdomains down to a plausible employer apex."""
    if not domain:
        return None
    current = domain.lower().strip(".")
    if not current:
        return None
    # For simplicity in test, just strip one level
    # Production has more sophisticated logic with PUBLIC_SUFFIX_LIKE
    parts = current.split(".")
    if len(parts) <= 2:
        return current
    # Strip one level for common subdomains
    return ".".join(parts[1:])


def extract_org_identity(url: str) -> str | None:
    """
    Extract a unique organization identifier from a URL.

    For employer-owned domains: returns normalized apex domain
    For shared hosting with subdomains: returns full subdomain.domain
    For shared platforms with paths: returns domain/path
    For subdomain + path combos: returns subdomain.domain/path
    For non-identifiable URLs: returns None
    """
    if not url:
        return None

    normalized_url = url.lower().strip()
    if '://' not in normalized_url:
        normalized_url = 'https://' + normalized_url

    try:
        parsed = urlparse(normalized_url)
        hostname = (parsed.hostname or '').strip('.')
    except (ValueError, AttributeError, TypeError):
        # Invalid URL
        return None

    if not hostname:
        return None

    # Remove www and mobile (m.) prefixes for normalization
    domain = hostname
    domain = _WWW_PREFIX.sub('', domain)
    if domain.startswith('m.'):
        domain = domain[2:]

    # Validate domain has alphanumeric characters and at least one dot (TLD)
    if not domain or not re.search(r'[a-z0-9]', domain) or '.' not in domain:
        return None

    # Check if this is a shared domain
    if not is_shared_domain(domain):
        # Employer-owned domain - normalize to apex for subdomain matching
        apex = employer_apex(domain)
        return apex or domain

    # Shared domain - need to extract unique identifier

    # Check for subdomain-based uniqueness
    # (e.g., myshop.panierdachat.app, mysite.wixsite.com)
    # But also check if there's a path (e.g., boards.greenhouse.io/acme)

    # Find if domain has subdomain beyond the shared suffix
    has_subdomain = False
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if domain == suffix:
            # Exact match - this IS the shared domain root
            break
        if domain.endswith('.' + suffix):
            # Has subdomain before shared domain
            has_subdomain = True
            break

    # Extract and normalize path
    path = parsed.path.strip('/').split('?')[0].split('#')[0]
    normalized_path = '/'.join(p for p in path.split('/') if p)

    # Determine identity based on what we have
    if has_subdomain and normalized_path:
        # Both subdomain AND path (e.g., boards.greenhouse.io/acme)
        # Use full domain + path
        return f"{domain}/{normalized_path}"
    elif has_subdomain:
        # Just subdomain (e.g., mysite.wixsite.com)
        return domain
    elif normalized_path:
        # Just path (e.g., facebook.com/OrgName)
        return f"{domain}/{normalized_path}"
    else:
        # Neither subdomain nor path - can't identify org
        return None


# Test cases covering all scenarios
TEST_CASES = [
    # Employer-owned domains
    ("https://acmecorp.com", "acmecorp.com", "✓ Basic employer domain"),
    ("https://www.acmecorp.com", "acmecorp.com", "✓ Employer domain with www"),
    ("http://acmecorp.com", "acmecorp.com", "✓ HTTP employer domain"),
    ("https://careers.acmecorp.com/jobs", "acmecorp.com", "✓ Employer subdomain normalized to apex"),
    ("HTTPS://WWW.ACMECORP.COM", "acmecorp.com", "✓ Case insensitive"),
    ("acmecorp.com", "acmecorp.com", "✓ No protocol"),

    # Marketplace - subdomain-based (panierdachat.app)
    ("https://wildlife-gardening.panierdachat.app", "wildlife-gardening.panierdachat.app", "✓ Marketplace subdomain"),
    ("https://www.wildlife-gardening.panierdachat.app", "wildlife-gardening.panierdachat.app", "✓ Marketplace subdomain with www"),
    ("https://another-org.panierdachat.app", "another-org.panierdachat.app", "✓ Different marketplace subdomain"),

    # Marketplace - subdomain-based (wixsite.com)
    ("https://mycompany.wixsite.com", "mycompany.wixsite.com", "✓ Wix subdomain"),
    ("https://mycompany.wixsite.com/home", "mycompany.wixsite.com/home", "✓ Wix subdomain with path"),

    # Marketplace - subdomain-based (squarespace.com)
    ("https://mysite.squarespace.com", "mysite.squarespace.com", "✓ Squarespace subdomain"),

    # Marketplace - path-based (Etsy)
    ("https://www.etsy.com/shop/MyShop", "etsy.com/shop/myshop", "✓ Etsy shop path"),
    ("https://www.etsy.com/shop/DifferentShop", "etsy.com/shop/differentshop", "✓ Different Etsy shop"),

    # Marketplace - subdomain-based (Shopify)
    ("https://mystore.myshopify.com", "mystore.myshopify.com", "✓ Shopify subdomain"),

    # Social media - path-based (Facebook)
    ("https://www.facebook.com/WildlifeGardening.ca", "facebook.com/wildlifegardening.ca", "✓ Facebook page"),
    ("https://www.facebook.com/DifferentOrg", "facebook.com/differentorg", "✓ Different Facebook page"),
    ("https://facebook.com/wildlife-gardening-ca", "facebook.com/wildlife-gardening-ca", "✓ Facebook page with dashes"),
    ("https://www.facebook.com/pages/My-Org/123456", "facebook.com/pages/my-org/123456", "✓ Facebook pages path"),
    ("https://m.facebook.com/MyOrg", "facebook.com/myorg", "✓ Mobile Facebook"),

    # Social media - path-based (LinkedIn)
    ("https://www.linkedin.com/company/acme-corp", "linkedin.com/company/acme-corp", "✓ LinkedIn company"),
    ("https://www.linkedin.com/company/different-corp", "linkedin.com/company/different-corp", "✓ Different LinkedIn company"),

    # Social media - path-based (Instagram)
    ("https://www.instagram.com/myorganization", "instagram.com/myorganization", "✓ Instagram profile"),

    # Social media - path-based (Twitter/X)
    ("https://twitter.com/MyOrg", "twitter.com/myorg", "✓ Twitter profile"),
    ("https://x.com/MyOrg", "x.com/myorg", "✓ X profile"),

    # YouTube channel
    ("https://www.youtube.com/@MyChannel", "youtube.com/@mychannel", "✓ YouTube channel"),
    ("https://www.youtube.com/c/MyChannel", "youtube.com/c/mychannel", "✓ YouTube custom channel"),

    # Google Sites (subdomain-based)
    ("https://mysite.sites.google.com", "mysite.sites.google.com", "✓ Google Sites subdomain"),

    # Edge cases - should return None
    ("https://facebook.com", None, "✗ Facebook root (no org identifier)"),
    ("https://www.linkedin.com", None, "✗ LinkedIn root (no org identifier)"),
    ("https://panierdachat.app", None, "✗ Marketplace root (no org identifier)"),
    ("", None, "✗ Empty string"),
    ("not a url", None, "✗ Invalid URL"),

    # URL variations - should normalize
    ("https://www.facebook.com/MyOrg/", "facebook.com/myorg", "✓ Trailing slash removed"),
    ("https://www.facebook.com/MyOrg?ref=page", "facebook.com/myorg", "✓ Query params removed"),
    ("https://www.facebook.com/MyOrg#about", "facebook.com/myorg", "✓ Fragment removed"),
    ("https://www.facebook.com/MyOrg?ref=page#about", "facebook.com/myorg", "✓ Query and fragment removed"),

    # ATS/Job boards - subdomain + path
    ("https://boards.greenhouse.io/acme", "boards.greenhouse.io/acme", "✓ Greenhouse board"),
    ("https://jobs.lever.co/acme", "jobs.lever.co/acme", "✓ Lever jobs"),

    # Eco Canada job boards - subdomain + path
    ("https://ecoworks.eco.ca/companies/acme", "ecoworks.eco.ca/companies/acme", "✓ Eco Canada company"),

    # WordPress hosted sites (subdomain)
    ("https://myorg.wordpress.com", "myorg.wordpress.com", "✓ WordPress subdomain"),
    ("https://differentorg.wordpress.com", "differentorg.wordpress.com", "✓ Different WordPress subdomain"),

    # Real-world examples from the context
    ("https://www.wildlifetrusts.org", "wildlifetrusts.org", "✓ Wildlife Trusts (employer-owned)"),
    ("https://carrefourfamilial.com", "carrefourfamilial.com", "✓ Carrefour Familial (employer-owned)"),
    ("https://earthpath.ca", "earthpath.ca", "✓ Earth Path (employer-owned)"),
    ("http://centrenarive.com", "centrenarive.com", "✓ Centre N A Rive (employer-owned)"),
    ("https://www.welcomecollective.org", "welcomecollective.org", "✓ Welcome Collective (employer-owned)"),
    ("https://www.outremontenfamille.org", "outremontenfamille.org", "✓ Outremont en famille (employer-owned)"),
]


def run_tests():
    print("=" * 80)
    print("ORGANIZATION IDENTITY EXTRACTION TEST")
    print("=" * 80)

    passed = 0
    failed = 0

    for url, expected, description in TEST_CASES:
        result = extract_org_identity(url)

        if result == expected:
            passed += 1
            print(f"{description:70} PASS")
        else:
            failed += 1
            print(f"{description:70} FAIL")
            print(f"  Input:    {url}")
            print(f"  Expected: {expected}")
            print(f"  Got:      {result}")
            print()

    print("\n" + "=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(TEST_CASES)} tests")
    print("=" * 80)

    if failed == 0:
        print("✓ All tests passed!")
        return 0
    else:
        print(f"✗ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(run_tests())
