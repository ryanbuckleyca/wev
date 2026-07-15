import { describe, expect, it, vi } from 'vitest';
import { applyBulletinAgeFilter, postedWithinToDays } from './server-data';

describe('postedWithinToDays', () => {
  it('maps known windows and ignores any', () => {
    expect(postedWithinToDays('1-week')).toBe(7);
    expect(postedWithinToDays('2-weeks')).toBe(14);
    expect(postedWithinToDays('3-weeks')).toBe(21);
    expect(postedWithinToDays('1-month')).toBe(30);
    expect(postedWithinToDays('any')).toBeNull();
  });
});

describe('applyBulletinAgeFilter', () => {
  it('always applies the hard max-age ceiling', () => {
    const gte = vi.fn(function (this: unknown) {
      return this;
    });
    const query = { gte };

    applyBulletinAgeFilter(query, 'any');

    expect(gte).toHaveBeenCalledTimes(1);
    expect(gte.mock.calls[0]?.[0]).toBe('date_posted');
    expect(typeof gte.mock.calls[0]?.[1]).toBe('string');
  });

  it('applies a second tighter cutoff for a postedWithin window', () => {
    const gte = vi.fn(function (this: unknown) {
      return this;
    });
    const query = { gte };

    applyBulletinAgeFilter(query, '1-week');

    expect(gte).toHaveBeenCalledTimes(2);
    expect(gte.mock.calls.every((call) => call[0] === 'date_posted')).toBe(true);
  });
});
