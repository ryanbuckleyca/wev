-- Reconcile older live schema drift to the current branch shape.
-- Schema-only: no application data rows are updated or deleted here.
-- Run the paired preflight first:
--   supabase/checks/20260328160000_reconcile_schema_preflight.sql

--------------------------------------------------------------------------------
-- 1. Remove legacy remote-only normalization objects
--------------------------------------------------------------------------------
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();

DROP INDEX IF EXISTS public.idx_scrape_runs_source_id;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_source_id_fkey;

ALTER TABLE public.jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_own_roles" ON public.user_roles;

--------------------------------------------------------------------------------
-- 2. Normalize profile policies to the current branch set
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

--------------------------------------------------------------------------------
-- 3. Reassert current-branch columns and constraints
--------------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.jobs.skills IS 'ESCO skill concept URIs tagged to this job (max 10).';

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_skills_max_10_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_skills_max_10_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 10);

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS value_score float,
  ADD COLUMN IF NOT EXISTS skill_score float,
  ADD COLUMN IF NOT EXISTS shared_skills text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.job_matches.value_score IS 'Match score based on shared values (0-1, null if no values present).';
COMMENT ON COLUMN public.job_matches.skill_score IS 'Match score based on shared skills (0-1, null if no skills present).';
COMMENT ON COLUMN public.job_matches.shared_skills IS 'ESCO concept URIs shared between user and job.';

ALTER TABLE public.job_matches
  DROP CONSTRAINT IF EXISTS job_matches_score_check;

