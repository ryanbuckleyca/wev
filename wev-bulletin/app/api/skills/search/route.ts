import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { skillDisplayKey } from '@/lib/skills/display';
import { parseLocale } from '@/lib/locale';

// Removed dynamic constraints to allow Edge-Caching
// export const dynamic = 'force-dynamic'
// export const revalidate = 0

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 1;

type SkillSearchRow = {
  concept_uri: string;
  term: string;
  definition: string | null;
  scope_note: string | null;
  skill_type: string | null;
  reuse_level: string | null;
  matched_alias: string | null;
  score: number;
};

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();
    const limit = parseLimit(searchParams.get('limit'));
    const locale = parseLocale(searchParams.get('locale'));

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ query, limit, locale, skills: [] });
    }

    const { data, error } = await supabaseServer.rpc('search_esco_skills', {
      p_query: query,
      p_limit: limit,
      p_locale: locale,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The RPC returns results ordered by score, but we re-sort client-side to
    // guarantee stable ordering and apply a secondary alpha sort on ties.
    const sortedRows = ((data ?? []) as SkillSearchRow[])
      .slice()
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

    const seenDisplay = new Set<string>();
    const skills: Array<Omit<SkillSearchRow, 'score'>> = [];
    for (const row of sortedRows) {
      const key = skillDisplayKey(row.term, row.definition, row.scope_note);
      if (seenDisplay.has(key)) continue;
      seenDisplay.add(key);
      skills.push({
        concept_uri: row.concept_uri,
        term: row.term,
        definition: row.definition || row.scope_note,
        scope_note: row.scope_note,
        skill_type: row.skill_type,
        reuse_level: row.reuse_level,
        matched_alias: row.matched_alias,
      });
    }

    return NextResponse.json(
      { query, limit, locale, skills },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to search skills';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
