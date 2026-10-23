-- Store embeddings as halfvec(1024). Runs in the normal migration transaction:
-- ALTER TYPE holds an exclusive lock, and the HNSW indexes are rebuilt before
-- that lock is released. Indexes are created in-transaction, not concurrently.
--
-- Order:
--   1. Drop HNSW indexes that reference the vector columns.
--   2. Drop matched_jobs. It projects jobs.skill_embedding and
--      skill_phrase_embedding, and ALTER TYPE fails while that view exists.
--   3. ALTER COLUMN TYPE halfvec(1024) USING the cast.
--   4. Recreate HNSW with halfvec_cosine_ops, same m and ef_construction.
--   5. Replace functions. RPC argument types stay vector / vector[] so
--      PostgREST clients keep sending the same JSON/text arrays. Comparisons
--      cast the query side to halfvec(1024). No scoring changes.
--      statement_timeout is not set on the match RPCs: a SET clause blocks
--      inlining and the non-inlined plan seq-scans.
--   6. Recreate matched_jobs (j.* so new jobs columns stay visible) and
--      re-grant SELECT.
-- Phrase columns are empty; they are converted so later writes type-check.

DROP INDEX IF EXISTS public.esco_skills_embedding_hnsw;
DROP INDEX IF EXISTS public.jobs_skill_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.jobs_skill_phrase_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.profiles_skill_embedding_hnsw_idx;

-- matched_jobs projects jobs.skill_embedding and skill_phrase_embedding.
-- PostgreSQL refuses ALTER TYPE while that view depends on the columns.
DROP VIEW IF EXISTS public.matched_jobs;

ALTER TABLE public.esco_skills
  ALTER COLUMN embedding TYPE halfvec(1024) USING embedding::halfvec(1024);
ALTER TABLE public.jobs
  ALTER COLUMN skill_embedding TYPE halfvec(1024) USING skill_embedding::halfvec(1024);
ALTER TABLE public.jobs
  ALTER COLUMN skill_phrase_embedding TYPE halfvec(1024) USING skill_phrase_embedding::halfvec(1024);
ALTER TABLE public.profiles
  ALTER COLUMN skill_embedding TYPE halfvec(1024) USING skill_embedding::halfvec(1024);
ALTER TABLE public.job_skill_phrases
  ALTER COLUMN embedding TYPE halfvec(1024) USING embedding::halfvec(1024);
ALTER TABLE public.job_skill_phrases
  ALTER COLUMN embedding_phrase TYPE halfvec(1024) USING embedding_phrase::halfvec(1024);
ALTER TABLE public.job_skill_phrases
  ALTER COLUMN embedding_query TYPE halfvec(1024) USING embedding_query::halfvec(1024);

CREATE INDEX esco_skills_embedding_hnsw
  ON public.esco_skills USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
