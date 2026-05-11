import Groq from 'groq-sdk';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { buildPrompt, MAX_VALUES } from '@/lib/prompts/cv-extraction';
import { VALUES_LIST } from '@/lib/values';
import { CvImportError } from '@/lib/types/cv-errors';

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
  skills: z
    .array(SkillPhraseSchema.catch({ phrase: '', prominence: 0 }))
    .transform((arr) => arr.filter((s) => s.phrase.length >= 3)),
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
    const cleanContent = content
      .replace(/^```(?:json)?/im, '')
      .replace(/```$/m, '')
      .trim();
    const parsed = JSON.parse(cleanContent);
    return LlmResponseSchema.parse(parsed) as LlmResult;
  } catch (error) {
    throw new CvImportError(
      'llm_parsing_failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function extractWithLlm(
  cvText: string,
  groqKey: string,
  userId: string,
  groqModel: string,
): Promise<LlmResult> {
  try {
    const completion = await new Groq({ apiKey: groqKey }).chat.completions.create({
      model: groqModel,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: buildPrompt(cvText) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content ?? '';
    const llmResult = parseLlmResponse(content);
    logger.info(
      {
        userId,
        skillCount: llmResult.skills.length,
        skills: llmResult.skills.map((s) => `${s.phrase} (${s.prominence})`),
        values: llmResult.values,
      },
      'CV LLM extraction result',
    );
    return llmResult;
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    logger.error({ err: error, userId }, 'CV LLM extraction failed');
    throw new CvImportError('extraction_failed');
  }
}
