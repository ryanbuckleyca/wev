import 'server-only';
import Groq from 'groq-sdk';
import { logger } from '@/lib/logger';
import { buildRerankPrompt, type RerankCandidate } from './prompts';
import type { CvLocale } from './types';

export const RERANK_TIMEOUT_MS = 25_000;
export const RERANK_MAX_RETRIES = 2;
export const RERANK_MAX_TOKENS = 1_000;
export const RERANK_TEMPERATURE = 0;

export type RerankerInput = {
  candidates: RerankCandidate[];
  cvText: string;
  locale: CvLocale;
  maxSkills: number;
  userId: string;
};

/**
 * A reranker selects an ordered subset of `candidates` that best match
 * `cvText`. Implementations MUST only return URIs from the input set.
 * On failure, return an empty array — the caller is responsible for fallback.
 */
export type Reranker = (input: RerankerInput) => Promise<string[]>;

export function parseSelectedUris(content: string, validUris: Set<string>, max: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const selected = (parsed as { selected?: unknown })?.selected;
  if (!Array.isArray(selected)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of selected) {
    if (typeof item !== 'string') continue;
    if (!validUris.has(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Build a reranker backed by the Groq Chat Completions API. The reranker
 * never invents new URIs — output is filtered against the input candidate set.
 */
export function createGroqReranker(groqKey: string, groqModel: string): Reranker {
  return async ({ candidates, cvText, locale, maxSkills, userId }) => {
    if (candidates.length === 0) return [];

    const prompt = buildRerankPrompt(cvText, candidates, maxSkills, locale);

    try {
      const groq = new Groq({
        apiKey: groqKey,
        maxRetries: RERANK_MAX_RETRIES,
        timeout: RERANK_TIMEOUT_MS,
      });
      const completion = await groq.chat.completions.create({
        model: groqModel,
        temperature: RERANK_TEMPERATURE,
        max_tokens: RERANK_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
      });

      const content = completion.choices?.[0]?.message?.content ?? '';
      const validUris = new Set(candidates.map((c) => c.conceptUri));
      return parseSelectedUris(content, validUris, maxSkills);
    } catch (err) {
      logger.warn({ err, userId }, 'CV skill LLM reranking failed — using vector order');
      return [];
    }
  };
}
