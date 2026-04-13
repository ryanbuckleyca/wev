-- Restore foreign key relationships lost in previous migrations
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_source_id_fkey,
  ADD CONSTRAINT jobs_source_id_fkey 
  FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

ALTER TABLE public.scrape_runs
  DROP CONSTRAINT IF EXISTS scrape_runs_source_id_fkey,
  ADD CONSTRAINT scrape_runs_source_id_fkey 
  FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;
