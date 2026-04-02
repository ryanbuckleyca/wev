import { describe, it, expect } from 'vitest';
import { calculateMatch, computeLocationScore, normalizeWeights } from './match-calculator';
import type { DimensionWeights, DimensionScores, LocationScoreParams } from './match-calculator';
import type { RatedValue, JobRatedValue } from './value-ratings';
import { getRankWeight } from './value-ratings';

/** Assert score is non-null and return it as a number for numeric matchers. */
function assertScore(score: number | null): number {
  expect(score).not.toBeNull();
  return score as number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a LocationScoreParams with sensible defaults — override only what you need. */
function locationParams(overrides: Partial<LocationScoreParams> = {}): LocationScoreParams {
  return {
    jobLat: null,
    jobLng: null,
    userLat: null,
    userLng: null,
    jobAccuracyType: null,
    userWorkTypes: ['office'],
    jobWorkType: 'office',
    jobMunicipality: null,
    jobProvince: null,
    userMunicipality: null,
    userProvince: null,
    ...overrides,
  };
}

// ─── calculateMatch ───────────────────────────────────────────────────────────

describe('calculateMatch', () => {
  it('returns null score and empty shared_values when user has no values', () => {
    expect(calculateMatch([], ['Community', 'Creativity'])).toEqual({ score: null, shared_values: [] });
  });

  it('returns null score and empty shared_values when job has no values', () => {
    expect(calculateMatch(['Community', 'Creativity'], [])).toEqual({ score: null, shared_values: [] });
  });

  it('returns null score when both lists are empty', () => {
    expect(calculateMatch([], [])).toEqual({ score: null, shared_values: [] });
  });

  it('returns score 1 when values match perfectly', () => {
    const values = ['Community', 'Creativity', 'Challenge'];
    const result = calculateMatch(values, values);
    expect(result.score).toBe(1);
    expect(result.shared_values).toEqual(values);
  });

  it('calculates partial overlap correctly', () => {
    const result = calculateMatch(
      ['Community', 'Creativity', 'Challenge', 'Knowledge'],
      ['Community', 'Creativity', 'Security'],
    );
    // shared = 2, overlap = 2/4 = 0.5, bonus = min(2*0.1, 0.3) = 0.2, score = 0.7
    expect(result.score).toBe(0.7);
    expect(result.shared_values).toEqual(['Community', 'Creativity']);
  });

  it('returns score 0 when no values overlap', () => {
    const result = calculateMatch(['Community'], ['Security']);
    expect(result.score).toBe(0);
    expect(result.shared_values).toEqual([]);
  });

  it('uses user values count as denominator (job superset caps at 1.0)', () => {
    const result = calculateMatch(
      ['Community', 'Creativity'],
      ['Community', 'Creativity', 'Security', 'Knowledge', 'Challenge'],
    );
    expect(result.score).toBe(1.0);
    expect(result.shared_values).toEqual(['Community', 'Creativity']);
  });

  it('handles single-value lists', () => {
    const result = calculateMatch(['Community'], ['Community']);
    expect(result.score).toBe(1);
    expect(result.shared_values).toEqual(['Community']);
  });
});

describe('calculateMatch with jobValuesRated', () => {
  it('returns same score when jobValuesRated is null (backward compat)', () => {
    const userValues = ['Community', 'Creativity', 'Challenge', 'Knowledge'];
    const jobValues = ['Community', 'Creativity', 'Security'];
    const base = calculateMatch(userValues, jobValues);
    expect(calculateMatch(userValues, jobValues, null).score).toBe(base.score);
    expect(calculateMatch(userValues, jobValues, undefined).score).toBe(base.score);
  });

  it('high-confidence shared value scores higher than low-confidence (flat path)', () => {
    const userValues = ['Community', 'Creativity', 'Challenge'];
    const jobValues = ['Community', 'Security', 'Balance'];

    const highConf: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Security', confidence: 2 },
      { value: 'Balance', confidence: 3 },
    ];
    const lowConf: JobRatedValue[] = [
      { value: 'Security', confidence: 1 },
      { value: 'Balance', confidence: 2 },
      { value: 'Community', confidence: 3 },
    ];

    expect(calculateMatch(userValues, jobValues, highConf).score).toBeGreaterThan(
      assertScore(calculateMatch(userValues, jobValues, lowConf).score),
    );
  });

  it('high-confidence shared value scores higher than low-confidence (weighted path)', () => {
    const userValues: RatedValue[] = [
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
      { value: 'Challenge', rank: 3 },
    ];
    const jobValues = ['Community', 'Security', 'Balance'];

    const highConf: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Security', confidence: 2 },
      { value: 'Balance', confidence: 3 },
    ];
    const lowConf: JobRatedValue[] = [
      { value: 'Security', confidence: 1 },
      { value: 'Balance', confidence: 2 },
      { value: 'Community', confidence: 3 },
    ];

    expect(calculateMatch(userValues, jobValues, highConf).score).toBeGreaterThan(
      assertScore(calculateMatch(userValues, jobValues, lowConf).score),
    );
  });

  it('score stays in [0, 1] with job confidence', () => {
    const userValues: RatedValue[] = [
      { value: 'V0', rank: 1 },
      { value: 'V1', rank: 2 },
      { value: 'V2', rank: 3 },
      { value: 'V3', rank: 4 },
    ];
    const jobValues = ['V0', 'V1', 'V2', 'V3'];
    const jobRated: JobRatedValue[] = jobValues.map((v, i) => ({ value: v, confidence: i + 1 }));
    const { score } = calculateMatch(userValues, jobValues, jobRated);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('empty jobValuesRated array treated same as null', () => {
    const userValues = ['Community', 'Creativity'];
    const jobValues = ['Community', 'Security'];
    expect(calculateMatch(userValues, jobValues, []).score).toBe(
      calculateMatch(userValues, jobValues, null).score,
    );
  });

  it('job confidence does not change which values are shared', () => {
    const userValues: RatedValue[] = [
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
    ];
    const jobValues = ['Community', 'Creativity', 'Security'];
    const jobRated: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Creativity', confidence: 2 },
      { value: 'Security', confidence: 3 },
    ];
    expect(calculateMatch(userValues, jobValues, jobRated).shared_values.sort()).toEqual(
      calculateMatch(userValues, jobValues).shared_values.sort(),
    );
  });

  it('duplicate job value labels use MIN confidence weight', () => {
    const userValues = ['Community'];
    const jobValues = ['Community'];
    const dupRated: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Community', confidence: 2 },
    ];
    const total = dupRated.length;
    const wMin = Math.min(getRankWeight(1, total), getRankWeight(2, total));
    const expectedScore = Math.min(wMin / userValues.length + 0.1, 1.0);
    expect(calculateMatch(userValues, jobValues, dupRated).score).toBeCloseTo(expectedScore, 10);
  });
});

