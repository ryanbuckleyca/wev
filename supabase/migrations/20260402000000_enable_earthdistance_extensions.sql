-- Required by location_score_for_pair (earth_distance, ll_to_earth).
-- Supabase enables these by default on hosted projects, but this ensures
-- they're present on fresh local or staging DBs.
CREATE EXTENSION IF NOT EXISTS cube WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;
