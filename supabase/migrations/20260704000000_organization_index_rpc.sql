-- Create RPC to fetch organizations with their active job counts
-- This replaces the inefficient in-memory counting that suffered from the 1000-row pagination limit.

CREATE OR REPLACE FUNCTION get_active_organizations(min_date TIMESTAMP WITH TIME ZONE, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id BIGINT,
    name TEXT,
    slug TEXT,
    location TEXT,
    is_sse BOOLEAN,
    active_job_count BIGINT,
    total_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH org_counts AS (
        SELECT
            o.id,
            o.name,
            o.slug,
            o.location,
            o.is_sse,
            COUNT(j.id) AS active_job_count
        FROM
            organizations o
        JOIN
            jobs j ON o.id = j.organization_id
        WHERE
            j.scraped_at >= min_date
        GROUP BY
            o.id
    )
    SELECT
        oc.id,
        oc.name,
        oc.slug,
        oc.location,
        oc.is_sse,
        oc.active_job_count,
        (SELECT COUNT(*) FROM org_counts)::BIGINT AS total_count
    FROM
        org_counts oc
    ORDER BY
        oc.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to public/anon so it can be called by the API/server
GRANT EXECUTE ON FUNCTION get_active_organizations(TIMESTAMP WITH TIME ZONE, INT, INT) TO anon, authenticated, service_role;
