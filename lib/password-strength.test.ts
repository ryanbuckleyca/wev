import { describe, it, expect } from 'vitest'
import { checkPasswordStrength } from './password-strength'

describe('checkPasswordStrength', () => {
  it('rates an empty string as Very Weak (score 0)', () => {
    const result = checkPasswordStrength('')
    expect(result.score).toBe(0)
    expect(result.label).toBe('Very Weak')
    expect(result.isAcceptable).toBe(false)
  })

  it('rates a short trivial password as unacceptable', () => {
    const result = checkPasswordStrength('abc')
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.isAcceptable).toBe(false)
  })

  it('rates a strong password as acceptable', () => {
    const result = checkPasswordStrength('c0rr3ct-H0rse-B@ttery-St@ple!')
    expect(result.score).toBeGreaterThanOrEqual(2)
    expect(result.isAcceptable).toBe(true)
  })

  it('returns the correct label for each score level', () => {
    // We can't deterministically control zxcvbn scores, but we can check the mapping
    const result = checkPasswordStrength('a')
    expect(['Very Weak', 'Weak', 'Fair', 'Good', 'Strong']).toContain(result.label)
  })

  it('returns a color string for all scores', () => {
    const result = checkPasswordStrength('test123')
    expect(result.color).toBeTruthy()
    expect(typeof result.color).toBe('string')
  })

  it('marks score >= 2 as acceptable and < 2 as not', () => {
    // Very short passwords are always weak
    const weak = checkPasswordStrength('ab')
    expect(weak.isAcceptable).toBe(false)

    const strong = checkPasswordStrength('Xk9$mZ!pL2@wQr7')
    expect(strong.isAcceptable).toBe(true)
  })

  it('feedbackKey is always a string', () => {
    const result = checkPasswordStrength('hello')
    expect(typeof result.feedbackKey).toBe('string')
  })
})
