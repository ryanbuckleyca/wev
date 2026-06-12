-- Add canonical ESCO skill URIs to user profiles.
-- Values in this array should be ESCO concept_uri identifiers.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}'::text[];
