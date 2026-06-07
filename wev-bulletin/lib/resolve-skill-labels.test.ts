import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSkillLabels, attachSkillLabels, parseLocale } from './resolve-skill-labels';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('resolve-skill-labels', () => {
  const mockQuery: any = {
    select: vi.fn(),
    in: vi.fn(),
    then: vi.fn(),
  };

  const mockSupabase = {
    from: vi.fn(() => mockQuery),
  } as unknown as SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.in.mockReturnValue(mockQuery);
  });

  describe('resolveSkillLabels', () => {
    it('returns an empty map if no URIs are provided', async () => {
      const result = await resolveSkillLabels(mockSupabase, [], 'en');
      expect(result.size).toBe(0);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('batches queries and returns a map of URI to labels (en)', async () => {
      const jobs = [
        { skills: ['uri1', 'uri2'] },
        { skills: ['uri2', 'uri3'] },
        { skills: null }, // Branch coverage for ?? []
      ];

      const mockData = [
        {
          concept_uri: 'uri1',
          preferred_label_en: 'Skill 1',
          preferred_label_fr: 'Compétence 1',
          description_en: 'Desc 1',
          description_fr: 'Desc 1 FR',
          scope_note_en: 'Note 1',
          scope_note_fr: 'Note 1 FR',
        },
        {
          concept_uri: 'uri2',
          preferred_label_en: 'Skill 2',
          preferred_label_fr: 'Compétence 2',
          description_en: null,
          description_fr: null,
          scope_note_en: null,
          scope_note_fr: null,
        },
      ];

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
      });

      const result = await resolveSkillLabels(mockSupabase, jobs, 'en');

      expect(result.size).toBe(2);
      expect(result.get('uri1')).toEqual({
        term: 'Skill 1',
        definition: 'Desc 1',
        scope_note: 'Note 1',
      });
      expect(result.get('uri2')).toEqual({
        term: 'Skill 2',
        definition: null,
        scope_note: null,
      });
    });

    it('handles null data response from supabase', async () => {
      const jobs = [{ skills: ['uri1'] }];
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      });

      const result = await resolveSkillLabels(mockSupabase, jobs, 'en');
      expect(result.size).toBe(0);
    });

    it('falls back to other language if primary is missing', async () => {
      const jobs = [{ skills: ['uri1'] }];
      const mockData = [
        {
          concept_uri: 'uri1',
          preferred_label_en: 'Skill 1',
          preferred_label_fr: '',
          description_en: null,
          description_fr: null,
          scope_note_en: 'Note 1',
          scope_note_fr: '',
        },
      ];

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
      });

      const result = await resolveSkillLabels(mockSupabase, jobs, 'fr');

      expect(result.get('uri1')).toEqual({
        term: 'Skill 1', // fallback to en
        definition: null, // both missing
        scope_note: 'Note 1', // fallback to en
      });
    });

    it('handles database errors gracefully', async () => {
      const jobs = [{ skills: ['uri1'] }];
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'DB Error' } }).then(onFulfilled);
      });

      const result = await resolveSkillLabels(mockSupabase, jobs, 'en');

      expect(result.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('[resolveSkillLabels] batch error:', 'DB Error');
      consoleSpy.mockRestore();
    });
  });

  describe('attachSkillLabels', () => {
    it('attaches labels to jobs based on the map', () => {
      const jobs = [
        { id: 1, skills: ['uri1', 'uri2'] },
        { id: 2, skills: ['uri3'] },
      ];
      const labelMap = new Map([
        ['uri1', { term: 'S1', definition: 'D1', scope_note: 'N1' }],
        ['uri2', { term: 'S2', definition: 'D2', scope_note: 'N2' }],
      ]);

      const result = attachSkillLabels(jobs, labelMap);

      expect(result[0].skill_labels).toEqual({
        uri1: { term: 'S1', definition: 'D1', scope_note: 'N1' },
        uri2: { term: 'S2', definition: 'D2', scope_note: 'N2' },
      });
      expect(result[1].skill_labels).toEqual({});
    });

    it('handles missing skills field', () => {
      const jobs = [{ id: 1 }];
      const labelMap = new Map();
      const result = attachSkillLabels(jobs as any, labelMap);
      expect(result[0].skill_labels).toEqual({});
    });
  });

  describe('parseLocale', () => {
    it('parses fr correctly', () => {
      expect(parseLocale('fr')).toBe('fr');
      expect(parseLocale('FR')).toBe('fr');
    });

    it('defaults to en for everything else', () => {
      expect(parseLocale('en')).toBe('en');
      expect(parseLocale('de')).toBe('en');
      expect(parseLocale(null)).toBe('en');
      expect(parseLocale('')).toBe('en');
    });
  });
});
