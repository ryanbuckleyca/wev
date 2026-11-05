-- Skip job-match recalculation for jobs classified non-SSE (is_sse = false).
-- Unresolved is_sse (NULL) stays eligible so rows can enqueue once classified.
-- Preserves existing INSERT / OLD-or-NEW values+skills qualification checks.

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
    if v_freshly_qualified and (new.is_sse is distinct from false) then
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
    );
    if not v_match_cols_changed then
      return new;
    end if;

    if (
      (new."values" is not null and array_length(new."values", 1) is not null)
      or (new.skills is not null and array_length(new.skills, 1) is not null)
      or (old."values" is not null and array_length(old."values", 1) is not null)
      or (old.skills is not null and array_length(old.skills, 1) is not null)
    ) and (new.is_sse is distinct from false) then
      perform public.enqueue_job_match_recalc(new.id);
    end if;
    return new;
  end if;

  return new;
end;
$func$;
