import Groq from 'groq-sdk';
import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import { VALUES_DICTIONARY, VALUES_LIST } from '@/lib/values';
import type { EscoSkill } from '@/lib/types/skills';
import { buildCvWordSet, labelRelevance } from '@/lib/nlp-utils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GROQ_MODEL = process.env.GROQ_MODEL_CV ?? 'llama-3.3-70b-versatile';
const MAX_TEXT_CHARS = 12_000;
const MAX_VALUES = 5;
const MAX_SKILLS = 10;
/** Per-phrase RPC: fetch top 3 so dedup has fallback candidates. */
const RPC_MATCHES_PER_PHRASE = 3;
const SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '0.25');

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_DIM = 1024;

// ---------------------------------------------------------------------------
// Stage 1: LLM extraction
// ---------------------------------------------------------------------------

function buildPrompt(cvText: string): string {
  const valuesTaxonomy = VALUES_LIST.map(
    (label) => `- ${label}: ${VALUES_DICTIONARY[label].description}`,
  ).join('\n');

  return `You are analyzing a candidate's CV. Perform two tasks:

TASK A — SKILL PHRASES
Extract 12 to 18 distinct professional skill phrases from the CV.
For each skill, assign a "prominence" score from 1 to 10 reflecting how central that skill is to the candidate's career based on:
- Duration: years of sustained use outweighs a single mention
- Depth: senior/lead-level work outweighs incidental use of a tool
- Recency: recent roles matter more than old ones
- Evidence: concrete achievements (metrics, outcomes) outweigh bare mentions

Rules:
- Each phrase should be a specific, contextual description of one capability (e.g. "Frontend web application development", not just "programming").
- Consolidate closely related technologies into one phrase when they were used together (e.g. "Data analysis and visualization using Python and SQL" rather than separate phrases for each).
- Do NOT extract a minor tool, platform, or framework as its own standalone skill phrase if it was only used incidentally within a larger role. Instead, fold it into the broader capability phrase. Only give a specific software tool its own phrase if the candidate's primary job was heavily centered on that tool.
- Cover ALL professional domains evident in the CV — do not let one domain dominate the list.
- Extract only skills the candidate has personally demonstrated or performed. Do not infer from job titles alone or from collaboration with specialists in other fields.
- Include both technical skills (tools, technologies, methodologies) and professional skills (leadership, training, consulting).
- If the CV text appears damaged or poorly formatted (e.g. OCR artifacts), do your best to interpret it.

TASK B — WORK VALUES
Infer the candidate's 3 to ${MAX_VALUES} most important work values from the CV.
Allowed values (use exact spelling, case-sensitive):
${valuesTaxonomy}
- Only include a value when the CV gives concrete evidence — focus areas, choices, achievements.
- Order from MOST to LEAST important based on evidence strength.

CV:
"""
${cvText.slice(0, MAX_TEXT_CHARS)}
"""

Return JSON:
{
  "skills": [{"phrase": "...", "prominence": 8}, ...],
  "values": ["Value1", ...]
}`;
}

type SkillPhrase = { phrase: string; prominence: number };
type LlmResult = { skills: SkillPhrase[]; values: string[] };

function parseLlmResponse(content: string): LlmResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { skills: [], values: [] };
  }
  const obj = parsed as { skills?: unknown; values?: unknown };

  const rawSkills = Array.isArray(obj.skills) ? obj.skills : [];
  const skills: SkillPhrase[] = [];
  for (const item of rawSkills) {
    if (typeof item === 'string' && item.trim().length > 2) {
      skills.push({ phrase: item.trim(), prominence: 5 });
    } else if (item && typeof item === 'object') {
      const entry = item as { phrase?: unknown; prominence?: unknown };
      const phrase = typeof entry.phrase === 'string' ? entry.phrase.trim() : '';
      const prominence =
        typeof entry.prominence === 'number' ? Math.max(1, Math.min(10, entry.prominence)) : 5;
      if (phrase.length > 2) {
        skills.push({ phrase, prominence });
      }
    }
  }

  const allowed = new Set<string>(VALUES_LIST);
  const rawValues = Array.isArray(obj.values) ? obj.values : [];
  const values: string[] = [];
  const seenValues = new Set<string>();
  for (const item of rawValues) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (allowed.has(v) && !seenValues.has(v)) {
      seenValues.add(v);
      values.push(v);
      if (values.length >= MAX_VALUES) break;
    }
  }

  return { skills, values };
}