CREATE INDEX jobs_skill_embedding_hnsw_idx
  ON public.jobs USING hnsw (skill_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX jobs_skill_phrase_embedding_hnsw_idx
  ON public.jobs USING hnsw (skill_phrase_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX profiles_skill_embedding_hnsw_idx
  ON public.profiles USING hnsw (skill_embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.recalculate_matches_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_values     text[];
  v_values_rated    jsonb;
  v_user_skills     text[];
  v_user_work_types text[];
  v_user_lat        float8;
  v_user_lng        float8;
  v_user_muni       text;
  v_user_province   text;
  v_use_weighted    boolean;
  v_user_skill_embedding halfvec(1024);
  v_user_skills_sum_score float;
BEGIN
  -- 1. Fetch user profile data
  SELECT "values", values_rated, skills, work_types, lat, lng, municipality, province, skill_embedding
  INTO v_user_values, v_values_rated, v_user_skills, v_user_work_types,
       v_user_lat, v_user_lng, v_user_muni, v_user_province, v_user_skill_embedding
  FROM profiles
  WHERE id = p_user_id;

  -- 2. Fast exit if no matching criteria
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
      SELECT 1 FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'rank') IS NOT NULL
    )
  );

  SELECT COALESCE(SUM(score), 0) INTO v_user_skills_sum_score FROM profile_skills WHERE user_id = p_user_id;

  -- 4. Calculate Semantic Scores (Skills)
  DROP TABLE IF EXISTS _temp_skill_scores;
  CREATE TEMPORARY TABLE _temp_skill_scores (
      job_id UUID PRIMARY KEY,
      skill_score FLOAT,
      shared_skills TEXT[]
  ) ON COMMIT DROP;

  IF v_user_skill_embedding IS NOT NULL AND v_user_skills_sum_score > 0 THEN
      -- Phrase path: person ESCO embedding × job raw-phrase embedding.
      INSERT INTO _temp_skill_scores (job_id, skill_score, shared_skills)
      WITH top_jobs AS (
        SELECT id
        FROM jobs
        WHERE skill_phrase_embedding IS NOT NULL
        ORDER BY skill_phrase_embedding <=> v_user_skill_embedding
        LIMIT 300
      ),
      user_embs AS (
        SELECT ps.skill_id AS concept_uri, ps.score AS p_score, es.embedding,
               es.preferred_label_en
        FROM profile_skills ps
        JOIN esco_skills es ON es.concept_uri = ps.skill_id
        WHERE ps.user_id = p_user_id AND es.embedding IS NOT NULL
      ),
      phrase_pairs AS (
        SELECT p.job_id,
               p.phrase,
               p.kind,
               ue.concept_uri AS user_skill_uri,
               ue.p_score,
               word_similarity(
                 f_unaccent(p.phrase),
                 f_unaccent(ue.preferred_label_en)
               ) >= 0.35 AS word_ok,
               -- The phrase with its job title and source span is the sense check.
               -- A bare phrase can score higher, but only when that context still
               -- agrees (at least 0.35) or the wording is a close overlap (>= 0.50).
               -- Otherwise "conseil aux clients" matches "counsel clients".
               -- The passage vector still needs shared wording at 0.35; it drifts
               -- when the words do not overlap.
               GREATEST(
                 COALESCE(1 - (ue.embedding <=> p.embedding), 0),
                 CASE
                   WHEN word_similarity(
                     f_unaccent(p.phrase),
                     f_unaccent(ue.preferred_label_en)
                   ) >= 0.50
                     OR COALESCE(1 - (ue.embedding <=> p.embedding), 0) >= 0.35
                   THEN COALESCE(1 - (ue.embedding <=> p.embedding_query), 0)
                   ELSE 0
                 END,
                 CASE
                   WHEN p.embedding_phrase IS NULL THEN 0
                   WHEN word_similarity(
                     f_unaccent(p.phrase),
                     f_unaccent(ue.preferred_label_en)
                   ) < 0.35 THEN 0
                   WHEN word_similarity(
                     f_unaccent(p.phrase),
                     f_unaccent(ue.preferred_label_en)
                   ) >= 0.50
                     OR COALESCE(1 - (ue.embedding <=> p.embedding), 0) >= 0.35
                   THEN 1 - (ue.embedding <=> p.embedding_phrase)
                   ELSE 0
                 END
               ) AS sim
        FROM job_skill_phrases p
        JOIN top_jobs tj ON tj.id = p.job_id
        CROSS JOIN user_embs ue
        WHERE p.embedding IS NOT NULL OR p.embedding_phrase IS NOT NULL
      ),
      best_user AS (
        -- Query-space similarity counts from 0.48 with or without shared
        -- words. Unrelated catalog skills stay near 0.20 in that space.
        SELECT DISTINCT ON (job_id, user_skill_uri)
               job_id,
               user_skill_uri,
               phrase,
               sim,
               word_ok,
               p_score
                 * CASE WHEN kind = 'transversal' THEN 0.35 ELSE 1.0 END
                 * GREATEST(
                     0,
                     (sim - 0.48) / 0.52
                   ) AS weighted_sim
        FROM phrase_pairs
        ORDER BY job_id, user_skill_uri,
                 GREATEST(
                   0,
                   (sim - 0.48)
                 ) DESC,
                 sim DESC
      ),
      scored AS (
        SELECT * FROM best_user WHERE weighted_sim > 0
      ),
      breadth AS (
        -- A skill that clears the bar on several jobs is shared work.
        -- Its credit is split, so one generic overlap does not outrank
        -- a job that also matches a duty unique to that posting.
        SELECT user_skill_uri, COUNT(*)::float AS n_jobs
        FROM scored
        GROUP BY user_skill_uri
      ),
      phrase_results AS (
        SELECT s.job_id,
               LEAST(SUM(s.weighted_sim / b.n_jobs) / v_user_skills_sum_score, 1.0) AS skill_score,
               ARRAY(
                 SELECT DISTINCT s2.phrase
                 FROM scored s2
                 WHERE s2.job_id = s.job_id
               ) AS shared_skills
        FROM scored s
        JOIN breadth b ON b.user_skill_uri = s.user_skill_uri
        GROUP BY s.job_id
      )
      SELECT job_id, skill_score, COALESCE(shared_skills, '{}'::text[])
      FROM phrase_results;

      -- Fallback: jobs with no phrase embedding still use ESCO tags.
      INSERT INTO _temp_skill_scores (job_id, skill_score, shared_skills)
      WITH top_jobs AS (
        SELECT id
        FROM jobs
        WHERE skill_embedding IS NOT NULL
        ORDER BY skill_embedding <=> v_user_skill_embedding
        LIMIT 300
      ),
      user_embs AS (
        SELECT ps.skill_id AS concept_uri, ps.score AS p_score, es.embedding
        FROM profile_skills ps
        JOIN esco_skills es ON es.concept_uri = ps.skill_id
        WHERE ps.user_id = p_user_id AND es.embedding IS NOT NULL
      ),
      job_embs AS (
        SELECT js.job_id, js.skill_id AS concept_uri, js.score AS j_score,
               es.embedding, es.reuse_level
        FROM job_skills js
        JOIN top_jobs tj ON tj.id = js.job_id
        JOIN esco_skills es ON es.concept_uri = js.skill_id
        WHERE es.embedding IS NOT NULL
          AND js.job_id NOT IN (SELECT job_id FROM _temp_skill_scores)
          AND NOT EXISTS (
            SELECT 1 FROM jobs j
            WHERE j.id = js.job_id
              AND j.skill_phrase_embedding IS NOT NULL
          )
      ),
      pairs AS (
        SELECT je.job_id,
               ue.concept_uri AS user_skill_uri,
               je.concept_uri AS job_skill_uri,
               1 - (ue.embedding <=> je.embedding) AS sim,
               -- Transversal overlaps still count, at a lower weight than
               -- sector- or occupation-specific skills. Cross-sector sits between.
               -- Smooth curve: similarity 0.6 -> 0, 1.0 -> 1.
               ue.p_score * je.j_score
                 * CASE COALESCE(je.reuse_level, '')
                     WHEN 'transversal' THEN 0.35
                     WHEN 'cross-sector' THEN 0.6
                     ELSE 1.0
                   END
                 * GREATEST(0, ((1 - (ue.embedding <=> je.embedding)) - 0.6) / 0.4) AS weighted_sim
        FROM user_embs ue
        CROSS JOIN job_embs je
      ),
      best AS (
        SELECT DISTINCT ON (job_id, user_skill_uri)
               job_id, user_skill_uri, weighted_sim
        FROM pairs
        ORDER BY job_id, user_skill_uri, sim DESC
      ),
      semantic_results AS (
        SELECT b.job_id,
               SUM(b.weighted_sim) / v_user_skills_sum_score AS semantic_score,
               ARRAY(
                 SELECT DISTINCT p.job_skill_uri
                 FROM pairs p
                 WHERE p.job_id = b.job_id AND p.sim > 0.8
               ) AS semantic_shared
        FROM best b
        GROUP BY b.job_id
      )
      SELECT job_id,
             LEAST(semantic_score, 1.0) AS skill_score,
             semantic_shared AS shared_skills
      FROM semantic_results;
  END IF;

  -- 6. Execute Matching Loop
  IF v_use_weighted THEN
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
      shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills,
             work_type, lat AS job_lat, lng AS job_lng,
             municipality AS job_muni, province AS job_province,
             geocode_accuracy_type
      FROM jobs
      WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
         OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
         OR (skill_details IS NOT NULL AND jsonb_typeof(skill_details) = 'array'
             AND jsonb_array_length(skill_details) > 0)
    ),
    user_items AS (
      SELECT elem->>'value' AS val, (elem->>'rank')::int AS rnk
      FROM jsonb_array_elements(v_values_rated) AS elem
      WHERE (elem->>'value') IS NOT NULL
    ),
    total AS (SELECT count(*)::int AS n FROM user_items),
    user_weights AS (
      SELECT ui.val, rank_weight(ui.rnk, t.n) AS weight
      FROM user_items ui CROSS JOIN total t
    ),
    total_weight AS (SELECT COALESCE(SUM(weight), 0) AS total_w FROM user_weights),
    job_value_weights AS (
      SELECT vj.id AS job_id, x.val, MIN(x.job_w) AS job_w
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT elem->>'value' AS val,
               rank_weight((elem->>'confidence')::int, jsonb_array_length(vj.job_rated)) AS job_w
        FROM jsonb_array_elements(vj.job_rated) AS elem
        WHERE (elem->>'value') IS NOT NULL
      ) x
      WHERE vj.job_rated IS NOT NULL AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    weighted_value_base AS (
      SELECT vj.id AS job_id, vj.job_values,
        COALESCE(SUM(uw.weight * COALESCE(jvw.job_w, 1.0)) FILTER (WHERE uw.val = ANY(vj.job_values)), 0) AS overlap_num,
        COUNT(*) FILTER (WHERE uw.val = ANY(vj.job_values))::int AS shared_count,
        ARRAY(SELECT uw2.val FROM user_weights uw2 WHERE uw2.val = ANY(vj.job_values)) AS shared_values
      FROM valid_jobs vj
      CROSS JOIN user_weights uw
      LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = uw.val
      GROUP BY vj.id, vj.job_values
    ),
    value_computed AS (
      SELECT wb.job_id,
        CASE
          WHEN wb.job_values IS NULL OR array_length(wb.job_values, 1) IS NULL THEN NULL
          WHEN tw.total_w = 0 THEN 0.0
          ELSE LEAST((wb.overlap_num / tw.total_w) + LEAST(wb.shared_count * 0.1, 0.3), 1.0)
        END AS value_score,
        COALESCE(wb.shared_values, '{}'::text[]) AS shared_values
      FROM weighted_value_base wb CROSS JOIN total_weight tw
    ),
    combined AS (
      SELECT p_user_id AS user_id, vj.id AS job_id,
        vc.value_score, ts.skill_score,
        CASE
          WHEN v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL THEN 1.0
          WHEN vj.work_type IS NULL THEN NULL
          WHEN vj.work_type = ANY(v_user_work_types) THEN 1.0
          ELSE 0.0
        END AS work_type_score,
        location_score_for_pair(
          v_user_muni, v_user_province, v_user_lat, v_user_lng, v_user_work_types,
          vj.job_muni, vj.job_province, vj.job_lat, vj.job_lng,
          vj.geocode_accuracy_type, vj.work_type
        ) AS location_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(ts.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN _temp_skill_scores ts ON ts.job_id = vj.id
    ),
    scored AS (
      SELECT user_id, job_id,
        (
          (CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END
           + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END
           + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END
           + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END)
          / GREATEST(
            (CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END
             + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END
             + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END
             + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END), 0.000001)
        ) AS score,
        value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
      FROM combined
    )
    SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
           shared_values, shared_skills, now()
    FROM scored WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      score = EXCLUDED.score, value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score, work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score, shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills, updated_at = EXCLUDED.updated_at
    WHERE (job_matches.score, job_matches.value_score, job_matches.skill_score,
           job_matches.work_type_score, job_matches.location_score,
           job_matches.shared_values, job_matches.shared_skills)
          IS DISTINCT FROM
          (EXCLUDED.score, EXCLUDED.value_score, EXCLUDED.skill_score,
           EXCLUDED.work_type_score, EXCLUDED.location_score,
           EXCLUDED.shared_values, EXCLUDED.shared_skills);

  ELSE
    -- Flat path
    INSERT INTO job_matches (
      user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
      shared_values, shared_skills, updated_at
    )
    WITH valid_jobs AS (
      SELECT id, "values" AS job_values, values_rated AS job_rated, skills AS job_skills,
             work_type, lat AS job_lat, lng AS job_lng,
             municipality AS job_muni, province AS job_province,
             geocode_accuracy_type
      FROM jobs
      WHERE ("values" IS NOT NULL AND array_length("values", 1) IS NOT NULL)
         OR (skills IS NOT NULL AND array_length(skills, 1) IS NOT NULL)
         OR (skill_details IS NOT NULL AND jsonb_typeof(skill_details) = 'array'
             AND jsonb_array_length(skill_details) > 0)
    ),
    job_value_weights AS (
      SELECT vj.id AS job_id, x.val, MIN(x.job_w) AS job_w
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT elem->>'value' AS val,
               rank_weight((elem->>'confidence')::int, jsonb_array_length(vj.job_rated)) AS job_w
        FROM jsonb_array_elements(vj.job_rated) AS elem
        WHERE (elem->>'value') IS NOT NULL
      ) x
      WHERE vj.job_rated IS NOT NULL AND jsonb_array_length(vj.job_rated) > 0
      GROUP BY vj.id, x.val
    ),
    value_computed AS (
      SELECT vj.id AS job_id,
        CASE
          WHEN v_user_values IS NULL OR array_length(v_user_values, 1) IS NULL
            OR vj.job_values IS NULL OR array_length(vj.job_values, 1) IS NULL THEN NULL
          ELSE LEAST(
            (COALESCE((
              SELECT SUM(COALESCE(jvw.job_w, 1.0))
              FROM unnest(shared_arr.v) AS sv
              LEFT JOIN job_value_weights jvw ON jvw.job_id = vj.id AND jvw.val = sv
            ), 0) / array_length(v_user_values, 1)::float)
            + LEAST(COALESCE(array_length(shared_arr.v, 1), 0) * 0.1, 0.3), 1.0)
        END AS value_score,
        shared_arr.v AS shared_values
      FROM valid_jobs vj
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT unnest(COALESCE(v_user_values, '{}'::text[]))
          INTERSECT SELECT unnest(COALESCE(vj.job_values, '{}'::text[]))
        ) AS v
      ) shared_arr
    ),
    combined AS (
      SELECT p_user_id AS user_id, vj.id AS job_id,
        vc.value_score, ts.skill_score,
        CASE
          WHEN v_user_work_types IS NULL OR array_length(v_user_work_types, 1) IS NULL THEN 1.0
          WHEN vj.work_type IS NULL THEN NULL
          WHEN vj.work_type = ANY(v_user_work_types) THEN 1.0
          ELSE 0.0
        END AS work_type_score,
        location_score_for_pair(
          v_user_muni, v_user_province, v_user_lat, v_user_lng, v_user_work_types,
          vj.job_muni, vj.job_province, vj.job_lat, vj.job_lng,
          vj.geocode_accuracy_type, vj.work_type
        ) AS location_score,
        COALESCE(vc.shared_values, '{}'::text[]) AS shared_values,
        COALESCE(ts.shared_skills, '{}'::text[]) AS shared_skills
      FROM valid_jobs vj
      LEFT JOIN value_computed vc ON vc.job_id = vj.id
      LEFT JOIN _temp_skill_scores ts ON ts.job_id = vj.id
    ),
    scored AS (
      SELECT user_id, job_id,
        (
          (CASE WHEN value_score IS NOT NULL THEN value_score * 0.55 ELSE 0 END
           + CASE WHEN skill_score IS NOT NULL THEN skill_score * 0.35 ELSE 0 END
           + CASE WHEN work_type_score IS NOT NULL THEN work_type_score * 0.05 ELSE 0 END
           + CASE WHEN location_score IS NOT NULL THEN location_score * 0.05 ELSE 0 END)
          / GREATEST(
            (CASE WHEN value_score IS NOT NULL THEN 0.55 ELSE 0 END
             + CASE WHEN skill_score IS NOT NULL THEN 0.35 ELSE 0 END
             + CASE WHEN work_type_score IS NOT NULL THEN 0.05 ELSE 0 END
             + CASE WHEN location_score IS NOT NULL THEN 0.05 ELSE 0 END), 0.000001)
        ) AS score,
        value_score, skill_score, work_type_score, location_score, shared_values, shared_skills
      FROM combined
    )
    SELECT user_id, job_id, score, value_score, skill_score, work_type_score, location_score,
           shared_values, shared_skills, now()
    FROM scored WHERE score IS NOT NULL
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      score = EXCLUDED.score, value_score = EXCLUDED.value_score,
      skill_score = EXCLUDED.skill_score, work_type_score = EXCLUDED.work_type_score,
      location_score = EXCLUDED.location_score, shared_values = EXCLUDED.shared_values,
      shared_skills = EXCLUDED.shared_skills, updated_at = EXCLUDED.updated_at
    WHERE (job_matches.score, job_matches.value_score, job_matches.skill_score,
           job_matches.work_type_score, job_matches.location_score,
           job_matches.shared_values, job_matches.shared_skills)
          IS DISTINCT FROM
          (EXCLUDED.score, EXCLUDED.value_score, EXCLUDED.skill_score,
           EXCLUDED.work_type_score, EXCLUDED.location_score,
           EXCLUDED.shared_values, EXCLUDED.shared_skills);
  END IF;
