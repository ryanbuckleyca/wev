import { describe, it, expect } from 'vitest'
import { calculateMatch } from './match-calculator'
import type { RatedValue, JobRatedValue } from './value-ratings'

describe('calculateMatch', () => {
  it('returns score 0 and empty shared_values when user has no values', () => {
    const result = calculateMatch([], ['Community', 'Creativity'])
    expect(result).toEqual({ score: 0, shared_values: [] })
  })

  it('returns score 0 and empty shared_values when job has no values', () => {
    const result = calculateMatch(['Community', 'Creativity'], [])
    expect(result).toEqual({ score: 0, shared_values: [] })
  })

  it('returns score 0 when both lists are empty', () => {
    const result = calculateMatch([], [])
    expect(result).toEqual({ score: 0, shared_values: [] })
  })

  it('returns score 1 when values match perfectly', () => {
    const values = ['Community', 'Creativity', 'Challenge']
    const result = calculateMatch(values, values)
    expect(result.score).toBe(1)
    expect(result.shared_values).toEqual(values)
  })

  it('calculates partial overlap correctly', () => {
    const userValues = ['Community', 'Creativity', 'Challenge', 'Knowledge']
    const jobValues = ['Community', 'Creativity', 'Security']
    const result = calculateMatch(userValues, jobValues)

    // shared = 2, overlap = 2/4 = 0.5, bonus = min(2*0.1, 0.3) = 0.2, score = 0.7
    expect(result.score).toBe(0.7)
    expect(result.shared_values).toEqual(['Community', 'Creativity'])
  })

  it('returns score 0 when no values overlap', () => {
    const result = calculateMatch(['Community'], ['Security'])
    expect(result.score).toBe(0)
    expect(result.shared_values).toEqual([])
  })

  it('uses user values count as denominator', () => {
    // user has 2, job has 5, shared = 2 → overlap = 2/2 = 1.0, bonus = 0.2, score capped at 1.0
    const result = calculateMatch(
      ['Community', 'Creativity'],
      ['Community', 'Creativity', 'Security', 'Knowledge', 'Challenge']
    )
    expect(result.score).toBe(1.0)
    expect(result.shared_values).toEqual(['Community', 'Creativity'])
  })

  it('handles single-value lists', () => {
    const result = calculateMatch(['Community'], ['Community'])
    expect(result.score).toBe(1)
    expect(result.shared_values).toEqual(['Community'])
  })
})

/**
 * Job confidence weighting tests
 *
 * Validates that jobValuesRated.confidence affects the match score.
 */
