-- Creates the search_esco_skills RPC function used by the skills search API.
-- Performs a locale-aware text search with trigram similarity scoring,
-- searching preferred labels, alternative labels, and descriptions.
-- Falls back to the other locale if no results are found in the requested one.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Helper: strip accents for locale-neutral matching
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT unaccent('unaccent', $1);
$$;
DROP FUNCTION IF EXISTS search_esco_skills(text, int, text);

CREATE OR REPLACE FUNCTION search_esco_skills(
    p_query   text,
    p_limit   int DEFAULT 20,
    p_locale  text DEFAULT 'en'
)
RETURNS TABLE (
    concept_uri    text,
    term           text,
    definition     text,
    scope_note     text,
    skill_type     text,
    reuse_level    text,
    matched_alias  text,
    score          real
)
LANGUAGE plpgsql STABLE
AS $func$
DECLARE
    v_query text := lower(f_unaccent(trim(p_query)));
    v_pref  text;  -- preferred label column
    v_alt   text;  -- alternative label column
    v_desc  text;  -- description column
    v_scope text;  -- scope note column
    v_fb_pref text; -- fallback preferred label column
BEGIN
    -- Pick columns based on locale
    IF p_locale = 'fr' THEN
        v_pref  := 'preferred_label_fr';
        v_alt   := 'alternative_label_fr';
        v_desc  := 'description_fr';
        v_scope := 'scope_note_fr';
        v_fb_pref := 'preferred_label_en';
    ELSE
        v_pref  := 'preferred_label_en';
        v_alt   := 'alternative_label_en';
        v_desc  := 'description_en';
        v_scope := 'scope_note_en';
        v_fb_pref := 'preferred_label_fr';
    END IF;

    RETURN QUERY EXECUTE format(
        $sql$
        WITH alias_matches AS (
            SELECT
                e.concept_uri,
                COALESCE(e.%1$I, e.%2$I) AS term,
                COALESCE(e.%3$I, '') AS definition,
                COALESCE(e.%4$I, '') AS scope_note,
                e.skill_type,
                e.reuse_level,
                a.alias AS matched_alias,
                CASE 
                    WHEN lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) %% $1 OR lower(f_unaccent(a.alias)) %% $1
                    THEN GREATEST(
                        similarity(lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))), $1),
                        similarity(lower(f_unaccent(a.alias)), $1)
                    )
                    ELSE 0.1 -- low fallback score
                END AS score
            FROM esco_skills e
            LEFT JOIN LATERAL unnest(e.%5$I) AS a(alias) ON true
            WHERE
                (lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) %% $1 OR lower(f_unaccent(a.alias)) %% $1)
                OR (length($1) < 3 AND (lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) LIKE $1 || '%%' OR lower(f_unaccent(a.alias)) LIKE $1 || '%%'))
        ),
        pref_matches AS (
            SELECT
                e.concept_uri,
                COALESCE(e.%1$I, e.%2$I) AS term,
                COALESCE(e.%3$I, '') AS definition,
                COALESCE(e.%4$I, '') AS scope_note,
                e.skill_type,
                e.reuse_level,
                NULL::text AS matched_alias,
                CASE 
                    WHEN lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) %% $1
                    THEN similarity(lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))), $1)
                    ELSE 0.1 -- low fallback score
                END AS score
            FROM esco_skills e
            WHERE 
                lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) %% $1
                OR (length($1) < 3 AND lower(f_unaccent(COALESCE(e.%1$I, e.%2$I, ''))) LIKE $1 || '%%')
        ),
        combined AS (
            SELECT * FROM alias_matches
            UNION ALL
            SELECT * FROM pref_matches
        ),
        ranked AS (
            SELECT DISTINCT ON (concept_uri) *
            FROM combined
            ORDER BY concept_uri, score DESC
        )
        SELECT
            concept_uri, term, definition, scope_note,
            skill_type, reuse_level, matched_alias, score
        FROM ranked
        ORDER BY score DESC
        LIMIT $2
        $sql$,
        v_pref, v_fb_pref, v_desc, v_scope, v_alt
    )
    USING v_query, p_limit;
END;
$func$;
