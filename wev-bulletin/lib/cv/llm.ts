import Groq from 'groq-sdk';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { buildPrompt, MAX_VALUES, PROMPT_VERSION } from './prompts';
import { CvImportError } from './errors';
import type { CvLocale } from './types';
import { VALUES_LIST } from '@/lib/values';

export type SkillPhrase = { phrase: string; prominence: number };
export type LlmResult = { skills: SkillPhrase[]; values: string[] };

const SkillPhraseSchema = z.union([
  z
    .string()
    .min(3)
    .transform((phrase) => ({ phrase: phrase.trim(), prominence: 5 })),
  z
    .object({
      phrase: z.string().min(3),
      prominence: z.coerce.number().min(1).max(10).catch(5).optional().default(5),
    })
    .transform((obj) => ({
      phrase: obj.phrase.trim(),
      prominence: obj.prominence,
    })),
]);

const LlmResponseSchema = z.object({
  skills: z.array(z.unknown()).transform((arr) =>
    arr
      .map((s) => SkillPhraseSchema.safeParse(s))
      .filter((res) => res.success)
      .map((res) => res.data)
      .filter((s) => s.phrase.length >= 3),
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
      maxRetries: 3,
      timeout: 30000,
    });
    const completion = await groq.chat.completions.create({
      model: groqModel,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: buildPrompt(cvText, locale) },
      ],
    });
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
