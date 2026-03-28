import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

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

function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function displayKey(row: Pick<SkillSearchRow, 'term' | 'definition' | 'scope_note'>): string {
  return `${normalizeSkillText(row.term)}::${normalizeSkillText(row.definition)}::${normalizeSkillText(row.scope_note)}`;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function parseLocale(value: string | null): 'en' | 'fr' {
  return (value ?? '').toLowerCase() === 'fr' ? 'fr' : 'en';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();
    const limit = parseLimit(searchParams.get('limit'));
    const locale = parseLocale(searchParams.get('locale'));

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({
        query,
        limit,
        locale,
        skills: [],
      });
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc('search_esco_skills', {
      p_query: query,
      p_limit: limit,
      p_locale: locale,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sortedRows = ((data ?? []) as SkillSearchRow[])
      .slice()
      .sort((a: SkillSearchRow, b: SkillSearchRow) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.term.localeCompare(b.term);
      });
    const seenDisplay = new Set<string>();
    const dedupedResults: Array<{
      concept_uri: string;
      term: string;
      definition: string | null;
      scope_note: string | null;
      skill_type: string | null;
      reuse_level: string | null;
      matched_alias: string | null;
    }> = [];
    for (const row of sortedRows) {
      const key = displayKey(row);
      if (seenDisplay.has(key)) {
        continue;
      }
      seenDisplay.add(key);
      dedupedResults.push({
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
      {
        query,
        limit,
        locale,
        skills: dedupedResults,
      },
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
