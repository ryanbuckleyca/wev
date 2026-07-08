-- Add mission_statement, values_list (mapped Knowdell), and values_rated to organizations
-- so the single grounded LLM call stores rich org data: identity, mapped values, SSE rating.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS mission_statement text,
  ADD COLUMN IF NOT EXISTS values_list       text[],
  ADD COLUMN IF NOT EXISTS values_rated      jsonb;
