import { forwardRef, useImperativeHandle } from 'react';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { vi } from 'vitest';

/** Spy for Turnstile `reset()` — used in regression tests when auth must recycle the token. */
export const mockTurnstileReset = vi.fn();

/**
 * Test double for `@/components/TurnstileWidget` — exposes success, error, and expire
 * without loading the real Turnstile bundle.
 */
const TurnstileWidgetTestMock = forwardRef<
  TurnstileInstance | null,
  {
    onSuccess: (token: string) => void;
    onError: () => void;
    onExpire: () => void;
  }
>(function TurnstileWidgetTestMock({ onSuccess, onError, onExpire }, ref) {
  useImperativeHandle(ref, () => ({
    render: () => null,
    execute: () => {},
    reset: () => mockTurnstileReset(),
    remove: () => {},
    getResponse: () => undefined,
    getResponsePromise: async () => '',
    isExpired: () => false,
  }));

  return (
    <div>
      <button type="button" onClick={() => onSuccess('turnstile-token')}>
        Complete CAPTCHA
      </button>
      <button type="button" onClick={() => onError()}>
        Simulate CAPTCHA error
      </button>
      <button type="button" onClick={() => onExpire()}>
        Simulate CAPTCHA expire
      </button>
    </div>
  );
});

export default TurnstileWidgetTestMock;
