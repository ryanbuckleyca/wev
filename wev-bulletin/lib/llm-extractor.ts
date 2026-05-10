import Groq from 'groq-sdk';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { VALUES_DICTIONARY, VALUES_LIST } from '@/lib/values';
import { CvImportError } from '@/lib/types/cv-errors';

const GROQ_MODEL = process.env.GROQ_MODEL_CV ?? 'llama-3.3-70b-versatile';
const MAX_TEXT_CHARS = 12_000;
const MAX_VALUES = 5;

export type SkillPhrase = { phrase: string; prominence: number };
export type LlmResult = { skills: SkillPhrase[]; values: string[] };

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
  values: z
    .array(z.string())
    .transform((arr) => {
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

function parseLlmResponse(content: string): LlmResult {
  try {
    const cleanContent = content.replace(/^```(?:json)?/im, '').replace(/```$/m, '').trim();
    const parsed = JSON.parse(cleanContent);
    return LlmResponseSchema.parse(parsed) as LlmResult;
  } catch (error) {
    throw new CvImportError('llm_parsing_failed', error instanceof Error ? error.message : String(error));
  }
}

export async function extractWithLlm(cvText: string, groqKey: string, userId: string): Promise<LlmResult> {
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
