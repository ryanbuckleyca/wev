import { describe, it, expect } from 'vitest';
import { adjustCutoffOnRemove, adjustCutoffOnReorder } from './ranked-list';

describe('ranked-list utils', () => {
  describe('adjustCutoffOnRemove', () => {
    it('decrements cutoff if removed item was ranked', () => {
      expect(adjustCutoffOnRemove(0, 5)).toBe(4);
      expect(adjustCutoffOnRemove(4, 5)).toBe(4);
    });

    it('keeps cutoff if removed item was unranked', () => {
      expect(adjustCutoffOnRemove(5, 5)).toBe(5);
      expect(adjustCutoffOnRemove(10, 5)).toBe(5);
    });
  });

  describe('adjustCutoffOnReorder', () => {
    it('returns explicit cutoff if provided', () => {
      expect(adjustCutoffOnReorder(0, 10, 5, 3)).toBe(3);
    });

    it('increments cutoff if item moved from unranked to ranked', () => {
      expect(adjustCutoffOnReorder(6, 2, 5)).toBe(6);
    });

    it('decrements cutoff if item moved from ranked to unranked', () => {
      expect(adjustCutoffOnReorder(2, 6, 5)).toBe(4);
    });

    it('keeps cutoff if item stayed within ranked', () => {
      expect(adjustCutoffOnReorder(1, 3, 5)).toBe(5);
    });

    it('keeps cutoff if item stayed within unranked', () => {
      expect(adjustCutoffOnReorder(6, 8, 5)).toBe(5);
    });
  });
});
