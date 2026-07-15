-- Allow restore.ts to advance identity sequences via the service-role API
-- after restoring rows with explicit PKs (no direct postgres URL / psql required).

CREATE OR REPLACE FUNCTION public.reset_restore_identity_sequences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq text;
  max_id bigint;
BEGIN
  -- Allowlisted tables only (matches RESTORE_IDENTITY_TABLES in supabase/src/backup-row.ts).
  seq := pg_get_serial_sequence('public.organizations', 'id');
  IF seq IS NOT NULL THEN
    SELECT MAX(id) INTO max_id FROM public.organizations;
    IF max_id IS NULL THEN
      PERFORM setval(seq, 1, false);
    ELSE
      PERFORM setval(seq, max_id, true);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_restore_identity_sequences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_restore_identity_sequences() TO service_role;

COMMENT ON FUNCTION public.reset_restore_identity_sequences() IS
  'Advances identity sequences to MAX(id) after restore for RESTORE_IDENTITY_TABLES '
  '(currently organizations — keep in sync with supabase/src/backup-row.ts). service_role only.';
