-- Tighten the persisted shape of profiles.cv_import.
-- Existing malformed rows are nulled before the stricter constraint is applied.

create or replace function public.is_valid_cv_import_metadata(payload jsonb)
returns boolean
language sql
immutable
as $$
  select payload is null or (
    jsonb_typeof(payload) = 'object'
    and (select count(*) from jsonb_object_keys(payload)) = 4
    and payload ?& array['filename', 'imported_at', 'source', 'locale']
    and jsonb_typeof(payload->'filename') = 'string'
    and length(btrim(payload->>'filename')) > 0
    and jsonb_typeof(payload->'imported_at') = 'string'
    and (payload->>'imported_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$'
    and jsonb_typeof(payload->'source') = 'string'
    and payload->>'source' = 'cv_upload'
    and jsonb_typeof(payload->'locale') = 'string'
    and payload->>'locale' in ('en', 'fr')
  );
$$;

comment on function public.is_valid_cv_import_metadata(jsonb) is
  'Validates profiles.cv_import metadata shape: required keys, non-empty filename, ISO timestamp, known source, and locale.';

update public.profiles
set cv_import = null
where cv_import is not null
  and not public.is_valid_cv_import_metadata(cv_import);

alter table public.profiles
  drop constraint if exists cv_import_shape;

alter table public.profiles
  add constraint cv_import_shape check (
    public.is_valid_cv_import_metadata(cv_import)
  );
