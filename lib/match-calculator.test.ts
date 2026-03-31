import { describe, it, expect } from 'vitest';
import { computeLocationScore, normalizeWeights } from './match-calculator';
import type { DimensionWeights, DimensionScores } from './match-calculator';

// ─── Task 10.1: computeLocationScore — all 7 Boolean-first branches ──────────

describe('computeLocationScore', () => {
  // Branch 1: Remote-on-remote → 1.0
  it('returns 1.0 when user includes remote and job is remote', () => {
    expect(
      computeLocationScore(null, null, null, null, null, ['remote'], 'remote', null, null, null, null),
    ).toBe(1.0);
  });

  // Branch 2: Remote job, non-remote user → null
  it('returns null when job is remote but user does not include remote', () => {
    expect(
      computeLocationScore(null, null, null, null, null, ['office'], 'remote', null, null, null, null),
    ).toBeNull();
  });

  // Branch 3: Physical job, remote-only user → null
  it('returns null when job is onsite and user is remote-only', () => {
    expect(
      computeLocationScore(49.2827, -123.1207, 49.2827, -123.1207, 'rooftop', ['remote'], 'office', 'Vancouver', 'BC', 'Vancouver', 'BC'),
    ).toBeNull();
  });

  // Branch 4: Exact municipality + province match → 1.0
  it('returns 1.0 for exact municipality and province match (case-insensitive)', () => {
    expect(
      computeLocationScore(null, null, null, null, null, ['office'], 'office', 'Vancouver', 'BC', 'vancouver', 'bc'),
    ).toBe(1.0);
  });

  // Branch 5: Imprecise geocode → null
  it('returns null when accuracy type is "state"', () => {
    expect(
      computeLocationScore(49.0, -123.0, 49.0, -123.0, 'state', ['office'], 'office', null, null, null, null),
    ).toBeNull();
  });

  it('returns null when accuracy type is "country"', () => {
    expect(
      computeLocationScore(49.0, -123.0, 49.0, -123.0, 'country', ['office'], 'office', null, null, null, null),
    ).toBeNull();
  });

  // Branch 6: Missing coordinates → null
  it('returns null when job lat is null', () => {
    expect(
      computeLocationScore(null, -123.0, 49.0, -123.0, 'rooftop', ['office'], 'office', null, null, null, null),
    ).toBeNull();
  });

  it('returns null when user lng is null', () => {
    expect(
      computeLocationScore(49.0, -123.0, 49.0, null, 'rooftop', ['office'], 'office', null, null, null, null),
    ).toBeNull();
  });

  // Branch 7: Distance bands
  it('returns 1.0 for distance ≤ 50km', () => {
    // Vancouver downtown to North Vancouver — ~5km
    const result = computeLocationScore(
      49.2827, -123.1207,
      49.3163, -123.0724,
      'rooftop', ['office'], 'office', null, null, null, null,
    );
    expect(result).toBe(1.0);
  });

  it('returns 0.5 for distance > 50km and ≤ 150km', () => {
    // Vancouver to Whistler — ~120km
    const result = computeLocationScore(
      49.2827, -123.1207,
      50.1163, -122.9574,
      'rooftop', ['office'], 'office', null, null, null, null,
    );
    expect(result).toBe(0.5);
  });

  it('returns 0.0 for distance > 150km', () => {
    // Vancouver to Kelowna — ~300km
    const result = computeLocationScore(
      49.2827, -123.1207,
      49.8880, -119.4960,
      'rooftop', ['office'], 'office', null, null, null, null,
    );
    expect(result).toBe(0.0);
  });
});

// ─── Task 10.2: Four required named test cases (Req 11.6) ────────────────────

describe('computeLocationScore — required named cases (Req 11.6)', () => {
  // Case 1: Same-city match
  it('same-city match: Richmond BC vs Richmond BC → 1.0', () => {
    expect(
      computeLocationScore(
        49.1666, -123.1336,
        49.1666, -123.1336,
        'rooftop',
        ['office'],
        'office',
        'Richmond', 'BC',
        'Richmond', 'BC',
      ),
    ).toBe(1.0);
  });

  // Case 2: Same-name different-province → 0.0 (distance > 150km)
  it('same-name different-province: Richmond BC vs Richmond QC → 0.0', () => {
    expect(
      computeLocationScore(
        45.6667, -72.1500,  // Richmond QC (job)
        49.1666, -123.1336, // Richmond BC (user)
        'rooftop',
        ['office'],
        'office',
        'Richmond', 'QC',
        'Richmond', 'BC',
      ),
    ).toBe(0.0);
  });

  // Case 3: Remote override — both remote, coords null → 1.0
  it('remote override: both remote with null coords → 1.0', () => {
    expect(
      computeLocationScore(
        null, null,
        null, null,
        null,
        ['remote'],
        'remote',
        null, null,
        null, null,
      ),
    ).toBe(1.0);
  });

  // Case 4: Sparse profile blocked — values: null, skills: null
  // normalizeWeights with both core scores null → values+skills weights = 0 < MIN_CORE_WEIGHT (0.50)
  it('sparse profile: null values and skills → normalizeWeights returns zero core weights', () => {
    const weights: DimensionWeights = {
      values: 0.55,
      skills: 0.35,
      work_type: 0.05,
      location: 0.05,
    };
    const scores: DimensionScores = {
      values: null,
      skills: null,
      work_type: 1.0,
      location: 1.0,
    };
    const result = normalizeWeights(weights, scores);
    expect(result.values).toBe(0);
    expect(result.skills).toBe(0);
    expect(result.values + result.skills).toBeLessThan(0.50);
  });
});

