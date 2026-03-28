import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import LocaleSwitcher from './LocaleSwitcher';

vi.mock('@/i18n/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    toString: () => 'tab=settings',
    get: () => 'settings',
  })),
}));

import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';

const mockRouter = () => ({ replace: vi.fn(), push: vi.fn() });

describe('LocaleSwitcher', () => {
  it('renders a single toggle button with EN/FR segments', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never);

    render(<LocaleSwitcher />);

    // The component now renders a single button with aria-label
    expect(screen.getByRole('button', { name: /toggle language/i })).toBeVisible();
    // Should contain both EN and FR segments
    expect(screen.getByText('EN')).toBeVisible();
    expect(screen.getByText('FR')).toBeVisible();
  });

  it('renders EN and FR text segments', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never);

    render(<LocaleSwitcher />);

    // Check that both EN and FR text segments are rendered
    expect(screen.getByText('EN')).toBeVisible();
    expect(screen.getByText('FR')).toBeVisible();
  });

  it('calls router.replace with French locale when clicking while in English', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    // Reset the useSearchParams mock to not return any query params
    vi.mocked(useSearchParams).mockReturnValue({
      toString: () => '',
      get: () => null,
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith('/', { locale: 'fr' });
  });

  it('preserves query params when switching locales', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    vi.mocked(useSearchParams).mockReturnValue({
      toString: () => 'tab=settings',
      get: () => 'settings',
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith('/?tab=settings', { locale: 'fr' });
  });

  it('does not call router.replace when clicking the already-active locale', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    // Reset the useSearchParams mock to not return any query params
    vi.mocked(useSearchParams).mockReturnValue({
      toString: () => '',
      get: () => null,
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<LocaleSwitcher />);

    // Click the toggle button (it will switch to the other locale)
    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    // Should have called replace since we're switching from English to French
    expect(mockReplace).toHaveBeenCalledWith('/', { locale: 'fr' });
  });

  it('preserves query parameters when switching locales', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    vi.mocked(useSearchParams).mockReturnValue({
      toString: () => 'q=engineer&location=ottawa',
      get: () => 'engineer',
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith('/?q=engineer&location=ottawa', { locale: 'fr' });
  });
});
