-- Strip job-board hiring-count suffixes from org-name normalization so
-- "Grand River Conservation Authority (2 positions)" matches the clean name.
-- Mirrors Python utils.organization_cache._strip_hiring_count_suffix.

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
  'organization_cache.make_cache_key; strips hiring-count suffixes and trailing acronyms).';
