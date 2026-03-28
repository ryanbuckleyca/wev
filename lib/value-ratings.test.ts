import { describe, it, expect } from 'vitest'
import {
  getRankWeight,
  NEUTRAL_WEIGHT,
  MIN_WEIGHT,
} from './value-ratings'

describe('getRankWeight', () => {
  it('rank 1 of 4 maps to 1.0', () => {
    expect(getRankWeight(1, 4)).toBe(1.0)
  })

  it('last rank maps to MIN_WEIGHT', () => {
    expect(getRankWeight(4, 4)).toBe(MIN_WEIGHT)
  })

  it('middle rank maps to intermediate weight', () => {
    // rank 2 of 4: 1.0 - (1/3)*0.75 = 0.75
    expect(getRankWeight(2, 4)).toBe(0.75)
  })

  it('rank 3 of 4 maps to 0.5', () => {
    // 1.0 - (2/3)*0.75 = 0.5
    expect(getRankWeight(3, 4)).toBe(0.5)
  })

  it('returns neutral when total <= 1', () => {
    expect(getRankWeight(1, 1)).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral when total is 0', () => {
    expect(getRankWeight(1, 0)).toBe(NEUTRAL_WEIGHT)
  })

  it('returns neutral when rank is undefined', () => {
    expect(getRankWeight(undefined, 3)).toBe(NEUTRAL_WEIGHT)
  })

  it('clamps rank to 1 when below range', () => {
    expect(getRankWeight(0, 4)).toBe(1.0)
  })

  it('clamps rank to total when above range', () => {
    expect(getRankWeight(10, 4)).toBe(MIN_WEIGHT)
  })
})