// ---------------------------------------------------------------------------
// Stage 2: Jina embedding
// ---------------------------------------------------------------------------

async function embedPhrases(phrases: string[], apiKey: string): Promise<number[][]> {
  if (phrases.length === 0) return [];

  const resp = await fetch(JINA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      dimensions: JINA_DIM,
      task: 'retrieval.query',
      input: phrases,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    throw new Error(`jina_${resp.status}`);
  }

  const json = (await resp.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => {
    if (!Array.isArray(item.embedding) || item.embedding.length !== JINA_DIM) {
      throw new Error('jina_bad_dimensions');
    }
    return item.embedding;
  });
}

// ---------------------------------------------------------------------------
// Stage 3: Vector linking
// ---------------------------------------------------------------------------

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

type ScoredMatch = MatchRow & { score: number };

async function linkPhrasesToEsco(
  skillPhrases: SkillPhrase[],
  embeddings: number[][],
  cvText: string,
  userId: string,
): Promise<EscoSkill[]> {
  const cvWords = buildCvWordSet(cvText);
  const supabase = supabaseServer;

  // Run phrase searches in chunks to avoid exhausting the Supabase connection pool
  const rpcResults: { data: unknown; error: unknown }[] = [];
  const chunkSize = 5;
  for (let i = 0; i < embeddings.length; i += chunkSize) {
    const chunk = embeddings.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((vec) =>
        supabase.rpc('match_skills_by_embedding', {
          query_embedding: `[${vec.join(',')}]`,
          match_count: RPC_MATCHES_PER_PHRASE,
        }),
      ),
    );
    rpcResults.push(...chunkResults);
  }

  const bestByUri = new Map<string, ScoredMatch>();
  for (let i = 0; i < rpcResults.length; i++) {
    const { data, error } = rpcResults[i];
    const prominence = skillPhrases[i]?.prominence ?? 5;
    const promWeight = prominence / 10;

    if (error) {
      logger.warn({ err: error, userId }, 'match_skills_by_embedding partial failure');
      continue;
    }
    for (const row of (data ?? []) as MatchRow[]) {
      if (row.similarity < SCORE_FLOOR) continue;
      const relevance = labelRelevance(row.preferred_label_en ?? '', cvWords);
      if (relevance < 0.4) continue;
      const score = row.similarity * promWeight * relevance;
      const existing = bestByUri.get(row.concept_uri);
      if (!existing || score > existing.score) {
        bestByUri.set(row.concept_uri, { ...row, score });
      }
    }
  }

  const topMatches = [...bestByUri.values()].sort((a, b) => b.score - a.score).slice(0, MAX_SKILLS);

  logger.info(
    {
      userId,
      phrasesSearched: embeddings.length,
      uniqueCandidates: bestByUri.size,
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

// ---------------------------------------------------------------------------
// Main Extractor Function
// ---------------------------------------------------------------------------

export async function extractSkillsAndValuesFromCv({
  cvText,
  userId,
  groqKey,
  jinaKey,
}: {
  cvText: string;
  userId: string;
  groqKey: string;
  jinaKey: string;
}): Promise<{ skills: EscoSkill[]; values: string[] }> {
  // Stage 1: LLM extraction
  let llmResult: LlmResult;
  try {
    const completion = await new Groq({ apiKey: groqKey }).chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: buildPrompt(cvText) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content ?? '';
    llmResult = parseLlmResponse(content);
    logger.info(
      {
        userId,
        skillCount: llmResult.skills.length,
        skills: llmResult.skills.map((s) => `${s.phrase} (${s.prominence})`),
        values: llmResult.values,
      },
      'CV LLM extraction result',
    );
  } catch (error) {
    logger.error({ err: error, userId }, 'CV LLM extraction failed');
    throw new Error('extraction_failed');
  }

  // Stage 2 + 3: Embed phrases → link to ESCO
  let skills: EscoSkill[] = [];
  if (llmResult.skills.length > 0) {
    try {
      const phrases = llmResult.skills.map((s) => s.phrase);
      const embeddings = await embedPhrases(phrases, jinaKey);
      skills = await linkPhrasesToEsco(llmResult.skills, embeddings, cvText, userId);
    } catch (error) {
      logger.error({ err: error, userId }, 'CV skill linking failed');
      // Return values even if skills linking fails
    }
  }

  return { skills, values: llmResult.values };
}
