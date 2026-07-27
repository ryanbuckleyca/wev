-- Document role of organizations_identity_key.
-- This index is an exact same-name + same-location-string duplicate /
-- idempotency guard — NOT organization identity. Cross-city reuse and
-- distinct same-name employers are resolved in the scraper
-- OrganizationResolver (name / domain evidence), not by this constraint.
-- Do not replace with UNIQUE(name).

COMMENT ON INDEX public.organizations_identity_key IS
  'Exact duplicate guard on lower(name)+location string. Org identity is resolver-owned; do not UNIQUE(name).';
