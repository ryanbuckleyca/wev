-- Provision Canada API job sources for environments that apply migrations
-- without re-running seed.sql (staging/prod). Staging seeders that copy
-- production sources are unchanged — this only inserts missing slugs.
--
-- Matches supabase/seed.sql rows for headcount + cost-waterfall APIs.

INSERT INTO public.sources (name, slug, url)
VALUES ('Headcount Labs', 'headcount', 'https://api.headcountlabs.com/v1/jobs')
ON CONFLICT (slug) DO NOTHING;

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
ON CONFLICT (slug) DO NOTHING;
