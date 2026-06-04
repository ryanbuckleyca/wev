import { describe, it, expect, vi } from 'vitest';
import { shortlistEscoCandidates, selectFinalSkills, rankAndFilterCandidates, type BatchMatchRow } from './matcher';

async function runMatcher(options: any) {
  const candidates = await shortlistEscoCandidates(options);
  return selectFinalSkills(
    candidates,
    options.cvText,
    options.locale,
    options.userId,
    options.reranker,
  );
}

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

  describe('runMatcher', () => {
    it('without LLM credentials falls back to vector-score order', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          {
            query_index: 0,
            concept_uri: 'a',
            preferred_label_en: 'react',
            similarity: 0.9,
          },
          {
            query_index: 0,
            concept_uri: 'b',
            preferred_label_en: 'vue',
            similarity: 0.8,
          },
        ],
        error: null,
      });
      const mockSelect = vi.fn().mockResolvedValue({
        data: [
          { concept_uri: 'a', preferred_label_en: 'React' },
          { concept_uri: 'b', preferred_label_en: 'Vue' },
        ],
        error: null,
      });

      const supabase = {
        rpc: mockRpc,
        from: () => ({ select: () => ({ in: mockSelect }) }),
      } as any;

      const result = await runMatcher({
        skillPhrases: [
          { phrase: 'react development', evidence: 'Built React apps', prominence: 10 },
        ],
        embeddings: [[0.1]],
        cvText: 'React developer with 5 years experience and Vue skills',
        userId: 'u1',
        locale: 'en',
        supabase,
      });

      expect(result).toHaveLength(2);
      expect(result.map((skill: any) => skill.uri)).toEqual(['a', 'b']);
    });

    it('returns fewer skills when low-confidence candidates remain after reranking', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          {
            query_index: 0,
            concept_uri: 'a',
            preferred_label_en: 'react',
            similarity: 0.9,
          },
        ],
        error: null,
      });
      // Mock metadata hydration for only 'a'
      const mockSelect = vi.fn().mockResolvedValue({
        data: [{ concept_uri: 'a', preferred_label_en: 'React' }],
        error: null,
      });

      const supabase = {
        rpc: mockRpc,
        from: () => ({ select: () => ({ in: mockSelect }) }),
      } as any;

      const reranker = vi.fn().mockResolvedValue(['a', 'b']); // 'b' is not in candidate set

      const result = await runMatcher({
        skillPhrases: [
          { phrase: 'react development', evidence: 'Built React apps', prominence: 10 },
        ],
        embeddings: [[0.1]],
        cvText: 'React developer',
        userId: 'u1',
        locale: 'en',
        reranker,
        supabase,
      });

      expect(result).toHaveLength(1);
      expect(result[0].uri).toBe('a');
    });

    it('throws when esco_skills metadata hydration fails', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [{ query_index: 0, concept_uri: 'react', preferred_label_en: 'react', similarity: 0.9 }],
        error: null,
      });
      const mockSelect = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB down' },
      });

      const supabase = {
        rpc: mockRpc,
        from: () => ({ select: () => ({ in: mockSelect }) }),
      } as any;

      await expect(
        runMatcher({
          skillPhrases: [
            { phrase: 'React development', evidence: 'Built React applications', prominence: 10 },
          ],
          embeddings: [[0.1]],
          cvText: 'React dev',
          userId: 'u1',
          locale: 'en',
          supabase,
        }),
      ).rejects.toThrow('DB down');
    });

    it('uses reranker output ordering when reranker returns valid URIs', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          { query_index: 0, concept_uri: 'a', preferred_label_en: 'react', similarity: 0.8 },
          { query_index: 0, concept_uri: 'b', preferred_label_en: 'leadership', similarity: 0.9 },
        ],
        error: null,
      });
      const mockSelect = vi.fn().mockResolvedValue({
        data: [
          { concept_uri: 'a', preferred_label_en: 'React' },
          { concept_uri: 'b', preferred_label_en: 'Leadership' },
        ],
        error: null,
      });

      const supabase = {
        rpc: mockRpc,
        from: () => ({ select: () => ({ in: mockSelect }) }),
      } as any;

      const reranker = vi.fn().mockResolvedValue(['b', 'a']);

      const result = await runMatcher({
        skillPhrases: [
          { phrase: 'team leadership', evidence: 'Led teams', prominence: 10 },
        ],
        embeddings: [[0.1]],
        cvText: 'Led React teams and demonstrated leadership',
        userId: 'u1',
        locale: 'en',
        reranker,
        supabase,
      });

      expect(result.map((s: any) => s.uri)).toEqual(['b', 'a']);
    });

    it('falls back to vector order when reranker returns empty', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: [
          { query_index: 0, concept_uri: 'a', preferred_label_en: 'react', similarity: 0.9 },
          { query_index: 0, concept_uri: 'b', preferred_label_en: 'leadership', similarity: 0.8 },
        ],
        error: null,
      });
      const mockSelect = vi.fn().mockResolvedValue({
        data: [
          { concept_uri: 'a', preferred_label_en: 'React' },
          { concept_uri: 'b', preferred_label_en: 'Leadership' },
        ],
        error: null,
      });

      const supabase = {
        rpc: mockRpc,
        from: () => ({ select: () => ({ in: mockSelect }) }),
      } as any;

      const reranker = vi.fn().mockResolvedValue([]);

      const result = await runMatcher({
        skillPhrases: [
          { phrase: 'team leadership', evidence: 'Led teams', prominence: 10 },
        ],
        embeddings: [[0.1]],
        cvText: 'Led React teams with leadership skills',
        userId: 'u1',
        locale: 'en',
        reranker,
        supabase,
      });

      expect(result.map((s: any) => s.uri)).toEqual(['a', 'b']);
    });
  });
});
