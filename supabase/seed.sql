INSERT INTO public.sources (name, slug, url)
VALUES ('Work in Culture', 'workinculture', 'https://workinculture.ca/job-search/');

INSERT INTO public.sources (name, slug, url)
VALUES
  ('WorkInNonProfits Volunteer', 'winpvol', 'https://workinnonprofits.ca/volunteer-jobs/search'),
  ('WorkInNonProfits Jobs', 'winpjobs', 'https://workinnonprofits.ca/jobs/search');

INSERT INTO public.sources (name, slug, url)
VALUES ('Headcount Labs', 'headcount', 'https://api.headcountlabs.com/v1/jobs');

INSERT INTO public.sources (name, slug, url)
VALUES ('Canada Job Bank', 'jobbank', 'https://www.jobbank.gc.ca/');

-- Canada cost waterfall API sources (opt-in only — scrape skips these unless
-- ``--source <slug>``: serpapi | jobbank | thejobsapi | theirstack).
-- Order when run intentionally: serpapi → jobbank → thejobsapi → theirstack.
INSERT INTO public.sources (name, slug, url)
VALUES
  ('SerpApi Google Jobs', 'serpapi', 'https://serpapi.com/google-jobs-api'),
  ('The Jobs API', 'thejobsapi', 'https://api.thejobsapi.com/v1/jobs'),
  ('TheirStack', 'theirstack', 'https://api.theirstack.com/v1/jobs/search');