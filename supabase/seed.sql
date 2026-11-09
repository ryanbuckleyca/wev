INSERT INTO public.sources (name, slug, url)
VALUES ('Work in Culture', 'workinculture', 'https://workinculture.ca/job-search/');

INSERT INTO public.sources (name, slug, url)
VALUES
  ('WorkInNonProfits Volunteer', 'winpvol', 'https://workinnonprofits.ca/volunteer-jobs/search'),
  ('WorkInNonProfits Jobs', 'winpjobs', 'https://workinnonprofits.ca/jobs/search');

-- Idealist boards (scraper already registered; dual URLs share IdealistScraper).
-- ON CONFLICT: migration 20261109164000 may already have inserted these.
INSERT INTO public.sources (name, slug, url)
VALUES
  ('Idealist Jobs', 'idealist', 'https://www.idealist.org/en/jobs'),
  (
    'Idealist Internships',
    'idealistintern',
    'https://www.idealist.org/en/internships'
  )
ON CONFLICT DO NOTHING;
