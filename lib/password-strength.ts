import { zxcvbn, ZxcvbnOptions } from '@zxcvbn-ts/core'
import { translations } from '@zxcvbn-ts/language-fr'

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
  feedback: string
  isAcceptable: boolean
}

/**
 * Get password strength labels for a given locale.
 * This function should be called from a component that has access to translations.
 */
export function getPasswordStrengthLabels(labels: {
  veryWeak: string
  weak: string
  fair: string
  good: string
  strong: string
}): string[] {
  return [labels.veryWeak, labels.weak, labels.fair, labels.good, labels.strong]
}

export function checkPasswordStrength(
  password: string,
  locale: 'en' | 'fr' = 'en',
  labels?: {
    veryWeak: string
    weak: string
    fair: string
    good: string
    strong: string
  }
): PasswordStrength {
  // Set up zxcvbn-ts with the appropriate language
  const options: ZxcvbnOptions = {}
  if (locale === 'fr') {
    options.translations = translations
  }

  const result = zxcvbn(password, undefined, options)

  const strengthLabels = labels
    ? getPasswordStrengthLabels(labels)
    : ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'] // Fallback to English

  const strengthColors = [
    'var(--alert-solid)', // Very Weak - red
    'var(--warn-solid)', // Weak - orange
    'var(--info-solid)', // Fair - blue
    'var(--success-solid)', // Good - green
    'var(--success-solid)', // Strong - green
  ]

  const label = strengthLabels[result.score]
  const color = strengthColors[result.score]
  const feedback = result.feedback.warning || result.feedback.suggestions[0] || ''
  const isAcceptable = result.score >= 2 // Fair or better

  return {
    score: result.score as 0 | 1 | 2 | 3 | 4,
    label,
    color,
    feedback,
    isAcceptable,
  }
}
