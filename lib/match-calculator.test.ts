import { describe, it, expect } from 'vitest'
import { calculateMatch } from './match-calculator'
import type { RatedValue } from './value-ratings'
import { TIER_WEIGHTS } from './value-ratings'

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
 * Property test: all-unrated Weighted_Match equals Flat_Match
 *
 * Validates: Requirements 3.9
 *
 * For any profile where every value has no tier, the score from
 * calculateMatch(ratedValues, jobValues) MUST equal the score from
 * calculateMatch(plainValues, jobValues).
 */
describe('Property: all-unrated RatedValue[] score equals plain string[] score', () => {
  const cases: Array<{ label: string; userValues: string[]; jobValues: string[] }> = [
    // empty arrays
    { label: 'both empty', userValues: [], jobValues: [] },
    { label: 'empty user values', userValues: [], jobValues: ['Community', 'Creativity'] },
    { label: 'empty job values', userValues: ['Community', 'Creativity'], jobValues: [] },

    // no overlap
    { label: 'no overlap (single)', userValues: ['Community'], jobValues: ['Security'] },
    {
      label: 'no overlap (multiple)',
      userValues: ['Community', 'Creativity', 'Challenge'],
      jobValues: ['Security', 'Knowledge', 'Stability'],
    },

    // partial overlap
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

    // full overlap
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

    // various sizes
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
    // Build all-unrated RatedValue[] (no tier property set)
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
  const tiers = Object.keys(TIER_WEIGHTS) as Array<keyof typeof TIER_WEIGHTS>

  type Case = { label: string; userValues: string[] | RatedValue[]; jobValues: string[] }

  const cases: Case[] = [
    // ── Edge cases ────────────────────────────────────────────────────────────
    { label: 'both empty (plain)', userValues: [], jobValues: [] },
    { label: 'both empty (rated)', userValues: [] as RatedValue[], jobValues: [] },
    { label: 'empty user, non-empty job (plain)', userValues: [], jobValues: ['Community'] },
    { label: 'empty job, non-empty user (plain)', userValues: ['Community'], jobValues: [] },
    { label: 'empty user, non-empty job (rated)', userValues: [] as RatedValue[], jobValues: ['Community'] },
    { label: 'empty job, non-empty user (rated)', userValues: [{ value: 'Community', tier: 'most_important' }], jobValues: [] },

    // ── Plain string[] ────────────────────────────────────────────────────────
    { label: 'plain: single value, no overlap', userValues: ['Community'], jobValues: ['Security'] },
    { label: 'plain: single value, full overlap', userValues: ['Community'], jobValues: ['Community'] },
    { label: 'plain: no overlap', userValues: ['Community', 'Creativity'], jobValues: ['Security', 'Stability'] },
    { label: 'plain: partial overlap', userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge'], jobValues: ['Community', 'Creativity', 'Security'] },
    { label: 'plain: full overlap (exact)', userValues: ['Community', 'Creativity', 'Challenge'], jobValues: ['Community', 'Creativity', 'Challenge'] },
    { label: 'plain: full overlap (job superset)', userValues: ['Community', 'Creativity'], jobValues: ['Community', 'Creativity', 'Security', 'Knowledge', 'Challenge'] },
    { label: 'plain: large user set, partial overlap', userValues: ['Community', 'Creativity', 'Challenge', 'Knowledge', 'Security', 'Stability', 'Growth'], jobValues: ['Community', 'Knowledge', 'Growth'] },

    // ── All-unrated RatedValue[] ──────────────────────────────────────────────
    { label: 'all-unrated: single, no overlap', userValues: [{ value: 'Community' }], jobValues: ['Security'] },
    { label: 'all-unrated: single, full overlap', userValues: [{ value: 'Community' }], jobValues: ['Community'] },
    { label: 'all-unrated: no overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }], jobValues: ['Security', 'Stability'] },
    { label: 'all-unrated: partial overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }, { value: 'Challenge' }], jobValues: ['Community', 'Security'] },
    { label: 'all-unrated: full overlap', userValues: [{ value: 'Community' }, { value: 'Creativity' }], jobValues: ['Community', 'Creativity'] },

    // ── All-rated RatedValue[] (all four tiers) ───────────────────────────────
    { label: 'all-rated most_important: no overlap', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity', tier: 'most_important' }], jobValues: ['Security'] },
    { label: 'all-rated most_important: full overlap', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity', tier: 'most_important' }], jobValues: ['Community', 'Creativity'] },
    { label: 'all-rated more_important: partial overlap', userValues: [{ value: 'Community', tier: 'more_important' }, { value: 'Creativity', tier: 'more_important' }, { value: 'Challenge', tier: 'more_important' }], jobValues: ['Community', 'Security'] },
    { label: 'all-rated less_important: partial overlap', userValues: [{ value: 'Community', tier: 'less_important' }, { value: 'Creativity', tier: 'less_important' }, { value: 'Challenge', tier: 'less_important' }], jobValues: ['Community', 'Security'] },
    { label: 'all-rated least_important: full overlap', userValues: [{ value: 'Community', tier: 'least_important' }, { value: 'Creativity', tier: 'least_important' }], jobValues: ['Community', 'Creativity'] },
    {
      label: 'all-rated: one of each tier, no overlap',
      userValues: tiers.map((tier, i) => ({ value: `Value${i}`, tier })),
      jobValues: ['Security', 'Stability'],
    },
    {
      label: 'all-rated: one of each tier, full overlap',
      userValues: tiers.map((tier, i) => ({ value: `Value${i}`, tier })),
      jobValues: tiers.map((_, i) => `Value${i}`),
    },
    {
      label: 'all-rated: one of each tier, partial overlap',
      userValues: tiers.map((tier, i) => ({ value: `Value${i}`, tier })),
      jobValues: ['Value0', 'Value1', 'Security'],
    },

    // ── Mixed rated/unrated RatedValue[] ─────────────────────────────────────
    { label: 'mixed: one rated, one unrated, no overlap', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity' }], jobValues: ['Security'] },
    { label: 'mixed: one rated, one unrated, full overlap', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity' }], jobValues: ['Community', 'Creativity'] },
    { label: 'mixed: one rated, one unrated, partial overlap (rated shared)', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity' }], jobValues: ['Community', 'Security'] },
    { label: 'mixed: one rated, one unrated, partial overlap (unrated shared)', userValues: [{ value: 'Community', tier: 'most_important' }, { value: 'Creativity' }], jobValues: ['Creativity', 'Security'] },
    {
      label: 'mixed: multiple tiers and unrated, partial overlap',
      userValues: [
        { value: 'Community', tier: 'most_important' },
        { value: 'Creativity', tier: 'more_important' },
        { value: 'Challenge' },
        { value: 'Knowledge', tier: 'least_important' },
        { value: 'Stability' },
      ],
      jobValues: ['Community', 'Challenge', 'Security'],
    },
    {
      label: 'mixed: multiple tiers and unrated, full overlap',
      userValues: [
        { value: 'Community', tier: 'most_important' },
        { value: 'Creativity', tier: 'less_important' },
        { value: 'Challenge' },
      ],
      jobValues: ['Community', 'Creativity', 'Challenge', 'Security'],
    },
    {
      label: 'mixed: large set, all tiers + unrated, no overlap',
      userValues: [
        { value: 'Community', tier: 'most_important' },
        { value: 'Creativity', tier: 'more_important' },
        { value: 'Challenge', tier: 'less_important' },
        { value: 'Knowledge', tier: 'least_important' },
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
 *
 * These tests call calculateMatch directly to simulate the fallback logic
 * that calculateUserMatches / calculateJobMatches apply when reading from
 * the database (values_rated null → fall back to values, etc.).
 */
describe('Fallback behaviour', () => {
  // Simulates: profile.values_rated is null/undefined → caller passes profile.values (string[])
  it('uses plain values (string[]) when values_rated is null/undefined', () => {
    const valuesRated = null
    const values = ['Community', 'Creativity', 'Challenge']
    const jobValues = ['Community', 'Creativity', 'Security']

    // Replicate the fallback logic from calculateUserMatches / calculateJobMatches:
    //   const userValues = profile.values_rated?.length ? profile.values_rated : profile.values
    const userValues: string[] = valuesRated ?? values

    const result = calculateMatch(userValues, jobValues)

    // shared = 2, overlap = 2/3, bonus = 0.2 → score ≈ 0.867
    expect(result.shared_values).toEqual(['Community', 'Creativity'])
    expect(result.score).toBeGreaterThan(0)
  })

  // Simulates: profile.values_rated is present → caller passes it (RatedValue[]) instead of plain values
  it('prefers values_rated (RatedValue[]) over plain values when values_rated is present', () => {
    const valuesRated: import('./value-ratings').RatedValue[] = [
      { value: 'Community', tier: 'most_important' },
      { value: 'Creativity', tier: 'more_important' },
    ]
    const values = ['Community', 'Creativity', 'OldValue']
    const jobValues = ['Community', 'Creativity', 'Security']

    // Replicate the fallback logic: prefer values_rated when present
    const userValues = valuesRated.length ? valuesRated : values

    const ratedResult = calculateMatch(userValues, jobValues)
    const plainResult = calculateMatch(values, jobValues)

    // Both share Community + Creativity with the job, but the rated path uses
    // weighted overlap while the plain path uses flat overlap — scores differ
    // because the denominator weights differ. The key assertion is that the
    // rated path is used (shared_values still correct) and no error is thrown.
    expect(ratedResult.shared_values).toEqual(['Community', 'Creativity'])
    expect(ratedResult.score).toBeGreaterThan(0)

    // The rated result should differ from the plain result because 'OldValue'
    // is excluded from the rated path (it's not in values_rated).
    expect(ratedResult.score).not.toBe(plainResult.score)
  })

  // Simulates: both values_rated and values are absent/empty
  it('returns score 0 and no error when both values_rated and values are absent/empty', () => {
    const valuesRated: import('./value-ratings').RatedValue[] | null = null
    const values: string[] = []
    const jobValues = ['Community', 'Creativity']

    // Replicate the fallback logic: both absent → empty array
    const userValues: string[] = (valuesRated ?? values)

    expect(() => {
      const result = calculateMatch(userValues, jobValues)
      expect(result.score).toBe(0)
      expect(result.shared_values).toEqual([])
    }).not.toThrow()
  })
})