// ─── Task 10.3: normalizeWeights unit tests ───────────────────────────────────

describe('normalizeWeights', () => {
  const BASE: DimensionWeights = { values: 0.55, skills: 0.35, work_type: 0.05, location: 0.05 };

  it('all non-null scores → weights sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: 0.5 };
    const result = normalizeWeights(BASE, scores);
    const sum = result.values + result.skills + result.work_type + result.location;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('one null score → that weight is 0, remaining sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: null, location: 0.5 };
    const result = normalizeWeights(BASE, scores);
    expect(result.work_type).toBe(0);
    const sum = result.values + result.skills + result.work_type + result.location;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('hard-zero score (0.0) → weight retained, sum still 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: 0.0 };
    const result = normalizeWeights(BASE, scores);
    expect(result.location).toBeGreaterThan(0);
    const sum = result.values + result.skills + result.work_type + result.location;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('all-null scores → all weights zero, sum = 0', () => {
    const scores: DimensionScores = { values: null, skills: null, work_type: null, location: null };
    const result = normalizeWeights(BASE, scores);
    expect(result.values).toBe(0);
    expect(result.skills).toBe(0);
    expect(result.work_type).toBe(0);
    expect(result.location).toBe(0);
    expect(result.values + result.skills + result.work_type + result.location).toBe(0);
  });

  it('null location, non-null others → location weight = 0, others sum to 1.0', () => {
    const scores: DimensionScores = { values: 0.8, skills: 0.6, work_type: 1.0, location: null };
    const result = normalizeWeights(BASE, scores);
    expect(result.location).toBe(0);
    const sum = result.values + result.skills + result.work_type + result.location;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ─── Task 10.4: Property-based tests (simple loop, 100 iterations) ────────────
// Validates: Requirements 11.3 and 11.4

describe('computeLocationScore — property: same coordinates always returns 1.0', () => {
  /**
   * Validates: Requirements 11.3
   * For all valid coordinate pairs, calling computeLocationScore with the same
   * coordinates in both positions and a non-imprecise accuracy type returns 1.0.
   */
  it('same-position call with non-imprecise accuracy always returns 1.0', () => {
    const preciseTypes = ['rooftop', 'range_interpolated', 'geometric_center', 'approximate', 'place', 'zip', 'city'];
    const workTypes = ['office', 'hybrid'];

    for (let i = 0; i < 100; i++) {
      // Random lat in [-90, 90], lng in [-180, 180]
      const lat = Math.random() * 180 - 90;
      const lng = Math.random() * 360 - 180;
      const accuracyType = preciseTypes[Math.floor(Math.random() * preciseTypes.length)];
      const workType = workTypes[Math.floor(Math.random() * workTypes.length)];

      const result = computeLocationScore(
        lat, lng,
        lat, lng,
        accuracyType,
        [workType],
        workType,
        null, null,
        null, null,
      );

      expect(result, `iteration ${i}: lat=${lat}, lng=${lng}, accuracy=${accuracyType}`).toBe(1.0);
    }
  });
});

describe('normalizeWeights — property: at least one non-null score → weights sum to 1.0', () => {
  /**
   * Validates: Requirements 11.4
   * For all weight and score inputs where at least one score is non-null,
   * normalizeWeights returns weights that sum to exactly 1.0.
   */
  it('random weights with at least one non-null score always sum to 1.0', () => {
    const TOLERANCE = 1e-10;

    for (let i = 0; i < 100; i++) {
      // Random positive weights
      const weights: DimensionWeights = {
        values: Math.random() * 0.9 + 0.01,
        skills: Math.random() * 0.9 + 0.01,
        work_type: Math.random() * 0.9 + 0.01,
        location: Math.random() * 0.9 + 0.01,
      };

      // Random scores: each dimension independently null or a value in [0, 1]
      // Ensure at least one is non-null
      const dims = ['values', 'skills', 'work_type', 'location'] as const;
      const scores: DimensionScores = { values: null, skills: null, work_type: null, location: null };

      // Force at least one non-null
      const forcedDim = dims[Math.floor(Math.random() * dims.length)];
      scores[forcedDim] = Math.random();

      // Randomly assign the rest
      for (const dim of dims) {
        if (dim === forcedDim) continue;
        scores[dim] = Math.random() < 0.5 ? null : Math.random();
      }

      const result = normalizeWeights(weights, scores);
      const sum = result.values + result.skills + result.work_type + result.location;

      expect(
        Math.abs(sum - 1.0),
        `iteration ${i}: sum=${sum}, weights=${JSON.stringify(weights)}, scores=${JSON.stringify(scores)}`,
      ).toBeLessThan(TOLERANCE);
    }
  });
});
