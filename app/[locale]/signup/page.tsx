'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePasswordStrength } from '@/hooks/usePasswordStrength'
import TurnstileWidget from '@/components/TurnstileWidget'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator'
import PageLayout from '@/components/PageLayout'
import CardLayout from '@/components/CardLayout'
import Heading from '@/components/Heading'
import FormContainer from '@/components/FormContainer'
import FormField from '@/components/FormField'
import Button from '@/components/Button'
import LinkButton from '@/components/LinkButton'
import ErrorBox from '@/components/ErrorBox'
import Message from '@/components/Message'

export default function SignupPage() {
  const t = useTranslations()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [successEmail, setSuccessEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendFeedback, setResendFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const RESEND_COOLDOWN_SECONDS = 30

  const passwordStrength = usePasswordStrength(password)

  const supabase = createClient()

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timeout = setTimeout(() => {
      setResendCooldown(prev => Math.max(prev - 1, 0))
    }, 1000)
    return () => clearTimeout(timeout)
  }, [resendCooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResendFeedback(null)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError(t('auth.signup.passwordWeak'))
      setLoading(false)
      return
    }

    if (!captchaToken) {
      setError(t('auth.signup.captchaRequired'))
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken,
      },
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccessEmail(email)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setCaptchaToken(null)
    }

    setLoading(false)
  }

  const handleResend = async () => {
    if (!successEmail) return
    setResendLoading(true)
    setResendFeedback(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: successEmail,
    })
    if (error) {
      setResendFeedback({ type: 'error', text: t('auth.signup.resendError') })
    } else {
      setResendFeedback({ type: 'success', text: t('auth.signup.resendSuccess') })
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    }
    setResendLoading(false)
  }

  const handleChangeEmail = () => {
    setSuccessEmail(null)
    setResendCooldown(0)
    setResendFeedback(null)
    setError(null)
    setCaptchaToken(null)
    setPassword('')
  }

  if (successEmail) {
    return (
      <PageLayout variant="centered">
        <CardLayout>
          <Heading level={1} className="text-center mb-3">{t('auth.signup.checkEmailTitle')}</Heading>
          <p className="text-center text-sm text-muted-foreground">
            {t('auth.signup.checkEmailDescription', { email: successEmail })}
          </p>

          <div className="mt-6 space-y-3">
            <Button
              onClick={handleResend}
              disabled={resendLoading || resendCooldown > 0}
              loading={resendLoading}
              fullWidth
            >
              {resendCooldown > 0
                ? t('auth.signup.resendIn', { seconds: resendCooldown })
                : t('auth.signup.resendEmail')}
            </Button>
            <Button
              variant="outline"
              onClick={handleChangeEmail}
              fullWidth
            >
              {t('auth.signup.changeEmail')}
            </Button>
            <LinkButton href="/login" variant="outline" fullWidth>
              {t('auth.signup.backToLogin')}
            </LinkButton>
          </div>

          {resendFeedback && (
            <Message variant={resendFeedback.type}>{resendFeedback.text}</Message>
          )}
        </CardLayout>
      </PageLayout>
    )
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-6">{t('auth.signup.title')}</Heading>

        <FormContainer onSubmit={handleSubmit}>
          <FormField
            label={t('auth.signup.email')}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
            fullWidth
          />

          <FormField
            label={t('auth.signup.password')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="•••••••••••"
            required
            fullWidth
          />
          <PasswordStrengthIndicator passwordStrength={passwordStrength} />

          <TurnstileWidget
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null)
              setError(t('auth.signup.captchaError'))
            }}
            onExpire={() => setCaptchaToken(null)}
          />

          <Button
            type="submit"
            disabled={loading || !captchaToken || (passwordStrength !== null && !passwordStrength.isAcceptable)}
            loading={loading}
            fullWidth
          >
            {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
          </Button>
        </FormContainer>

        {error && (
          <ErrorBox className="mt-4">{error}</ErrorBox>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {t('auth.signup.hasAccount')}{' '}
          <Link
            href="/login"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            {t('auth.signup.logIn')}
          </Link>
        </p>
      </CardLayout>
    </PageLayout>
  )
}
