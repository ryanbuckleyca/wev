-- Drop the synchronous profile match recalculation trigger.
--
-- This trigger ran recalculate_matches_for_user() inline on every profile UPDATE,
-- which blocked the profile save response until all job matches were recalculated.
-- With many jobs this caused the Next.js RSC request for the home page to hang
-- (the DB connection was held open for the duration of the trigger).
--
-- Match recalculation is now triggered asynchronously from the client via
-- POST /api/matches/recalculate-mine after a successful profile save.

DROP TRIGGER IF EXISTS trg_profile_values_changed ON profiles;
