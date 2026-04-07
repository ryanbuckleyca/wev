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

import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';

const mockRouter = () => ({ replace: vi.fn(), push: vi.fn() });

function mockSearchParams(queryString = '') {
  vi.mocked(useSearchParams).mockReturnValue({
    toString: () => queryString,
  } as unknown as ReturnType<typeof useSearchParams>);
}

describe('LocaleSwitcher', () => {
  it('renders a single toggle button with EN/FR segments', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never);
    mockSearchParams();

    render(<LocaleSwitcher />);

    expect(screen.getByRole('button', { name: /toggle language/i })).toBeVisible();
    expect(screen.getByText('EN')).toBeVisible();
    expect(screen.getByText('FR')).toBeVisible();
  });

  it('calls router.replace with French locale when clicking while in English', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    mockSearchParams();

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith('/', { locale: 'fr' });
  });

  it('preserves query params when switching locales', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    mockSearchParams('tab=settings');

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith('/?tab=settings', { locale: 'fr' });
  });

  it('preserves repeated query params without collapsing them into an object', async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never);
    vi.mocked(usePathname).mockReturnValue('/jobs');
    mockSearchParams('source=WEV%20Opportunities&source=Community%20Impact%20Jobs&page=2');

    render(<LocaleSwitcher />);

    const button = screen.getByRole('button', { name: /toggle language/i });
    await user.click(button);

    expect(mockReplace).toHaveBeenCalledWith(
      '/jobs?source=WEV%20Opportunities&source=Community%20Impact%20Jobs&page=2',
      { locale: 'fr' },
    );
  });
});
