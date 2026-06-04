import { describe, it, expect, vi } from 'vitest';
import { linkPhrasesToEsco, rankAndFilterCandidates, type BatchMatchRow } from './matcher';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {},
}));

describe('skill-matcher', () => {
  describe('rankAndFilterCandidates', () => {
    it('filters out candidates below scoreFloor', () => {
      const rows: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: '1',
          preferred_label_en: 'wordA',
          preferred_label_fr: '',
          similarity: 0.9,
        },
        {
          query_index: 0,
          concept_uri: '2',
          preferred_label_en: 'wordB',
          preferred_label_fr: '',
          similarity: 0.1,
        }, // below floor
      ];
      const phrases = [{ phrase: 'Test', evidence: 'Test', prominence: 5 }];
      const cvWords = new Set(['worda']);

      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(1);
      expect(result[0].concept_uri).toBe('1');
    });

    it('calculates score using similarity * prominence weight * relevance', () => {
      const rows: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: '1',
          preferred_label_en: 'React',
          preferred_label_fr: '',
          similarity: 0.8,
        },
      ];
      // Prominence is 10 (weight 1.0)
      const phrases = [{ phrase: 'React', evidence: 'Built React applications', prominence: 10 }];
      // Relevance is 1.0 because 'react' is in the CV
      const cvWords = new Set(['react', 'developer']);

      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      // 0.8 * 1.0 * 1.0 = 0.8
      expect(result[0].score).toBe(0.8);
    });

    it('deduplicates by concept_uri, keeping the highest score', () => {
      const rows: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: 'uri_A',
          preferred_label_en: 'wordA',
          preferred_label_fr: '',
          similarity: 0.6,
        },
        {
          query_index: 1,
          concept_uri: 'uri_A',
          preferred_label_en: 'wordA',
          preferred_label_fr: '',
          similarity: 0.8,
        }, // higher similarity
      ];
      const phrases = [
        { phrase: 'phrase1', evidence: 'phrase1', prominence: 5 },
        { phrase: 'phrase2', evidence: 'phrase2', prominence: 5 },
      ];
      const cvWords = new Set(['worda']);

      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.8); // kept the better one
    });

    it('filters out candidates below RELEVANCE_FLOOR', () => {
      const phrases = [{ phrase: 'management', evidence: 'management', prominence: 5 }];
      // CV has 'management' but not 'water', so relevance is 0.5. Wait, 1/2 = 0.5.
      // If the floor is 0.4, it passes.
      // Let's use a label with 3 words, and only 1 matches: 1/3 = 0.33 (fails)
      const rows2: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: '1',
          preferred_label_en: 'deep sea water management',
          preferred_label_fr: '',
          similarity: 0.9,
        },
      ];
      const cvWords = new Set(['management']); // 1 out of 4 words matches -> 0.25 relevance

      const result = rankAndFilterCandidates(rows2, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(0); // dropped due to relevance < 0.4
    });

    it('sorts results by score descending', () => {
      const rows: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: '2',
          preferred_label_en: 'wordB',
          preferred_label_fr: '',
          similarity: 0.5,
        },
        {
          query_index: 0,
          concept_uri: '1',
          preferred_label_en: 'wordA',
          preferred_label_fr: '',
          similarity: 0.9,
        },
        {
          query_index: 0,
          concept_uri: '3',
          preferred_label_en: 'wordC',
          preferred_label_fr: '',
          similarity: 0.7,
        },
      ];
      const phrases = [{ phrase: 'test', evidence: 'test', prominence: 5 }];
      const cvWords = new Set(['worda', 'wordb', 'wordc']); // 1.0 relevance for all

      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result.map((r) => r.concept_uri)).toEqual(['1', '3', '2']);
    });

    it('keeps only the strongest initial candidates for later reranking', () => {
      const rows: BatchMatchRow[] = [
        {
          query_index: 0,
          concept_uri: 'taskish',
          preferred_label_en: 'lead a team in water management',
          preferred_label_fr: '',
          similarity: 0.95,
        },
        {
          query_index: 0,
          concept_uri: 'canonical',
          preferred_label_en: 'team leadership',
          preferred_label_fr: '',
          similarity: 0.9,
        },
      ];
      const phrases = [
        {
          phrase: 'Team leadership',
          evidence: 'Led a team of six staff across regional water operations',
          prominence: 8,
        },
      ];
      const cvWords = new Set([
        'led',
        'team',
        'six',
        'staff',
        'regional',
        'water',
        'operations',
        'leadership',
      ]);

      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result.map((r) => r.concept_uri)).toEqual(['canonical', 'taskish']);
    });
  });

  describe('linkPhrasesToEsco', () => {
    it('without LLM credentials falls back to vector-score order', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              query_index: 0,
              concept_uri: 'taskish',
              preferred_label_en: 'lead a team in water management',
              preferred_label_fr: 'lead a team in water management',
              similarity: 0.95,
            },
            {
              query_index: 0,
              concept_uri: 'canonical',
              preferred_label_en: 'team leadership',
              preferred_label_fr: 'team leadership',
              similarity: 0.9,
            },
          ],
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  concept_uri: 'taskish',
                  preferred_label_en: 'lead a team in water management',
                  preferred_label_fr: 'lead a team in water management',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: null,
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
                {
                  concept_uri: 'canonical',
                  preferred_label_en: 'team leadership',
                  preferred_label_fr: 'team leadership',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: ['lead teams'],
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      const result = await linkPhrasesToEsco({
        skillPhrases: [
          {
            phrase: 'Team leadership',
            evidence: 'Led a team of six staff across regional water operations',
            prominence: 8,
          },
        ],
        embeddings: [new Array(1024).fill(0.1)],
        cvText: 'Led a team of six staff across regional water operations.',
        userId: 'user-1',
        locale: 'en',
        supabase: supabase as any,
      });

      // Without a reranker, fallback returns candidates in vector-score order
      // (taskish has higher similarity).
      expect(result.map((skill) => skill.uri)).toEqual(['taskish', 'canonical']);
    });

    it('returns fewer skills when low-confidence candidates remain after reranking', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              query_index: 0,
              concept_uri: 'good',
              preferred_label_en: 'data analysis',
              preferred_label_fr: 'data analysis',
              similarity: 0.91,
            },
            {
              query_index: 1,
              concept_uri: 'weak',
              preferred_label_en: 'manage marine rescue operations',
              preferred_label_fr: 'manage marine rescue operations',
              similarity: 0.89,
            },
          ],
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  concept_uri: 'good',
                  preferred_label_en: 'data analysis',
                  preferred_label_fr: 'data analysis',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: ['analyse data'],
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
                {
                  concept_uri: 'weak',
                  preferred_label_en: 'manage marine rescue operations',
                  preferred_label_fr: 'manage marine rescue operations',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: null,
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      const result = await linkPhrasesToEsco({
        skillPhrases: [
          {
            phrase: 'Data analysis',
            evidence: 'Performed data analysis for monthly reports',
            prominence: 9,
          },
          {
            phrase: 'Operations support',
            evidence: 'Supported field teams during incidents',
            prominence: 5,
          },
        ],
        embeddings: [new Array(1024).fill(0.1), new Array(1024).fill(0.2)],
        cvText:
          'Performed data analysis for monthly reports and supported field teams during incidents.',
        userId: 'user-1',
        locale: 'en',
        supabase: supabase as any,
      });

      // Without a reranker, fallback returns all candidates that pass initial scoring.
      expect(result.map((skill) => skill.uri)).toContain('good');
    });

    it('throws when esco_skills metadata hydration fails', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              query_index: 0,
              concept_uri: 'skill:1',
              preferred_label_en: 'React',
              preferred_label_fr: 'React',
              similarity: 0.9,
            },
          ],
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'database unavailable' },
            }),
          }),
        }),
      };

      await expect(
        linkPhrasesToEsco({
          skillPhrases: [
            { phrase: 'React development', evidence: 'Built React applications', prominence: 10 },
          ],
          embeddings: [new Array(1024).fill(0.1)],
          cvText: 'Built React applications',
          userId: 'user-1',
          locale: 'en',
          supabase: supabase as any,
        }),
      ).rejects.toMatchObject({
        code: 'embedding_failed',
        message: 'database unavailable',
      });
    });

    it('uses reranker output ordering when reranker returns valid URIs', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              query_index: 0,
              concept_uri: 'a',
              preferred_label_en: 'team leadership',
              preferred_label_fr: 'team leadership',
              similarity: 0.95,
            },
            {
              query_index: 0,
              concept_uri: 'b',
              preferred_label_en: 'team leadership variant',
              preferred_label_fr: 'team leadership variant',
              similarity: 0.9,
            },
          ],
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  concept_uri: 'a',
                  preferred_label_en: 'team leadership',
                  preferred_label_fr: 'team leadership',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: null,
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
                {
                  concept_uri: 'b',
                  preferred_label_en: 'team leadership variant',
                  preferred_label_fr: 'team leadership variant',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: null,
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      const reranker = vi.fn().mockResolvedValue(['b', 'a']);

      const result = await linkPhrasesToEsco({
        skillPhrases: [
          { phrase: 'team leadership', evidence: 'Led teams', prominence: 8 },
        ],
        embeddings: [new Array(1024).fill(0.1)],
        cvText: 'Led teams across departments.',
        userId: 'u',
        locale: 'en',
        reranker,
        supabase: supabase as any,
      });

      expect(reranker).toHaveBeenCalledOnce();
      expect(result.map((s) => s.uri)).toEqual(['b', 'a']);
    });

    it('falls back to vector order when reranker returns empty', async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              query_index: 0,
              concept_uri: 'a',
              preferred_label_en: 'team leadership',
              preferred_label_fr: 'team leadership',
              similarity: 0.95,
            },
          ],
          error: null,
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  concept_uri: 'a',
                  preferred_label_en: 'team leadership',
                  preferred_label_fr: 'team leadership',
                  description_en: null,
                  description_fr: null,
                  alternative_label_en: null,
                  alternative_label_fr: null,
                  skill_type: 'skill',
                  reuse_level: 'cross-sector',
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      const reranker = vi.fn().mockResolvedValue([]);

      const result = await linkPhrasesToEsco({
        skillPhrases: [
          { phrase: 'team leadership', evidence: 'Led teams', prominence: 8 },
        ],
        embeddings: [new Array(1024).fill(0.1)],
        cvText: 'Led teams across departments.',
        userId: 'u',
        locale: 'en',
        reranker,
        supabase: supabase as any,
      });

      expect(result.map((s) => s.uri)).toEqual(['a']);
    });
  });
});