describe('Property: all-unranked RatedValue[] score equals plain string[] score', () => {
  const cases = [
    { label: 'both empty', userValues: [], jobValues: [] },
    { label: 'empty user values', userValues: [], jobValues: ['Community', 'Creativity'] },
    { label: 'empty job values', userValues: ['Community', 'Creativity'], jobValues: [] },
    { label: 'no overlap', userValues: ['Community'], jobValues: ['Security'] },
    {
      label: 'partial overlap',
      userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'],
      jobValues: ['Community', 'Creativity', 'Security'],
    },
    {
      label: 'full overlap',
      userValues: ['Community', 'Creativity', 'Challenge'],
      jobValues: ['Community', 'Creativity', 'Challenge'],
    },
  ];

  it.each(cases)('$label', ({ userValues, jobValues }) => {
    const ratedValues: RatedValue[] = userValues.map((v) => ({ value: v }));
    expect(calculateMatch(ratedValues, jobValues).score).toBe(
      calculateMatch(userValues, jobValues).score,
    );
  });
});

describe('Property: score is always in [0.0, 1.0] when non-null', () => {
  const cases: Array<{ label: string; userValues: string[] | RatedValue[]; jobValues: string[] }> = [
    { label: 'both empty', userValues: [], jobValues: [] },
    { label: 'no overlap', userValues: ['Community'], jobValues: ['Security'] },
    { label: 'full overlap', userValues: ['Community'], jobValues: ['Community'] },
    {
      label: 'partial overlap',
      userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'],
      jobValues: ['Community', 'Creativity', 'Security'],
    },
    {
      label: 'ranked: partial overlap',
      userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }],
      jobValues: ['Community', 'Security'],
    },
    {
      label: 'ranked: full overlap',
      userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }],
      jobValues: ['Community', 'Creativity'],
    },
  ];

  it.each(cases)('$label', ({ userValues, jobValues }) => {
    const { score } = calculateMatch(userValues as string[] | RatedValue[], jobValues);
    if (score !== null) {
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── computeLocationScore ─────────────────────────────────────────────────────

describe('computeLocationScore', () => {
  it('returns 1.0 when user includes remote and job is remote', () => {
    expect(computeLocationScore(locationParams({ userWorkTypes: ['remote'], jobWorkType: 'remote' }))).toBe(1.0);
  });

  it('returns null when job is remote but user does not include remote', () => {
    expect(computeLocationScore(locationParams({ userWorkTypes: ['office'], jobWorkType: 'remote' }))).toBeNull();
  });

  it('returns null when job is onsite and user is remote-only', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.2827, jobLng: -123.1207,
        userLat: 49.2827, userLng: -123.1207,
        jobAccuracyType: 'rooftop',
        userWorkTypes: ['remote'],
        jobWorkType: 'office',
        jobMunicipality: 'Vancouver', jobProvince: 'BC',
        userMunicipality: 'Vancouver', userProvince: 'BC',
      })),
    ).toBeNull();
  });

  it('returns null when job is hybrid and user is remote-only', () => {
    expect(
      computeLocationScore(locationParams({ userWorkTypes: ['remote'], jobWorkType: 'hybrid' })),
    ).toBeNull();
  });

  it('returns 1.0 when job is hybrid and user includes hybrid', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.2827, jobLng: -123.1207,
        userLat: 49.2827, userLng: -123.1207,
        jobAccuracyType: 'rooftop',
        userWorkTypes: ['hybrid'],
        jobWorkType: 'hybrid',
      })),
    ).toBe(1.0);
  });

  it('returns 1.0 for exact municipality and province match (case-insensitive)', () => {
    expect(
      computeLocationScore(locationParams({
        jobMunicipality: 'Vancouver', jobProvince: 'BC',
        userMunicipality: 'vancouver', userProvince: 'bc',
      })),
    ).toBe(1.0);
  });

  it('returns null when accuracy type is "state"', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.0, jobLng: -123.0,
        userLat: 49.0, userLng: -123.0,
        jobAccuracyType: 'state',
      })),
    ).toBeNull();
  });

  it('returns null when accuracy type is "country"', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.0, jobLng: -123.0,
        userLat: 49.0, userLng: -123.0,
        jobAccuracyType: 'country',
      })),
    ).toBeNull();
  });

  it('returns null when job lat is null', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: null, jobLng: -123.0,
        userLat: 49.0, userLng: -123.0,
        jobAccuracyType: 'rooftop',
      })),
    ).toBeNull();
  });

  it('returns null when user lng is null', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.0, jobLng: -123.0,
        userLat: 49.0, userLng: null,
        jobAccuracyType: 'rooftop',
      })),
    ).toBeNull();
  });

  it('returns 1.0 for distance ≤ 50km (Vancouver to North Vancouver ~5km)', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.2827, jobLng: -123.1207,
        userLat: 49.3163, userLng: -123.0724,
        jobAccuracyType: 'rooftop',
      })),
    ).toBe(1.0);
  });

  it('returns 0.5 for distance > 50km and ≤ 150km (Vancouver to Whistler ~120km)', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.2827, jobLng: -123.1207,
        userLat: 50.1163, userLng: -122.9574,
        jobAccuracyType: 'rooftop',
      })),
    ).toBe(0.5);
  });

  it('returns 0.0 for distance > 150km (Vancouver to Kelowna ~300km)', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.2827, jobLng: -123.1207,
        userLat: 49.8880, userLng: -119.4960,
        jobAccuracyType: 'rooftop',
      })),
    ).toBe(0.0);
  });
});

