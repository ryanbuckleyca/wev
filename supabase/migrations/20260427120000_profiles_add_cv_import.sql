-- Add metadata-only CV import tracking to profiles.
-- No file content is stored.

alter table public.profiles
  add column if not exists cv_import jsonb;

comment on column public.profiles.cv_import is
  'CV import metadata only: { filename, imported_at, source, locale }';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cv_import_shape'
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT cv_import_shape CHECK (
        cv_import IS NULL OR jsonb_typeof(cv_import) = 'object'
      );
  END IF;
END $$;
