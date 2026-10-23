-- Promote skills max-50 CHECKs (added NOT VALID in semantic_matching_v2 /
-- profile_skills delta) to fully validated. SHARE UPDATE EXCLUSIVE only —
-- safer than validating during ADD CONSTRAINT on hot tables.
-- Idempotent if constraints were already validated.

ALTER TABLE jobs VALIDATE CONSTRAINT jobs_skills_max_50_check;
ALTER TABLE profiles VALIDATE CONSTRAINT profiles_skills_max_50_check;
