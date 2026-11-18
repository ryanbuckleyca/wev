-- Environments that already applied 20261117210000 (function replace only)
-- still need STORED generated columns recomputed. Idempotent if 17210000's
-- trailing UPDATEs already ran.

-- Same duplicate policy as 20261117210000: do not blank a name, and do not
-- write a lower(name)+location key that another row already projects to.

CREATE OR REPLACE FUNCTION pg_temp.project_hiring_count_display(p_name text)
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
    '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
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
    pg_temp.project_hiring_count_display(name) AS new_name,
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
