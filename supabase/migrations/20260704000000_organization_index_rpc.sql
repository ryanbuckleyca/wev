-- Create RPC to fetch organizations with their active job counts
-- This replaces the inefficient in-memory counting that suffered from the 1000-row pagination limit.

CREATE OR REPLACE FUNCTION get_active_organizations(min_date TIMESTAMP WITH TIME ZONE)
RETURNS TABLE (
    id BIGINT,
    name TEXT,
    slug TEXT,
    description TEXT,
    website TEXT,
    location TEXT,
    is_sse BOOLEAN,
    type TEXT,
    values TEXT,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    sse_rating TEXT,
    sse_details JSONB,
    active_job_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.name,
        o.slug,
        o.description,
        o.website,
        o.location,
        o.is_sse,
        o.type,
        o.values,
        o.logo_url,
        o.created_at,
        o.sse_rating,
        o.sse_details,
        COUNT(j.id) AS active_job_count
    FROM 
        organizations o
    JOIN 
        jobs j ON o.id = j.organization_id
    WHERE 
        j.scraped_at >= min_date
    GROUP BY 
        o.id
    ORDER BY
        o.name ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to public/anon so it can be called by the API/server
GRANT EXECUTE ON FUNCTION get_active_organizations(TIMESTAMP WITH TIME ZONE) TO anon, authenticated, service_role;
