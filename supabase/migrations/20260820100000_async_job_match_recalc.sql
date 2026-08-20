-- Fix: stop blocking every jobs UPDATE on synchronous match recalculation.
--
-- Background
-- ----------
-- The unified post-processor writes summary/values/sse_details/language for every
-- processed job. Previously, each row UPDATE fired a trigger that called
-- recalculate_matches_for_job(...), which iterates every qualifying user profile
-- and recomputes that profile's full jobs matrix inline. As profile/job counts
-- grew, that inline recalc started hitting statement_timeout (PGRST / PG:57014)
-- and failing the entire jobs UPDATE. The scraper's retry layer correctly
-- classified 57014 as non-transient, so the write became "permanently failed"
-- even though the actual row mutation was trivial.
--
-- In short: the trigger was punishing writes for metadata that does not even
-- affect match scores. The correct shape is:
--   * a trigger that only fires on columns that actually change scoring
--     (values, values_rated, skills, work_type, lat, lng, municipality,
--     province, geocode_accuracy_type)
--   * a trigger function that enqueues the recalc instead of executing it inline
--   * an async worker that drains that queue outside the UPDATE transaction
--
-- This migration also fixes a latent schema bug: since
-- 20260328160000_reconcile_schema_to_current_branch.sql,
-- trigger_recalculate_job_matches() has remained a no-op stub that never called
-- recalculate_matches_for_job(NEW.id). That is replaced here.

create extension if not exists pg_cron with schema extensions;

--------------------------------------------------------------------------------
-- 1. Queue table
--------------------------------------------------------------------------------
create table if not exists public.job_match_recalc_queue (
  job_id uuid not null,
  enqueued_at timestamptz not null default now(),
  run_after timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  attempts int not null default 0,
  last_error text,
  processed_at timestamptz,
  primary key (job_id)
);

create index if not exists job_match_recalc_queue_run_idx
  on public.job_match_recalc_queue (run_after, claimed_at)
  include (job_id, attempts);

grant select, insert, update, delete on public.job_match_recalc_queue
  to service_role;

--------------------------------------------------------------------------------
-- 2. Explicit enqueue RPC (called by scraper / admin paths when they know a
--    match-relevant column changed)
--------------------------------------------------------------------------------
create or replace function public.enqueue_job_match_recalc(p_job_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $func$
begin
  if p_job_id is null then
    return;
  end if;

  insert into public.job_match_recalc_queue (job_id)
  values (p_job_id)
  on conflict (job_id) do update
    set
      enqueued_at = now(),
      run_after  = now(),
      claimed_at = null,
      processed_at = null,
      last_error = null,
      attempts = 0;
end;
$func$;

revoke all on function public.enqueue_job_match_recalc(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_job_match_recalc(uuid) to service_role;

--------------------------------------------------------------------------------
-- 3. Drain queue worker: claim up to N rows, process them, record outcomes.
--    Runs via pg_cron on a short cadence; also callable manually.
--------------------------------------------------------------------------------
create or replace function public.process_job_match_recalc_queue(
  p_batch_size int default 25,
  p_attempts_max int default 8,
  p_claim_owner text default 'pg_cron-worker',
  p_lease_seconds int default 180
)
returns table (
  processed_jobs int,
  failed_jobs int
)
language plpgsql security definer
set search_path = public
as $func$
declare
  v_rows uuid[];
  v_job_id uuid;
  v_processed int := 0;
  v_failed int := 0;
  v_now timestamptz := now();
begin
  -- 1) reset stale claims (prevents a crashed worker from permanently holding rows)
  update public.job_match_recalc_queue q
  set claimed_at = null, claimed_by = null, last_error = 'stale claim released'
  where q.claimed_at is not null
    and q.processed_at is null
    and q.claimed_at < (v_now - (p_lease_seconds::text || 's')::interval);

  -- 2) claim a batch of ready, unprocessed rows, preferring oldest first
  with candidates as (
    select q.job_id
    from public.job_match_recalc_queue q
    where q.processed_at is null
      and q.run_after <= v_now
      and (q.claimed_at is null
           or q.claimed_at < (v_now - (p_lease_seconds::text || 's')::interval))
      and q.attempts < p_attempts_max
    order by q.enqueued_at asc, q.job_id
    limit greatest(p_batch_size, 1)
    for update skip locked
  ),
  claimed as (
    update public.job_match_recalc_queue q
       set claimed_at = v_now,
           claimed_by = p_claim_owner,
           attempts = attempts + 1
      from candidates c
     where q.job_id = c.job_id
     returning q.job_id
  )
  select array_agg(job_id) into strict v_rows from claimed;

  if v_rows is null then
    return query select 0::int, 0::int;
    return;
  end if;

  foreach v_job_id in array v_rows loop
    begin
      perform public.recalculate_matches_for_job(v_job_id);

      update public.job_match_recalc_queue q
         set processed_at = now(),
             last_error = null
       where q.job_id = v_job_id;

      v_processed := v_processed + 1;
    exception when others then
      update public.job_match_recalc_queue q
         set last_error = sqlerrm,
             -- exponential-ish backoff capped at ~1h
             run_after  = now() + least((2^least(attempts, 6))::text || 's', '3600s')::interval
       where q.job_id = v_job_id;

      v_failed := v_failed + 1;
    end;
  end loop;

  return query select v_processed, v_failed;
