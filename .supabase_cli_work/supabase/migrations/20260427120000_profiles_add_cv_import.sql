-- Add metadata-only CV import tracking to profiles.
-- No file content is stored.

alter table public.profiles
  add column if not exists cv_import jsonb;
comment on column public.profiles.cv_import is
  'CV import metadata only: { filename, imported_at, source, locale }';
alter table public.profiles
  add constraint cv_import_shape check (
    cv_import is null or jsonb_typeof(cv_import) = 'object'
  );
