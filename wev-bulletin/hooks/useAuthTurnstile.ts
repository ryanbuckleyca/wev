import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TurnstileInstance } from '@/components/TurnstileWidget';

/**
 * Turnstile tokens are single-use once sent to Supabase. This hook keeps token + ref
 * in one place and exposes {@link recycleTurnstileAfterAuthError} for failed auth calls.
 */
export function useAuthTurnstile(
  captchaErrorMessage: string,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const recycleTurnstileAfterAuthError = useCallback(() => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }, []);

  const clearCaptchaToken = useCallback(() => setCaptchaToken(null), []);

  const turnstileProps = useMemo(
    () => ({
      ref: turnstileRef,
      onSuccess: (token: string) => setCaptchaToken(token),
      onError: () => {
        setCaptchaToken(null);
        setError(captchaErrorMessage);
      },
      onExpire: () => setCaptchaToken(null),
    }),
    [captchaErrorMessage, setError],
  );

  return { captchaToken, turnstileProps, recycleTurnstileAfterAuthError, clearCaptchaToken };
}
