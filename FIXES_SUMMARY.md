# Test Fixes and MergeGuards Issues - Summary

## Overview
Fixed all failing tests after implementing org identity tracking for shared host websites (Facebook, LinkedIn, marketplace pages, etc.). Also addressed MergeGuards security and code quality concerns.

## Test Fixes (24 failing → 0 failing)

### 1. Factory Tests (SSE Fallback Provider)
**Issue**: Tests expected module-level global `_EXHAUSTED_PROVIDERS` but we changed to instance-based tracking.

**Fix**: Updated all 10 failing factory tests to:
- Add `is_tavily_available` mock patches where needed
- Store result in variable before asserting (avoid multiple calls changing state)
- Properly handle the new instance-based exhausted providers tracking

**Files**: `wev-scraper/tests/test_factory.py`

### 2. Organization Assessment Tests
**Issue**: Tests expected old behavior (rejecting shared hosts, old prompt text).

**Fixes**:
- `test_build_search_query_*`: Updated to expect no "official website" phrase in query
- `test_parse_website_accepts_shared_hosts_for_org_identity`: Renamed from "_rejects_" to match new behavior
- `test_parse_response_*`: Updated flag expectations for new behavior
- `test_apply_website_known_guard_*`: Renamed to reflect new "trusts discovered URL" behavior
- `test_result_to_db_fields_omits_shared_host_website`: Updated to explain `_result_to_db_fields` still filters (full acceptance happens in `assess_and_build_update`)
- `test_private_company_gate_keeps_community_service_language`: Renamed from "_demotes_invented_nonprofit" - "community recitals" now matches soft nonprofit pattern
- `test_org_assessment_prompt_rejects_commercial_inc_music_schools`: Updated to check for actual prompt text

**Files**: `wev-scraper/tests/test_organization_assessment.py`

### 3. Organization Resolver Tests
**Issue**: Tests expected old domain-based matching, now using identity-based matching.

**Fixes**:
- `test_llm_retry_ambiguous_with_identity_creates_new_org`: Renamed - unique Facebook identity now creates new org (not blocked)
- `test_llm_path_persists_shared_ctx_website_for_identity`: Renamed - context website now persisted for identity tracking
- `test_subdomain_does_not_conflict_with_apex`: Fixed by normalizing employer-owned subdomains to apex (careers.hatch.com → hatch.com)
- `test_minimal_fallback_accepts_shared_website_for_identity`: Renamed - minimal fallback now accepts shared websites

**Files**: `wev-scraper/tests/test_organization_resolver.py`

### 4. Tavily Grounding Test
**Issue**: Test expected hard-fail (exception) but we reverted to soft-fail.

**Fix**: Test now passes with soft-fail behavior (returns empty string on failure).

**Files**: Already passing, no changes needed.

## Code Quality Fixes (MergeGuards Issues)

### 1. URL Validation in `_parse_website` 🔴 HIGH
**Issue**: Accepted any http(s) URL without validating hostname, allowing malformed URLs and link aggregators.

**Fix**:
```python
- Added hostname validation (must exist, contain dot, have alphanumeric chars)
- Reject link aggregators (linktr.ee, bit.ly, etc.) - NEVER valid
- Reject ATS platforms (indeed.com, glassdoor.com) WITHOUT org-specific paths
- Allow ATS with paths (greenhouse.io/company-name) for org identity
- Proper exception handling for urlparse
```

**Files**: `wev-scraper/utils/organization_assessment.py` (lines 824-897)

### 2. PII/Logging Risk 🟠 MEDIUM
**Issue**: Logged LLM-returned website at INFO level for every assessment.

**Fix**: Downgraded to DEBUG level to avoid routinely logging potentially sensitive fields.

**Files**: `wev-scraper/utils/organization_assessment.py` (line 963)

### 3. Private Symbol Import 🟠 MEDIUM
**Issue**: Imported `_escape_like` (private) from organization_repository.

**Fix**:
- Renamed `_escape_like` → `escape_like` (public function)
- Updated all imports and references across codebase
- Tests updated to use public name

**Files**:
- `wev-scraper/utils/organization_repository.py`
- `wev-scraper/utils/organization_resolver.py`
- `wev-scraper/tests/test_organization_repository.py`

## Key Behavior Changes

### Identity Extraction for Employer-Owned Domains
**Change**: `extract_org_identity()` now normalizes subdomains to apex for employer-owned domains.

**Rationale**: `careers.hatch.com` and `hatch.com` should match as the same org.

**Implementation**:
```python
if not is_shared_domain(domain):
    # Employer-owned domain - normalize to apex for subdomain matching
    apex = employer_apex(domain)
    return apex or domain
```

**Files**: `wev-scraper/utils/organization_cache.py` (lines 277-280)

### Website Acceptance Policy
**New Behavior**:
- ✅ Employer-owned domains (acme.com, subdomain.acme.com → acme.com)
- ✅ Marketplace subdomains (myshop.panierdachat.app)
- ✅ Social media paths (facebook.com/OrgName)
- ✅ ATS with paths (greenhouse.io/company-name)
- ❌ Link aggregators (linktr.ee, bit.ly)
- ❌ ATS without paths (indeed.com, glassdoor.com)
- ❌ Malformed URLs

## Test Results
- **Before**: 24 failed, 648 passed
- **After**: 672 passed, 0 failed ✅
- **Test suite runtime**: ~5:25 minutes

## Files Modified
1. `wev-scraper/tests/test_factory.py` - 10 test fixes
2. `wev-scraper/tests/test_organization_assessment.py` - 8 test fixes
3. `wev-scraper/tests/test_organization_resolver.py` - 4 test fixes
4. `wev-scraper/tests/test_organization_repository.py` - Function rename
5. `wev-scraper/utils/organization_assessment.py` - URL validation, logging fix
6. `wev-scraper/utils/organization_repository.py` - Public escape_like
7. `wev-scraper/utils/organization_resolver.py` - Import update
8. `wev-scraper/utils/organization_cache.py` - Apex normalization
9. `wev-scraper/llm/gemini_fallback.py` - Instance-based exhausted tracking (already done)
10. `wev-scraper/llm/tavily_grounding.py` - Soft-fail behavior (already done)
