import { render, screen } from '@/test-utils';
import TurnstileWidget from './TurnstileWidget';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: vi.fn(() => <div data-testid="mock-turnstile" />),
}));

vi.mock('@/lib/hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({ theme: 'light' })),
}));

describe('TurnstileWidget', () => {
  it('renders the turnstile component when mounted', () => {
    render(
      <TurnstileWidget
        onSuccess={vi.fn()}
        onError={vi.fn()}
        onExpire={vi.fn()}
      />
    );
    expect(screen.getByTestId('mock-turnstile')).toBeInTheDocument();
  });
});
