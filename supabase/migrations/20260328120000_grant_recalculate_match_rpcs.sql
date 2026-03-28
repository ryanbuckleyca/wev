-- Expose match recalculation to the Supabase API so maintenance scripts (service role)
-- can invoke the same logic as triggers via PostgREST rpc().

GRANT EXECUTE ON FUNCTION public.recalculate_matches_for_user(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_matches_for_job(UUID) TO service_role;
