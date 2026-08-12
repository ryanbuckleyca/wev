# Option 1: Website Identity Tracking via sse_details.flags

## How the Existing Flag System Works

The `sse_details` JSONB column currently stores metadata about how organization data was determined. It has this structure:

```json
{
  "confidence": 0.85,
  "reasoning": "Organization shows clear SSE characteristics...",
  "classified_at": "2026-08-10T14:30:00Z",
  "reviewed": false,
  "flags": [
    "language:en via=web_text",
    "language_reason:website_lang_tag=en",
    "description via=extracted",
    "mission via=extracted",
    "values via=inferred"
  ]
}
```

### Current Flag Patterns

Flags follow a consistent pattern:

- **Provenance flags**: `{field} via={source}`
- **Reason flags**: `{field}_reason:{detail}`
- **Multiple flags** can exist for different fields

**Examples from the codebase:**

```python
# Language tracking (from organization_assessment.py)
flags.append(f"language:{language} via={via}")
# e.g., "language:en via=web_text"
# e.g., "language:fr via=llm_name"
# e.g., "language:bilingual via=public_language"
# e.g., "language:fr via=kept"

# Content provenance
flags.append(f"description via={status}")  # status: extracted, inferred, absent
flags.append(f"mission via={status}")
flags.append(f"values via={status}")
```

## How to Add Website Identity Tracking

### The Implementation

Add flags when storing a website to track:

1. **What type of identity** it provides
2. **Which platform** (for monitoring/filtering)
3. **Optional: Confidence level**

### Code Example

```python
def _append_website_identity_flags(
    row: dict,
    website: str,
    identity: str,  # from extract_org_identity()
) -> None:
    """Record website identity provenance on sse_details.flags."""
    details = row.get("sse_details")
    if not isinstance(details, dict):
        details = {}
        row["sse_details"] = details
    else:
        # Copy so we don't mutate a shared prior dict in place
        details = dict(details)
        row["sse_details"] = details

    # Remove any existing website flags
    flags = [
        f for f in (details.get("flags") or [])
        if isinstance(f, str) and not f.startswith("website")
    ]

    # Determine identity type
    identity_type = _classify_identity_type(identity)

    # Add new website flags
    flags.append(f"website via={identity_type}")

    # Add platform detail for non-employer domains
    if identity_type != "employer_owned":
        platform = _extract_platform(identity)
        flags.append(f"website_platform:{platform}")

    details["flags"] = flags


def _classify_identity_type(identity: str) -> str:
    """Determine what type of identity this is."""
    if not identity:
        return "unknown"

    # Check against shared domain list
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if identity == suffix:
            return "invalid"  # Root domain only, no org identifier

        # Has subdomain component
        if identity.startswith(f"{suffix}/") or identity.endswith(f".{suffix}"):
            # Determine if marketplace or social
            if suffix in {"facebook.com", "linkedin.com", "instagram.com",
                         "twitter.com", "x.com", "youtube.com", "tiktok.com"}:
                return "social_media"
            elif suffix in {"panierdachat.app", "etsy.com", "shopify.com",
                           "wixsite.com", "squarespace.com", "wordpress.com"}:
                return "marketplace"
            elif suffix in {"greenhouse.io", "lever.co", "workable.com"}:
                return "ats_board"
            else:
                return "shared_hosting"

    # No shared domain match = employer-owned
    return "employer_owned"


def _extract_platform(identity: str) -> str:
    """Extract the platform name from an identity string."""
    # For domain/path pattern (e.g., "facebook.com/orgname")
    if "/" in identity:
        return identity.split("/")[0]

    # For subdomain pattern (e.g., "myorg.panierdachat.app")
    for suffix in _SHARED_DOMAIN_SUFFIXES:
        if identity.endswith(f".{suffix}"):
            return suffix

    return "unknown"
```

### Usage in Organization Assessment

```python
# In assess_and_build_update() around line 1545
if website:
    # Extract identity for uniqueness matching
    identity = extract_org_identity(website)

    # Add provenance tracking
    _append_website_identity_flags(updates, website, identity or "")

    # Store the website
    updates["website"] = website
```

## Example Flag Outputs

### Scenario 1: Employer-Owned Domain

```python
Website: "https://www.wildlifetrusts.org"
Identity: "wildlifetrusts.org"

Flags:
[
  "website via=employer_owned"
]
```

### Scenario 2: Marketplace Subdomain

```python
Website: "https://wildlife-gardening.panierdachat.app"
Identity: "wildlife-gardening.panierdachat.app"

Flags:
[
  "website via=marketplace",
  "website_platform:panierdachat.app"
]
```

### Scenario 3: Social Media Path

```python
Website: "https://www.facebook.com/WildlifeGardening.ca"
Identity: "facebook.com/wildlifegardening.ca"

Flags:
[
  "website via=social_media",
  "website_platform:facebook.com"
]
```

### Scenario 4: ATS Board (Subdomain + Path)

```python
Website: "https://boards.greenhouse.io/acme"
Identity: "boards.greenhouse.io/acme"

Flags:
[
  "website via=ats_board",
  "website_platform:greenhouse.io"
]
```

### Scenario 5: Mixed Flags

