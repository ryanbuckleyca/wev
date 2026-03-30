import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';

/** Row shape for `esco_skills` columns selected below (localized ESCO fields). */
type EscoSkillRow = {
  concept_uri: string;
  preferred_label_en: string | null;
  preferred_label_fr: string | null;
  alternative_label_en: string[] | null;
  alternative_label_fr: string[] | null;
  skill_type: string | null;
  reuse_level: string | null;
  description_en: string | null;
  description_fr: string | null;
  scope_note_en: string | null;
  scope_note_fr: string | null;
};

// Cache indefinitely - only revalidate on-demand when ESCO skills are updated
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get('locale') || 'en';

    const supabase = supabaseServer;

    let allData: EscoSkillRow[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('esco_skills')
        .select(
          'concept_uri, preferred_label_en, preferred_label_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level, description_en, description_fr, scope_note_en, scope_note_fr',
        )
        .order('preferred_label_en', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData = [...allData, ...(data as EscoSkillRow[])];
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Map to a compact format for the client
    const skills = allData.map((r) => {
      const def =
        locale === 'fr'
          ? r.description_fr || r.description_en
          : r.description_en || r.description_fr;
      const scope =
        locale === 'fr' ? r.scope_note_fr || r.scope_note_en : r.scope_note_en || r.scope_note_fr;
      return {
        uri: r.concept_uri,
        term:
          locale === 'fr'
            ? r.preferred_label_fr || r.preferred_label_en
            : r.preferred_label_en || r.preferred_label_fr,
        definition: def || scope,
        aliases:
          locale === 'fr'
            ? [...(r.alternative_label_fr || []), ...(r.alternative_label_en || [])]
            : [...(r.alternative_label_en || []), ...(r.alternative_label_fr || [])],
        type: r.skill_type,
        level: r.reuse_level,
      };
    });

    return NextResponse.json({ skills });
  } catch (err) {
    logger.error({ err }, 'Fetch all skills error');
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}