ALTER TABLE public.job_matches
  ALTER COLUMN score DROP NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_5_check;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_max_10_check
  CHECK (coalesce(array_length(skills, 1), 0) <= 10);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_values_max_5_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_values_max_5_check
  CHECK (coalesce(array_length("values", 1), 0) <= 5);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_values_rated_max_5_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_values_rated_max_5_check
  CHECK (
    values_rated IS NULL
    OR (
      jsonb_typeof(values_rated) = 'array'
      AND jsonb_array_length(values_rated) <= 5
    )
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_skills_rated_max_10_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skills_rated_max_10_check
  CHECK (
    skills_rated IS NULL
    OR (
      jsonb_typeof(skills_rated) = 'array'
      AND jsonb_array_length(skills_rated) <= 10
    )
  );

--------------------------------------------------------------------------------
-- 4. Reapply the branch-canonical ESCO search function
--------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_esco_skills_pref_en_trgm
  ON public.esco_skills USING gin (lower(preferred_label_en) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_esco_skills_pref_fr_trgm
  ON public.esco_skills USING gin (lower(preferred_label_fr) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_esco_skills(
  p_query text,
  p_limit integer DEFAULT 20,
  p_locale text DEFAULT 'en'
)
RETURNS TABLE (
  concept_uri text,
  term text,
  definition text,
  scope_note text,
  skill_type text,
  reuse_level text,
  matched_alias text,
  score integer
)
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      NULLIF(lower(trim(coalesce(p_query, ''))), '') AS q,
      CASE
        WHEN lower(coalesce(p_locale, 'en')) = 'fr' THEN 'fr'
        ELSE 'en'
      END AS loc,
      greatest(1, least(coalesce(p_limit, 20), 20)) AS lim
  ),
  localized AS (
    SELECT
      e.concept_uri,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.preferred_label_fr, e.preferred_label_en)
        ELSE coalesce(e.preferred_label_en, e.preferred_label_fr)
      END AS term,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.description_fr, e.description_en)
        ELSE coalesce(e.description_en, e.description_fr)
      END AS definition,
      CASE
        WHEN p.loc = 'fr' THEN coalesce(e.scope_note_fr, e.scope_note_en)
        ELSE coalesce(e.scope_note_en, e.scope_note_fr)
      END AS scope_note,
      e.skill_type,
      e.reuse_level,
      CASE
        WHEN p.loc = 'fr' THEN
          array_remove(
            coalesce(e.alternative_label_fr, '{}'::text[])
            || coalesce(e.alternative_label_en, '{}'::text[]),
            ''
          )
        ELSE
          array_remove(
            coalesce(e.alternative_label_en, '{}'::text[])
            || coalesce(e.alternative_label_fr, '{}'::text[]),
            ''
          )
      END AS aliases,
      p.q
    FROM public.esco_skills AS e
    CROSS JOIN params AS p
    WHERE p.q IS NOT NULL
      AND (
        (p.loc = 'en' AND (
          lower(e.preferred_label_en) LIKE '%' || p.q || '%'
          OR EXISTS (
            SELECT 1
            FROM unnest(e.alternative_label_en) ext
            WHERE lower(ext) LIKE '%' || p.q || '%'
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(e.alternative_label_fr) ext
            WHERE lower(ext) LIKE '%' || p.q || '%'
          )
        ))
        OR
        (p.loc = 'fr' AND (
          lower(e.preferred_label_fr) LIKE '%' || p.q || '%'
          OR EXISTS (
            SELECT 1
            FROM unnest(e.alternative_label_fr) ext
            WHERE lower(ext) LIKE '%' || p.q || '%'
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(e.alternative_label_en) ext
            WHERE lower(ext) LIKE '%' || p.q || '%'
          )
        ))
      )
  ),
  scored AS (
    SELECT
      l.concept_uri,
      l.term,
      l.definition,
      l.scope_note,
      l.skill_type,
      l.reuse_level,
      (
        SELECT alt
        FROM unnest(l.aliases) AS alt
        WHERE
          lower(alt) = l.q
          OR lower(alt) LIKE l.q || '%'
          OR lower(alt) LIKE '%' || l.q || '%'
        ORDER BY
          CASE
            WHEN lower(alt) = l.q THEN 1
            WHEN lower(alt) LIKE l.q || '%' THEN 2
            ELSE 3
          END,
          length(alt)
        LIMIT 1
      ) AS matched_alias,
      CASE
        WHEN lower(l.term) = l.q THEN 700
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) = l.q
        ) THEN 650
        WHEN lower(l.term) LIKE l.q || '%' THEN 600
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) LIKE l.q || '%'
        ) THEN 550
        WHEN lower(l.term) LIKE '%' || l.q || '%' THEN 500
        WHEN EXISTS (
          SELECT 1
          FROM unnest(l.aliases) AS alt
          WHERE lower(alt) LIKE '%' || l.q || '%'
        ) THEN 450
        WHEN lower(coalesce(l.definition, '')) LIKE '%' || l.q || '%' THEN 200
        WHEN lower(coalesce(l.scope_note, '')) LIKE '%' || l.q || '%' THEN 150
        ELSE 0
      END AS score
    FROM localized AS l
  )
  SELECT
    s.concept_uri,
    s.term,
    s.definition,
    s.scope_note,
    s.skill_type,
    s.reuse_level,
    s.matched_alias,
    s.score
  FROM scored AS s
  WHERE s.score > 0
  ORDER BY s.score DESC, s.term ASC
  LIMIT (SELECT lim FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.search_esco_skills(text, integer, text)
TO anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. Replace the legacy tier-based matching engine
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_job_values_changed ON public.jobs;
DROP TRIGGER IF EXISTS trg_profile_values_changed ON public.profiles;

DROP FUNCTION IF EXISTS public.value_tier_weight(text);

--------------------------------------------------------------------------------
-- Helper: rank -> weight (mirrors getRankWeight in value-ratings.ts)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rank_weight(p_rank int, p_total int)
RETURNS float LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_rank IS NULL OR p_total <= 1 THEN 0.5
    ELSE 1.0 - ((LEAST(GREATEST(p_rank, 1), p_total) - 1)::float
                 / (p_total - 1)::float) * 0.75
  END;
$$;

--------------------------------------------------------------------------------
-- Helper: look up job confidence weight for a single value name.
-- Duplicate values use MIN(weight), matching buildJobConfidenceMap in TS.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION job_confidence_weight(p_job_rated jsonb, p_value text)
RETURNS float LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_job_rated IS NULL OR jsonb_array_length(p_job_rated) = 0 THEN 1.0
    ELSE COALESCE(
      (
        SELECT MIN(rank_weight(
          (elem->>'confidence')::int,
          jsonb_array_length(p_job_rated)
        ))
        FROM jsonb_array_elements(p_job_rated) AS elem
        WHERE elem->>'value' = p_value
      ),
      1.0
    )
  END;
$$;

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single user against all jobs
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_user_values   text[];
  v_values_rated  jsonb;
  v_user_skills   text[];
  v_use_weighted  boolean;
BEGIN
  SELECT "values", values_rated, skills
  INTO v_user_values, v_values_rated, v_user_skills
  FROM profiles
  WHERE id = p_user_id;

  IF (
    (v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL)
    AND (v_values_rated IS NULL OR jsonb_array_length(v_values_rated) = 0)
    AND (v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL)
  ) THEN
    DELETE FROM job_matches WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_use_weighted := (
    v_values_rated IS NOT NULL
    AND jsonb_array_length(v_values_rated) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  IF v_use_weighted THEN
    INSERT INTO job_matches (
      user_id,
      job_id,
      score,
      value_score,
      skill_score,
      shared_values,
      shared_skills,
      updated_at
    )
    WITH valid_jobs AS (
      SELECT
        id,
        "values" AS job_values,
        values_rated AS job_rated,
        skills AS job_skills
      FROM jobs
      WHERE
        ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
        OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
    ),
    user_items AS (
      SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ),
    total AS (
      SELECT count(*)::int AS n FROM user_items
    ),
    user_weights AS (
      SELECT ui.val, rank_weight(ui.rnk, t.n) AS weight
      FROM user_items ui
      CROSS JOIN total t
    ),
    total_weight AS (
      SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights
    ),
    job_value_weights AS (
      SELECT vj.id AS job_id, x.val, MIN(x.job_w) AS job_w
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT
          elem->>'value' AS val,
          rank_weight((elem->>'confidence')::int, jsonb_array_length(vj.job_rated)) AS job_w
        FROM jsonb_array_elements(vj.job_rated) AS elem
        WHERE (elem->>'value') IS NOT NULL
      ) x
      WHERE vj.job_rated IS NOT NULL
        AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    weighted_value_base AS (
      SELECT
        vj.id AS job_id,
        vj.job_values,
        COALESCE(
          SUM(uw.weight * COALESCE(jvw.job_w, 1.0))
            FILTER (WHERE uw.val = ANY(vj.job_values)),
          0
        ) AS overlap_num,
        COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values))::int AS shared_count,
        ARRAY(
          SELECT uw2.val
          FROM user_weights uw2
          WHERE uw2.val = ANY(vj.job_values)
        ) AS shared_values
      FROM valid_jobs vj
      CROSS JOIN user_weights uw
      LEFT JOIN job_value_weights jvw
        ON jvw.job_id = vj.id AND jvw.val = uw.val
      GROUP BY vj.id, vj.job_values
    ),
    value_computed AS (
      SELECT
        wb.job_id,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN NULL
          WHEN tw.total_w = 0 THEN 0.0
          ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
        END AS value_score,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN '{}'::text[]
          ELSE wb.shared_values
        END AS shared_values
      FROM weighted_value_base wb
      CROSS JOIN total_weight tw
    ),
    skill_computed AS (
      SELECT
        vj.id AS job_id,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(v_user_skills, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS skill_score,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_skills
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_skills, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT
        p_user_id AS user_id,
        vj.id AS job_id,
        CASE
          WHEN vc.value_score IS NOT NULL AND sc.skill_score IS NOT NULL THEN (vc.value_score * 0.6) + (sc.skill_score * 0.4)
          WHEN vc.value_score IS NOT NULL THEN vc.value_score
          WHEN sc.skill_score IS NOT NULL THEN sc.skill_score
          ELSE NULL
        END AS score,
        vc.value_score,
        sc.skill_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(sc.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN skill_computed sc ON sc.job_id = vj.id
    )
    SELECT
      user_id,
      job_id,
      score,
      value_score,
      skill_score,
      shared_values,
      shared_skills,
      now()
    FROM combined
    WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;

  ELSE
    INSERT INTO job_matches (
      user_id,
      job_id,
      score,
      value_score,
      skill_score,
      shared_values,
      shared_skills,
      updated_at
    )
    WITH valid_jobs AS (
      SELECT
        id,
        "values" AS job_values,
        values_rated AS job_rated,
        skills AS job_skills
      FROM jobs
      WHERE
        ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
        OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
    ),
    job_value_weights AS (
      SELECT vj.id AS job_id, x.val, MIN(x.job_w) AS job_w
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT
          elem->>'value' AS val,
          rank_weight((elem->>'confidence')::int, jsonb_array_length(vj.job_rated)) AS job_w
        FROM jsonb_array_elements(vj.job_rated) AS elem
        WHERE (elem->>'value') IS NOT NULL
      ) x
      WHERE vj.job_rated IS NOT NULL
        AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    value_computed AS (
      SELECT
        vj.id AS job_id,
        CASE
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (
              COALESCE(
                (
                  SELECT SUM(COALESCE(jvw.job_w, 1.0))
                  FROM unnest(shared_arr.v) AS sv
                  LEFT JOIN job_value_weights jvw
                    ON jvw.job_id = vj.id AND jvw.val = sv
                ),
                0
              ) / array_length(v_user_values, 1)::float
            ) + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS value_score,
        CASE
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_values
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_values, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_values, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    skill_computed AS (
      SELECT
        vj.id AS job_id,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN NULL
          ELSE LEAST(
            (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(v_user_skills, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
            1.0
          )
        END AS skill_score,
        CASE
          WHEN v_user_skills IS NULL OR array_length(v_user_skills, 1) IS NULL
            OR vj.job_skills IS NULL OR array_length(vj.job_skills, 1) IS NULL
          THEN '{}'::text[]
          ELSE shared_arr.v
        END AS shared_skills
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_skills, '{}'::text[]))
          INTERSECT
          SELECT unnest(COALESCE(vj.job_skills, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT
        p_user_id AS user_id,
        vj.id AS job_id,
        CASE
          WHEN vc.value_score IS NOT NULL AND sc.skill_score IS NOT NULL THEN (vc.value_score * 0.6) + (sc.skill_score * 0.4)
          WHEN vc.value_score IS NOT NULL THEN vc.value_score
          WHEN sc.skill_score IS NOT NULL THEN sc.skill_score
          ELSE NULL
        END AS score,
        vc.value_score,
        sc.skill_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(sc.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN skill_computed sc ON sc.job_id = vj.id
    )
    SELECT
      user_id,
      job_id,
      score,
      value_score,
      skill_score,
      shared_values,
      shared_skills,
      now()
    FROM combined
    WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET
      score = EXCLUDED.score,
      value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score,
      shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$func$;

--------------------------------------------------------------------------------
-- Core: recalculate matches for a single job against all users
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_matches_for_job(p_job_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_job_values text[];
  v_job_rated  jsonb;
  v_job_skills text[];
BEGIN
  SELECT "values", values_rated, skills
  INTO v_job_values, v_job_rated, v_job_skills
  FROM jobs
  WHERE id = p_job_id;

  IF (
    (v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL)
    AND (v_job_skills IS NULL OR array_length(v_job_skills, 1) IS NULL)
  ) THEN
    DELETE FROM job_matches WHERE job_id = p_job_id;
    RETURN;
  END IF;

  INSERT INTO job_matches (
    user_id,
    job_id,
    score,
    value_score,
    skill_score,
    shared_values,
    shared_skills,
    updated_at
  )
  WITH job_value_weights AS (
    SELECT x.val, MIN(x.job_w) AS job_w
    FROM (
      SELECT
        elem->>'value' AS val,
        rank_weight((elem->>'confidence')::int, jsonb_array_length(v_job_rated)) AS job_w
      FROM jsonb_array_elements(COALESCE(v_job_rated, '[]'::jsonb)) AS elem
      WHERE v_job_rated IS NOT NULL
        AND jsonb_array_length(v_job_rated) > 0
        AND (elem->>'value') IS NOT NULL
    ) x
    GROUP BY x.val
  ),
  all_profiles AS (
    SELECT
      p.id AS profile_id,
      p."values" AS user_values,
      p.values_rated,
      p.skills AS user_skills
    FROM profiles p
    WHERE
      (p."values" IS NOT NULL AND array_length(p."values", 1) IS NOT NULL)
      OR (p.values_rated IS NOT NULL AND jsonb_array_length(p.values_rated) > 0)
      OR (p.skills IS NOT NULL AND array_length(p.skills, 1) IS NOT NULL)
  ),
  weighted_profiles AS (
    SELECT ap.profile_id, ap.values_rated
    FROM all_profiles ap
    WHERE ap.values_rated IS NOT NULL
      AND jsonb_array_length(ap.values_rated) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(ap.values_rated) AS elem
        WHERE (elem->>'rank') IS NOT NULL
      )
  ),
  weighted_items AS (
    SELECT
      wp.profile_id,
      elem->>'value' AS val,
      (elem->>'rank')::int AS rnk,
      jsonb_array_length(wp.values_rated)::int AS total
    FROM weighted_profiles wp
    CROSS JOIN jsonb_array_elements(wp.values_rated) AS elem
    WHERE (elem->>'value') IS NOT NULL
  ),
  weighted_rows AS (
    SELECT profile_id, val, rank_weight(rnk, total) AS weight
    FROM weighted_items
  ),
  weighted_value_base AS (
    SELECT
      wr.profile_id AS user_id,
      COALESCE(
        SUM(wr.weight * COALESCE(jvw.job_w, 1.0))
          FILTER (WHERE wr.val = ANY(v_job_values)),
        0
      ) AS overlap_num,
      COUNT(*) FILTER (WHERE wr.val = ANY(v_job_values))::int AS shared_count,
      SUM(wr.weight) AS total_w,
      COALESCE(
        array_agg(DISTINCT wr.val) FILTER (WHERE wr.val = ANY(v_job_values)),
        '{}'::text[]
      ) AS shared_values
    FROM weighted_rows wr
    LEFT JOIN job_value_weights jvw ON jvw.val = wr.val
    GROUP BY wr.profile_id
  ),
  weighted_value_computed AS (
    SELECT
      wvb.user_id,
      CASE
        WHEN v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN NULL
        WHEN wvb.total_w = 0 THEN 0.0
        ELSE LEAST((wvb.overlap_num / wvb.total_w) + LEAST(wvb.shared_count * 0.1, 0.3), 1.0)
      END AS value_score,
      CASE
        WHEN v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL THEN '{}'::text[]
        ELSE wvb.shared_values
      END AS shared_values
    FROM weighted_value_base wvb
  ),
  flat_value_computed AS (
    SELECT
      ap.profile_id AS user_id,
      CASE
        WHEN v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL
          OR ap.user_values IS NULL OR array_length(ap.user_values, 1) IS NULL
        THEN NULL
        ELSE LEAST(
          (
            COALESCE(
              (
                SELECT SUM(COALESCE(jvw.job_w, 1.0))
                FROM unnest(shared_arr.v) AS sv
                LEFT JOIN job_value_weights jvw ON jvw.val = sv
              ),
              0
            ) / array_length(ap.user_values, 1)::float
          ) + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
          1.0
        )
      END AS value_score,
      CASE
        WHEN v_job_values IS NULL OR array_length(v_job_values, 1) IS NULL
          OR ap.user_values IS NULL OR array_length(ap.user_values, 1) IS NULL
        THEN '{}'::text[]
        ELSE shared_arr.v
      END AS shared_values
    FROM all_profiles ap
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT unnest(COALESCE(ap.user_values, '{}'::text[]))
        INTERSECT
        SELECT unnest(COALESCE(v_job_values, '{}'::text[]))
      ) AS v
    ) shared_arr
    WHERE ap.profile_id NOT IN (SELECT profile_id FROM weighted_profiles)
  ),
  value_computed AS (
    SELECT * FROM weighted_value_computed
    UNION ALL
    SELECT * FROM flat_value_computed
  ),
  skill_computed AS (
    SELECT
      ap.profile_id AS user_id,
      CASE
        WHEN v_job_skills IS NULL OR array_length(v_job_skills, 1) IS NULL
          OR ap.user_skills IS NULL OR array_length(ap.user_skills, 1) IS NULL
        THEN NULL
        ELSE LEAST(
          (COALESCE(array_length(shared_arr.v, 1), 0)::float / array_length(ap.user_skills, 1)::float)
          + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3),
          1.0
        )
      END AS skill_score,
      CASE
        WHEN v_job_skills IS NULL OR array_length(v_job_skills, 1) IS NULL
          OR ap.user_skills IS NULL OR array_length(ap.user_skills, 1) IS NULL
        THEN '{}'::text[]
        ELSE shared_arr.v
      END AS shared_skills
    FROM all_profiles ap
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT unnest(COALESCE(ap.user_skills, '{}'::text[]))
        INTERSECT
        SELECT unnest(COALESCE(v_job_skills, '{}'::text[]))
      ) AS v
    ) shared_arr
  ),
  combined AS (
    SELECT
      ap.profile_id AS user_id,
      p_job_id AS job_id,
      CASE
        WHEN vc.value_score IS NOT NULL AND sc.skill_score IS NOT NULL THEN (vc.value_score * 0.6) + (sc.skill_score * 0.4)
        WHEN vc.value_score IS NOT NULL THEN vc.value_score
        WHEN sc.skill_score IS NOT NULL THEN sc.skill_score
        ELSE NULL
      END AS score,
      vc.value_score,
      sc.skill_score,
      COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
      COALESCE(sc.shared_skills, '{}'::text[]) AS shared_skills
    FROM all_profiles ap
    LEFT JOIN value_computed vc ON vc.user_id = ap.profile_id
    LEFT JOIN skill_computed sc ON sc.user_id = ap.profile_id
  )
  SELECT
    user_id,
    job_id,
    score,
    value_score,
    skill_score,
    shared_values,
    shared_skills,
    now()
  FROM combined
  WHERE score IS NOT NULL
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    value_score = EXCLUDED.value_score,
    skill_score = EXCLUDED.skill_score,
    shared_values = EXCLUDED.shared_values,
    shared_skills = EXCLUDED.shared_skills,
    updated_at = EXCLUDED.updated_at;
END;
$func$;

--------------------------------------------------------------------------------
-- Trigger functions and trigger attachment
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_recalculate_job_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
      OR (NEW.values_rated IS NOT NULL AND jsonb_array_length(NEW.values_rated) > 0)
      OR (NEW.skills IS NOT NULL AND array_length(NEW.skills, 1) IS NOT NULL)
    ) THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values"
       OR OLD.values_rated IS DISTINCT FROM NEW.values_rated
       OR OLD.skills IS DISTINCT FROM NEW.skills
    THEN
      PERFORM recalculate_matches_for_job(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$func$;

CREATE OR REPLACE FUNCTION trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
      OR (NEW.values_rated IS NOT NULL AND jsonb_array_length(NEW.values_rated) > 0)
      OR (NEW.skills IS NOT NULL AND array_length(NEW.skills, 1) IS NOT NULL)
    ) THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values"
       OR OLD.values_rated IS DISTINCT FROM NEW.values_rated
       OR OLD.skills IS DISTINCT FROM NEW.skills
    THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$func$;

CREATE TRIGGER trg_job_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_job_matches();

CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_user_matches();

GRANT EXECUTE ON FUNCTION public.recalculate_matches_for_user(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_matches_for_job(UUID) TO service_role;
