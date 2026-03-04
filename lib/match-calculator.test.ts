import { describe, it, expect } from 'vitest'
import { calculateMatch } from './match-calculator'

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
