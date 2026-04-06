import type { SupabaseClient } from '@supabase/supabase-js';

export type SkillLabel = { term: string; definition: string | null; scope_note: string | null };

type SkillRow = {
  concept_uri: string;
  preferred_label_en: string;
  preferred_label_fr: string;
  description_en: string | null;
  description_fr: string | null;
  scope_note_en: string | null;
  scope_note_fr: string | null;
};

const BATCH_SIZE = 80; // keep well under PostgREST URL length limits

/**
 * Given a list of jobs (each with a `skills` string[] field), fetches all
 * ESCO skill labels in batched queries and returns a map of URI → label.
 */
export async function resolveSkillLabels(
  supabase: SupabaseClient,
  jobs: { skills?: string[] | null }[],
  locale: 'en' | 'fr',
): Promise<Map<string, SkillLabel>> {
  const allUris = Array.from(new Set(jobs.flatMap((j) => j.skills ?? [])));
  const map = new Map<string, SkillLabel>();

  if (allUris.length === 0) return map;

  const promises = [];
  // Batch into chunks to avoid PostgREST URL length limits
  for (let i = 0; i < allUris.length; i += BATCH_SIZE) {
    const batch = allUris.slice(i, i + BATCH_SIZE);
    promises.push(
      supabase
        .from('esco_skills')
        .select(
          'concept_uri, preferred_label_en, preferred_label_fr, description_en, description_fr, scope_note_en, scope_note_fr',
        )
        .in('concept_uri', batch)
        .then(({ data, error }) => {
          if (error) {
            console.error('[resolveSkillLabels] batch error:', error.message);
            return [];
          }
          return (data ?? []) as SkillRow[];
        })
    );
  }

  const results = await Promise.all(promises);

  for (const skillRows of results) {
    for (const row of skillRows) {
      const term =
        locale === 'fr'
          ? row.preferred_label_fr || row.preferred_label_en
          : row.preferred_label_en || row.preferred_label_fr;
      const definition =
        locale === 'fr'
          ? row.description_fr || row.description_en || null
          : row.description_en || row.description_fr || null;
      const scope_note =
        locale === 'fr'
          ? row.scope_note_fr || row.scope_note_en || null
          : row.scope_note_en || row.scope_note_fr || null;
      map.set(row.concept_uri, { term, definition, scope_note });
    }
  }

  return map;
}

/**
 * Attaches a `skill_labels` map to each job object using a pre-built label map.
 */
export function attachSkillLabels<T extends { skills?: string[] | null }>(
  jobs: T[],
  labelMap: Map<string, SkillLabel>,
): (T & { skill_labels: Record<string, SkillLabel> })[] {
  return jobs.map((job) => {
    const skills = job.skills ?? [];
    const skill_labels: Record<string, SkillLabel> = {};
    for (const uri of skills) {
      const label = labelMap.get(uri);
      if (label) skill_labels[uri] = label;
    }
    return { ...job, skill_labels };
  });
}

export function parseLocale(value: string | null): 'en' | 'fr' {
  return (value ?? '').toLowerCase() === 'fr' ? 'fr' : 'en';
}
