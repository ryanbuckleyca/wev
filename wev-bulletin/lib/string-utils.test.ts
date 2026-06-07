import { describe, it, expect } from 'vitest';
import { truncateMiddle } from './string-utils';

describe('string-utils', () => {
  describe('truncateMiddle', () => {
    it('returns original string if shorter than maxLength', () => {
      expect(truncateMiddle('test', 10)).toBe('test');
    });

    it('truncates middle if longer than maxLength', () => {
      // maxLength 5, half = floor(4/2) = 2
      // expect "te…st" (2 chars + … + 2 chars = 5 chars)
      expect(truncateMiddle('teststring', 5)).toBe('te…ng');
    });

    it('handles exact length', () => {
      expect(truncateMiddle('test', 4)).toBe('test');
    });
  });
});
