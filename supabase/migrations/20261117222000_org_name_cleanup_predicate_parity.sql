-- Re-run display-name cleanups until hiring-count and apply/link suffixes
-- stop changing. A single suffix still yields the previous result. Stacked
-- suffixes ("Org | Apply (2 positions)" / "Org (2 positions) | Apply") clear
-- in this one backfill. jobs.organization uses the same rules, so a
-- hiring-count-only label such as "Acme [2 positions]" is cleaned too.
-- Skip a write that would blank the value or duplicate organizations_identity_key.

CREATE OR REPLACE FUNCTION pg_temp.clean_org_display_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := coalesce(p_name, '');
  prev text;
  stripped text;
BEGIN
  FOR _i IN 1..8 LOOP
    prev := s;
    stripped := regexp_replace(
      s,
      '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)',
      '',
      'i'
    );
    IF stripped IS DISTINCT FROM s THEN
      s := btrim(stripped);
    END IF;
    stripped := regexp_replace(
      s,
      '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
      '',
      'i'
    );
    IF stripped IS DISTINCT FROM s THEN
      s := btrim(stripped);
    END IF;
    EXIT WHEN s IS NOT DISTINCT FROM prev;
  END LOOP;
  RETURN s;
END;
$$;

WITH projected AS (
  SELECT
    id,
    name AS old_name,
    pg_temp.clean_org_display_name(name) AS new_name,
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

UPDATE public.jobs AS j
SET organization = cleaned.new_name
FROM (
  SELECT
    id,
    organization AS old_name,
    pg_temp.clean_org_display_name(organization) AS new_name
  FROM public.jobs
  WHERE organization IS NOT NULL
    AND (
      organization ~* '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]\s*$|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*$)'
      OR organization ~* '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)'
    )
) AS cleaned
WHERE j.id = cleaned.id
  AND cleaned.old_name IS DISTINCT FROM cleaned.new_name
  AND btrim(cleaned.new_name) <> '';

UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);