END;
$function$;


-- statement_timeout is intentionally not set on these SQL functions.
-- A SET clause blocks inlining. The non-inlined plan seq-scans halfvec
-- (about 195ms vs about 2ms on the HNSW index for match_count 5).
CREATE OR REPLACE FUNCTION public.match_skills_by_embedding(query_embedding vector, match_count integer DEFAULT 80)
 RETURNS TABLE(concept_uri text, preferred_label_en text, preferred_label_fr text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
        concept_uri,
        preferred_label_en,
        preferred_label_fr,
        1 - (embedding <=> query_embedding::halfvec(1024)) AS similarity
    FROM esco_skills
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding::halfvec(1024)
    LIMIT match_count;
$function$;


CREATE OR REPLACE FUNCTION public.match_skills_by_embedding(query_embeddings vector[], match_count integer DEFAULT 5)
 RETURNS TABLE(query_index integer, concept_uri text, preferred_label_en text, preferred_label_fr text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
    WITH queries AS (
        SELECT (i - 1)::int AS query_index, query_embeddings[i] AS q_vec
        FROM generate_series(1, array_length(query_embeddings, 1)) AS i
        OFFSET 0 -- optimization fence
    )
    SELECT
        q.query_index,
        e.concept_uri,
        e.preferred_label_en,
        e.preferred_label_fr,
        1 - (e.embedding <=> q.q_vec::halfvec(1024)) AS similarity
    FROM queries q
    CROSS JOIN LATERAL (
        SELECT
            e.concept_uri,
            e.preferred_label_en,
            e.preferred_label_fr,
            e.embedding
        FROM esco_skills e
        WHERE e.embedding IS NOT NULL
        ORDER BY e.embedding <=> q.q_vec::halfvec(1024)
        LIMIT match_count
    ) e;
$function$;


CREATE OR REPLACE FUNCTION public.compute_profile_skill_embedding(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_embedding halfvec(1024);
BEGIN
  SELECT (
    SELECT array_agg(dim ORDER BY ord)::halfvec(1024)
    FROM (
      SELECT u.ord,
             SUM(ps.score * u.dim) / NULLIF(SUM(ps.score), 0) AS dim
      FROM profile_skills ps
      JOIN esco_skills es ON es.concept_uri = ps.skill_id
      CROSS JOIN LATERAL unnest(
        string_to_array(trim(both '[]' FROM es.embedding::text), ',')::real[]
      ) WITH ORDINALITY AS u(dim, ord)
      WHERE ps.user_id = p_user_id AND es.embedding IS NOT NULL
      GROUP BY u.ord
    ) s
  ) INTO v_embedding;

  UPDATE profiles SET skill_embedding = v_embedding WHERE id = p_user_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.compute_job_skill_embedding(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_embedding halfvec(1024);
BEGIN
  SELECT (
    SELECT array_agg(dim ORDER BY ord)::halfvec(1024)
    FROM (
      SELECT u.ord,
             SUM(js.score * u.dim) / NULLIF(SUM(js.score), 0) AS dim
      FROM job_skills js
      JOIN esco_skills es ON es.concept_uri = js.skill_id
      CROSS JOIN LATERAL unnest(
        string_to_array(trim(both '[]' FROM es.embedding::text), ',')::real[]
      ) WITH ORDINALITY AS u(dim, ord)
      WHERE js.job_id = p_job_id AND es.embedding IS NOT NULL
      GROUP BY u.ord
    ) s
  ) INTO v_embedding;

  UPDATE jobs SET skill_embedding = v_embedding WHERE id = p_job_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.bulk_update_skill_embeddings(updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
    update esco_skills s
    set embedding = (u.emb::text::halfvec(1024))
    from (
        select
            item->>'uri' as uri,
            item->'emb' as emb
        from jsonb_array_elements(updates) as item
    ) u
    where s.concept_uri = u.uri;
$function$;

CREATE VIEW public.matched_jobs WITH (security_invoker = true) AS
SELECT
  j.*,
  s.name AS source,
  o.type AS org_type,
  o.sector_id AS org_sector_id,
  COALESCE(jm.score, 0) AS match_score,
  COALESCE(jm.value_score, 0) AS value_score,
  COALESCE(jm.skill_score, 0) AS skill_score
FROM public.jobs j
LEFT JOIN public.sources s ON j.source_id = s.id
LEFT JOIN public.organizations o ON j.organization_id = o.id
LEFT JOIN public.job_matches jm
  ON j.id = jm.job_id
  AND jm.user_id = auth.uid();

GRANT SELECT ON public.matched_jobs TO anon, authenticated, service_role;

COMMENT ON VIEW public.matched_jobs IS
  'Jobs with source name, match scores, and org type/sector for bulletin facet filters.';


