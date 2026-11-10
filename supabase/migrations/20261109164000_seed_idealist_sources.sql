-- Provision Idealist board sources for environments that apply migrations
-- without re-running seed.sql (staging/prod). The scraper classes are already
-- registered; these rows are what the orchestrator loads from ``sources``.
--
-- Matches supabase/seed.sql. Untargeted ON CONFLICT DO NOTHING retains
-- existing rows on either sources_url_key or sources_slug_key.

INSERT INTO public.sources (name, slug, url)
VALUES
  ('Idealist Jobs', 'idealist', 'https://www.idealist.org/en/jobs'),
  (
    'Idealist Internships',
    'idealistintern',
    'https://www.idealist.org/en/internships'
  )
ON CONFLICT DO NOTHING;
