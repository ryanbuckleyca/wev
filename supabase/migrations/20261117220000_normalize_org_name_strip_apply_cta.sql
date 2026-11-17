-- Strip career-page apply CTAs from org-name normalization so
-- "Clean Energy Canada | Apply" matches "Clean Energy Canada".
-- Mirrors Python utils.organization_cache._strip_page_chrome_suffix (apply-CTA part).

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
  -- Drop apply-CTA noise: "| Apply", "– Postuler", etc.
  s := regexp_replace(
    s,
    '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez)\s*$)',
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
  'organization_cache.make_cache_key; strips apply-CTA and hiring-count suffixes '
  'and trailing acronyms).';

-- Clean dirty display names and recompute STORED generated columns.
UPDATE public.organizations
SET name = btrim(regexp_replace(
  name,
  '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez)\s*$)',
  '',
  'i'
))
WHERE name ~* '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez)\s*$)';

UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);

UPDATE public.jobs
SET organization = btrim(regexp_replace(
  organization,
  '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez)\s*$)',
  '',
  'i'
))
WHERE organization ~* '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez)\s*$)';
