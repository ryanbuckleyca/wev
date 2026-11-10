-- Skip job-match recalculation unless jobs.is_sse is true.
-- jobs.is_sse defaults to false (unclassified / non-SSE); only confirmed SSE
-- jobs enqueue. Watch is_sse so false→true after classification enqueues too.
-- Recreate the trigger so UPDATE OF includes is_sse (column-scoped triggers
-- ignore function body checks for columns not listed).

create or replace function public.trigger_recalculate_job_matches()
returns trigger language plpgsql security definer
set search_path = public
as $func$
declare
  v_match_cols_changed boolean := false;
  v_freshly_qualified boolean := false;
begin
  if tg_op = 'INSERT' then
    v_freshly_qualified := (
      (new."values" is not null and array_length(new."values", 1) is not null)
      or (new.skills is not null and array_length(new.skills, 1) is not null)
    );
    if v_freshly_qualified and new.is_sse is true then
      perform public.enqueue_job_match_recalc(new.id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_match_cols_changed := (
      old."values" is distinct from new."values"
      or old.values_rated is distinct from new.values_rated
      or old.skills is distinct from new.skills
      or old.work_type is distinct from new.work_type
      or old.lat is distinct from new.lat
      or old.lng is distinct from new.lng
      or old.municipality is distinct from new.municipality
      or old.province is distinct from new.province
      or old.geocode_accuracy_type is distinct from new.geocode_accuracy_type
      or old.is_sse is distinct from new.is_sse
    );
    if not v_match_cols_changed then
      return new;
    end if;

    if (
      (new."values" is not null and array_length(new."values", 1) is not null)
      or (new.skills is not null and array_length(new.skills, 1) is not null)
      or (old."values" is not null and array_length(old."values", 1) is not null)
      or (old.skills is not null and array_length(old.skills, 1) is not null)
    ) and new.is_sse is true then
      perform public.enqueue_job_match_recalc(new.id);
    end if;
    return new;
  end if;

  return new;
end;
$func$;

drop trigger if exists trg_job_values_changed on public.jobs;

create trigger trg_job_values_changed
after insert or update of
  "values", values_rated, skills, work_type,
  lat, lng, municipality, province, geocode_accuracy_type, is_sse
on public.jobs
for each row execute function public.trigger_recalculate_job_matches();
