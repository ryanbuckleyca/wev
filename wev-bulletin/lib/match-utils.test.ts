import { describe, it, expect } from 'vitest';
import {
  tokeniseIdealEnv,
  buildJobText,
  computeLocationTokens,
  scoreLocationTokens,
  profileHasLocationValue,
  combineFinalScore,
} from './match-utils';

describe('match-utils', () => {
  describe('tokeniseIdealEnv', () => {
    it('should lowercase and split by non-word characters', () => {
      expect(tokeniseIdealEnv('Remote, Hybrid; Office')).toEqual(['remote', 'hybrid', 'office']);
    });

    it('should filter out tokens shorter than 3 characters', () => {
      expect(tokeniseIdealEnv('a in out home')).toEqual(['out', 'home']);
    });

    it('should handle empty strings', () => {
      expect(tokeniseIdealEnv('')).toEqual([]);
    });
  });

  describe('buildJobText', () => {
    it('should join location, summary, and description with spaces and lowercase them', () => {
      expect(buildJobText('Toronto', 'Developer role', 'Exciting work')).toBe(
        'toronto developer role exciting work',
      );
    });

    it('should handle missing fields', () => {
      expect(buildJobText('Toronto', null, 'Work')).toBe('toronto work');
      expect(buildJobText(undefined, 'Summary', undefined)).toBe('summary');
    });
  });

  describe('computeLocationTokens', () => {
    it('should return matched and unmatched tokens', () => {
      const idealEnv = 'Remote Hybrid Office';
      const jobText = 'this is a remote position in an office';
      const result = computeLocationTokens(idealEnv, jobText);
      expect(result.matched).toEqual(['remote', 'office']);
      expect(result.unmatched).toEqual(['hybrid']);
    });

    it('should handle empty or null idealEnv', () => {
      expect(computeLocationTokens(null, 'some text')).toEqual({ matched: [], unmatched: [] });
      expect(computeLocationTokens('', 'some text')).toEqual({ matched: [], unmatched: [] });
      expect(computeLocationTokens('   ', 'some text')).toEqual({ matched: [], unmatched: [] });
    });
  });

  describe('scoreLocationTokens', () => {
    it('should return null if there are no tokens', () => {
      expect(scoreLocationTokens({ matched: [], unmatched: [] })).toBeNull();
    });

    it('should calculate overlap score with a bonus for more matches', () => {
      // 1 match, 1 unmatch -> 0.5 overlap + 0.1 bonus = 0.6
      expect(scoreLocationTokens({ matched: ['a'], unmatched: ['b'] })).toBeCloseTo(0.6);

      // 2 matches, 0 unmatch -> 1.0 overlap + 0.2 bonus = 1.2 -> capped at 1.0
      expect(scoreLocationTokens({ matched: ['a', 'b'], unmatched: [] })).toBe(1.0);

      // 0 matches, 2 unmatch -> 0.0 overlap + 0 bonus = 0.0
      expect(scoreLocationTokens({ matched: [], unmatched: ['a', 'b'] })).toBe(0.0);
    });

    it('should cap bonus at 0.3', () => {
      // 4 matches, 10 unmatch -> 4/14 = 0.285... + 0.3 bonus = 0.585...
      const result = scoreLocationTokens({
        matched: ['1', '2', '3', '4'],
        unmatched: ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14']
      });
      expect(result).toBeCloseTo(0.2857 + 0.3, 4);
    });
  });

  describe('profileHasLocationValue', () => {
    it('should return true if location is in values array', () => {
      expect(profileHasLocationValue(['Location', 'Other'], [])).toBe(true);
      expect(profileHasLocationValue(['location'], [])).toBe(true);
    });

    it('should return true if location is in valuesRated array', () => {
      expect(profileHasLocationValue([], [{ value: 'Location', rank: 1 }])).toBe(true);
      expect(profileHasLocationValue([], ['location'] as any)).toBe(true);
    });

    it('should return false if location is not present', () => {
      expect(profileHasLocationValue(['Other'], [{ value: 'Work', rank: 1 }])).toBe(false);
      expect(profileHasLocationValue(null, undefined)).toBe(false);
    });
  });

  describe('combineFinalScore', () => {
    it('should use legacy 60/40 split if only value and skill scores are present', () => {
      const score = combineFinalScore({
        valueScore: 0.8,
        skillScore: 0.5,
        workTypeScore: null,
        locationScore: null,
      });
      // 0.8 * 0.6 + 0.5 * 0.4 = 0.48 + 0.2 = 0.68
      expect(score).toBeCloseTo(0.68);
    });

    it('should use weighted average if other scores are present', () => {
      const score = combineFinalScore({
        valueScore: 1.0,      // weight 0.55
        skillScore: 1.0,      // weight 0.35
        workTypeScore: 1.0,   // weight 0.05
        locationScore: 0.0,   // weight 0.05
      });
      // (1.0 * 0.55 + 1.0 * 0.35 + 1.0 * 0.05 + 0.0 * 0.05) / 1.0 = 0.95
      expect(score).toBeCloseTo(0.95);
    });

    it('should handle partial scores by re-weighting remaining dimensions', () => {
      const score = combineFinalScore({
        valueScore: 1.0,      // weight 0.55
        skillScore: null,
        workTypeScore: 0.5,   // weight 0.05
        locationScore: null,
      });
      // (1.0 * 0.55 + 0.5 * 0.05) / (0.55 + 0.05) = 0.575 / 0.6 = 0.95833...
      expect(score).toBeCloseTo(0.575 / 0.6);
    });

    it('should return 0 if no scores are present', () => {
      expect(combineFinalScore({
        valueScore: null,
        skillScore: null,
        workTypeScore: null,
        locationScore: null,
      })).toBe(0);
    });

    it('should cap final score at 1.0', () => {
      const score = combineFinalScore({
        valueScore: 2.0,
        skillScore: 2.0,
        workTypeScore: null,
        locationScore: null,
      });
      expect(score).toBe(1.0);
    });
  });
});
