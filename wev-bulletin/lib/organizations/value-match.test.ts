import { describe, expect, it } from 'vitest';
import { sqlRankWeight } from './sql-rank-weight';
import { computeOrgValueMatch } from './value-match';

describe('sqlRankWeight', () => {
  it('matches the Postgres rank_weight formula', () => {
    expect(sqlRankWeight(1, 3)).toBeCloseTo(1.0);
    expect(sqlRankWeight(2, 3)).toBeCloseTo(0.8333333333);
    expect(sqlRankWeight(3, 3)).toBeCloseTo(0.6666666667);
    expect(sqlRankWeight(1, 0)).toBe(1.0);
  });
});

describe('computeOrgValueMatch', () => {
  it('returns null score when the org has no values', () => {
    expect(computeOrgValueMatch([{ value: 'Autonomy', rank: 1 }], [], [])).toEqual({
      valueScore: null,
      sharedValues: [],
    });
  });

  it('returns a golden score for a known overlap fixture', () => {
    const result = computeOrgValueMatch(
      [
        { value: 'Autonomy', rank: 1 },
        { value: 'Helping Others', rank: 2 },
      ],
      ['Autonomy', 'Creativity'],
      [
        { value: 'Autonomy', rank: 1 },
        { value: 'Creativity', rank: 2 },
      ],
    );

    expect(result.sharedValues).toEqual(['Autonomy']);
    // overlap = 1.0 * 1.0 = 1.0; totalW = 1.0 + 0.75 = 1.75; bonus = 0.1
    expect(result.valueScore).toBeCloseTo(1.0 / 1.75 + 0.1, 5);
  });

  it('returns zero score when the user has no rated values', () => {
    expect(computeOrgValueMatch([], ['Autonomy'], [{ value: 'Autonomy', rank: 1 }])).toEqual({
      valueScore: 0,
      sharedValues: [],
    });
  });
});
