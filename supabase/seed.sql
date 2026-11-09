-- Local seed. Migrations may already provision some of these rows
-- (e.g. 20261108120000_seed_canada_api_sources,
-- 20261109164000_seed_idealist_sources); any unique conflict is a no-op.

INSERT INTO public.sources (name, slug, url)
VALUES ('Work in Culture', 'workinculture', 'https://workinculture.ca/job-search/')
ON CONFLICT DO NOTHING;

INSERT INTO public.sources (name, slug, url)
VALUES
  ('WorkInNonProfits Volunteer', 'winpvol', 'https://workinnonprofits.ca/volunteer-jobs/search'),
  ('WorkInNonProfits Jobs', 'winpjobs', 'https://workinnonprofits.ca/jobs/search')
ON CONFLICT DO NOTHING;

-- Idealist boards (scraper already registered; dual URLs share IdealistScraper).
INSERT INTO public.sources (name, slug, url)
VALUES
  ('Idealist Jobs', 'idealist', 'https://www.idealist.org/en/jobs'),
  (
    'Idealist Internships',
    'idealistintern',
    'https://www.idealist.org/en/internships'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.sources (name, slug, url)
VALUES ('Headcount Labs', 'headcount', 'https://api.headcountlabs.com/v1/jobs')
ON CONFLICT DO NOTHING;

-- Canada cost waterfall API sources (opt-in only — scrape skips these unless
-- ``--source <slug>`` / ``--apis``: serpapi | apify | thejobsapi | theirstack).
-- Order when run intentionally: serpapi → apify → thejobsapi → theirstack.
-- ``apify`` = Apify actor for Canada Job Bank inventory (listing URLs stay jobbank.gc.ca).
INSERT INTO public.sources (name, slug, url)
VALUES
  ('SerpApi Google Jobs', 'serpapi', 'https://serpapi.com/google-jobs-api'),
  (
    'Apify (Canada Job Bank)',
    'apify',
    'https://api.apify.com/v2/acts/getascraper~jobbank-scraper'
  ),
  ('The Jobs API', 'thejobsapi', 'https://api.thejobsapi.com/v1/jobs'),
  ('TheirStack', 'theirstack', 'https://api.theirstack.com/v1/jobs/search')
ON CONFLICT DO NOTHING;
