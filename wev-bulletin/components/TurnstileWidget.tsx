'use client';

import { forwardRef, useSyncExternalStore } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useTheme } from '@/lib/hooks/useTheme';

export type { TurnstileInstance };

const emptySubscribe = () => () => {};

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError: () => void;
  onExpire: () => void;
}

const TurnstileWidget = forwardRef<TurnstileInstance | null, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess, onError, onExpire }, ref) {
    const { theme } = useTheme();

    // Hydration check: useSyncExternalStore ensures we don't trigger cascading renders
    // while providing a stable 'true' on client and 'false' on server.
    const mounted = useSyncExternalStore(
      emptySubscribe,
      () => true,
      () => false,
    );

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
