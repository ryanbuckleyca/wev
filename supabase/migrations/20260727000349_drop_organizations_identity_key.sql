-- Organization identity is resolved in application code (scraper resolver),
-- not by name+location uniqueness. Distinct same-name employers (different
-- domains) must remain allowed — do not replace with UNIQUE(name).

DROP INDEX IF EXISTS public.organizations_identity_key;
