/**
 * Test double for `@/components/TurnstileWidget` — exposes success, error, and expire
 * without loading the real Turnstile bundle.
 */
export default function TurnstileWidgetTestMock({
  onSuccess,
  onError,
  onExpire,
}: {
  onSuccess: (token: string) => void;
  onError: () => void;
  onExpire: () => void;
}) {
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
}
