-- Store the user's selected city name and province alongside coordinates.
-- These are used for exact-match location scoring in match-calculator.ts (step 5),
-- which short-circuits the GPS distance calculation when the user's city matches
-- the job's city exactly.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS province text;
-- Recreate trigger to also watch municipality and province now that the columns exist.
DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills, work_types, lat, lng, municipality, province ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_user_matches();
