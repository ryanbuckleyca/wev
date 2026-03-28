/**
 * SQL / TypeScript parity tests
 *
 * Validates: Requirements 3.7, 3.9
 *
 * The SQL trigger functions in 20260326000000_rank_weighted_match_triggers.sql
 * implement the same formula as the TypeScript `calculateMatch` in
 * match-calculator.ts.  These tests verify parity by re-implementing the SQL
 * formula in TypeScript (as a reference implementation) and asserting it
 * produces the same score as `calculateMatch`.
 *
 * SQL formula (from the migration file):
 *   rank_weight(rank, total):
 *     rank IS NULL OR total <= 1 → 0.5 (NEUTRAL_WEIGHT)
 *     else → 1.0 - ((clamp(rank,1,total) - 1) / (total - 1)) * 0.75
 *
 *   Weighted_Match (when values_rated has ≥1 entry with a non-null rank):
 *     total_w        = SUM(weight for all user values)
 *     overlap_num    = SUM(weight for shared values)
 *     shared_count   = COUNT(shared values)
 *     score          = LEAST((overlap_num / total_w) + LEAST(shared_count * 0.1, 0.3), 1.0)
 *
 *   Flat_Match (fallback when values_rated is null or all ranks are null):
 *     shared_count   = COUNT(shared values)
 *     user_count     = COUNT(user values)
 *     score          = LEAST((shared_count / user_count) + LEAST(shared_count * 0.1, 0.3), 1.0)
 */

import { describe, it, expect } from 'vitest'
import { calculateMatch } from './match-calculator'
import type { RatedValue } from './value-ratings'
import { getRankWeight } from './value-ratings'

// ---------------------------------------------------------------------------
// Reference implementation of the SQL formula in TypeScript
// ---------------------------------------------------------------------------

/**
 * Returns true when values_rated has at least one entry with a non-null rank —
 * mirroring the SQL EXISTS check.
 */
function sqlUsesWeighted(valuesRated: RatedValue[] | null | undefined): boolean {
  return (
    valuesRated != null &&
    valuesRated.length > 0 &&
    valuesRated.some(rv => rv.rank != null)
  )
}

/**
 * Reference implementation of the SQL score formula.
 *
 * When values_rated is present and has ≥1 ranked entry → Weighted_Match.
 * Otherwise → Flat_Match using the plain values array.
 */
function sqlFormula(
  valuesRated: RatedValue[] | null | undefined,
  plainValues: string[],
  jobValues: string[]
): { score: number; shared_values: string[] } {
  const jobSet = new Set(jobValues)

  if (sqlUsesWeighted(valuesRated)) {
    const rated = valuesRated!
    const total = rated.length
    let totalW = 0
    let overlapNum = 0
    const sharedValues: string[] = []

    for (const rv of rated) {
      if (!rv.value) continue
      const w = getRankWeight(rv.rank, total)
      totalW += w
      if (jobSet.has(rv.value)) {
        overlapNum += w
        sharedValues.push(rv.value)
      }
    }

    if (totalW === 0) return { score: 0, shared_values: [] }

    const sharedCount = sharedValues.length
    const score = Math.min(overlapNum / totalW + Math.min(sharedCount * 0.1, 0.3), 1.0)
    return { score, shared_values: sharedValues }
  }

  // Flat_Match path
  if (!plainValues.length) return { score: 0, shared_values: [] }

  const sharedValues = plainValues.filter(v => jobSet.has(v))
  const sharedCount = sharedValues.length
  const userCount = plainValues.length
  const score = Math.min(sharedCount / userCount + Math.min(sharedCount * 0.1, 0.3), 1.0)
  return { score, shared_values: sharedValues }
}

