'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useTheme } from '@/lib/hooks/useTheme';

export type { TurnstileInstance };

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError: () => void;
  onExpire: () => void;
}

const TurnstileWidget = forwardRef<TurnstileInstance | null, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess, onError, onExpire }, ref) {
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      return (
        <div className="w-full">
          <div className="w-full h-[65px] rounded-lg border border-[var(--border)] bg-[var(--background)] animate-pulse" />
        </div>
      );
    }

    return (
      <div className="w-full">
        <Turnstile
          ref={ref}
          className="w-full"
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
          options={{ theme, size: 'flexible' }}
          onSuccess={onSuccess}
          onError={onError}
          onExpire={onExpire}
        />
      </div>
    );
  },
);

export default TurnstileWidget;
