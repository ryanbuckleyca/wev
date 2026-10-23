-- Fix: recalculate_matches_for_user failed for any user on the weighted path
-- ("null value in column shared_skills of relation job_matches violates
-- not-null constraint"). Since the v2 rewrite only scores the top 300 jobs,
-- most jobs have no row in _temp_skill_scores, so ts.shared_skills is NULL
-- after the LEFT JOIN. The flat path already COALESCEs; the weighted path did not.
-- Because recalculate_matches_for_job loops over every profile in one
-- transaction, one failing user rolled back everyone's matches.
--
-- Also: skip no-op updates. Every recalculation used to rewrite every row and
-- bump updated_at, causing heavy table/index bloat. Nothing reads
-- job_matches.updated_at, so rows are now only written when a value changed.
-- No other logic changes.

CREATE OR REPLACE FUNCTION recalculate_matches_for_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
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
  v_user_skill_embedding vector(1024);
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
$func$;