describe('computeLocationScore — named cases', () => {
  it('same-city match: Richmond BC vs Richmond BC → 1.0', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 49.1666, jobLng: -123.1336,
        userLat: 49.1666, userLng: -123.1336,
        jobAccuracyType: 'rooftop',
        jobMunicipality: 'Richmond', jobProvince: 'BC',
        userMunicipality: 'Richmond', userProvince: 'BC',
      })),
    ).toBe(1.0);
  });

  it('same-name different-province: Richmond BC vs Richmond QC → 0.0', () => {
    expect(
      computeLocationScore(locationParams({
        jobLat: 45.6667, jobLng: -72.1500,
        userLat: 49.1666, userLng: -123.1336,
        jobAccuracyType: 'rooftop',
        jobMunicipality: 'Richmond', jobProvince: 'QC',
        userMunicipality: 'Richmond', userProvince: 'BC',
      })),
    ).toBe(0.0);
  });

  it('remote override: both remote with null coords → 1.0', () => {
    expect(
      computeLocationScore(locationParams({ userWorkTypes: ['remote'], jobWorkType: 'remote' })),
    ).toBe(1.0);
  });

  it('sparse profile: null values and skills → normalizeWeights returns zero core weights', () => {
    const weights: DimensionWeights = { values: 0.55, skills: 0.35, work_type: 0.05, location: 0.05 };
    const scores: DimensionScores = { values: null, skills: null, work_type: 1.0, location: 1.0 };
    const result = normalizeWeights(weights, scores);
    expect(result.values).toBe(0);
    expect(result.skills).toBe(0);
    expect(result.values + result.skills).toBeLessThan(0.50);
  });
});

