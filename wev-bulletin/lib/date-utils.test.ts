import { describe, it, expect } from 'vitest';
import { parseDateString, parseDateMs } from './date-utils';

describe('date-utils', () => {
  describe('parseDateString', () => {
    it('parses UTC dates correctly', () => {
      const date = parseDateString('2024-01-01T00:00:00Z');
      expect(date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('treats bare dates as UTC', () => {
      const date = parseDateString('2024-01-01T12:00:00');
      expect(date.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    });

    it('handles offset timezones', () => {
      const date = parseDateString('2024-01-01T12:00:00+05:30');
      expect(date.toISOString()).toBe('2024-01-01T06:30:00.000Z');
    });

    it('handles short offset timezones', () => {
      const date = parseDateString('2024-01-01T12:00:00+0530');
      expect(date.toISOString()).toBe('2024-01-01T06:30:00.000Z');
    });
  });

  describe('parseDateMs', () => {
    it('returns timestamp', () => {
      expect(parseDateMs('2024-01-01T00:00:00Z')).toBe(1704067200000);
    });

    it('returns NaN for invalid dates', () => {
      expect(parseDateMs('not a date')).toBeNaN();
    });
  });
});
