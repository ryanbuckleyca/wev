import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { checkPasswordStrength, type PasswordStrength } from '@/lib/password-strength'

/**
 * Hook that wraps checkPasswordStrength with translated labels.
 * Replaces the repeated useMemo + label-passing pattern across pages.
 */
export function usePasswordStrength(password: string): PasswordStrength | null {
  const t = useTranslations('passwordStrength')

  return useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password, {
      veryWeak: t('veryWeak'),
      weak: t('weak'),
      fair: t('fair'),
      good: t('good'),
      strong: t('strong'),
    })
  }, [password, t])
}
