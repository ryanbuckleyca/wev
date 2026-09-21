-- Alternate org names for resolver matching (former names, FR/EN, acronyms, etc.).
-- Canonical display name stays organizations.name; aliases live here.
-- Matching uses stored normalized columns so lookups can use indexes.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS alternative_names text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.organizations.alternative_names IS
  'Additional names that identify this organization for matching (former names, '
  'other-language legal names, acronyms, short forms). Canonical display name '
  'remains organizations.name. Values are display strings; matching uses the '
  'same normalization as organization name cache keys.';

-- Mirror utils.organization_cache._normalize / make_cache_key so RPC lookups
-- agree with names_equivalent() (&/et → and, accents, punctuation, trailing acronym).
CREATE OR REPLACE FUNCTION public.normalize_org_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  s text := coalesce(p_name, '');
  m text[];
  token text;
BEGIN
  -- Match Python _strip_trailing_acronym: only drop trailing (ACRONYM) when the
  -- alphabetic core is all-caps and length >= 2. Keep "(Ontario)" / "(Inc)".
  m := regexp_match(s, '\s*[\(\[]([A-Za-z][A-Za-z0-9.&/\-]{0,14})[\)\]]\s*$');
  IF m IS NOT NULL THEN
    token := regexp_replace(m[1], '[^A-Za-z]', '', 'g');
    IF char_length(token) >= 2
       AND token ~ '^[A-Za-z]+$'
       AND token = upper(token) THEN
      s := regexp_replace(
        s,
        '\s*[\(\[][A-Za-z][A-Za-z0-9.&/\-]{0,14}[\)\]]\s*$',
        ''
      );
    END IF;
  END IF;

  s := btrim(s);
  s := lower(public.f_unaccent(s));
  s := replace(s, '&', ' and ');
  s := regexp_replace(s, '\yet\y', ' and ', 'g');
  s := regexp_replace(s, '[-_/]+', ' ', 'g');
  s := regexp_replace(s, '[^a-z0-9 ]+', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := trim(both ' ' from s);
  RETURN nullif(s, '');
END;
$$;

COMMENT ON FUNCTION public.normalize_org_name(text) IS
  'Normalize an organization name for equality matching (mirrors Python '
  'organization_cache.make_cache_key).';

-- Normalize an array of display names (for generated alternative_names_normalized).
CREATE OR REPLACE FUNCTION public.normalize_org_names(p_names text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(
    array_agg(DISTINCT n),
    '{}'::text[]
  )
  FROM (
    SELECT public.normalize_org_name(x) AS n
    FROM unnest(coalesce(p_names, '{}'::text[])) AS t(x)
  ) s
  WHERE n IS NOT NULL;
$$;

COMMENT ON FUNCTION public.normalize_org_names(text[]) IS
  'Normalize each alternative name; used by alternative_names_normalized.';

-- Stored normalized forms so find_organizations_by_name can use indexes.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS name_normalized text
  GENERATED ALWAYS AS (public.normalize_org_name(name)) STORED;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS alternative_names_normalized text[]
  GENERATED ALWAYS AS (public.normalize_org_names(alternative_names)) STORED;

COMMENT ON COLUMN public.organizations.name_normalized IS
  'Stored normalize_org_name(name) for indexed equality matching.';

COMMENT ON COLUMN public.organizations.alternative_names_normalized IS
  'Stored normalize_org_names(alternative_names) for indexed containment matching.';

-- Note: CONCURRENTLY omitted — Supabase migrations run in a transaction
-- (same pattern as 20260708000002_org_search_indexes.sql).
CREATE INDEX IF NOT EXISTS idx_organizations_name_normalized
  ON public.organizations (name_normalized);

CREATE INDEX IF NOT EXISTS idx_organizations_alternative_names_normalized
  ON public.organizations
  USING GIN (alternative_names_normalized);

-- Match on normalized canonical name OR any alternative_name.
-- Needle is normalized once; predicates hit stored indexed columns.
CREATE OR REPLACE FUNCTION public.find_organizations_by_name(p_name text)
RETURNS TABLE (
  id bigint,
  name text,
  location text,
  website text,
  alternative_names text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH needle AS (
    SELECT public.normalize_org_name(p_name) AS n
  )
  SELECT o.id, o.name, o.location, o.website, o.alternative_names
  FROM public.organizations o
  CROSS JOIN needle
  WHERE needle.n IS NOT NULL
    AND (
      o.name_normalized = needle.n
      OR o.alternative_names_normalized @> ARRAY[needle.n]
    );
$$;

GRANT EXECUTE ON FUNCTION public.find_organizations_by_name(text)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.normalize_org_name(text)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.normalize_org_names(text[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.find_organizations_by_name(text) IS
  'Return organizations whose canonical name or alternative_names match p_name '
  'after normalize_org_name (same rules as Python make_cache_key). Uses '
  'name_normalized / alternative_names_normalized indexes. Used by '
  'OrganizationRepository.find_by_name.';
