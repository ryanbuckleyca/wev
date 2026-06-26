-- Create an RPC to find job IDs within a given distance using earthdistance
CREATE OR REPLACE FUNCTION get_job_ids_within_distance(
  user_lat float8,
  user_lng float8,
  distance_km float8
)
RETURNS SETOF uuid AS $$
BEGIN
  RETURN QUERY
  SELECT id
  FROM jobs
  WHERE lat IS NOT NULL 
    AND lng IS NOT NULL
    AND earth_box(ll_to_earth(user_lat, user_lng), distance_km * 1000) @> ll_to_earth(lat, lng)
    AND earth_distance(ll_to_earth(user_lat, user_lng), ll_to_earth(lat, lng)) <= (distance_km * 1000);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
