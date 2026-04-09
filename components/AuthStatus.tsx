'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import LinkButton from '@/components/LinkButton';
import Button from '@/components/Button';
import notify from '@/lib/toast';

export default function AuthStatus() {
  const router = useRouter();
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, _session) => {
      // Don't use the session parameter to avoid Supabase warnings
      // Fetch user directly to validate against the server
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      notify.success(t('userProfile.logoutSuccess'));
      router.push('/');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('userProfile.logoutFailed'));
      setIsLoggingOut(false);
    }
  };

  if (loading) return null;

  if (!user) {
    return (
      <LinkButton href="/login" size="sm">
        Log in
      </LinkButton>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{user.email}</span>
      <Button onClick={handleLogout} variant="outline" size="sm" disabled={isLoggingOut}>
        {isLoggingOut ? 'Logging out...' : 'Log out'}
      </Button>
    </div>
  );
}