// ─── normalizeWeights ─────────────────────────────────────────────────────────

describe('normalizeWeights', () => {
  const BASE: DimensionWeights = { values: 0.55, skills: 0.35, work_type: 0.05, location: 0.05 };

  it('all non-null scores → weights sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: 0.5 };
    const result = normalizeWeights(BASE, scores);
    expect(result.values + result.skills + result.work_type + result.location).toBeCloseTo(1.0, 10);
  });

  it('one null score → that weight is 0, remaining sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: null, location: 0.5 };
    const result = normalizeWeights(BASE, scores);
    expect(result.work_type).toBe(0);
    expect(result.values + result.skills + result.work_type + result.location).toBeCloseTo(1.0, 10);
  });

  it('hard-zero score (0.0) → weight retained, sum still 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: 0.0 };
    const result = normalizeWeights(BASE, scores);
    expect(result.location).toBeGreaterThan(0);
    expect(result.values + result.skills + result.work_type + result.location).toBeCloseTo(1.0, 10);
  });

  it('all-null scores → all weights zero, sum = 0', () => {
    const scores: DimensionScores = { values: null, skills: null, work_type: null, location: null };
    const result = normalizeWeights(BASE, scores);
    expect(result.values + result.skills + result.work_type + result.location).toBe(0);
  });

  it('null location, non-null others → location weight = 0, others sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: null };
    const result = normalizeWeights(BASE, scores);
    expect(result.location).toBe(0);
    expect(result.values + result.skills + result.work_type + result.location).toBeCloseTo(1.0, 10);
  });
});

// ─── Property tests ───────────────────────────────────────────────────────────

describe('computeLocationScore — property: same coordinates always returns 1.0', () => {
  it('same-position call with precise accuracy always returns 1.0', () => {
    // Only accuracy types that are NOT in IMPRECISE_ACCURACY_TYPES ('state', 'country')
    const preciseTypes = ['rooftop', 'range_interpolated', 'geometric_center'];
    const workTypes = ['office', 'hybrid'];

    for (let i = 0; i < 100; i++) {
      const lat = Math.random() * 180 - 90;
      const lng = Math.random() * 360 - 180;
      const accuracyType = preciseTypes[Math.floor(Math.random() * preciseTypes.length)];
      const workType = workTypes[Math.floor(Math.random() * workTypes.length)];

      const result = computeLocationScore(locationParams({
        jobLat: lat, jobLng: lng,
        userLat: lat, userLng: lng,
        jobAccuracyType: accuracyType,
        userWorkTypes: [workType],
        jobWorkType: workType,
      }));

      expect(result, `iteration ${i}: lat=${lat}, lng=${lng}, accuracy=${accuracyType}`).toBe(1.0);
    }
  });
});

describe('normalizeWeights — property: at least one non-null score → weights sum to 1.0', () => {
  it('random weights with at least one non-null score always sum to 1.0', () => {
    const TOLERANCE = 1e-10;
    const dims = ['values', 'skills', 'work_type', 'location'] as const;

    for (let i = 0; i < 100; i++) {
      const weights: DimensionWeights = {
        values: Math.random() * 0.9 + 0.01,
        skills: Math.random() * 0.9 + 0.01,
        work_type: Math.random() * 0.9 + 0.01,
        location: Math.random() * 0.9 + 0.01,
      };

      const scores: DimensionScores = { values: null, skills: null, work_type: null, location: null };
      const forcedDim = dims[Math.floor(Math.random() * dims.length)];
      scores[forcedDim] = Math.random();
      for (const dim of dims) {
        if (dim !== forcedDim) scores[dim] = Math.random() < 0.5 ? null : Math.random();
      }

      const result = normalizeWeights(weights, scores);
      const sum = result.values + result.skills + result.work_type + result.location;

      expect(
        Math.abs(sum - 1.0),
        `iteration ${i}: sum=${sum}`,
      ).toBeLessThan(TOLERANCE);
    }
  });
});
