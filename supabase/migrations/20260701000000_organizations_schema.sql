-- Organizations schema extension
-- Adds rich relational columns to organizations, links jobs via organization_id FK,
-- and recreates matched_jobs so j.* expands to include organization_id.
--
-- Step order is critical to avoid constraint failures on existing rows:
--   1. Add new nullable columns
--   2. Backfill name (placeholder for any existing NULL rows)
--   3. Backfill slug (derived from name; raw SQL regex, not Python generate_slug())
--      NOTE: the || '-' || id::text suffix guarantees uniqueness regardless of name.
--      Future re-derivations should use generate_slug() instead of this raw regex.
--   4. Set NOT NULL on name and slug
--   5. Add CHECK constraints
--   6. Add uniqueness indexes
--   7. Add organization_id FK to jobs
--   8. Create index on jobs(organization_id)
--   9. Recreate matched_jobs view and re-grant SELECT

-- ── 1. Add new nullable columns ─────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug        text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS website     text,
  ADD COLUMN IF NOT EXISTS location    text,
  ADD COLUMN IF NOT EXISTS sse_rating  text,
  ADD COLUMN IF NOT EXISTS sse_details jsonb,
  ADD COLUMN IF NOT EXISTS is_sse      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url    text;

-- ── 2. Backfill name for any existing NULL rows ──────────────────────────────

UPDATE public.organizations
  SET name = 'Unknown Organization ' || id::text
  WHERE name IS NULL;

-- ── 3. Backfill slug for all existing rows ───────────────────────────────────
-- Uses raw SQL regex (not Python generate_slug() NFKD logic).
-- The || '-' || id::text suffix guarantees uniqueness regardless of name.
--
-- KNOWN ISSUE: regexp_replace treats accented characters (é, è, ê, ç, etc.)
-- as non-matching and replaces them with '-', producing incorrect slugs like
-- "centraide-montr-al-42" instead of "centraide-montreal-42". The -id suffix
-- guarantees uniqueness, but slugs are semantically wrong for French names.
-- Post-migration, run a Python script using generate_slug() to fix affected slugs.

UPDATE public.organizations
  SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || id::text
  WHERE slug IS NULL;

-- ── 4. Set NOT NULL ──────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN slug SET NOT NULL;

-- ── 5. Add CHECK constraints ─────────────────────────────────────────────────
-- PostgreSQL does not support IF NOT EXISTS for ADD CONSTRAINT; use the
-- exception-based form to make the migration re-runnable.

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_slug_nonempty CHECK (slug <> '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_sse_rating_check
      CHECK (sse_rating IS NULL OR sse_rating IN ('strong_yes', 'weak_yes', 'no'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. Add uniqueness constraints / indexes ──────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Case-insensitive normalized identity index — treats null/empty location as ''
-- so repeated inserts for the same organization (regardless of location presence)
-- are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_identity_key
  ON public.organizations (
    lower(btrim(name)),
    coalesce(nullif(lower(btrim(location)), ''), '')
  );

-- ── 7. Add organization_id FK to jobs ────────────────────────────────────────
-- organizations.id is bigint; jobs.id is uuid — the FK column type must match
-- organizations.id (bigint), not jobs.id.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS organization_id bigint
    REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ── 8. Index on jobs(organization_id) ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS jobs_organization_id_idx
  ON public.jobs (organization_id);

-- ── 9. Recreate matched_jobs so j.* expands to include organization_id ───────

DROP VIEW IF EXISTS public.matched_jobs;

CREATE VIEW public.matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM jobs j
LEFT JOIN sources s ON j.source_id = s.id
LEFT JOIN job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();

GRANT SELECT ON public.matched_jobs TO anon, authenticated, service_role;
