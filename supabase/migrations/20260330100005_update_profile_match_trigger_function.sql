-- Update the trigger function body to also recalculate matches when location
-- fields change (lat, lng, municipality, province), not just values/skills.
CREATE OR REPLACE FUNCTION trigger_recalculate_user_matches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (
      (NEW."values" IS NOT NULL AND array_length(NEW."values", 1) IS NOT NULL)
      OR (NEW.values_rated IS NOT NULL AND jsonb_array_length(NEW.values_rated) > 0)
      OR (NEW.skills IS NOT NULL AND array_length(NEW.skills, 1) IS NOT NULL)
    ) THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."values" IS DISTINCT FROM NEW."values"
       OR OLD.values_rated IS DISTINCT FROM NEW.values_rated
       OR OLD.skills IS DISTINCT FROM NEW.skills
       OR OLD.work_types IS DISTINCT FROM NEW.work_types
       OR OLD.lat IS DISTINCT FROM NEW.lat
       OR OLD.lng IS DISTINCT FROM NEW.lng
       OR OLD.municipality IS DISTINCT FROM NEW.municipality
       OR OLD.province IS DISTINCT FROM NEW.province
    THEN
      PERFORM recalculate_matches_for_user(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$func$;
