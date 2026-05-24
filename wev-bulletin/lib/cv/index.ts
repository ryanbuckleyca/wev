import { logger } from '@/lib/logger';
import type { EscoSkill } from '@/lib/types/skills';
import { extractWithLlm } from './llm';
import { embedPhrases } from './embeddings';
import { linkPhrasesToEsco } from './matcher';
import type { CvLocale } from './types';

export async function extractSkillsAndValuesFromCv({
  cvText,
  userId,
  groqKey,
  jinaKey,
  locale,
  groqModel,
}: {
  cvText: string;
  userId: string;
  groqKey: string;
  jinaKey: string;
  locale: CvLocale;
  groqModel: string;
}): Promise<{ skills: EscoSkill[]; values: string[]; warnings: string[] }> {
  const llmResult = await extractWithLlm({ cvText, groqKey, userId, groqModel });

  let skills: EscoSkill[] = [];
  const warnings: string[] = [];

  if (llmResult.skills.length > 0) {
    try {
      const phrases = llmResult.skills.map((s) => s.phrase);
      const embeddings = await embedPhrases(phrases, jinaKey);
      skills = await linkPhrasesToEsco(llmResult.skills, embeddings, cvText, userId, locale);
    } catch (error) {
      logger.error({ err: error, userId }, 'CV skill linking failed');
      throw error;
    }
  } else {
    logger.warn({ userId }, 'CV LLM extracted zero skills');
    warnings.push('no_skills_extracted');
  }

  return { skills, values: llmResult.values, warnings };
}
