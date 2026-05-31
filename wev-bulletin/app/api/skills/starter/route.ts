import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { skillDisplayKey } from '@/lib/skills/display';
import { parseLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const FETCH_MULTIPLIER = 5;

type SkillRow = {
  concept_uri: string;
  skill_type: string | null;
  reuse_level: string | null;
  preferred_label_en: string | null;
  preferred_label_fr: string | null;
  description_en: string | null;
  description_fr: string | null;
  scope_note_en: string | null;
  scope_note_fr: string | null;
};

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));
    const limit = parseLimit(searchParams.get('limit'));
    const orderColumn = locale === 'fr' ? 'preferred_label_fr' : 'preferred_label_en';

    const { data, error } = await supabaseServer
      .from('esco_skills')
      .select(
        `concept_uri, skill_type, reuse_level,
         preferred_label_en, preferred_label_fr,
         description_en, description_fr,
         scope_note_en, scope_note_fr`,
      )
      .order(orderColumn, { ascending: true, nullsFirst: false })
      .limit(limit * FETCH_MULTIPLIER);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const seenDisplay = new Set<string>();
    const skills = ((data ?? []) as SkillRow[])
      .map((row) => {
        const term =
          locale === 'fr'
            ? row.preferred_label_fr || row.preferred_label_en
            : row.preferred_label_en || row.preferred_label_fr;
        const definition =
          locale === 'fr'
            ? row.description_fr || row.description_en || null
            : row.description_en || row.description_fr || null;
        const scopeNote =
          locale === 'fr'
            ? row.scope_note_fr || row.scope_note_en || null
            : row.scope_note_en || row.scope_note_fr || null;

        return {
          concept_uri: row.concept_uri,
          term,
          definition: definition || scopeNote,
          scope_note: scopeNote,
          skill_type: row.skill_type,
          reuse_level: row.reuse_level,
          matched_alias: null,
        };
      })
      .filter(
        (
          row,
        ): row is {
          concept_uri: string;
          term: string;
          definition: string | null;
          scope_note: string | null;
          skill_type: string | null;
          reuse_level: string | null;
          matched_alias: null;
        } => Boolean(row.term),
      )
      .filter((row) => {
        const key = skillDisplayKey(row.term, row.definition, row.scope_note);
        if (seenDisplay.has(key)) return false;
        seenDisplay.add(key);
        return true;
      })
      .slice(0, limit);

    return NextResponse.json(
      { locale, limit, skills },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch starter skills';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
