import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen } from '@/test-utils';
import CheckEmailCard from './CheckEmailCard';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => {
    void prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

describe('CheckEmailCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the shared check email UI and counts down from 30s', async () => {
    const onPrimaryAction = vi.fn().mockResolvedValue(true);

    render(<CheckEmailCard onPrimaryAction={onPrimaryAction} />);

    expect(screen.getByRole('heading', { name: /^check your email$/i })).toBeVisible();
    expect(
      screen.getByText(/if an account exists for this email, we['’]ll send you a link/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /try again in 30s/i })).toBeDisabled();
    expect(screen.getByRole('link', { name: /log in/i })).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByRole('button', { name: /try again in 29s/i })).toBeDisabled();
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  it('renders signup continue-only copy without anti-enumeration subtext', () => {
    render(<CheckEmailCard variant="signup" onPrimaryAction={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /check your email to continue/i })).toBeVisible();
    expect(
      screen.queryByText(/if an account exists for this email, we['’]ll send you a link/i),
    ).not.toBeInTheDocument();
  });
});
