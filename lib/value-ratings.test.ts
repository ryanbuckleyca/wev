import { describe, it, expect } from 'vitest'
import { TIER_WEIGHTS, getTierWeight, NEUTRAL_WEIGHT } from './value-ratings'

describe('TIER_WEIGHTS', () => {
  it('most_important resolves to 1.0', () => {
    expect(TIER_WEIGHTS.most_important).toBe(1.0)
  })

  it('more_important resolves to 0.75', () => {
    expect(TIER_WEIGHTS.more_important).toBe(0.75)
  })

  it('less_important resolves to 0.5', () => {
    expect(TIER_WEIGHTS.less_important).toBe(0.5)
  })

  it('least_important resolves to 0.25', () => {
    expect(TIER_WEIGHTS.least_important).toBe(0.25)
  })
})

describe('getTierWeight', () => {
  it('returns 1.0 for most_important', () => {
    expect(getTierWeight('most_important')).toBe(1.0)
  })

  it('returns 0.75 for more_important', () => {
    expect(getTierWeight('more_important')).toBe(0.75)
  })

  it('returns 0.5 for less_important', () => {
    expect(getTierWeight('less_important')).toBe(0.5)
  })

  it('returns 0.25 for least_important', () => {
    expect(getTierWeight('least_important')).toBe(0.25)
  })

  it('returns neutral weight (0.5) for unknown tier string', () => {
    expect(getTierWeight('unknown_tier')).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral weight (0.5) for undefined tier', () => {
    expect(getTierWeight(undefined)).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral weight (0.5) for null tier', () => {
    // null is cast via the function's null check
    expect(getTierWeight(null as unknown as undefined)).toBe(NEUTRAL_WEIGHT)
  })
})
