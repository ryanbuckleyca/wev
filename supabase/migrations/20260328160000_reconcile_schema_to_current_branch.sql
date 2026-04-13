-- Reconcile missing tables and columns that were squashed/omitted.

CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "user_id" uuid NOT NULL,
    "job_id" uuid NOT NULL,
    "notes" text,
    "tags" text[] DEFAULT '{}'::text[] NOT NULL,
    PRIMARY KEY ("user_id", "job_id")
);
ALTER TABLE "public"."bookmarks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."job_matches" (
    "user_id" uuid NOT NULL,
    "job_id" uuid NOT NULL,
    "score" numeric NOT NULL,
    "shared_skills" text[],
    "shared_values" text[] DEFAULT '{}'::text[] NOT NULL,
    "skill_score" numeric,
    "value_score" numeric,
    "location_score" numeric,
    "work_type_score" numeric,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("user_id", "job_id")
);
ALTER TABLE "public"."job_matches" OWNER TO "postgres";

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "skills" text[],
  ADD COLUMN IF NOT EXISTS "skills_rated" jsonb,
  ADD COLUMN IF NOT EXISTS "values_rated" jsonb,
  ADD COLUMN IF NOT EXISTS "work_types" text[],
  ADD COLUMN IF NOT EXISTS "ideal_work_environment" text,
  ADD COLUMN IF NOT EXISTS "lat" double precision,
  ADD COLUMN IF NOT EXISTS "lng" double precision,
  ADD COLUMN IF NOT EXISTS "location_display_name" text,
  ADD COLUMN IF NOT EXISTS "municipality" text,
  ADD COLUMN IF NOT EXISTS "province" text;


ALTER TABLE "public"."jobs"
  ADD COLUMN IF NOT EXISTS "language" text,
  ADD COLUMN IF NOT EXISTS "skills" text[],
  ADD COLUMN IF NOT EXISTS "skills_rated" jsonb,
  ADD COLUMN IF NOT EXISTS "values" text[],
  ADD COLUMN IF NOT EXISTS "values_rated" jsonb,
  ADD COLUMN IF NOT EXISTS "lat" double precision,
  ADD COLUMN IF NOT EXISTS "lng" double precision,
  ADD COLUMN IF NOT EXISTS "geocode_accuracy_type" text;

-- Stub trigger functions needed by later migrations.
-- Full implementations are replaced in 20260330090000 and 20260330100006.
CREATE OR REPLACE FUNCTION trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Updated by later migration; stub here ensures the trigger can be created.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Updated by later migration; stub here ensures the trigger can be created.
  RETURN NEW;
END;
$$;

-- rank_weight helper used by recalculate_matches_for_user in later migrations.
CREATE OR REPLACE FUNCTION rank_weight(rank int, total int)
RETURNS float LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN total IS NULL OR total = 0 THEN 1.0
              ELSE 1.0 - ((rank - 1)::float / total::float) * 0.5
         END;
$$;
