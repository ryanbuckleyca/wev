import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { checkPasswordStrength, type PasswordStrength } from '@/lib/password-strength'

export type PasswordStrengthResult = Omit<PasswordStrength, 'feedbackKey' | 'feedbackIsWarning'> & {
  feedback: string
}

/**
 * Hook that wraps checkPasswordStrength with translated labels and feedback.
 * All translation happens here via next-intl — the utility stays locale-agnostic.
 */
export function usePasswordStrength(password: string): PasswordStrengthResult | null {
  const t = useTranslations('passwordStrength')

  return useMemo(() => {
    if (!password) return null
    const result = checkPasswordStrength(password, {
      veryWeak: t('veryWeak'),
      weak: t('weak'),
      fair: t('fair'),
      good: t('good'),
      strong: t('strong'),
    })

    // Translate the feedback key via message files
    let feedback = ''
    if (result.feedbackKey) {
      const namespace = result.feedbackIsWarning ? 'warnings' : 'suggestions'
      const key = `feedback.${namespace}.${result.feedbackKey}`
      // Use t.has() to avoid missing-key errors, fall back to empty string
      feedback = t.has(key) ? t(key) : ''
    }

    return {
      score: result.score,
      label: result.label,
      color: result.color,
      isAcceptable: result.isAcceptable,
      feedback,
    }
  }, [password, t])
}
