-- Enforce: jobs.is_sse may be true only when the linked organization is SSE.
-- Cascade: when an organization loses SSE, demote its SSE jobs.
-- Also clear any pre-existing mismatches.
--
-- Locking: both triggers take the same transaction advisory lock keyed by
-- organization id *before* touching the other table's rows. That serializes
-- job promotion (job row → check org) vs org demotion (org row → update jobs)
-- and avoids the classic job ↔ org row-lock deadlock from FOR UPDATE.
--
-- Lock key: hashtextextended('org_sse:' || org_id::text, 87201401)

CREATE OR REPLACE FUNCTION public.enforce_job_sse_requires_org_sse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_is_sse boolean;
BEGIN
  IF NEW.is_sse IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'jobs.is_sse cannot be true without an organization_id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize with demote_jobs_when_org_sse_cleared on the same org.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('org_sse:' || NEW.organization_id::text, 87201401)
  );

  SELECT o.is_sse
  INTO org_is_sse
  FROM public.organizations o
  WHERE o.id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'jobs.is_sse cannot be true: organization % not found', NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF org_is_sse IS NOT TRUE THEN
    RAISE EXCEPTION 'jobs.is_sse cannot be true unless organizations.is_sse is true'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_job_sse_requires_org_sse ON public.jobs;
CREATE TRIGGER trg_enforce_job_sse_requires_org_sse
  BEFORE INSERT OR UPDATE OF is_sse, organization_id
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_sse_requires_org_sse();

CREATE OR REPLACE FUNCTION public.demote_jobs_when_org_sse_cleared()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_sse IS NOT TRUE AND OLD.is_sse IS DISTINCT FROM NEW.is_sse THEN
    -- Same advisory key as enforce_job_sse_requires_org_sse before locking jobs.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('org_sse:' || NEW.id::text, 87201401)
    );

    UPDATE public.jobs
    SET is_sse = false
    WHERE organization_id = NEW.id
      AND is_sse IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demote_jobs_when_org_sse_cleared ON public.organizations;
CREATE TRIGGER trg_demote_jobs_when_org_sse_cleared
  AFTER UPDATE OF is_sse
  ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.demote_jobs_when_org_sse_cleared();

-- One-time cleanup of rows that already violate the invariant.
UPDATE public.jobs AS j
SET is_sse = false
FROM public.organizations AS o
WHERE o.id = j.organization_id
  AND j.is_sse IS TRUE
  AND o.is_sse IS NOT TRUE;

UPDATE public.jobs
SET is_sse = false
WHERE is_sse IS TRUE
  AND organization_id IS NULL;