// ---------------------------------------------------------------------------
// Helper: build the userValues argument that calculateMatch receives,
// mirroring the fallback logic in calculateUserMatches / calculateJobMatches:
//   prefer values_rated when present, else fall back to plain values.
// ---------------------------------------------------------------------------
function tsUserValues(
  valuesRated: RatedValue[] | null | undefined,
  plainValues: string[]
): string[] | RatedValue[] {
  return valuesRated?.length ? valuesRated : plainValues
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
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }]
      const plain = ['Community']
      const job = ['Community', 'Creativity']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('four values, ranked 1-4, partial overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('four values, ranked 1-4, full overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = valuesRated.map(rv => rv.value)

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values.sort()).toEqual(sql.shared_values.sort())
    })

    it('four values, ranked 1-4, no overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Security', 'Stability', 'Growth']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('score is capped at 1.0 when overlap + bonus would exceed it', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Creativity', 'Challenge', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.score).toBe(1.0)
    })
  })

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
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('no overlap', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community' }, { value: 'Creativity' }]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Security', 'Stability']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('full overlap', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community' }, { value: 'Creativity' }]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('all-unranked score equals plain string[] score (equivalence property)', () => {
      const plain = ['Community', 'Creativity', 'Challenge']
      const valuesRated: RatedValue[] = plain.map(v => ({ value: v }))
      const job = ['Community', 'Security']

      const sqlRated = sqlFormula(valuesRated, plain, job)
      const sqlPlain = sqlFormula(null, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(sqlRated.score).toBeCloseTo(sqlPlain.score, 10)
      expect(ts.score).toBeCloseTo(sqlRated.score, 10)
    })
  })

  /**
   * Case 3 — Mixed: some values have ranks, some don't → Weighted_Match
   *
   * Validates: Requirements 3.7
   */
  describe('Case 3: mixed ranked/unranked (Weighted_Match)', () => {
    it('one ranked, one unranked, ranked value shared', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity' },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('one ranked, one unranked, unranked value shared', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity' },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('multiple ranks and unranked values, partial overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge' },
        { value: 'Knowledge', rank: 4 },
        { value: 'Stability' },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Community', 'Challenge', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values.sort()).toEqual(sql.shared_values.sort())
    })

    it('multiple ranks and unranked values, no overlap', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity' },
        { value: 'Challenge', rank: 3 },
      ]
      const plain = valuesRated.map(rv => rv.value)
      const job = ['Security', 'Stability', 'Growth']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })
  })

  /**
   * Case 4 — Null values_rated: fall back to Flat_Match using plain values
   *
   * Validates: Requirements 3.7, 3.8
   */
  describe('Case 4: null values_rated (Flat_Match fallback)', () => {
    it('partial overlap', () => {
      const valuesRated = null
      const plain = ['Community', 'Creativity', 'Challenge', 'Knowledge']
      const job = ['Community', 'Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('no overlap', () => {
      const valuesRated = null
      const plain = ['Community', 'Creativity']
      const job = ['Security', 'Stability']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('full overlap', () => {
      const valuesRated = null
      const plain = ['Community', 'Creativity']
      const job = ['Community', 'Creativity', 'Security']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBeCloseTo(sql.score, 10)
      expect(ts.shared_values).toEqual(sql.shared_values)
    })

    it('empty plain values → score 0', () => {
      const valuesRated = null
      const plain: string[] = []
      const job = ['Community', 'Creativity']

      const sql = sqlFormula(valuesRated, plain, job)
      const ts = calculateMatch(tsUserValues(valuesRated, plain), job)

      expect(ts.score).toBe(0)
      expect(sql.score).toBe(0)
    })

    it('null values_rated score equals plain string[] score (equivalence)', () => {
      const plain = ['Community', 'Creativity', 'Challenge']
      const job = ['Community', 'Security']

      const sqlNull = sqlFormula(null, plain, job)
      const ts = calculateMatch(plain, job)

      expect(ts.score).toBeCloseTo(sqlNull.score, 10)
      expect(ts.shared_values).toEqual(sqlNull.shared_values)
    })
  })
})
