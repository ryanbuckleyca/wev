'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import TurnstileWidget from '@/components/TurnstileWidget';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import Button from '@/components/Button';
import ErrorBox from '@/components/ErrorBox';
import { PASSWORD_FIELD_PLACEHOLDER } from '@/lib/auth';
import { useAuthTurnstile } from '@/hooks/useAuthTurnstile';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { captchaToken, turnstileProps, recycleTurnstileAfterAuthError } = useAuthTurnstile(
    t('auth.login.captchaError'),
    setError,
  );

  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && user) {
      setIsRedirecting(true);
      router.replace('/');
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setIsRedirecting(false);
    setError(null);

    if (!captchaToken) {
      setError(t('auth.login.captchaRequired'));
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        captchaToken,
      },
    });
    if (error) {
      setError(error.message);
      recycleTurnstileAfterAuthError();
      setIsRedirecting(false);
      setLoading(false);
    } else {
      setIsRedirecting(true);
      router.replace('/');
    }
  }

  const isSubmitting = loading || isRedirecting;
  const submitLabel = isRedirecting
    ? t('auth.login.redirecting')
    : loading
      ? t('auth.login.submitting')
      : t('auth.login.submit');

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className="text-center mb-6">
          {t('auth.login.title')}
        </Heading>

        <FormContainer onSubmit={handleSubmit}>
          <FormField
            label={t('auth.login.email')}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
            fullWidth
          />

          <FormField
            label={t('auth.login.password')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={PASSWORD_FIELD_PLACEHOLDER}
            required
            fullWidth
          />
          <div className="w-full flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs underline"
              style={{ color: 'var(--primary-text)' }}
            >
              {t('auth.login.forgotPassword')}
            </Link>
          </div>

          <TurnstileWidget {...turnstileProps} />

          <Button
            type="submit"
            disabled={isSubmitting || !captchaToken}
            loading={isSubmitting}
            fullWidth
          >
            {submitLabel}
          </Button>
        </FormContainer>

        {error && <ErrorBox className="mt-4">{error}</ErrorBox>}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {t('auth.login.noAccount')}{' '}
          <Link
            href="/signup"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            {t('auth.login.signUp')}
          </Link>
        </p>
      </CardLayout>
    </PageLayout>
  );
}
