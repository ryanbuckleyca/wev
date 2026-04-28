-- Add metadata-only CV import tracking to profiles.
-- No file content is stored.

alter table public.profiles
  add column if not exists cv_import jsonb;

comment on column public.profiles.cv_import is
  'CV import metadata only: { filename, imported_at, source, locale }';
