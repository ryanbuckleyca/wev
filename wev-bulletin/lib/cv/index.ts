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
  traceId,
}: {
  cvText: string;
  userId: string;
  groqKey: string;
  jinaKey: string;
  locale: CvLocale;
  groqModel: string;
  traceId?: string;
}): Promise<{ skills: EscoSkill[]; values: string[]; warnings: string[] }> {
  // #region debug-point D:llm-start
  logger.info({ traceId, userId }, '[DEBUG] CV LLM stage start');
  // #endregion
  const llmResult = await extractWithLlm({ cvText, groqKey, userId, groqModel, locale, traceId });
  // #region debug-point D:llm-done
  logger.info(
    {
      traceId,
      userId,
      skillPhraseCount: llmResult.skills.length,
      valueCount: llmResult.values.length,
    },
    '[DEBUG] CV LLM stage done',
  );
  // #endregion

  let skills: EscoSkill[] = [];
  const warnings: string[] = [];

  if (llmResult.skills.length > 0) {
    try {
      const phrases = llmResult.skills.map((s) => s.phrase);
      // #region debug-point D:embed-start
      logger.info({ traceId, userId, phraseCount: phrases.length }, '[DEBUG] CV embedding stage start');
      // #endregion
      const embeddings = await embedPhrases(phrases, jinaKey);
      // #region debug-point D:embed-done
      logger.info(
        { traceId, userId, embeddingCount: embeddings.length },
        '[DEBUG] CV embedding stage done',
      );
      // #endregion
      // #region debug-point D:match-start
      logger.info({ traceId, userId }, '[DEBUG] CV ESCO match stage start');
      // #endregion
      skills = await linkPhrasesToEsco(
        llmResult.skills,
        embeddings,
        cvText,
        userId,
        locale,
        undefined,
        traceId,
      );
      // #region debug-point D:match-done
      logger.info({ traceId, userId, skillCount: skills.length }, '[DEBUG] CV ESCO match stage done');
      // #endregion
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
