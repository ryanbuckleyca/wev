'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import TurnstileWidget from '@/components/TurnstileWidget'
import PageLayout from '@/components/PageLayout'
import CardLayout from '@/components/CardLayout'
import Heading from '@/components/Heading'
import FormContainer from '@/components/FormContainer'
import FormField from '@/components/FormField'
import Button from '@/components/Button'
import Message from '@/components/Message'

export default function ForgotPasswordPage() {
  const t = useTranslations()
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    if (!captchaToken) {
      setError(t('auth.forgotPassword.captchaRequired'))
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${locale}/reset-password`,
      captchaToken,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage(t('auth.forgotPassword.emailSent'))
    }

    setLoading(false)
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-2">{t('auth.forgotPassword.title')}</Heading>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
          {t('auth.forgotPassword.description')}
        </p>

        <FormContainer onSubmit={handleSubmit}>
          <FormField
            label={t('auth.forgotPassword.email')}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
            fullWidth
          />

          <TurnstileWidget
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null)
              setError(t('auth.forgotPassword.captchaError'))
            }}
            onExpire={() => setCaptchaToken(null)}
          />

          <Button
            type="submit"
            disabled={loading || !captchaToken}
            loading={loading}
            fullWidth
          >
            {loading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
          </Button>
        </FormContainer>

        {error && (
          <Message variant="error">{error}</Message>
        )}
        {message && (
          <Message variant="success">{message}</Message>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {t('auth.forgotPassword.rememberPassword')}{' '}
          <Link
            href="/login"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            {t('auth.forgotPassword.logIn')}
          </Link>
        </p>
      </CardLayout>
    </PageLayout>
  )
}
