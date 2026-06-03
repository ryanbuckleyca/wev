import Groq from 'groq-sdk';
import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import type { EscoSkill } from '@/lib/types/skills';
import { buildCvWordSet, labelRelevance } from '@/lib/nlp-utils';
import { CvImportError } from './errors';
import type { CvLocale } from './types';
import type { SkillPhrase } from './llm';

const MAX_SKILLS = 10;
const HYDRATE_CANDIDATES_LIMIT = 30;
const RPC_MATCHES_PER_PHRASE = 10;
const SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '') || 0.25;
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

/**
 * Use the LLM to select and rank the best ≤10 ESCO skills from the candidates.
 * The LLM only sees the candidate list and CV text — it cannot invent new URIs.
 * Returns ordered URIs. Falls back to empty array on any error (caller uses
 * vector-score ordering as fallback).
 */
async function rerankWithLlm(
  candidates: EscoMetaRow[],
  cvText: string,
  groqKey: string,
  groqModel: string,
  locale: CvLocale,
  userId: string,
): Promise<string[]> {
  const cvSnippet = cvText.slice(0, 3000);
  const candidateList = candidates
    .map((c, i) => `${i + 1}. [${c.concept_uri}] ${getPreferredLabel(c, locale)}`)
    .join('\n');

  const prompt = `You are matching ESCO skills to a candidate's CV.

CV (excerpt):
"""
${cvSnippet}
"""

Candidate ESCO skills (index | URI | label):
${candidateList}

Select up to ${MAX_SKILLS} skills that best match what this person has actually demonstrated. Aim for ${MAX_SKILLS} — only return fewer if you genuinely cannot find that many clearly supported matches. Prefer broader, reusable skill labels over domain-specific variants unless the specific domain is explicitly mentioned in the CV. Order from best match to weakest.

Rules:
- Return ONLY URIs from the list above, exactly as written
- Do not invent new URIs
- Do not select skills with domain-specific qualifiers (e.g. ICT, marine, agricultural, legal, clinical) unless that specific domain is explicitly mentioned in the CV
- Return fewer than ${MAX_SKILLS} only if fewer are genuinely supported

Return JSON: {"selected": ["uri1", "uri2", ...]}`;

  try {
    const groq = new Groq({ apiKey: groqKey, maxRetries: 2, timeout: 20000 });
    const completion = await groq.chat.completions.create({
      model: groqModel,
      temperature: 0.0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content);
    const selected: unknown = parsed?.selected;

    if (!Array.isArray(selected)) return [];

    // Validate: only return URIs that are actually in the candidate set
    const validUris = new Set(candidates.map((c) => c.concept_uri));
    return (selected as unknown[])
      .filter((u): u is string => typeof u === 'string' && validUris.has(u))
      .slice(0, MAX_SKILLS);
  } catch (err) {
    logger.warn({ err, userId }, 'CV skill LLM reranking failed — using vector order');
    return [];
  }
}

export async function linkPhrasesToEsco(
  skillPhrases: SkillPhrase[],
  embeddings: number[][],
  cvText: string,
  userId: string,
  locale: CvLocale,
  groqKey?: string,
  groqModel?: string,
  supabase = supabaseServer,
): Promise<EscoSkill[]> {
  const cvWords = buildCvWordSet(cvText, locale);

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
    },
    'CV skills candidate shortlist',
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

  const allMeta = (metaData ?? []) as EscoMetaRow[];
  const metaByUri = new Map(allMeta.map((row) => [row.concept_uri, row]));

  // LLM reranking: if we have Groq credentials, let the LLM pick the best matches.
  // This replaces heuristic token-overlap filtering with semantic judgement.
  if (groqKey && groqModel && allMeta.length > 0) {
    const selectedUris = await rerankWithLlm(
      allMeta,
      cvText,
      groqKey,
      groqModel,
      locale,
      userId,
    );

    if (selectedUris.length > 0) {
      logger.info({ userId, kept: selectedUris.length }, 'CV skills LLM reranking complete');
      return selectedUris
        .map((uri) => metaByUri.get(uri))
        .filter((row): row is EscoMetaRow => Boolean(row))
        .map(toEscoSkill);
    }

    // LLM reranking returned nothing — fall through to vector-score ordering
    logger.warn({ userId }, 'LLM reranking returned empty — falling back to vector order');
  }

  // Fallback: return top candidates ordered by vector score, no extra filtering
  const topMatches = candidateMatches.slice(0, MAX_SKILLS);
  logger.info({ userId, kept: topMatches.length }, 'CV skills vector-score fallback');

  return topMatches
    .map((m) => metaByUri.get(m.concept_uri))
    .filter((row): row is EscoMetaRow => Boolean(row))
    .map(toEscoSkill);
}
