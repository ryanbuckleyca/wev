-- Create the esco_skills table (bilingual, normalized schema).
-- This must run before add_esco_vector_search which adds the embedding column.
CREATE TABLE IF NOT EXISTS "public"."esco_skills" (
    "concept_uri" text NOT NULL,
    "skill_type" text,
    "reuse_level" text,
    "preferred_label_en" text,
    "preferred_label_fr" text,
    "alternative_label_en" text[],
    "alternative_label_fr" text[],
    "description_en" text,
    "description_fr" text,
    "scope_note_en" text,
    "scope_note_fr" text,
    "updated_at" timestamp with time zone,
    PRIMARY KEY ("concept_uri")
);
ALTER TABLE "public"."esco_skills" OWNER TO "postgres";

