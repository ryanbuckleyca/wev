-- Find organizations with shared platform websites
SELECT 
    id,
    name,
    website,
    location,
    created_at
FROM organizations
WHERE website IS NOT NULL
AND (
    website ILIKE '%facebook.com%'
    OR website ILIKE '%linkedin.com%'
    OR website ILIKE '%instagram.com%'
    OR website ILIKE '%panierdachat.app%'
    OR website ILIKE '%wixsite.com%'
    OR website ILIKE '%squarespace.com%'
    OR website ILIKE '%etsy.com%'
    OR website ILIKE '%greenhouse.io%'
)
ORDER BY created_at DESC
LIMIT 30;
