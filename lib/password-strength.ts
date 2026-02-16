import zxcvbn from 'zxcvbn'

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
  feedback: string
  isAcceptable: boolean
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const result = zxcvbn(password)

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = [
    'var(--alert-solid)', // Very Weak - red
    'var(--warning-solid)', // Weak - orange
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
