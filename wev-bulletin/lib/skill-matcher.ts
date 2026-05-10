import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import type { EscoSkill } from '@/lib/types/skills';
import { buildCvWordSet, labelRelevance } from '@/lib/nlp-utils';
import type { SkillPhrase } from './llm-extractor';

const MAX_SKILLS = 10;
const RPC_MATCHES_PER_PHRASE = 3;
const rawScoreFloor = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '0.25');
const SCORE_FLOOR = Number.isFinite(rawScoreFloor) ? rawScoreFloor : 0.25;
const RELEVANCE_FLOOR = 0.4;

type MatchRow = {
  concept_uri: string;
  preferred_label_en: string;
  preferred_label_fr: string;
  similarity: number;
};

type EscoMetaRow = {
  concept_uri: string;
  preferred_label_en: string | null;
  preferred_label_fr: string | null;
  description_en: string | null;
  description_fr: string | null;
  alternative_label_en: string[] | null;
  alternative_label_fr: string[] | null;
  skill_type: string | null;
  reuse_level: string | null;
};

function toEscoSkill(row: EscoMetaRow): EscoSkill {
  const alt = [...(row.alternative_label_en ?? []), ...(row.alternative_label_fr ?? [])];
  return {
    uri: row.concept_uri,
    preferredLabel: {
      en: row.preferred_label_en ?? '',
      fr: row.preferred_label_fr ?? row.preferred_label_en ?? '',
    },
    description: { en: row.description_en, fr: row.description_fr },
    skillType: row.skill_type as EscoSkill['skillType'],
    reuseLevel: row.reuse_level as EscoSkill['reuseLevel'],
    aliases: alt.length > 0 ? alt : undefined,
  };
}

export type ScoredMatch = MatchRow & { score: number };
export type BatchMatchRow = MatchRow & { query_index: number };

export function rankAndFilterCandidates(
  rows: BatchMatchRow[],
  skillPhrases: SkillPhrase[],
  cvWords: Set<string>,
  locale: 'en' | 'fr'
): ScoredMatch[] {
  const bestByUri = new Map<string, ScoredMatch>();

  for (const row of rows) {
    if (row.similarity < SCORE_FLOOR) continue;

    const phraseIdx = row.query_index;
    const prominence = skillPhrases[phraseIdx]?.prominence ?? 5;
    const promWeight = prominence / 10;

    const relevance = labelRelevance(row.preferred_label_en ?? '', cvWords, locale);
    if (relevance < RELEVANCE_FLOOR) continue;

    const score = row.similarity * promWeight * relevance;
    const existing = bestByUri.get(row.concept_uri);
    if (!existing || score > existing.score) {
      bestByUri.set(row.concept_uri, { ...row, score });
    }
  }

  return [...bestByUri.values()].sort((a, b) => b.score - a.score);
}

export async function linkPhrasesToEsco(
  skillPhrases: SkillPhrase[],
  embeddings: number[][],
  cvText: string,
  userId: string,
  locale: 'en' | 'fr'
): Promise<EscoSkill[]> {
  const cvWords = buildCvWordSet(cvText, locale);
  const supabase = supabaseServer;

  // Run a single batched RPC to avoid exhausting the Supabase connection pool
  const query_embeddings = embeddings.map((vec) => `[${vec.join(',')}]`);
  const { data, error } = await supabase.rpc('match_skills_by_embedding', {
    query_embeddings,
    match_count: RPC_MATCHES_PER_PHRASE,
  });

  if (error) {
    logger.warn({ err: error, userId }, 'match_skills_by_embedding failure');
  }

  const scoredMatches = rankAndFilterCandidates((data ?? []) as BatchMatchRow[], skillPhrases, cvWords, locale);
  const topMatches = scoredMatches.slice(0, MAX_SKILLS);

  logger.info(
    {
      userId,
      phrasesSearched: embeddings.length,
      uniqueCandidates: scoredMatches.length,
      kept: topMatches.length,
      topScore: topMatches[0]?.score ?? null,
      topSimilarity: topMatches[0]?.similarity ?? null,
      floor: SCORE_FLOOR,
    },
    'CV skills two-stage linking stats',
  );

  if (topMatches.length === 0) return [];

  const { data: metaData, error: metaError } = await supabase
    .from('esco_skills')
    .select(
      'concept_uri, preferred_label_en, preferred_label_fr, description_en, description_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level',
    )
    .in(
      'concept_uri',
      topMatches.map((m) => m.concept_uri),
    );

  if (metaError) {
    logger.error({ err: metaError, userId }, 'esco_skills hydrate failed');
    return [];
  }

  const metaByUri = new Map(
    ((metaData ?? []) as EscoMetaRow[]).map((row) => [row.concept_uri, row]),
  );

  return topMatches
    .map((m) => metaByUri.get(m.concept_uri))
    .filter((row): row is EscoMetaRow => Boolean(row))
    .map(toEscoSkill);
}
