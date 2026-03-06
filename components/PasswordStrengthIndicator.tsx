import { useTranslations, useLocale } from 'next-intl'
import type { PasswordStrength } from '@/lib/password-strength'

interface PasswordStrengthIndicatorProps {
  passwordStrength: PasswordStrength | null
}

export default function PasswordStrengthIndicator({ passwordStrength }: PasswordStrengthIndicatorProps) {
  const t = useTranslations('passwordStrength')
  const locale = useLocale()
  
  if (!passwordStrength) {
    return null
  }

  return (
    <div className="mt-3">
      <div className="flex gap-1 mb-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 h-2 rounded-full transition-colors"
            style={{
              backgroundColor:
                i <= passwordStrength.score
                  ? passwordStrength.color
                  : 'var(--border)',
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs">
          {t('strength')}{' '}
          <span style={{ color: passwordStrength.color }} className="font-semibold">
            {passwordStrength.label}
          </span>
        </span>
        {passwordStrength.isAcceptable && (
          <span className="text-xs text-[var(--success-solid)]">
            {t('acceptable')}
          </span>
        )}
      </div>

      {passwordStrength.feedback && !passwordStrength.isAcceptable && (
        <p className="text-xs text-[var(--warn-solid)]">
          {passwordStrength.feedback}
        </p>
      )}
    </div>
  )
}
