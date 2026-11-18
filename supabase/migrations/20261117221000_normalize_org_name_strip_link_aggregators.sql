-- Strip link-aggregator chrome from org-name normalization so
-- "The Kindness and Smile Zone | Linktree" matches the clean name.
-- Also keeps apply-CTA stripping from 20261117220000.
-- Mirrors Python utils.organization_cache._strip_page_chrome_suffix.

CREATE OR REPLACE FUNCTION public.normalize_org_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  s text := coalesce(p_name, '');
  prev text;
  m text[];
  token text;
BEGIN
  -- Repeat page-chrome and hiring-count strips until neither changes s, then
  -- run the acronym step below. One suffix still yields the same result;
  -- stacked suffixes ("Org | Apply (2 positions)") clear in this pass.
  FOR _i IN 1..8 LOOP
    prev := s;
    -- Drop page-chrome noise: "| Apply", "| Linktree", "– Postuler", etc.
    s := regexp_replace(
      s,
      '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)',
      '',
      'i'
    );

    -- Drop posting-count noise: "(2 positions)", "– 3 postes", etc.
    s := regexp_replace(
      s,
      '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
      '',
      'i'
    );
    EXIT WHEN s IS NOT DISTINCT FROM prev;
  END LOOP;

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
  'organization_cache.make_cache_key; strips page-chrome / hiring-count suffixes '
  'and trailing acronyms).';

-- Clean dirty display names and recompute STORED generated columns.
-- Keep the original value when the strip would be empty or would duplicate
-- organizations_identity_key at the same location.

CREATE OR REPLACE FUNCTION pg_temp.project_page_chrome_display(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := coalesce(p_name, '');
  stripped text;
BEGIN
  stripped := regexp_replace(
    s,
    '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)',
    '',
    'i'
  );
  IF stripped IS DISTINCT FROM s THEN
    RETURN btrim(stripped);
  END IF;
  RETURN s;
END;
$$;

WITH projected AS (
  SELECT
    id,
    name AS old_name,
    pg_temp.project_page_chrome_display(name) AS new_name,
    coalesce(nullif(lower(btrim(location)), ''), '') AS loc_key
  FROM public.organizations
),
collisions AS (
  SELECT lower(btrim(new_name)) AS name_key, loc_key
  FROM projected
  WHERE btrim(new_name) <> ''
  GROUP BY 1, 2
  HAVING count(*) > 1
)
UPDATE public.organizations AS o
SET name = p.new_name
FROM projected AS p
WHERE o.id = p.id
  AND p.old_name IS DISTINCT FROM p.new_name
  AND btrim(p.new_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM collisions AS c
    WHERE c.name_key = lower(btrim(p.new_name))
      AND c.loc_key = p.loc_key
  );

UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);

UPDATE public.jobs AS j
SET organization = cleaned.new_name
FROM (
  SELECT
    id,
    pg_temp.project_page_chrome_display(organization) AS new_name
  FROM public.jobs
  WHERE organization IS NOT NULL
) AS cleaned
WHERE j.id = cleaned.id
  AND j.organization IS DISTINCT FROM cleaned.new_name
  AND btrim(cleaned.new_name) <> '';
