'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import Button from '@/components/Button';
import LinkButton from '@/components/LinkButton';
import Message from '@/components/Message';

const COOLDOWN_SECONDS = 30;

interface CheckEmailCardProps {
  onPrimaryAction: () => Promise<boolean | void>;
  /**
   * `signup` — single heading "Check your email to continue." (no anti-enumeration body).
   * `default` — "Check your email" + obfuscated "if an account exists…" body (forgot password, etc.).
   */
  variant?: 'default' | 'signup';
}

/** Shared "Check your email" success state for auth flows. */
export default function CheckEmailCard({
  onPrimaryAction,
  variant = 'default',
}: CheckEmailCardProps) {
  const t = useTranslations('auth.checkEmail');
  const [loading, setLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(COOLDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const isSignup = variant === 'signup';

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timeout = setTimeout(() => {
      setCooldownRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [cooldownRemaining]);

  const handlePrimaryAction = async () => {
    if (loading || cooldownRemaining > 0) return;

    setLoading(true);
    setError(null);
    try {
      const result = await onPrimaryAction();
      if (result === false) {
        setError(t('error'));
      } else {
        setCooldownRemaining(COOLDOWN_SECONDS);
      }
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel =
    cooldownRemaining > 0 ? t('cooldown', { seconds: cooldownRemaining }) : t('primary');

  return (
    <PageLayout variant="centered">
      <CardLayout>
        <Heading level={1} className={`text-center ${isSignup ? 'mb-6' : 'mb-3'}`}>
          {isSignup ? t('signupContinue') : t('title')}
        </Heading>
        {!isSignup && (
          <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
            {t('message')}
          </p>
        )}
        <div className="space-y-3">
          <Button
            onClick={handlePrimaryAction}
            disabled={loading || cooldownRemaining > 0}
            loading={loading}
            fullWidth
          >
            {primaryLabel}
          </Button>
          <LinkButton href="/login" variant="outline" fullWidth>
            {t('logIn')}
          </LinkButton>
          {error && <Message variant="error">{error}</Message>}
        </div>
      </CardLayout>
    </PageLayout>
  );
}
