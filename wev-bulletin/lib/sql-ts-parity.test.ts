/**
 * SQL / TypeScript parity tests
 *
 * Validates: Requirements 3.7, 3.9
 *
 * The SQL trigger functions in 20260328000000_job_confidence_in_matching.sql
 * implement the same formula as the TypeScript `calculateMatch` in
 * match-calculator.ts.  These tests verify parity by re-implementing the SQL
 * formula in TypeScript (as a reference implementation) and asserting it
 * produces the same score as `calculateMatch`.
 *
 * SQL formula (from the migration files):
 *   rank_weight(rank, total):
 *     rank IS NULL OR total <= 1 → 0.5 (NEUTRAL_WEIGHT)
 *     else → 1.0 - ((clamp(rank,1,total) - 1) / (total - 1)) * 0.75
 *
 *   job_confidence_weight(job_rated, value):
 *     When job_rated is NULL or empty → 1.0
 *     Otherwise → rank_weight(confidence, jsonb_array_length(job_rated))
 *
 *   Weighted_Match (when values_rated has ≥1 entry with a non-null rank):
 *     total_w        = SUM(user_weight for all user values)
 *     overlap_num    = SUM(user_weight * job_confidence_weight for shared values)
 *     shared_count   = COUNT(shared values)
 *     score          = LEAST((overlap_num / total_w) + LEAST(shared_count * 0.1, 0.3), 1.0)
 *
 *   Flat_Match (fallback when values_rated is null or all ranks are null):
 *     overlap_num    = SUM(job_confidence_weight for shared values)
 *     user_count     = COUNT(user values)
 *     score          = LEAST((overlap_num / user_count) + LEAST(shared_count * 0.1, 0.3), 1.0)
 */

import { describe, it, expect } from 'vitest';
import { calculateMatch } from './match-calculator';
import type { RatedValue, JobRatedValue } from './value-ratings';
import { getRankWeight } from './value-ratings';

/** Assert score is non-null and return it as a number for numeric matchers. */
function assertScore(score: number | null): number {
  expect(score).not.toBeNull();
  return score as number;
}

// ---------------------------------------------------------------------------
// Reference implementation of the SQL formula in TypeScript
// ---------------------------------------------------------------------------

/**
 * Returns true when values_rated has at least one entry with a non-null rank —
 * mirroring the SQL EXISTS check.
 */
function sqlUsesWeighted(valuesRated: RatedValue[] | null | undefined): boolean {
  return valuesRated != null && valuesRated.length > 0 && valuesRated.some((rv) => rv.rank != null);
}

/**
 * Mirrors SQL job_confidence_weight / job_value_weights: duplicate `value` → MIN(weight).
 */
function sqlJobConfidenceWeight(
  jobRated: JobRatedValue[] | null | undefined,
  value: string,
): number {
  if (!jobRated?.length) return 1.0;
  const total = jobRated.length;
  let minW: number | null = null;
  for (const jv of jobRated) {
    if (jv.value !== value) continue;
    const w = getRankWeight(jv.confidence, total);
    minW = minW === null ? w : Math.min(minW, w);
  }
  if (minW === null) return 1.0;
  return minW;
}

/**
 * Reference implementation of the SQL score formula.
 *
 * When values_rated is present and has ≥1 ranked entry → Weighted_Match.
 * Otherwise → Flat_Match using the plain values array.
 *
 * In both paths, each shared value's contribution is scaled by the job's
 * confidence weight (defaults to 1.0 when job has no values_rated).
 */
