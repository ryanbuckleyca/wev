import { logger } from '@/lib/logger';
import type { EscoSkill } from '@/lib/types/skills';
import { extractWithLlm } from './llm';
import { embedPhrases } from './embeddings';
import { shortlistEscoCandidates, selectFinalSkills } from './matcher';
import { createGroqReranker } from './reranker';
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
  // Guard against empty or obviously too short CV text
  const trimmedText = cvText.trim();
  if (trimmedText.length < 50) {
    logger.warn({ userId, textLength: trimmedText.length }, 'CV text too short for extraction');
    return { skills: [], values: [], warnings: ['no_skills_extracted'] };
  }

  const llmResult = await extractWithLlm({ cvText: trimmedText, groqKey, userId, groqModel, locale });

  let skills: EscoSkill[] = [];
  const warnings: string[] = [];

  if (llmResult.skills.length > 0) {
    try {
      const phrases = llmResult.skills.map((s) => s.phrase);
      const embeddings = await embedPhrases(phrases, jinaKey);

      const candidates = await shortlistEscoCandidates({
        skillPhrases: llmResult.skills,
        embeddings,
        cvText,
        userId,
        locale,
      });

      skills = await selectFinalSkills(
        candidates,
        cvText,
        locale,
        userId,
        createGroqReranker(groqKey, groqModel),
      );
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
