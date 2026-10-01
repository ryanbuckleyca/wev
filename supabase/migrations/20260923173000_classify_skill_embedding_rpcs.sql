-- Classify skill-embedding SECURITY DEFINER functions in the restricted RPC manifest.
-- Created by 20260922134218 / 20260923150000 without private.restricted_rpc rows.

INSERT INTO private.restricted_rpc (function_name, allowed_roles, is_optional, rationale)
VALUES
  (
    'compute_job_skill_embedding',
    '{service_role}',
    false,
    'Pooled jobs.skill_embedding from job_skills; called by junction triggers and backfill.'
  ),
  (
    'compute_profile_skill_embedding',
    '{service_role}',
    false,
    'Pooled profiles.skill_embedding from profile_skills; called by junction triggers and backfill.'
  ),
  (
    'trg_job_skills_update_embedding',
    '{}',
    false,
    'Trigger body only — never a callable RPC.'
  ),
  (
    'trg_profile_skills_update_embedding',
    '{}',
    false,
    'Trigger body only — never a callable RPC.'
  )
ON CONFLICT (function_name) DO UPDATE
SET allowed_roles = EXCLUDED.allowed_roles,
    is_optional = EXCLUDED.is_optional,
    rationale = EXCLUDED.rationale;

SELECT private.apply_restricted_rpc_grants();
