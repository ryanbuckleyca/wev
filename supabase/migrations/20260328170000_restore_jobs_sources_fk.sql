-- Restore the jobs -> sources relationship required by PostgREST embeds.
-- Schema-only: this does not modify application data rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_source_id_fkey'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES public.sources(id);
  END IF;
END $$;

-- Prompt PostgREST to refresh its schema cache so embedded selects work again.
NOTIFY pgrst, 'reload schema';