```python
# An organization with multiple metadata
{
  "sse_details": {
    "confidence": 0.92,
    "reasoning": "...",
    "flags": [
      "language:en via=web_text",
      "description via=extracted",
      "mission via=extracted",
      "values via=inferred",
      "website via=marketplace",
      "website_platform:panierdachat.app"
    ]
  }
}
```

## Benefits of This Approach

### 1. **Low Friction**

- Uses existing infrastructure (flags array)
- No schema changes required
- Consistent with current patterns

### 2. **Queryable**

You can query orgs by website source type:

```sql
-- Find all orgs using marketplace websites
SELECT id, name, website, sse_details
FROM organizations
WHERE sse_details->'flags' ? 'website via=marketplace';

-- Find all Facebook-based orgs
SELECT id, name, website, sse_details
FROM organizations
WHERE sse_details->'flags' @> '["website_platform:facebook.com"]'::jsonb;

-- Find orgs needing review (non-employer websites)
SELECT id, name, website, sse_details
FROM organizations
WHERE sse_details->'flags' ?| ARRAY[
  'website via=social_media',
  'website via=marketplace',
  'website via=ats_board'
];
```

### 3. **Backward Compatible**

- Existing records without these flags work fine
- Flags are additive, not required
- Easy to backfill: just reprocess websites

### 4. **Simple to Filter/Review**

You can build admin views to review orgs by website type:

```python
def get_orgs_by_website_type(website_type: str):
    """Get orgs with a specific website type for review."""
    return supabase.from_("organizations").select("*").contains(
        "sse_details",
        {"flags": [f"website via={website_type}"]}
    ).execute()

# Review marketplace orgs
marketplace_orgs = get_orgs_by_website_type("marketplace")

# Review social media orgs
social_orgs = get_orgs_by_website_type("social_media")
```

### 5. **Monitoring & Metrics**

Easy to generate reports:

```sql
-- Count orgs by website type
SELECT
  CASE
    WHEN sse_details->'flags' ? 'website via=employer_owned' THEN 'employer_owned'
    WHEN sse_details->'flags' ? 'website via=marketplace' THEN 'marketplace'
    WHEN sse_details->'flags' ? 'website via=social_media' THEN 'social_media'
    WHEN sse_details->'flags' ? 'website via=ats_board' THEN 'ats_board'
    ELSE 'unknown'
  END as website_type,
  COUNT(*) as count
FROM organizations
WHERE website IS NOT NULL
GROUP BY website_type
ORDER BY count DESC;

-- Platform distribution for non-employer sites
SELECT
  jsonb_array_elements_text(sse_details->'flags') as flag,
  COUNT(*) as count
FROM organizations
WHERE sse_details->'flags' ?| ARRAY[
  'website via=marketplace',
  'website via=social_media'
]
AND jsonb_typeof(sse_details->'flags') = 'array'
GROUP BY flag
HAVING jsonb_array_elements_text(sse_details->'flags') LIKE 'website_platform:%'
ORDER BY count DESC;
```

## Workflow Integration

### Development/Testing

```bash
# Process orgs with new identity extraction
cd wev-scraper
CONFIRM_PROD_RUN=YES ./venv/bin/python3 scripts/backfill_org_websites.py \
  --prod --mode full --limit 100

# Check what was flagged
psql -c "
  SELECT name, website, sse_details->'flags' as flags
  FROM organizations
  WHERE sse_details->'flags' @> '[\"website via=marketplace\"]'::jsonb
  LIMIT 10;
"
```

### Monitoring Dashboard Queries

```sql
-- Daily stats on website types
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE sse_details->'flags' ? 'website via=employer_owned') as employer,
  COUNT(*) FILTER (WHERE sse_details->'flags' ? 'website via=marketplace') as marketplace,
  COUNT(*) FILTER (WHERE sse_details->'flags' ? 'website via=social_media') as social,
  COUNT(*) FILTER (WHERE sse_details->'flags' ? 'website via=ats_board') as ats
FROM organizations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Manual Review Workflow

```sql
-- Get orgs that need website verification
CREATE OR REPLACE VIEW orgs_needing_website_review AS
SELECT
  id,
  name,
  website,
  location,
  sse_details->'flags' as flags,
  created_at
FROM organizations
WHERE
  sse_details->'flags' ?| ARRAY[
    'website via=marketplace',
    'website via=social_media'
  ]
  AND (sse_details->>'reviewed')::boolean IS NOT TRUE
ORDER BY created_at DESC;
```

## Next Steps

1. **Add the helper functions** to `organization_cache.py`
2. **Update** `assess_and_build_update()` to call `_append_website_identity_flags()`
3. **Update** `organization_resolver.py` to use `extract_org_identity()` for matching
4. **Test** on a small batch to verify flags are set correctly
5. **Backfill** existing records if needed
6. **Create monitoring queries** for your admin dashboard

## Why This is Better Than Alternatives

**vs. Option 2 (Structured metadata):**

- Simpler: no need for nested object parsing
- Consistent with existing patterns
- Easier to query with JSONB operators

**vs. Option 3 (Separate review queue):**

- No new tables/columns needed
- Flags serve dual purpose: tracking + review filtering
- Less infrastructure complexity

**Key Insight**: Flags are already your provenance system. Website identity provenance fits the same pattern as language/content provenance.
