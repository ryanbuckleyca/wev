INSERT INTO public.sources (name, slug, url)
VALUES ('Work in Culture', 'workinculture', 'https://workinculture.ca/job-search/');

INSERT INTO public.sources (name, slug, url)
VALUES
  ('WorkInNonProfits Volunteer', 'winpvol', 'https://workinnonprofits.ca/volunteer-jobs/search'),
  ('WorkInNonProfits Jobs', 'winpjobs', 'https://workinnonprofits.ca/jobs/search');

INSERT INTO public.sources (name, slug, url)
VALUES ('Headcount Labs', 'headcount', 'https://api.headcountlabs.com/v1/jobs');

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
  ('TheirStack', 'theirstack', 'https://api.theirstack.com/v1/jobs/search');
