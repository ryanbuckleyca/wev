import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import type { EscoSkill } from '@/lib/types/skills';
import {
  buildCvWordSet,
  buildTokenSet,
  labelRelevance,
  tokenize,
} from '@/lib/nlp-utils';
import { CvImportError } from './errors';
import type { CvLocale } from './types';
import type { SkillPhrase } from './llm';

const MAX_SKILLS = 10;
const HYDRATE_CANDIDATES_LIMIT = 30;
const RPC_MATCHES_PER_PHRASE = 10;
// Read once at module load. Override via CV_SKILLS_SCORE_FLOOR env var.
const SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '') || 0.25;
const RELEVANCE_FLOOR = 0.4;
const FINAL_SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_FINAL_SCORE_FLOOR ?? '') || 0.15;

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

export type ScoredMatch = BatchMatchRow & { score: number };
export type BatchMatchRow = MatchRow & { query_index: number };

function getPreferredLabel(
  row:
    | Pick<BatchMatchRow, 'preferred_label_en' | 'preferred_label_fr'>
    | Pick<EscoMetaRow, 'preferred_label_en' | 'preferred_label_fr'>,
  locale: CvLocale,
): string {
  return locale === 'fr'
    ? row.preferred_label_fr || row.preferred_label_en || ''
    : row.preferred_label_en || row.preferred_label_fr || '';
}

export function rankAndFilterCandidates(
  rows: BatchMatchRow[],
  skillPhrases: SkillPhrase[],
  cvWords: Set<string>,
  locale: CvLocale,
  scoreFloor: number = SCORE_FLOOR,
): ScoredMatch[] {
  const bestByUri = new Map<string, ScoredMatch>();

  for (const row of rows) {
    if (row.similarity < scoreFloor) continue;

    const phraseIdx = row.query_index;
    const isValidIdx =
      Number.isInteger(phraseIdx) && phraseIdx >= 0 && phraseIdx < skillPhrases.length;

    const prominence = isValidIdx ? skillPhrases[phraseIdx].prominence : 5;
    const promWeight = prominence / 10;

    const label = getPreferredLabel(row, locale);
    const relevance = labelRelevance(label ?? '', cvWords, locale);
    if (relevance < RELEVANCE_FLOOR) continue;

    const score = row.similarity * promWeight * relevance;
    const existing = bestByUri.get(row.concept_uri);
    if (!existing || score > existing.score) {
      bestByUri.set(row.concept_uri, { ...row, score });
    }
  }

  return [...bestByUri.values()].sort((a, b) => b.score - a.score);
}


function scoreHydratedCandidate(
  match: ScoredMatch,
  meta: EscoMetaRow,
  skillPhrases: SkillPhrase[],
  cvWords: Set<string>,
  locale: CvLocale,
): number {
  const skillPhrase = skillPhrases[match.query_index];
  if (!skillPhrase) return 0;

  const label = getPreferredLabel(meta, locale);
  const labelTokens = tokenize(label, true, locale);

  // Every token in the label must appear in either the CV text or the LLM
  // phrase that generated this match. This is the primary domain-qualifier
  // filter: "Agile project management" fails if "agile" isn't in the CV or
  // phrase, while "coaching and mentoring" passes if both words are present.
  const phraseWords = buildTokenSet(skillPhrase.phrase, true, locale);
  const supportWords = new Set([...cvWords, ...phraseWords]);
  if (labelTokens.some((t) => !supportWords.has(t))) {
    return 0;
  }

  // Base score: similarity × prominence weight × CV word coverage
  const cvOverlap = labelRelevance(label, cvWords, locale);
  const promWeight = 0.5 + skillPhrase.prominence / 20;
  return match.similarity * promWeight * cvOverlap;
}

export async function linkPhrasesToEsco(
  skillPhrases: SkillPhrase[],
  embeddings: number[][],
  cvText: string,
  userId: string,
  locale: CvLocale,
  supabase = supabaseServer,
): Promise<EscoSkill[]> {
  const cvWords = buildCvWordSet(cvText, locale);

  // Run a single batched RPC to avoid exhausting the Supabase connection pool
  const query_embeddings = embeddings.map((vec) => `[${vec.join(',')}]`);
  const { data, error } = await supabase.rpc('match_skills_by_embedding', {
    query_embeddings,
    match_count: RPC_MATCHES_PER_PHRASE,
  });

  if (error) {
    logger.error({ err: error, userId }, 'match_skills_by_embedding failure');
    throw new CvImportError('embedding_failed', error.message);
  }

  const scoredMatches = rankAndFilterCandidates(
    (data ?? []) as BatchMatchRow[],
    skillPhrases,
    cvWords,
    locale,
  );
  const candidateMatches = scoredMatches.slice(0, HYDRATE_CANDIDATES_LIMIT);

  logger.info(
    {
      userId,
      phrasesSearched: embeddings.length,
      uniqueCandidates: scoredMatches.length,
      shortlisted: candidateMatches.length,
      topScore: candidateMatches[0]?.score ?? null,
      topSimilarity: candidateMatches[0]?.similarity ?? null,
      floor: SCORE_FLOOR,
    },
    'CV skills two-stage linking stats',
  );

  if (candidateMatches.length === 0) return [];

  const { data: metaData, error: metaError } = await supabase
    .from('esco_skills')
    .select(
      'concept_uri, preferred_label_en, preferred_label_fr, description_en, description_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level',
    )
    .in(
      'concept_uri',
      candidateMatches.map((m) => m.concept_uri),
    );

  if (metaError) {
    logger.error({ err: metaError, userId }, 'esco_skills hydrate failed');
    throw new CvImportError('embedding_failed', metaError.message);
  }

  const metaByUri = new Map(
    ((metaData ?? []) as EscoMetaRow[]).map((row) => [row.concept_uri, row]),
  );

  const rerankedMatches = candidateMatches
    .map((match) => {
      const meta = metaByUri.get(match.concept_uri);
      if (!meta) return null;
      const score = scoreHydratedCandidate(match, meta, skillPhrases, cvWords, locale);
      return score > 0 ? { ...match, score } : null;
    })
    .filter((match): match is ScoredMatch => Boolean(match))
    .sort((a, b) => b.score - a.score);

  const topScore = rerankedMatches[0]?.score ?? 0;
  const topMatches = rerankedMatches
    .filter(
      (match, index) =>
        match.score >= FINAL_SCORE_FLOOR &&
        (index < 3 || topScore === 0 || match.score >= topScore * 0.25),
    )
    .slice(0, MAX_SKILLS);

  logger.info(
    {
      userId,
      rerankedCandidates: rerankedMatches.length,
      kept: topMatches.length,
      topFinalScore: topMatches[0]?.score ?? null,
      finalScoreFloor: FINAL_SCORE_FLOOR,
    },
    'CV skills reranking stats',
  );

  return topMatches
    .map((m) => metaByUri.get(m.concept_uri))
    .filter((row): row is EscoMetaRow => Boolean(row))
    .map(toEscoSkill);
}
