'use client';

import type { EscoSkill } from '@/lib/types/skills';

type RawSkillApiRow = {
  concept_uri: string;
  term: string;
  definition: string | null;
  skill_type: string | null;
  reuse_level: string | null;
  matched_alias?: string | null;
};

function toEscoSkill(row: RawSkillApiRow): EscoSkill {
  return {
    uri: row.concept_uri,
    preferredLabel: { en: row.term, fr: row.term },
    description: { en: row.definition, fr: row.definition },
    skillType: row.skill_type as EscoSkill['skillType'],
    reuseLevel: row.reuse_level as EscoSkill['reuseLevel'],
    matchedAlias: row.matched_alias ?? null,
  };
}

async function fetchSkillRows(
  path: string,
  signal?: AbortSignal,
): Promise<RawSkillApiRow[]> {
  const response = signal ? await fetch(path, { signal }) : await fetch(path);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to fetch skills: ${response.status} - ${errorBody.message || response.statusText}`);
  }

  const body: { skills?: RawSkillApiRow[] } = await response.json();

  const seen = new Set<string>();
  return (body.skills ?? []).filter((skill) => {
    if (seen.has(skill.concept_uri)) return false;
    seen.add(skill.concept_uri);
    return true;
  });
}

export async function fetchSkillsByUri(
  uris: string[],
  locale: 'en' | 'fr',
  signal?: AbortSignal,
): Promise<EscoSkill[]> {
  if (uris.length === 0) return [];

  const rows = await fetchSkillRows(
    `/api/skills/by-uri?${new URLSearchParams({ uris: uris.join(','), locale })}`,
    signal,
  );
  return rows.map(toEscoSkill);
}

export async function fetchStarterSkills(
  locale: 'en' | 'fr',
  limit = 10,
  signal?: AbortSignal,
): Promise<EscoSkill[]> {
  const rows = await fetchSkillRows(
    `/api/skills/starter?${new URLSearchParams({ locale, limit: String(limit) })}`,
    signal,
  );
  return rows.map(toEscoSkill);
}

export async function fetchSkillSearchResults(
  query: string,
  locale: 'en' | 'fr',
  limit = 20,
  signal?: AbortSignal,
): Promise<EscoSkill[]> {
  const rows = await fetchSkillRows(
    `/api/skills/search?${new URLSearchParams({ q: query, locale, limit: String(limit) })}`,
    signal,
  );
  return rows.map(toEscoSkill);
}
