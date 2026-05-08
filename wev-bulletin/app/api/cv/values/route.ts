import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { VALUES_DICTIONARY, VALUES_LIST } from '@/lib/values';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_TEXT_CHARS = 12_000;
const MAX_VALUES = 5;
// No bulletin-side LLM abstraction exists yet (groq-sdk is the only TS LLM dep).
// Model is overridable via env so we can flip without a deploy.
const GROQ_MODEL = process.env.GROQ_MODEL_VALUES ?? 'llama-3.3-70b-versatile';

function buildPrompt(cvText: string): string {
  const taxonomy = VALUES_LIST.map(
    (label) => `- ${label}: ${VALUES_DICTIONARY[label].description}`,
  ).join('\n');
  return `Infer a candidate's most important work values from their CV.

Allowed values (label: meaning):
${taxonomy}

CV:
"""
${cvText.slice(0, MAX_TEXT_CHARS)}
"""

Return JSON: {"values": ["Label", ...]}.
- Use only labels above (case-sensitive, exact spelling).
- Pick 3 to ${MAX_VALUES} values the candidate clearly prioritises (skills are not values).
- Only include a value when the CV gives concrete evidence — focus areas, choices, achievements.
- Order the array from MOST important to least important based on the strength of evidence in the CV. The first label is the candidate's strongest value.`;
}

function pickValuesFromText(content: string): string[] {
  const allowed = new Set<string>(VALUES_LIST);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = /\{[\s\S]*\}/.exec(content);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const raw = (parsed as { values?: unknown })?.values;
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (allowed.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
      if (out.length >= MAX_VALUES) break;
    }
  }
  return out;
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.error('GROQ_API_KEY missing — cannot infer CV values');
    return NextResponse.json({ error: 'values_provider_unavailable' }, { status: 503 });
  }

  try {
    const completion = await new Groq({ apiKey }).chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: buildPrompt(body.text.trim()) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content ?? '';
    return NextResponse.json({ values: pickValuesFromText(content) });
  } catch (error) {
    logger.error({ err: error, userId: auth.user.id }, 'CV values inference failed');
    return NextResponse.json({ error: 'values_inference_failed' }, { status: 502 });
  }
}
