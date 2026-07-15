import { describe, expect, it, vi } from 'vitest';
import { applyBulletinAgeFilter, postedWithinToDays } from './age-filter';

describe('postedWithinToDays', () => {
  it('maps known windows, caps at the hard ceiling, and ignores any', () => {
    expect(postedWithinToDays('1-week')).toBe(7);
    expect(postedWithinToDays('2-weeks')).toBe(14);
    expect(postedWithinToDays('3-weeks')).toBe(21);
    // '1-month' (30d) is clamped to the 28-day hard ceiling.
    expect(postedWithinToDays('1-month')).toBe(28);
    expect(postedWithinToDays('any')).toBeNull();
    expect(postedWithinToDays('nonsense')).toBeNull();
  });
});

describe('applyBulletinAgeFilter', () => {
  function makeQuery() {
    const query = {
      gte: vi.fn((_column: string, _value: string) => query),
    };
    return query;
  }

  it('always applies the hard max-age ceiling', () => {
    const query = makeQuery();

    applyBulletinAgeFilter(query, 'any');

    expect(query.gte).toHaveBeenCalledTimes(1);
    expect(query.gte.mock.calls[0]?.[0]).toBe('date_posted');
    expect(typeof query.gte.mock.calls[0]?.[1]).toBe('string');
  });

  it('applies a second tighter cutoff for a postedWithin window', () => {
    const query = makeQuery();

    applyBulletinAgeFilter(query, '1-week');

    expect(query.gte).toHaveBeenCalledTimes(2);
    expect(query.gte.mock.calls.every((call) => call[0] === 'date_posted')).toBe(true);
  });
});
