-- Re-run display-name cleanups with selection predicates that match the
-- replacement patterns (brackets / interior whitespace / slash CTAs). Idempotent
-- for environments that already applied the narrower WHERE clauses.

UPDATE public.organizations
SET name = btrim(regexp_replace(
  name,
  '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?))\s*$',
  '',
  'i'
))
WHERE name ~* '(\s*[\(\[]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*[\)\]]\s*$|\s*[\-–—]\s*\d+\s+(positions?|postes?|openings?|vacancies|roles?|offres?)\s*$)';

UPDATE public.organizations
SET name = btrim(regexp_replace(
  name,
  '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)',
  '',
  'i'
))
WHERE name ~* '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)';

UPDATE public.jobs
SET organization = btrim(regexp_replace(
  organization,
  '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)',
  '',
  'i'
))
WHERE organization ~* '(\s*[|\/]\s*(apply(\s+now)?|postuler|postulez|candidat(ure|er)?|submit(\s+(an?\s+)?application)?|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio|beacons\.ai|solo\.to|allmylinks)\s*$|\s*[\-–—]\s*(apply(\s+now)?|postuler|postulez|linktree|linktr\.ee|carrd(\.co)?|bio\.link|lnk\.bio)\s*$)';

UPDATE public.organizations
SET name = name
WHERE name_normalized IS DISTINCT FROM public.normalize_org_name(name);

UPDATE public.organizations
SET alternative_names = alternative_names
WHERE alternative_names_normalized
  IS DISTINCT FROM public.normalize_org_names(alternative_names);