function sqlFormula(
  valuesRated: RatedValue[] | null | undefined,
  plainValues: string[],
  jobValues: string[],
  jobValuesRated?: JobRatedValue[] | null,
): { score: number | null; shared_values: string[] } {
  const jobSet = new Set(jobValues);

  if (sqlUsesWeighted(valuesRated)) {
    const rated = valuesRated!;
    const total = rated.length;
    let totalW = 0;
    let overlapNum = 0;
    const sharedValues: string[] = [];

    for (const rv of rated) {
      if (!rv.value) continue;
      const w = getRankWeight(rv.rank, total);
      totalW += w;
      if (jobSet.has(rv.value)) {
        overlapNum += w * sqlJobConfidenceWeight(jobValuesRated, rv.value);
        sharedValues.push(rv.value);
      }
    }

    if (totalW === 0) return { score: null, shared_values: [] };

    const sharedCount = sharedValues.length;
    const score = Math.min(overlapNum / totalW + Math.min(sharedCount * 0.1, 0.3), 1.0);
    return { score, shared_values: sharedValues };
  }

  // Flat_Match path
  if (!plainValues.length) return { score: null, shared_values: [] };

  const sharedValues = plainValues.filter((v) => jobSet.has(v));
  const sharedCount = sharedValues.length;
  const userCount = plainValues.length;
  const overlapNum = sharedValues.reduce(
    (sum, v) => sum + sqlJobConfidenceWeight(jobValuesRated, v),
    0,
  );
  const score = Math.min(overlapNum / userCount + Math.min(sharedCount * 0.1, 0.3), 1.0);
  return { score, shared_values: sharedValues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tsUserValues(
  valuesRated: RatedValue[] | null | undefined,
  plainValues: string[],
): string[] | RatedValue[] {
  return valuesRated?.length ? valuesRated : plainValues;
}

function tsMatch(
  valuesRated: RatedValue[] | null | undefined,
  plainValues: string[],
  jobValues: string[],
  jobValuesRated?: JobRatedValue[] | null,
) {
  return calculateMatch(tsUserValues(valuesRated, plainValues), jobValues, jobValuesRated);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('SQL / TypeScript parity', () => {
  /**
   * Case 1 — All-ranked: every value has a rank → Weighted_Match
   *
   * Validates: Requirements 3.7
   */
  describe('Case 1: all-ranked (Weighted_Match)', () => {
    it('single value, rank 1, shared', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }];
      const plain = ['Community'];
      const job = ['Community', 'Creativity'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('four values, ranked 1-4, partial overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('four values, ranked 1-4, full overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = valuesRated.map((rv) => rv.value);

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values.sort()).toEqual(sql.shared_values.sort());
    });

    it('four values, ranked 1-4, no overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Security', 'Stability', 'Growth'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('score is capped at 1.0 when overlap + bonus would exceed it', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Challenge', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.score).toBe(1.0);
    });
  });

  /**
   * Case 2 — All-unranked: no values have ranks → Flat_Match
   *
   * Validates: Requirements 3.7, 3.9
   */
  describe('Case 2: all-unranked (Flat_Match via RatedValue[] with no ranks)', () => {
    it('partial overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community' },
        { value: 'Creativity' },
        { value: 'Challenge' },
        { value: 'Knowledge' },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('no overlap', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community' }, { value: 'Creativity' }];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Security', 'Stability'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('full overlap', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community' }, { value: 'Creativity' }];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('all-unranked score equals plain string[] score (equivalence property)', () => {
      const plain = ['Community', 'Creativity', 'Challenge'];
      const valuesRated: RatedValue[] = plain.map((v) => ({ value: v }));
      const job = ['Community', 'Security'];

      const sqlRated = sqlFormula(valuesRated, plain, job);
      const sqlPlain = sqlFormula(null, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(sqlRated.score).toBeCloseTo(assertScore(sqlPlain.score), 10);
      expect(ts.score).toBeCloseTo(assertScore(sqlRated.score), 10);
    });
  });

  /**
   * Case 3 — Mixed: some values have ranks, some don't → Weighted_Match
   *
   * Validates: Requirements 3.7
   */
  describe('Case 3: mixed ranked/unranked (Weighted_Match)', () => {
    it('one ranked, one unranked, ranked value shared', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }, { value: 'Creativity' }];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('one ranked, one unranked, unranked value shared', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }, { value: 'Creativity' }];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('multiple ranks and unranked values, partial overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge' },
        { value: 'Knowledge', rank: 4 },
        { value: 'Stability' },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Challenge', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values.sort()).toEqual(sql.shared_values.sort());
    });

    it('multiple ranks and unranked values, no overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity' },
        { value: 'Challenge', rank: 3 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Security', 'Stability', 'Growth'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });
  });

  /**
   * Case 4 — Null values_rated: fall back to Flat_Match using plain values
   *
   * Validates: Requirements 3.7, 3.8
   */
  describe('Case 4: null values_rated (Flat_Match fallback)', () => {
    it('partial overlap', () => {
      const valuesRated = null;
      const plain = ['Community', 'Creativity', 'Challenge', 'Knowledge'];
      const job = ['Community', 'Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('no overlap', () => {
      const valuesRated = null;
      const plain = ['Community', 'Creativity'];
      const job = ['Security', 'Stability'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('full overlap', () => {
      const valuesRated = null;
      const plain = ['Community', 'Creativity'];
      const job = ['Community', 'Creativity', 'Security'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values).toEqual(sql.shared_values);
    });

    it('empty plain values → score null', () => {
      const valuesRated = null;
      const plain: string[] = [];
      const job = ['Community', 'Creativity'];

      const sql = sqlFormula(valuesRated, plain, job);
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job);

      expect(ts.score).toBeNull();
      expect(sql.score).toBeNull();
    });

    it('null values_rated score equals plain string[] score (equivalence)', () => {
      const plain = ['Community', 'Creativity', 'Challenge'];
      const job = ['Community', 'Security'];

      const sqlNull = sqlFormula(null, plain, job);
      const ts = calculateMatch(plain, job);

      expect(ts.score).toBeCloseTo(assertScore(sqlNull.score), 10);
      expect(ts.shared_values).toEqual(sqlNull.shared_values);
    });
  });

  /**
   * Case 5 — Job confidence weighting
   *
   * When the job has values_rated with confidence positions, each shared
   * value's overlap contribution is scaled by getRankWeight(confidence, M).
   */
  describe('Case 5: job confidence weighting', () => {
    it('no job values_rated → same as before (all job weights = 1.0)', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Security'];

      const sqlNoConf = sqlFormula(valuesRated, plain, job, null);
      const sqlNoConf2 = sqlFormula(valuesRated, plain, job, undefined);
      const tsNoConf = tsMatch(valuesRated, plain, job, null);

      expect(tsNoConf.score).toBeCloseTo(assertScore(sqlNoConf.score), 10);
      expect(sqlNoConf.score).toBeCloseTo(assertScore(sqlNoConf2.score), 10);
    });

    it('weighted user + job confidence: high-confidence shared value scores higher', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Security'];
      const jobRatedHighConf: JobRatedValue[] = [
        { value: 'Community', confidence: 1 },
        { value: 'Security', confidence: 2 },
      ];
      const jobRatedLowConf: JobRatedValue[] = [
        { value: 'Security', confidence: 1 },
        { value: 'Community', confidence: 2 },
      ];

      const sqlHigh = sqlFormula(valuesRated, plain, job, jobRatedHighConf);
      const tsHigh = tsMatch(valuesRated, plain, job, jobRatedHighConf);
      const sqlLow = sqlFormula(valuesRated, plain, job, jobRatedLowConf);
      const tsLow = tsMatch(valuesRated, plain, job, jobRatedLowConf);

      expect(tsHigh.score).toBeCloseTo(assertScore(sqlHigh.score), 10);
      expect(tsLow.score).toBeCloseTo(assertScore(sqlLow.score), 10);
      expect(tsHigh.score).toBeGreaterThan(assertScore(tsLow.score));
    });

    it('weighted user + job confidence: partial overlap with 4 job values', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community', 'Creativity', 'Security', 'Balance'];
      const jobRated: JobRatedValue[] = [
        { value: 'Community', confidence: 1 },
        { value: 'Creativity', confidence: 2 },
        { value: 'Security', confidence: 3 },
        { value: 'Balance', confidence: 4 },
      ];

      const sql = sqlFormula(valuesRated, plain, job, jobRated);
      const ts = tsMatch(valuesRated, plain, job, jobRated);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.shared_values.sort()).toEqual(sql.shared_values.sort());
    });

    it('flat user + job confidence: shared value with high confidence scores higher', () => {
      const plain = ['Community', 'Creativity', 'Challenge'];
      const job = ['Community', 'Security'];
      const jobRatedHighConf: JobRatedValue[] = [
        { value: 'Community', confidence: 1 },
        { value: 'Security', confidence: 2 },
      ];
      const jobRatedLowConf: JobRatedValue[] = [
        { value: 'Security', confidence: 1 },
        { value: 'Community', confidence: 2 },
      ];

      const sqlHigh = sqlFormula(null, plain, job, jobRatedHighConf);
      const tsHigh = tsMatch(null, plain, job, jobRatedHighConf);
      const sqlLow = sqlFormula(null, plain, job, jobRatedLowConf);
      const tsLow = tsMatch(null, plain, job, jobRatedLowConf);

      expect(tsHigh.score).toBeCloseTo(assertScore(sqlHigh.score), 10);
      expect(tsLow.score).toBeCloseTo(assertScore(sqlLow.score), 10);
      expect(tsHigh.score).toBeGreaterThan(assertScore(tsLow.score));
    });

    it('flat user + no job confidence → backward compatible with original flat formula', () => {
      const plain = ['Community', 'Creativity', 'Challenge'];
      const job = ['Community', 'Creativity', 'Security'];

      const sqlOrig = sqlFormula(null, plain, job, null);
      const tsOrig = calculateMatch(plain, job);
      const tsWithNull = calculateMatch(plain, job, null);

      expect(tsOrig.score).toBeCloseTo(assertScore(sqlOrig.score), 10);
      expect(tsWithNull.score).toBe(tsOrig.score);
    });

    it('score stays in [0, 1] with job confidence', () => {
      const valuesRated: RatedValue[] = [
        { value: 'V0', rank: 1 },
        { value: 'V1', rank: 2 },
        { value: 'V2', rank: 3 },
        { value: 'V3', rank: 4 },
        { value: 'V4', rank: 5 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['V0', 'V1', 'V2', 'V3', 'V4'];
      const jobRated: JobRatedValue[] = job.map((v, i) => ({
        value: v,
        confidence: i + 1,
      }));

      const sql = sqlFormula(valuesRated, plain, job, jobRated);
      const ts = tsMatch(valuesRated, plain, job, jobRated);

      expect(ts.score).toBeCloseTo(assertScore(sql.score), 10);
      expect(ts.score).toBeGreaterThanOrEqual(0);
      expect(ts.score).toBeLessThanOrEqual(1);
    });

    it('single job value with confidence 1 → full weight on that shared value', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
      ];
      const plain = valuesRated.map((rv) => rv.value);
      const job = ['Community'];
      const jobRated: JobRatedValue[] = [{ value: 'Community', confidence: 1 }];

      const sqlWithConf = sqlFormula(valuesRated, plain, job, jobRated);
      const tsWithConf = tsMatch(valuesRated, plain, job, jobRated);

      expect(tsWithConf.score).toBeCloseTo(assertScore(sqlWithConf.score), 10);
      // Single job value → getRankWeight(1, 1) = NEUTRAL_WEIGHT = 0.5,
      // so score WITH confidence is actually different from without (1.0)
      expect(tsWithConf.score).toBeCloseTo(assertScore(sqlWithConf.score), 10);
    });
  });
});
