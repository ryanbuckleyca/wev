-- Duplicate `value` keys in jobs.values_rated: use MIN(rank_weight(...)), same as
-- job_value_weights CTEs and buildJobConfidenceMap in match-calculator.ts.

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
