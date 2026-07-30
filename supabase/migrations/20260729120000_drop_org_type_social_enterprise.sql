-- Drop "social enterprise" as an org type.
-- That label invited mission-only SSE Yes ratings and is not a RIPESS/SEN
-- governance form in our taxonomy.
--
-- Remap type → other and CLEAR the SSE verdict (do not force sse_rating='no')
-- so miscategorized real nonprofits/coops can be picked up by
-- backfill_org_websites --mode minimal (sse_rating IS NULL) and are not
-- skipped as "completed" (requires classified_at gone).

UPDATE public.organizations
SET
  type = 'other',
  is_sse = false,
  sse_rating = NULL,
  sse_details = CASE
    WHEN sse_details IS NULL OR jsonb_typeof(sse_details) <> 'object' THEN
      jsonb_build_object(
        'flags', jsonb_build_array('type_remapped:social_enterprise')
      )
    ELSE
      (
        sse_details
          - 'classified_at'
          - 'reasoning'
          - 'reasoning_en'
          - 'reasoning_fr'
          - 'confidence'
          - 'must_haves_met'
          - 'nice_to_haves_met'
      ) || jsonb_build_object(
        'flags',
        CASE
          WHEN jsonb_typeof(sse_details->'flags') = 'array' THEN
            (sse_details->'flags')
              || jsonb_build_array('type_remapped:social_enterprise')
          ELSE
            jsonb_build_array('type_remapped:social_enterprise')
        END
      )
  END
WHERE type = 'social enterprise';

COMMENT ON COLUMN public.organizations.type IS
  'Org governance form: nonprofit, cooperative, government, union, or other. '
  'SSE-eligible types are nonprofit, cooperative, and union — type alone is '
  'not sufficient for SSE Yes.';
