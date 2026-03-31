ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS ideal_work_environment;

DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
CREATE TRIGGER trg_profile_values_changed
  AFTER INSERT OR UPDATE OF "values", values_rated, skills, work_types, lat, lng ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_user_matches();
