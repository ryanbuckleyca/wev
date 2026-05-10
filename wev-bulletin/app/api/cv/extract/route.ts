/**
 * POST /api/cv/extract
 *
 * Three-Stage CV Extraction: a single endpoint that extracts both skills and
 * values from CV text.
 *
 * Pipeline:
 *   1. Parser     — reads the CV (PDF/DOCX) using server-side parsers.
 *   2. Groq LLM   — reads the text, extracts 12–18 contextual skill phrases
 *      with prominence scores (1–10) AND infers 3–5 work values.
 *   3. Jina + DB  — batch-embeds the skill phrases and runs match_skills_by_embedding
 *      per phrase to find the closest ESCO skill for each. Ranks by similarity × prominence,
 *      deduplicates by concept_uri, returns top 10.
 *
 * Why multiple stages? Embedding the whole CV as a single vector produces a
 * "centroid" that is dominated by whichever domain has the most text.
 * By extracting individual skill phrases first, each phrase gets its own
 * undiluted vector, so minority domains (e.g. a dev stint in an archiving
 * career) are correctly represented.
 */

import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { extractSkillsAndValuesFromCv } from '@/lib/cv-extraction';
import { CvImportError } from '@/lib/types/cv-errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await getRequestUser();
  if (!auth.ok) return unauthorizedResponse('Not authenticated');

  const groqKey = process.env.GROQ_API_KEY;
  const jinaKey = process.env.JINA_API_KEY;

  if (!groqKey || !jinaKey) {
    logger.error('Missing API keys for CV extraction');
    return NextResponse.json({ error: 'provider_unavailable' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const rawLocale = formData.get('locale');
    const locale: 'en' | 'fr' = rawLocale === 'fr' ? 'fr' : 'en';

    if (!file) {
      return NextResponse.json({ error: 'no_file_provided' }, { status: 400 });
    }

    // 1. Parse CV (PDF/DOCX) on the server
    const { parseCvOnServer } = await import('@/lib/server/cv-parser');
    const { text, metadata } = await parseCvOnServer(file, locale);

    // 2. Extract Skills and Values from text
    const groqModel = process.env.GROQ_MODEL_CV ?? 'llama-3.3-70b-versatile';
    const result = await extractSkillsAndValuesFromCv({
      cvText: text,
      userId: auth.user.id,
      groqKey,
      jinaKey,
      locale,
      groqModel,
    });

    return NextResponse.json({
      ...result,
      metadata,
    });
  } catch (error) {
    if (error instanceof CvImportError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, userId: auth.user.id }, 'CV Extraction Error');
    return NextResponse.json(
      {
        error: 'extraction_failed',
        ...(process.env.NODE_ENV !== 'production' && { detail: message }),
      },
      { status: 500 },
    );
  }
}
