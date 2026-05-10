/**
 * POST /api/cv/extract
 *
 * Two-Stage CV Extraction: a single endpoint that extracts both skills and
 * values from CV text.
 *
 * Pipeline:
 *   1. Groq LLM — reads the CV once, extracts 12–18 contextual skill phrases
 *      with prominence scores (1–10) AND infers 3–5 work values.
 *   2. Jina v3  — batch-embeds the skill phrases (task: retrieval.query).
 *   3. Supabase — runs match_skills_by_embedding per phrase to find the
 *      closest ESCO skill for each. Ranks by similarity × prominence,
 *      deduplicates by concept_uri, returns top 10.
 *
 * Why two stages?  Embedding the whole CV as a single vector produces a
 * "centroid" that is dominated by whichever domain has the most text.
 * By extracting individual skill phrases first, each phrase gets its own
 * undiluted vector, so minority domains (e.g. a dev stint in an archiving
 * career) are correctly represented.
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { extractSkillsAndValuesFromCv } from '@/lib/cv-extraction';
import { CvImportError } from '@/lib/types/cv-errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RequestSchema = z.object({
  text: z.string().trim().min(10).max(15000, 'CV text is too long (max 15000 characters)'),
  locale: z.enum(['en', 'fr']).default('en'),
});

export async function POST(request: Request) {
  const auth = await getRequestUser();
  if (!auth.ok) return unauthorizedResponse('Not authenticated');

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const jinaKey = process.env.JINA_API_KEY;

  if (!groqKey) {
    logger.error('GROQ_API_KEY missing — cannot extract CV skills/values');
    return NextResponse.json({ error: 'provider_unavailable' }, { status: 503 });
  }

  if (!jinaKey) {
    logger.error('JINA_API_KEY missing — cannot embed CV skill phrases');
    return NextResponse.json({ error: 'provider_unavailable' }, { status: 503 });
  }

  try {
    const result = await extractSkillsAndValuesFromCv({
      cvText: body.text,
      userId: auth.user.id,
      groqKey,
      jinaKey,
      locale: body.locale,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CvImportError) {
      return NextResponse.json({ error: error.code }, { status: 502 });
    }

    logger.error({ err: error, userId: auth.user.id }, 'Unexpected CV extraction error');
    return NextResponse.json({ error: 'extraction_failed' }, { status: 502 });
  }
}
