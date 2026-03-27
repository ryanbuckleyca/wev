-- Migration: collapse 4-tier values system to 3-tier, add skills_rated column.
--
-- Tier changes:
--   most_important  → essential    (weight 1.0)
--   more_important  → essential    (weight 1.0, promote to essential)
--   less_important  → nice_to_have (weight 0.25)
--   least_important → nice_to_have (weight 0.25)
--   unrated         → unrated      (neutral weight 0.5, unchanged)
--
-- New column: profiles.skills_rated jsonb
--   Array of { skill: string (ESCO URI), tier?: "essential" | "nice_to_have" }

--------------------------------------------------------------------------------
-- 1. Add skills_rated column to profiles
--------------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skills_rated jsonb;

--------------------------------------------------------------------------------
-- 2. Migrate existing values_rated tiers to new 3-tier system
--------------------------------------------------------------------------------
UPDATE profiles
SET values_rated = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'tier') IN ('most_important', 'more_important')
        THEN jsonb_set(elem, '{tier}', '"essential"')
      WHEN (elem->>'tier') IN ('less_important', 'least_important')
        THEN jsonb_set(elem, '{tier}', '"nice_to_have"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(values_rated) AS elem
)
WHERE values_rated IS NOT NULL
  AND jsonb_array_length(values_rated) > 0;

--------------------------------------------------------------------------------
-- 3. Update value_tier_weight helper to 3-tier weights
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION value_tier_weight(p_tier text)
RETURNS float LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tier
    WHEN 'essential'    THEN 1.0
    WHEN 'nice_to_have' THEN 0.25
    ELSE 0.5  -- neutral weight for null / unrecognised tier
  END;
$$;
