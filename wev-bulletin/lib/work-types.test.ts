import { describe, it, expect } from 'vitest';
import { isWorkType, normalizeWorkTypes } from './work-types';

describe('work-types', () => {
  describe('isWorkType', () => {
    it('identifies valid work types', () => {
      expect(isWorkType('remote')).toBe(true);
      expect(isWorkType('hybrid')).toBe(true);
      expect(isWorkType('office')).toBe(true);
    });

    it('identifies invalid work types', () => {
      expect(isWorkType('freelance')).toBe(false);
      expect(isWorkType('')).toBe(false);
      expect(isWorkType('REMOTE')).toBe(false);
    });
  });

  describe('normalizeWorkTypes', () => {
    it('returns empty array for null/undefined', () => {
      expect(normalizeWorkTypes(null)).toEqual([]);
      expect(normalizeWorkTypes(undefined)).toEqual([]);
    });

    it('normalizes valid work types', () => {
      expect(normalizeWorkTypes(['remote', 'hybrid'])).toEqual(['remote', 'hybrid']);
    });

    it('ignores invalid types and nulls', () => {
      expect(normalizeWorkTypes(['remote', 'invalid', null, undefined])).toEqual(['remote']);
    });

    it('returns unique values', () => {
      expect(normalizeWorkTypes(['remote', 'remote', 'hybrid'])).toEqual(['remote', 'hybrid']);
    });
  });
});
