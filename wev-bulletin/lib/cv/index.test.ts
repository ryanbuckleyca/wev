import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractSkillsAndValuesFromCv } from './index';
import { extractWithLlm } from './llm';
import { embedPhrases } from './embeddings';
import { shortlistEscoCandidates, selectFinalSkills } from './matcher';
import { logger } from '@/lib/logger';

vi.mock('./llm');
vi.mock('./embeddings');
vi.mock('./matcher');
vi.mock('./reranker');
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('extractSkillsAndValuesFromCv', () => {
  const mockParams = {
    cvText:
      'This is a long enough CV text for testing purposes. It should be at least 50 characters.',
    userId: 'user-1',
    groqKey: 'groq-key',
    jinaKey: 'jina-key',
    locale: 'en' as const,
    groqModel: 'groq-model',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early if CV text is too short', async () => {
    const result = await extractSkillsAndValuesFromCv({
      ...mockParams,
      cvText: 'too short',
    });
    expect(result).toEqual({ skills: [], values: [], warnings: ['no_skills_extracted'] });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('successfully extracts skills and values', async () => {
    vi.mocked(extractWithLlm).mockResolvedValue({
      skills: [{ phrase: 'coding', evidence: 'Used for 5 years', prominence: 5 }],
      values: ['Ambition'],
    });
    vi.mocked(embedPhrases).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(shortlistEscoCandidates).mockResolvedValue([]);
    vi.mocked(selectFinalSkills).mockResolvedValue([
      { conceptUri: 'uri1', label: 'Coding' } as any,
    ]);

    const result = await extractSkillsAndValuesFromCv(mockParams);

    expect(result.skills).toHaveLength(1);
    expect(result.values).toEqual(['Ambition']);
    expect(result.warnings).toEqual([]);
  });

  it('returns warnings if LLM extracts zero skills', async () => {
    vi.mocked(extractWithLlm).mockResolvedValue({
      skills: [],
      values: ['Ambition'],
    });

    const result = await extractSkillsAndValuesFromCv(mockParams);

    expect(result.skills).toEqual([]);
    expect(result.values).toEqual(['Ambition']);
    expect(result.warnings).toEqual(['no_skills_extracted']);
  });

  it('throws error if skill linking fails', async () => {
    vi.mocked(extractWithLlm).mockResolvedValue({
      skills: [{ phrase: 'coding', evidence: 'evidence', prominence: 5 }],
      values: [],
    });
    vi.mocked(embedPhrases).mockRejectedValue(new Error('Embedding failed'));

    await expect(extractSkillsAndValuesFromCv(mockParams)).rejects.toThrow('Embedding failed');
    expect(logger.error).toHaveBeenCalled();
  });
});
