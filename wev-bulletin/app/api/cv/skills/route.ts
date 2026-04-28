import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase-server';
import type { EscoSkill } from '@/lib/types/skills';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Mirrors wev-scraper/llm/jina_embedding.py contract: same model, same dim,
// same task. Vectors must be comparable to those in esco_skills.embedding.
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_DIM = 1024;

const MAX_TEXT_CHARS = 16_000;
const MAX_SKILLS = 10;
const RPC_CANDIDATE_COUNT = 80;
// Matches the scraper's tested floor (wev-scraper/scripts/tag_esco_skills_vector.py:select_skills).
// The scraper's source comment warns: do NOT raise above 0.32.
const SCORE_FLOOR = Number.parseFloat(process.env.CV_SKILLS_SCORE_FLOOR ?? '0.25');

type MatchRow = { concept_uri: string; similarity: number };
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

async function embedCvText(text: string, apiKey: string): Promise<number[]> {
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
      input: [text],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    throw new Error(`jina_${resp.status}`);
  }
  const json = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== JINA_DIM) {
    throw new Error('jina_bad_dimensions');
  }
  return vec;
}

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

export async function POST(request: Request) {
  const auth = await getRequestUser();
  if (!auth.ok) return unauthorizedResponse('Not authenticated');

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof body.text !== 'string' || body.text.trim().length < 10) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    logger.error('JINA_API_KEY missing — cannot embed CV text');
    return NextResponse.json({ error: 'skills_provider_unavailable' }, { status: 503 });
  }

  let queryVector: number[];
  try {
    queryVector = await embedCvText(body.text.trim().slice(0, MAX_TEXT_CHARS), apiKey);
  } catch (error) {
    logger.error({ err: error, userId: auth.user.id }, 'CV embedding failed');
    return NextResponse.json({ error: 'skills_inference_failed' }, { status: 502 });
  }

  const supabase = supabaseServer;
  const { data: matchData, error: matchError } = await supabase.rpc('match_skills_by_embedding', {
    // pgvector text literal — what the RPC's typed signature expects.
    query_embedding: `[${queryVector.join(',')}]`,
    match_count: RPC_CANDIDATE_COUNT,
  });
  if (matchError) {
    logger.error({ err: matchError, userId: auth.user.id }, 'match_skills_by_embedding failed');
    return NextResponse.json({ error: 'skills_inference_failed' }, { status: 502 });
  }

  const allCandidates = (matchData ?? []) as MatchRow[];
  const matches = allCandidates
    .filter((row) => row.similarity >= SCORE_FLOOR)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SKILLS);

  logger.info(
    {
      userId: auth.user.id,
      candidates: allCandidates.length,
      topSimilarity: allCandidates[0]?.similarity ?? null,
      kept: matches.length,
      floor: SCORE_FLOOR,
    },
    'CV skills RPC stats',
  );

  if (matches.length === 0) {
    return NextResponse.json({ skills: [] });
  }

  const { data: metaData, error: metaError } = await supabase
    .from('esco_skills')
    .select(
      'concept_uri, preferred_label_en, preferred_label_fr, description_en, description_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level',
    )
    .in(
      'concept_uri',
      matches.map((m) => m.concept_uri),
    );
  if (metaError) {
    logger.error({ err: metaError, userId: auth.user.id }, 'esco_skills hydrate failed');
    return NextResponse.json({ error: 'skills_inference_failed' }, { status: 502 });
  }

  const metaByUri = new Map(
    ((metaData ?? []) as EscoMetaRow[]).map((row) => [row.concept_uri, row]),
  );
  const skills = matches
    .map((m) => metaByUri.get(m.concept_uri))
    .filter((row): row is EscoMetaRow => Boolean(row))
    .map(toEscoSkill);

  return NextResponse.json({ skills });
}
