-- Org display-name cleanup (hiring counts, apply CTAs, link aggregators,
-- profile/page tabs) for organizations.name, jobs.organization, and the
-- STORED name norms.
--
-- Supersedes the per-suffix branch migrations that wev-prod / wev-test applied
-- out of band as normalize_org_name_strip_hiring_counts,
-- recompute_org_name_normalized_after_hiring_strip,
-- normalize_org_name_strip_apply_cta, normalize_org_name_strip_link_aggregators,
-- and org_name_cleanup_predicate_parity. Every statement is idempotent, so the
-- end state is the same on those databases and on a fresh one.
--
-- public.clean_org_display_name mirrors Python
-- utils.organization_cache.clean_organization_display_name
-- (_PAGE_CHROME_SUFFIX + _HIRING_COUNT_SUFFIX, repeated until stable).
-- Change both together.

CREATE OR REPLACE FUNCTION public.clean_org_display_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  s text := btrim(coalesce(p_name, ''));
  prev text;
BEGIN
  -- Every match consumes a separator, so each pass either shortens s or exits.
  LOOP
    prev := s;
    s := btrim(regexp_replace(
      s,
      '\s*[|/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks|about(\s+us)?|home|accueil|welcome|bienvenue|careers?|jobs?|emplois?|contact(\s+us)?|social\s+impact|official\s+site|our\s+story|who\s+we\s+are|get\s+involved|facebook|instagram)\s*$'
      '|(\s+[-–—]|[–—])\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|about(\s+us)?|home|accueil|welcome|bienvenue|careers?|jobs?|emplois?|contact(\s+us)?|social\s+impact)\s*$',
      '',
      'i'
    ));
    s := btrim(regexp_replace(
      s,
      '(\s*[(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[)\]]|\s*[-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
      '',
      'i'
    ));
    EXIT WHEN s = prev;
  END LOOP;
  RETURN s;
END;
$$;

COMMENT ON FUNCTION public.clean_org_display_name(text) IS
  'Strip scrape-noise suffixes from an org display name (mirrors Python '
  'organization_cache.clean_organization_display_name).';

CREATE OR REPLACE FUNCTION public.normalize_org_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  s text := public.clean_org_display_name(p_name);
  m text[];
  token text;
BEGIN
  -- Match Python _strip_trailing_acronym: only drop trailing (ACRONYM) when the
  -- alphabetic core is all-caps and length >= 2. Keep "(Ontario)" / "(Inc)".
  m := regexp_match(s, '\s*[(\[]([A-Za-z][A-Za-z0-9.&/-]{0,14})[)\]]\s*$');
  IF m IS NOT NULL THEN
    token := regexp_replace(m[1], '[^A-Za-z]', '', 'g');
    IF char_length(token) >= 2
       AND token ~ '^[A-Za-z]+$'
       AND token = upper(token) THEN
      s := regexp_replace(s, '\s*[(\[][A-Za-z][A-Za-z0-9.&/-]{0,14}[)\]]\s*$', '');
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
  'organization_cache.make_cache_key; strips scrape-noise suffixes and trailing acronyms).';

-- Rename a row only when no other row holds the cleaned identity key
-- (lower(btrim(name)) + location, see organizations_identity_key) now, and no
-- other row would hold it after this update. Skipped rows keep their name.
-- No LOCK TABLE: the CLI may run this file outside a transaction. A concurrent
-- insert that takes a cleaned name fails this statement on the unique index;
-- rerunning is safe.
WITH projected AS (
  SELECT
    id,
    btrim(name) AS old_name,
    public.clean_org_display_name(name) AS new_name,
    coalesce(nullif(lower(btrim(location)), ''), '') AS loc_key
  FROM public.organizations
),
contested AS (
  SELECT lower(new_name) AS name_key, loc_key
  FROM projected
  WHERE new_name <> ''
  GROUP BY 1, 2
  HAVING count(*) > 1
)
UPDATE public.organizations AS o
SET name = p.new_name
FROM projected AS p
WHERE o.id = p.id
  AND p.new_name <> ''
  AND p.new_name IS DISTINCT FROM p.old_name
  AND NOT EXISTS (
    SELECT 1
    FROM contested AS c
    WHERE c.name_key = lower(p.new_name)
      AND c.loc_key = p.loc_key
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.organizations AS other
    WHERE other.id <> p.id
      AND lower(btrim(other.name)) = lower(p.new_name)
      AND coalesce(nullif(lower(btrim(other.location)), ''), '') = p.loc_key
  );

UPDATE public.jobs AS j
SET organization = cleaned.new_name
FROM (
  SELECT id, public.clean_org_display_name(organization) AS new_name
  FROM public.jobs
  WHERE organization IS NOT NULL
) AS cleaned
WHERE j.id = cleaned.id
  AND cleaned.new_name <> ''
  AND cleaned.new_name IS DISTINCT FROM btrim(j.organization);

-- STORED generated columns are not recomputed when an IMMUTABLE function they
-- call is replaced; touch rows whose stored norm is stale.
UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);
