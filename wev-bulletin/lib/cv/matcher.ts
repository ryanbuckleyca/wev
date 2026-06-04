import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import type { EscoSkill } from '@/lib/types/skills';
import { buildCvWordSet, labelRelevance } from '@/lib/nlp-utils';
import { CvImportError } from './errors';
import type { CvLocale } from './types';
import type { SkillPhrase } from './llm';
import type { Reranker } from './reranker';
import type { RerankCandidate } from './prompts';

const MAX_SKILLS = 10;
const HYDRATE_CANDIDATES_LIMIT = 30;
const RPC_MATCHES_PER_PHRASE = 10;
const SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '') || 0.25;
const RELEVANCE_FLOOR = 0.4;

const ESCO_META_COLUMNS =
  'concept_uri, preferred_label_en, preferred_label_fr, description_en, description_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level';

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

export type ScoredMatch = BatchMatchRow & { score: number };
export type BatchMatchRow = MatchRow & { query_index: number };

type LocalizedRow = Pick<EscoMetaRow, 'preferred_label_en' | 'preferred_label_fr'> & {
  description_en?: EscoMetaRow['description_en'];
  description_fr?: EscoMetaRow['description_fr'];
};

type ShortlistOptions = {
  skillPhrases: SkillPhrase[];
  embeddings: number[][];
  cvText: string;
  userId: string;
  locale: CvLocale;
  supabase?: typeof supabaseServer;
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

function getPreferredLabel(row: LocalizedRow, locale: CvLocale): string {
  return locale === 'fr'
    ? row.preferred_label_fr || row.preferred_label_en || ''
    : row.preferred_label_en || row.preferred_label_fr || '';
}

function getDescription(row: EscoMetaRow, locale: CvLocale): string {
  return (
    (locale === 'fr'
      ? row.description_fr || row.description_en
      : row.description_en || row.description_fr) ?? ''
  );
}

function toRerankCandidate(row: EscoMetaRow, locale: CvLocale): RerankCandidate {
  return {
    conceptUri: row.concept_uri,
    label: getPreferredLabel(row, locale),
    description: getDescription(row, locale),
  };
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
    const relevance = labelRelevance(label, cvWords, locale);
    if (relevance < RELEVANCE_FLOOR) continue;

    const score = row.similarity * promWeight * relevance;
    const existing = bestByUri.get(row.concept_uri);
    if (!existing || score > existing.score) {
      bestByUri.set(row.concept_uri, { ...row, score });
    }
  }

  return [...bestByUri.values()].sort((a, b) => b.score - a.score);
}

async function fetchEmbeddingMatches(
  supabase: typeof supabaseServer,
  embeddings: number[][],
  userId: string,
): Promise<BatchMatchRow[]> {
  const query_embeddings = embeddings.map((vec) => `[${vec.join(',')}]`);
  const { data, error } = await supabase.rpc('match_skills_by_embedding', {
    query_embeddings,
    match_count: RPC_MATCHES_PER_PHRASE,
  });

  if (error) {
    logger.error({ err: error, userId }, 'match_skills_by_embedding failure');
    throw new CvImportError('embedding_failed', error.message);
  }

  return (data ?? []) as BatchMatchRow[];
}

async function hydrateEscoMeta(
  supabase: typeof supabaseServer,
  uris: string[],
  userId: string,
): Promise<EscoMetaRow[]> {
  const { data, error } = await supabase
    .from('esco_skills')
    .select(ESCO_META_COLUMNS)
    .in('concept_uri', uris);

  if (error) {
    logger.error({ err: error, userId }, 'esco_skills hydrate failed');
    throw new CvImportError('embedding_failed', error.message);
  }

  return (data ?? []) as EscoMetaRow[];
}

export async function selectFinalSkills(
  candidates: EscoMetaRow[],
  cvText: string,
  locale: CvLocale,
  userId: string,
  reranker: Reranker | undefined,
): Promise<EscoSkill[]> {
  if (!reranker || candidates.length === 0) {
    return candidates.slice(0, MAX_SKILLS).map(toEscoSkill);
  }

  logger.info({ userId, candidates: candidates.length }, 'CV skills starting LLM reranking');

  const rerankCandidates = candidates.map((c) => toRerankCandidate(c, locale));
  const selectedUris = await reranker({
    candidates: rerankCandidates,
    cvText,
    locale,
    maxSkills: MAX_SKILLS,
    userId,
  });

  if (selectedUris.length === 0) {
    logger.warn({ userId }, 'LLM reranking returned empty — falling back to vector order');
    return candidates.slice(0, MAX_SKILLS).map(toEscoSkill);
  }

  const byUri = new Map(candidates.map((c) => [c.concept_uri, c]));
  const reranked = selectedUris
    .map((uri) => byUri.get(uri))
    .filter((row): row is EscoMetaRow => Boolean(row));

  logger.info({ userId, kept: reranked.length }, 'CV skills LLM reranking complete');
  return reranked.map(toEscoSkill);
}

export async function shortlistEscoCandidates({
  skillPhrases,
  embeddings,
  cvText,
  userId,
  locale,
  supabase = supabaseServer,
}: ShortlistOptions): Promise<EscoMetaRow[]> {
  const cvWords = buildCvWordSet(cvText, locale);
  const matchRows = await fetchEmbeddingMatches(supabase, embeddings, userId);
  const scoredMatches = rankAndFilterCandidates(matchRows, skillPhrases, cvWords, locale);
  const candidateMatches = scoredMatches.slice(0, HYDRATE_CANDIDATES_LIMIT);

  logger.info(
    {
      userId,
      phrasesSearched: embeddings.length,
      uniqueCandidates: scoredMatches.length,
      shortlisted: candidateMatches.length,
      topScore: candidateMatches[0]?.score ?? null,
    },
    'CV skills candidate shortlist',
  );

  if (candidateMatches.length === 0) return [];

  const allMeta = await hydrateEscoMeta(
    supabase,
    candidateMatches.map((m) => m.concept_uri),
    userId,
  );

  const metaByUri = new Map(allMeta.map((row) => [row.concept_uri, row]));
  return candidateMatches
    .map((m) => metaByUri.get(m.concept_uri))
    .filter((row): row is EscoMetaRow => Boolean(row));
}