end;
$func$;

revoke all on function public.process_job_match_recalc_queue(int, int, text, int) from public, anon, authenticated;
grant execute on function public.process_job_match_recalc_queue(int, int, text, int)
  to service_role;

--------------------------------------------------------------------------------
-- 4. Narrow the jobs trigger + make it enqueue instead of recalculating inline.
--    This also replaces the long-standing no-op stub of
--    trigger_recalculate_job_matches() with real behaviour.
--------------------------------------------------------------------------------
drop trigger if exists trg_job_values_changed on public.jobs;

create or replace function public.trigger_recalculate_job_matches()
returns trigger language plpgsql security definer
set search_path = public
as $func$
declare
  v_match_cols_changed boolean := false;
  v_freshly_qualified boolean := false;
begin
  if tg_op = 'INSERT' then
    -- Trigger is column-scoped; any INSERT that reached here carries at least
    -- one match-relevant column. Only enqueue when the row would actually be
    -- scored for at least one profile (has values or skills).
    v_freshly_qualified := (
      (new."values" is not null and array_length(new."values", 1) is not null)
      or (new.skills is not null and array_length(new.skills, 1) is not null)
    );
    if v_freshly_qualified then
      perform public.enqueue_job_match_recalc(new.id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Trigger is defined on specific match-relevant columns below, but we
    -- additionally confirm semantic change (IS DISTINCT FROM) so toggles from
    -- null to default-empty or identical array rewrites do not spam the queue.
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

    -- Enqueue if row has (or just gained) scoring-relevant data.
    if (
      (new."values" is not null and array_length(new."values", 1) is not null)
      or (new.skills is not null and array_length(new.skills, 1) is not null)
      or (old."values" is not null and array_length(old."values", 1) is not null)
      or (old.skills is not null and array_length(old.skills, 1) is not null)
    ) then
      perform public.enqueue_job_match_recalc(new.id);
    end if;
    return new;
  end if;

  return new;
end;
$func$;

create trigger trg_job_values_changed
after insert or update of
  "values", values_rated, skills, work_type,
  lat, lng, municipality, province, geocode_accuracy_type
on public.jobs
for each row execute function public.trigger_recalculate_job_matches();

--------------------------------------------------------------------------------
-- 5. Schedule async drain. pg_cron schedules are stored cluster-wide, so this
--    is written to be idempotent (upsert via delete-then-create) and safe to
--    re-apply. The 15s cadence is a small "eventual consistency" window.
--------------------------------------------------------------------------------
do $sched$
declare
  v_job_name text := 'job-match-recalc-queue-drain';
begin
  perform 1 from cron.job where jobname = v_job_name;
  if found then
    perform cron.unschedule(v_job_name);
  end if;

  perform cron.schedule(
    v_job_name,
    '*/15 * * * * *',
    $$select public.process_job_match_recalc_queue(p_batch_size => 25);$$
  );
end;
$sched$;
