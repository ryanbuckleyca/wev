'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePasswordStrength } from '@/hooks/usePasswordStrength'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator'
import PageLayout from '@/components/PageLayout'
import CardLayout from '@/components/CardLayout'
import Heading from '@/components/Heading'
import FormContainer from '@/components/FormContainer'
import FormField from '@/components/FormField'
import Button from '@/components/Button'
import LinkButton from '@/components/LinkButton'
import ErrorBox from '@/components/ErrorBox'
import LoadingState from '@/components/LoadingState'

export default function ResetPasswordPage() {
  const t = useTranslations()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidSession, setIsValidSession] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  const passwordStrength = usePasswordStrength(password)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsValidSession(true)
      } else {
        setError(t('auth.resetPassword.invalidLink'))
      }
    }
    checkSession()
  }, [supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError(t('auth.resetPassword.passwordWeak'))
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.resetPassword.passwordsDontMatch'))
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // User is already authenticated after password reset, redirect to home
      router.push('/')
    }
  }

  if (!isValidSession && !error) {
    return <LoadingState message={t('auth.resetPassword.verifying')} />;
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-2">{t('auth.resetPassword.title')}</Heading>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
          {t('auth.resetPassword.description')}
        </p>

        {isValidSession ? (
          <FormContainer onSubmit={handleSubmit}>
            <FormField
              label={t('auth.resetPassword.newPassword')}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
              required
            />
            <PasswordStrengthIndicator passwordStrength={passwordStrength} />

            <FormField
              label={t('auth.resetPassword.confirmPassword')}
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="••••••••••"
              required
            />

            <Button
              type="submit"
              disabled={loading || (passwordStrength !== null && !passwordStrength.isAcceptable)}
              loading={loading}
            >
              {loading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
            </Button>
          </FormContainer>
        ) : (
          <div className="text-center">
            <ErrorBox className="mb-4">{error}</ErrorBox>
            <LinkButton href="/forgot-password" size="sm">
              {t('auth.resetPassword.requestNewLink')}
            </LinkButton>
          </div>
        )}

        {error && isValidSession && (
          <ErrorBox className="mt-4">{error}</ErrorBox>
        )}
      </CardLayout>
    </PageLayout>
  )
}
