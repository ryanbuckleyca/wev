-- Add preferred_languages column to profiles table.
-- Stores the user's language preference for pre-filling job board filters.
-- Valid values are: 'en', 'fr', 'bilingual'.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_languages text[];

ALTER TABLE public.profiles
  ADD CONSTRAINT preferred_languages_valid CHECK (
    preferred_languages IS NULL OR
    ARRAY['en', 'fr', 'bilingual'] @> preferred_languages
  );
