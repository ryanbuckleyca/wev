import Groq from 'groq-sdk';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { isTaskLikeText } from '@/lib/nlp-utils';
import { buildPrompt, MAX_VALUES, PROMPT_VERSION } from './prompts';
import { CvImportError } from './errors';
import type { CvLocale } from './types';
import { VALUES_LIST } from '@/lib/values';

export type SkillPhrase = { phrase: string; evidence: string; prominence: number };
export type LlmResult = { skills: SkillPhrase[]; values: string[] };

/** Headroom for 12–18 skills with evidence + values; 1200 often truncates and Groq returns json_validate_failed. */
const CV_EXTRACT_MAX_TOKENS = 4096;
const CV_EXTRACT_TIMEOUT_MS = 60_000;

function normalizeSkillText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Reject phrases that look like task descriptions or full sentences. We check
 * both the EN and FR prefix lists because the LLM occasionally mixes
 * languages, and we want a normalized noun-phrase skill label either way.
 */
function isReusableSkillPhrase(phrase: string): boolean {
  const normalized = normalizeSkillText(phrase);
  if (!normalized) return false;
  return !isTaskLikeText(normalized, 'en') && !isTaskLikeText(normalized, 'fr');
}

const SkillPhraseSchema = z.union([
  z
    .string()
    .min(3)
    .transform((phrase) => ({
      phrase: normalizeSkillText(phrase),
      evidence: normalizeSkillText(phrase),
      prominence: 5,
    })),
  z
    .object({
      phrase: z.string().min(3),
      evidence: z.string().optional(),
      prominence: z.coerce.number().min(1).max(10).catch(5).optional().default(5),
    })
    .transform((obj) => {
      const normalizedPhrase = normalizeSkillText(obj.phrase);
      const trimmedEvidence = obj.evidence?.trim() ?? '';
      const finalEvidence =
        trimmedEvidence.length >= 3 ? normalizeSkillText(trimmedEvidence) : normalizedPhrase;
      return {
        phrase: normalizedPhrase,
        evidence: finalEvidence,
        prominence: obj.prominence,
      };
    }),
]);

const LlmResponseSchema = z.object({
  skills: z.array(z.unknown()).transform((arr) =>
    arr
      .map((s) => SkillPhraseSchema.safeParse(s))
      .filter((res) => res.success)
      .map((res) => res.data)
      .filter((s) => s.phrase.length >= 3 && s.evidence.length >= 3)
      .filter((s) => isReusableSkillPhrase(s.phrase)),
  ),
  values: z.array(z.string()).transform((arr) => {
    const allowed = new Set<string>(VALUES_LIST);
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const v of arr) {
      const trimmed = v.trim();
      if (allowed.has(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        valid.push(trimmed);
        if (valid.length >= MAX_VALUES) break;
      }
    }
    return valid;
  }),
});

export function parseLlmResponse(content: string): LlmResult {
  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const cleanContent = (match ? match[1] : content).trim();
    const parsed = JSON.parse(cleanContent);
    return LlmResponseSchema.parse(parsed) as LlmResult;
  } catch (error) {
    throw new CvImportError(
      'llm_parsing_failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export type ExtractWithLlmOptions = {
  cvText: string;
  groqKey: string;
  userId: string;
  groqModel: string;
  locale: CvLocale;
};

/** Groq structured-output validator rejected the model completion. */
export function isGroqJsonValidateFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    status?: number;
    error?: { code?: string; error?: { code?: string } };
  };
  if (err.status !== 400) return false;
  const code = err.error?.error?.code ?? err.error?.code;
  return code === 'json_validate_failed';
}

async function createCvCompletion(
  groq: Groq,
  groqModel: string,
  locale: CvLocale,
  cvText: string,
  options: { enforceJsonObject: boolean },
) {
  return groq.chat.completions.create({
    model: groqModel,
    temperature: 0.1,
    max_tokens: CV_EXTRACT_MAX_TOKENS,
    ...(options.enforceJsonObject ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: 'You output only valid JSON.' },
      { role: 'user', content: buildPrompt(cvText, locale) },
    ],
  });
}

export async function extractWithLlm({
  cvText,
  groqKey,
  userId,
  groqModel,
  locale,
}: ExtractWithLlmOptions): Promise<LlmResult> {
  try {
    const groq = new Groq({
      apiKey: groqKey,
      maxRetries: 2,
      timeout: CV_EXTRACT_TIMEOUT_MS,
    });

    let completion;
    try {
      completion = await createCvCompletion(groq, groqModel, locale, cvText, {
        enforceJsonObject: true,
      });
    } catch (error) {
      // Groq's server-side JSON validator occasionally returns empty
      // failed_generation (truncation / model glitch). Retry once without
      // response_format and parse with our own Zod schema.
      if (!isGroqJsonValidateFailed(error)) throw error;
      logger.warn(
        { userId, groqModel, promptVersion: PROMPT_VERSION },
        'CV LLM json_validate_failed; retrying without response_format',
      );
      completion = await createCvCompletion(groq, groqModel, locale, cvText, {
        enforceJsonObject: false,
      });
    }

    const content = completion.choices?.[0]?.message?.content ?? '';
    const llmResult = parseLlmResponse(content);
    logger.info(
      {
        userId,
        skillCount: llmResult.skills.length,
        valueCount: llmResult.values.length,
        promptVersion: PROMPT_VERSION,
      },
      'CV LLM extraction successful',
    );
    return llmResult;
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    logger.error({ err: error, userId }, 'CV LLM extraction failed');
    throw new CvImportError('extraction_failed');
  }
}