describe('calculateMatch with jobValuesRated', () => {
  it('returns same score when jobValuesRated is null (backward compat)', () => {
    const userValues = ['Community', 'Creativity', 'Challenge', 'Knowledge']
    const jobValues = ['Community', 'Creativity', 'Security']

    const withNull = calculateMatch(userValues, jobValues, null)
    const withUndefined = calculateMatch(userValues, jobValues, undefined)
    const withoutArg = calculateMatch(userValues, jobValues)

    expect(withNull.score).toBe(withoutArg.score)
    expect(withUndefined.score).toBe(withoutArg.score)
  })

  it('high-confidence shared value scores higher than low-confidence (flat path)', () => {
    const userValues = ['Community', 'Creativity', 'Challenge']
    const jobValues = ['Community', 'Security', 'Balance']

    const highConf: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Security', confidence: 2 },
      { value: 'Balance', confidence: 3 },
    ]
    const lowConf: JobRatedValue[] = [
      { value: 'Security', confidence: 1 },
      { value: 'Balance', confidence: 2 },
      { value: 'Community', confidence: 3 },
    ]

    const highResult = calculateMatch(userValues, jobValues, highConf)
    const lowResult = calculateMatch(userValues, jobValues, lowConf)

    expect(highResult.score).toBeGreaterThan(lowResult.score)
    expect(highResult.shared_values).toEqual(lowResult.shared_values)
  })

  it('high-confidence shared value scores higher than low-confidence (weighted path)', () => {
    const userValues: RatedValue[] = [
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
      { value: 'Challenge', rank: 3 },
    ]
    const jobValues = ['Community', 'Security', 'Balance']

    const highConf: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Security', confidence: 2 },
      { value: 'Balance', confidence: 3 },
    ]
    const lowConf: JobRatedValue[] = [
      { value: 'Security', confidence: 1 },
      { value: 'Balance', confidence: 2 },
      { value: 'Community', confidence: 3 },
    ]

    const highResult = calculateMatch(userValues, jobValues, highConf)
    const lowResult = calculateMatch(userValues, jobValues, lowConf)

    expect(highResult.score).toBeGreaterThan(lowResult.score)
  })

  it('score stays in [0, 1] with job confidence', () => {
    const userValues: RatedValue[] = [
      { value: 'V0', rank: 1 },
      { value: 'V1', rank: 2 },
      { value: 'V2', rank: 3 },
      { value: 'V3', rank: 4 },
    ]
    const jobValues = ['V0', 'V1', 'V2', 'V3']
    const jobRated: JobRatedValue[] = jobValues.map((v, i) => ({
      value: v, confidence: i + 1,
    }))

    const result = calculateMatch(userValues, jobValues, jobRated)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('empty jobValuesRated array treated same as null', () => {
    const userValues = ['Community', 'Creativity']
    const jobValues = ['Community', 'Security']

    const withEmpty = calculateMatch(userValues, jobValues, [])
    const withNull = calculateMatch(userValues, jobValues, null)

    expect(withEmpty.score).toBe(withNull.score)
  })

  it('job confidence does not change which values are shared', () => {
    const userValues: RatedValue[] = [
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
    ]
    const jobValues = ['Community', 'Creativity', 'Security']
    const jobRated: JobRatedValue[] = [
      { value: 'Community', confidence: 1 },
      { value: 'Creativity', confidence: 2 },
      { value: 'Security', confidence: 3 },
    ]

    const without = calculateMatch(userValues, jobValues)
    const withConf = calculateMatch(userValues, jobValues, jobRated)

    expect(withConf.shared_values.sort()).toEqual(without.shared_values.sort())
  })
})

/**
 * Property test: all-unranked Weighted_Match equals Flat_Match
 *
 * Validates: Requirements 3.9
 *
 * For any profile where every value has no rank, the score from
 * calculateMatch(ratedValues, jobValues) MUST equal the score from
 * calculateMatch(plainValues, jobValues).
 */
describe('Property: all-unranked RatedValue[] score equals plain string[] score', () => {
  const cases: Array<{ label: string; userValues: string[]; jobValues: string[] }> = [
    { label: 'both empty', userValues: [], jobValues: [] },
    { label: 'empty user values', userValues: [], jobValues: ['Community', 'Creativity'] },
    { label: 'empty job values', userValues: ['Community', 'Creativity'], jobValues: [] },

    { label: 'no overlap (single)', userValues: ['Community'], jobValues: ['Security'] },
    {
      label: 'no overlap (multiple)',
      userValues: ['Community', 'Creativity', 'Challenge'],
      jobValues: ['Security', 'Knowledge', 'Stability'],
    },

    {
      label: 'partial overlap (2 of 4)',
      userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'],
      jobValues: ['Community', 'Creativity', 'Security'],
    },
    {
      label: 'partial overlap (1 of 3)',
      userValues: ['Community', 'Creativity', 'Challenge'],
      jobValues: ['Challenge', 'Security', 'Stability'],
    },

    {
      label: 'full overlap (exact match)',
      userValues: ['Community', 'Creativity', 'Challenge'],
      jobValues: ['Community', 'Creativity', 'Challenge'],
    },
    {
      label: 'full overlap (job superset)',
      userValues: ['Community', 'Creativity'],
      jobValues: ['Community', 'Creativity', 'Security', 'Knowledge', 'Challenge'],
    },

    { label: 'single value match', userValues: ['Community'], jobValues: ['Community'] },
    {
      label: 'large user set, partial overlap',
      userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge', 'Security', 'Stability', 'Growth'],
      jobValues: ['Community', 'Knowledge', 'Growth'],
    },
    {
      label: 'large user set, no overlap',
      userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'],
      jobValues: ['Security', 'Stability', 'Growth', 'Balance'],
    },
  ]

  it.each(cases)('$label', ({ userValues, jobValues }) => {
    const ratedValues: RatedValue[] = userValues.map(v => ({ value: v }))

    const ratedResult = calculateMatch(ratedValues, jobValues)
    const plainResult = calculateMatch(userValues, jobValues)

    expect(ratedResult.score).toBe(plainResult.score)
  })
})

