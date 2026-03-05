'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkPasswordStrength } from '@/lib/password-strength'
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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidSession, setIsValidSession] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  const passwordStrength = useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password)
  }, [password])

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsValidSession(true)
      } else {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    }
    checkSession()
  }, [supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError('Password is too weak. Please choose a stronger password.')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
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
    return <LoadingState message="Verifying session..." />;
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-2">Reset password</Heading>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text-secondary)' }}>
          Enter your new password below.
        </p>

        {isValidSession ? (
          <FormContainer onSubmit={handleSubmit}>
            <FormField
              label="New Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
              required
            />
            <PasswordStrengthIndicator passwordStrength={passwordStrength} />

            <FormField
              label="Confirm Password"
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
              {loading ? 'Updating...' : 'Update password'}
            </Button>
          </FormContainer>
        ) : (
          <div className="text-center">
            <ErrorBox className="mb-4">{error}</ErrorBox>
            <LinkButton href="/forgot-password" size="sm">
              Request a new reset link
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
