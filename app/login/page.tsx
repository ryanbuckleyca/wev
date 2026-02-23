'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import TurnstileWidget from '@/components/TurnstileWidget'
import PageLayout from '@/components/PageLayout'
import CardLayout from '@/components/CardLayout'
import Heading from '@/components/Heading'
import FormContainer from '@/components/FormContainer'
import FormField from '@/components/FormField'
import FormLabel from '@/components/FormLabel'
import FormInput from '@/components/FormInput'
import Button from '@/components/Button'
import ErrorBox from '@/components/ErrorBox'
import LinkButton from '@/components/LinkButton'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken,
      },
    })
    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/'
    }

    setLoading(false)
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-6">Log in</Heading>

        <FormContainer onSubmit={handleSubmit}>
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
            fullWidth
          />

          <FormField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="•••••••••"
            required
            fullWidth
          />
          <div className="w-full flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs underline"
              style={{ color: 'var(--primary-text)' }}
            >
              Forgot password?
            </Link>
          </div>

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
            disabled={loading || !captchaToken}
            loading={loading}
            fullWidth
          >
            Log in
          </Button>
        </FormContainer>

        {error && (
          <ErrorBox className="mt-4">{error}</ErrorBox>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <Link
            href="/signup"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            Sign up
          </Link>
        </p>
      </CardLayout>
    </PageLayout>
  )
}
