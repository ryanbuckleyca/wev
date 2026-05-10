import { describe, it, expect, vi } from 'vitest';
import { rankAndFilterCandidates, type BatchMatchRow } from './skill-matcher';

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
        { query_index: 0, concept_uri: '1', preferred_label_en: 'A', preferred_label_fr: '', similarity: 0.9 },
        { query_index: 0, concept_uri: '2', preferred_label_en: 'B', preferred_label_fr: '', similarity: 0.1 }, // below floor
      ];
      const phrases = [{ phrase: 'Test', prominence: 5 }];
      const cvWords = new Set(['a']);
      
      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(1);
      expect(result[0].concept_uri).toBe('1');
    });

    it('calculates score using similarity * prominence weight * relevance', () => {
      const rows: BatchMatchRow[] = [
        { query_index: 0, concept_uri: '1', preferred_label_en: 'React', preferred_label_fr: '', similarity: 0.8 },
      ];
      // Prominence is 10 (weight 1.0)
      const phrases = [{ phrase: 'React', prominence: 10 }];
      // Relevance is 1.0 because 'react' is in the CV
      const cvWords = new Set(['react', 'developer']);
      
      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      // 0.8 * 1.0 * 1.0 = 0.8
      expect(result[0].score).toBe(0.8);
    });

    it('deduplicates by concept_uri, keeping the highest score', () => {
      const rows: BatchMatchRow[] = [
        { query_index: 0, concept_uri: 'uri_A', preferred_label_en: 'A', preferred_label_fr: '', similarity: 0.6 },
        { query_index: 1, concept_uri: 'uri_A', preferred_label_en: 'A', preferred_label_fr: '', similarity: 0.8 }, // higher similarity
      ];
      const phrases = [
        { phrase: 'phrase1', prominence: 5 },
        { phrase: 'phrase2', prominence: 5 },
      ];
      const cvWords = new Set(['a']);
      
      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.8); // kept the better one
    });

    it('filters out candidates below RELEVANCE_FLOOR', () => {
      const rows: BatchMatchRow[] = [
        { query_index: 0, concept_uri: '1', preferred_label_en: 'water management', preferred_label_fr: '', similarity: 0.9 },
      ];
      const phrases = [{ phrase: 'management', prominence: 5 }];
      // CV has 'management' but not 'water', so relevance is 0.5. Wait, 1/2 = 0.5. 
      // If the floor is 0.4, it passes.
      // Let's use a label with 3 words, and only 1 matches: 1/3 = 0.33 (fails)
      const rows2: BatchMatchRow[] = [
        { query_index: 0, concept_uri: '1', preferred_label_en: 'deep sea water management', preferred_label_fr: '', similarity: 0.9 },
      ];
      const cvWords = new Set(['management']); // 1 out of 4 words matches -> 0.25 relevance
      
      const result = rankAndFilterCandidates(rows2, phrases, cvWords, 'en', 0.25);
      expect(result).toHaveLength(0); // dropped due to relevance < 0.4
    });

    it('sorts results by score descending', () => {
      const rows: BatchMatchRow[] = [
        { query_index: 0, concept_uri: '2', preferred_label_en: 'B', preferred_label_fr: '', similarity: 0.5 },
        { query_index: 0, concept_uri: '1', preferred_label_en: 'A', preferred_label_fr: '', similarity: 0.9 },
        { query_index: 0, concept_uri: '3', preferred_label_en: 'C', preferred_label_fr: '', similarity: 0.7 },
      ];
      const phrases = [{ phrase: 'test', prominence: 5 }];
      const cvWords = new Set(['a', 'b', 'c']); // 1.0 relevance for all
      
      const result = rankAndFilterCandidates(rows, phrases, cvWords, 'en', 0.25);
      expect(result.map(r => r.concept_uri)).toEqual(['1', '3', '2']);
    });
  });
});
