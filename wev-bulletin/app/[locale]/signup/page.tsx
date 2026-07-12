'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSiteBaseUrl } from '@/lib/site-url';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';
import TurnstileWidget from '@/components/TurnstileWidget';
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import Button from '@/components/Button';
import CheckEmailCard from '@/components/CheckEmailCard';
import ErrorBox from '@/components/ErrorBox';
import { PASSWORD_FIELD_PLACEHOLDER } from '@/lib/auth';
import { useAuthTurnstile } from '@/hooks/useAuthTurnstile';

export default function SignupPage() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { captchaToken, turnstileProps, recycleTurnstileAfterAuthError, clearCaptchaToken } =
    useAuthTurnstile(t('auth.signup.captchaError'), setError);

  const passwordStrength = usePasswordStrength(password);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError(t('auth.signup.passwordWeak'));
      setLoading(false);
      return;
    }

    if (!captchaToken) {
      setError(t('auth.signup.captchaRequired'));
      setLoading(false);
      return;
    }

    // Server decides whether to send a normal signup confirmation (new account) or
    // a magic link (existing account). The response is intentionally identical for
    // both so the client cannot tell whether the email is already registered.
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, captchaToken }),
      });

      if (response.ok) {
        setSentEmail(email);
        clearCaptchaToken();
      } else {
        setError(t('auth.signup.requestError'));
        recycleTurnstileAfterAuthError();
      }
    } catch {
      setError(t('auth.signup.requestError'));
      recycleTurnstileAfterAuthError();
    } finally {
      setLoading(false);
    }
  }

  const handleResend = async () => {
    if (!sentEmail) return false;
    const baseUrl = getSiteBaseUrl();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: sentEmail,
      options: { emailRedirectTo: `${baseUrl}/auth/callback` },
    });
    return !error;
  };

  if (sentEmail) {
    return <CheckEmailCard onPrimaryAction={handleResend} />;
  }

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-6">
          {t('auth.signup.title')}
        </Heading>

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
            placeholder={PASSWORD_FIELD_PLACEHOLDER}
            required
            fullWidth
          />
          <PasswordStrengthIndicator passwordStrength={passwordStrength} />

          <TurnstileWidget {...turnstileProps} />

          <Button
            type="submit"
            disabled={
              loading ||
              !captchaToken ||
              (passwordStrength !== null && !passwordStrength.isAcceptable)
            }
            loading={loading}
            fullWidth
          >
            {loading ? t('auth.signup.submitting') : t('auth.signup.submit')}
          </Button>
        </FormContainer>

        {error && <ErrorBox className="mt-4">{error}</ErrorBox>}

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
  );
}
