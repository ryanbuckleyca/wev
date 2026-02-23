'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { checkPasswordStrength } from '@/lib/password-strength'
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

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const passwordStrength = useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password)
  }, [password])

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError('Password is too weak. Please choose a stronger password.')
      setLoading(false)
      return
    }

    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification.')
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
      setMessage('Check your email for a confirmation link.')
    }

    setLoading(false)
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-6">Sign up</Heading>

        <FormContainer onSubmit={handleSubmit}>
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
          />

          <FormField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="•••••••••••"
            required
          />
          <PasswordStrengthIndicator passwordStrength={passwordStrength} />

          <TurnstileWidget
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null)
              setError('CAPTCHA verification failed. Please try again.')
            }}
            onExpire={() => setCaptchaToken(null)}
          />

          <Button
            type="submit"
            disabled={loading || !captchaToken || (passwordStrength !== null && !passwordStrength.isAcceptable)}
            loading={loading}
          >
            Create account
          </Button>
        </FormContainer>

        {error && (
          <ErrorBox className="mt-4">{error}</ErrorBox>
        )}
        {message && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--success-text)' }}>
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <LinkButton href="/login" variant="outline" size="sm">
            Log in
          </LinkButton>
        </p>
      </CardLayout>
    </PageLayout>
  )
}
