-- Environments that already applied 20261117210000 (function replace only)
-- still need STORED generated columns recomputed. Idempotent if 17210000's
-- trailing UPDATEs already ran.

UPDATE public.organizations
SET name = btrim(regexp_replace(
  name,
  '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
  '',
  'i'
))
WHERE name ~* '(\([0-9]+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\)|[\-–—]\s*[0-9]+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*$)';

UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);