/**
 * Property test: score always in [0.0, 1.0]
 *
 * Validates: Requirements 3.10
 *
 * For any combination of user values and job values, the score returned by
 * calculateMatch MUST satisfy 0 <= score <= 1.
 */
describe('Property: score is always in [0.0, 1.0]', () => {
  type Case = { label: string; userValues: string[] | RatedValue[]; jobValues: string[] }

  const cases: Case[] = [
    // ── Edge cases ────────────────────────────────────────────────────────────
    { label: 'both empty (plain)', userValues: [], jobValues: [] },
    { label: 'both empty (rated)', userValues: [] as RatedValue[], jobValues: [] },
    { label: 'empty user, non-empty job (plain)', userValues: [], jobValues: ['Community'] },
    { label: 'empty job, non-empty user (plain)', userValues: ['Community'], jobValues: [] },
    { label: 'empty user, non-empty job (rated)', userValues: [] as RatedValue[], jobValues: ['Community'] },
    { label: 'empty job, non-empty user (rated)', userValues: [{ value: 'Community', rank: 1 }], jobValues: [] },

    // ── Plain string[] ────────────────────────────────────────────────────────
    { label: 'plain: single value, no overlap', userValues: ['Community'], jobValues: ['Security'] },
    { label: 'plain: single value, full overlap', userValues: ['Community'], jobValues: ['Community'] },
    { label: 'plain: no overlap', userValues: ['Community', 'Creativity'], jobValues: ['Security', 'Stability'] },
    { label: 'plain: partial overlap', userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'], jobValues: ['Community', 'Creativity', 'Security'] },
    { label: 'plain: full overlap (exact)', userValues: ['Community', 'Creativity', 'Challenge'], jobValues: ['Community', 'Creativity', 'Challenge'] },
    { label: 'plain: full overlap (job superset)', userValues: ['Community', 'Creativity'], jobValues: ['Community', 'Creativity', 'Security', 'Knowledge', 'Challenge'] },
    { label: 'plain: large user set, partial overlap', userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge', 'Security', 'Stability', 'Growth'], jobValues: ['Community', 'Knowledge', 'Growth'] },

    // ── All-unranked RatedValue[] ─────────────────────────────────────────────
    { label: 'all-unranked: single, no overlap', userValues: [{ value: 'Community' }], jobValues: ['Security'] },
    { label: 'all-unranked: single, full overlap', userValues: [{ value: 'Community' }], jobValues: ['Community'] },
    { label: 'all-unranked: no overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }], jobValues: ['Security', 'Stability'] },
    { label: 'all-unranked: partial overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }, { value: 'Challenge' }], jobValues: ['Community', 'Security'] },
    { label: 'all-unranked: full overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }], jobValues: ['Community', 'Creativity'] },

    // ── All-ranked RatedValue[] ───────────────────────────────────────────────
    { label: 'all-ranked: 2 values, no overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }], jobValues: ['Security'] },
    { label: 'all-ranked: 2 values, full overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }], jobValues: ['Community', 'Creativity'] },
    { label: 'all-ranked: 3 values, partial overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }, { value: 'Challenge', rank: 3 }], jobValues: ['Community', 'Security'] },
    { label: 'all-ranked: 4 values, full overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity', rank: 2 }, { value: 'Challenge', rank: 3 }, { value: 'Knowledge', rank: 4 }], jobValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'] },
    {
      label: 'all-ranked: 4 values, no overlap',
      userValues: [{ value: 'V0', rank: 1 }, { value: 'V1', rank: 2 }, { value: 'V2', rank: 3 }, { value: 'V3', rank: 4 }],
      jobValues: ['Security', 'Stability'],
    },
    {
      label: 'all-ranked: 4 values, partial overlap',
      userValues: [{ value: 'V0', rank: 1 }, { value: 'V1', rank: 2 }, { value: 'V2', rank: 3 }, { value: 'V3', rank: 4 }],
      jobValues: ['V0', 'V1', 'Security'],
    },

    // ── Mixed ranked/unranked RatedValue[] ────────────────────────────────────
    { label: 'mixed: one ranked, one unranked, no overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity' }], jobValues: ['Security'] },
    { label: 'mixed: one ranked, one unranked, full overlap', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity' }], jobValues: ['Community', 'Creativity'] },
    { label: 'mixed: one ranked, one unranked, partial overlap (ranked shared)', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity' }], jobValues: ['Community', 'Security'] },
    { label: 'mixed: one ranked, one unranked, partial overlap (unranked shared)', userValues: [{ value: 'Community', rank: 1 }, { value: 'Creativity' }], jobValues: ['Creativity', 'Security'] },
    {
      label: 'mixed: multiple ranks and unranked, partial overlap',
      userValues: [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge' },
        { value: 'Knowledge', rank: 4 },
        { value: 'Stability' },
      ],
      jobValues: ['Community', 'Challenge', 'Security'],
    },
    {
      label: 'mixed: multiple ranks and unranked, full overlap',
      userValues: [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge' },
      ],
      jobValues: ['Community', 'Creativity', 'Challenge', 'Security'],
    },
    {
      label: 'mixed: large set, ranks + unranked, no overlap',
      userValues: [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Challenge', rank: 3 },
        { value: 'Knowledge', rank: 4 },
        { value: 'Stability' },
        { value: 'Growth' },
      ],
      jobValues: ['Security', 'Balance', 'Integrity'],
    },
  ]

  it.each(cases)('$label', ({ userValues, jobValues }) => {
    const { score } = calculateMatch(userValues as string[] | RatedValue[], jobValues)
    expect(score).toBeGreaterThanOrEqual(0.0)
    expect(score).toBeLessThanOrEqual(1.0)
  })
})

/**
 * Unit tests: fallback behaviour
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */
describe('Fallback behaviour', () => {
  it('uses plain values (string[]) when values_rated is null/undefined', () => {
    const valuesRated = null
    const values = ['Community', 'Creativity', 'Challenge']
    const jobValues = ['Community', 'Creativity', 'Security']

    const userValues: string[] = valuesRated ?? values

    const result = calculateMatch(userValues, jobValues)

    expect(result.shared_values).toEqual(['Community', 'Creativity'])
    expect(result.score).toBeGreaterThan(0)
  })

  it('prefers values_rated (RatedValue[]) over plain values when values_rated is present', () => {
    const valuesRated: RatedValue[] = [
      { value: 'Community', rank: 1 },
      { value: 'Creativity', rank: 2 },
    ]
    const values = ['Community', 'Creativity', 'OldValue']
    const jobValues = ['Community', 'Creativity', 'Security']

    const userValues = valuesRated.length ? valuesRated : values

    const ratedResult = calculateMatch(userValues, jobValues)
    const plainResult = calculateMatch(values, jobValues)

    expect(ratedResult.shared_values).toEqual(['Community', 'Creativity'])
    expect(ratedResult.score).toBeGreaterThan(0)

    expect(ratedResult.score).not.toBe(plainResult.score)
  })

  it('returns score 0 and no error when both values_rated and values are absent/empty', () => {
    const valuesRated: RatedValue[] | null = null
    const values: string[] = []
    const jobValues = ['Community', 'Creativity']

    const userValues: string[] = (valuesRated ?? values)

    expect(() => {
      const result = calculateMatch(userValues, jobValues)
      expect(result.score).toBe(0)
      expect(result.shared_values).toEqual([])
    }).not.toThrow()
  })
})
