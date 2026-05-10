import { logger } from '@/lib/logger';
import type { EscoSkill } from '@/lib/types/skills';
import { extractWithLlm } from './llm-extractor';
import { embedPhrases } from './vector-embedder';
import { linkPhrasesToEsco } from './skill-matcher';

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
  locale: 'en' | 'fr';
  groqModel: string;
}): Promise<{ skills: EscoSkill[]; values: string[] }> {
  const llmResult = await extractWithLlm(cvText, groqKey, userId, groqModel);

  let skills: EscoSkill[] = [];
  if (llmResult.skills.length > 0) {
    try {
      const phrases = llmResult.skills.map((s) => s.phrase);
      const embeddings = await embedPhrases(phrases, jinaKey);
      skills = await linkPhrasesToEsco(llmResult.skills, embeddings, cvText, userId, locale);
    } catch (error) {
      logger.error({ err: error, userId }, 'CV skill linking failed');
      throw error;
    }
  }

  return { skills, values: llmResult.values };
}
