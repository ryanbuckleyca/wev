import { describe, it, expect } from 'vitest'
import {
  TIER_WEIGHTS,
  getTierWeight,
  getRankWeight,
  NEUTRAL_WEIGHT,
  MIN_WEIGHT,
} from './value-ratings'

describe('TIER_WEIGHTS (legacy tier strings)', () => {
  it('essential resolves to 1.0', () => {
    expect(TIER_WEIGHTS.essential).toBe(1.0)
  })

  it('nice_to_have resolves to MIN_WEIGHT', () => {
    expect(TIER_WEIGHTS.nice_to_have).toBe(MIN_WEIGHT)
  })
})

describe('getTierWeight', () => {
  it('returns 1.0 for essential', () => {
    expect(getTierWeight('essential')).toBe(1.0)
  })

  it('returns MIN_WEIGHT for nice_to_have', () => {
    expect(getTierWeight('nice_to_have')).toBe(MIN_WEIGHT)
  })

  it('returns 0.5 for less_important (unknown legacy string → neutral)', () => {
    expect(getTierWeight('less_important')).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral weight for unknown tier string', () => {
    expect(getTierWeight('unknown_tier')).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral weight for undefined tier', () => {
    expect(getTierWeight(undefined)).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral weight for null tier', () => {
    expect(getTierWeight(null as unknown as undefined)).toBe(NEUTRAL_WEIGHT)
  })
})

describe('getRankWeight', () => {
  it('rank 1 of 4 maps to 1.0', () => {
    expect(getRankWeight(1, 4)).toBe(1.0)
  })

  it('last rank maps to MIN_WEIGHT', () => {
    expect(getRankWeight(4, 4)).toBe(MIN_WEIGHT)
  })

  it('returns neutral when total <= 1', () => {
    expect(getRankWeight(1, 1)).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral when rank is undefined', () => {
    expect(getRankWeight(undefined, 3)).toBe(NEUTRAL_WEIGHT)
  })
})
