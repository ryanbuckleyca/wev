-- Canonical ESCO skills index used by profile skill selection and job skill tagging.
-- Records are normalized from esco_skills_en_only.csv via scripts/build_esco_skills_index.py.

CREATE TABLE IF NOT EXISTS public.esco_skills (
  concept_uri text PRIMARY KEY,
  label text NOT NULL,
  definition text,
  alt_labels text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.esco_skills IS 'Canonical ESCO skill taxonomy for matching and profile/tagging flows.';
COMMENT ON COLUMN public.esco_skills.concept_uri IS 'Stable ESCO concept URI identifier.';

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'esco_skills'
      AND column_name = 'label'
  ) THEN
    EXECUTE $sql$COMMENT ON COLUMN public.esco_skills.label IS 'Canonical preferred ESCO skill label.';$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'esco_skills'
      AND column_name = 'definition'
  ) THEN
    EXECUTE $sql$COMMENT ON COLUMN public.esco_skills.definition IS 'Best available definition: description > scopeNote > definition.';$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'esco_skills'
      AND column_name = 'alt_labels'
  ) THEN
    EXECUTE $sql$COMMENT ON COLUMN public.esco_skills.alt_labels IS 'Merged alternate/hidden labels.';$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'esco_skills'
      AND column_name = 'label'
  ) THEN
    EXECUTE $sql$CREATE INDEX IF NOT EXISTS idx_esco_skills_label ON public.esco_skills (label);$sql$;
    EXECUTE $sql$CREATE INDEX IF NOT EXISTS idx_esco_skills_label_lower ON public.esco_skills ((lower(label)));$sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'esco_skills'
      AND column_name = 'alt_labels'
  ) THEN
    EXECUTE $sql$CREATE INDEX IF NOT EXISTS idx_esco_skills_alt_labels_gin ON public.esco_skills USING gin (alt_labels);$sql$;
  END IF;
END
$do$;

ALTER TABLE public.esco_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read ESCO skills" ON public.esco_skills;
CREATE POLICY "Public can read ESCO skills"
  ON public.esco_skills
  FOR SELECT
  USING (true);
