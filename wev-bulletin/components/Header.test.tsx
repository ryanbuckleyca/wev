import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import { NextIntlClientProvider } from 'next-intl';
import { usePathname } from '@/i18n/navigation';

// Mock next-intl hooks
vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
    useLocale: () => 'en',
  };
});

// Mock i18n navigation
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: any }) => (
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock other components
vi.mock('./UserProfile', () => ({ default: () => <div data-testid="user-profile" /> }));
vi.mock('./ThemeToggle', () => ({ default: () => <div data-testid="theme-toggle" /> }));
vi.mock('./LocaleSwitcher', () => ({ default: () => <div data-testid="locale-switcher" /> }));

describe('Header', () => {
  const messages = {
    home: {
      heading: 'WEV Bulletin',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderHeader = (props = {}) => {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Header {...props} />
      </NextIntlClientProvider>
    );
  };

  it('is initially hidden on home page', () => {
    // Mock pathname as home page
    vi.mocked(usePathname).mockReturnValue('/');

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-0');
  });

  it('is visible on non-home pages', () => {
    // Mock pathname as non-home page
    vi.mocked(usePathname).mockReturnValue('/profile');

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-100');
  });

  it('becomes visible when scrolling past the main logo', async () => {
    vi.mocked(usePathname).mockReturnValue('/');

    // Create a mock main-logo element
    const mainLogo = document.createElement('div');
    mainLogo.className = 'main-logo';
    document.body.appendChild(mainLogo);

    // Mock getBoundingClientRect for the logo
    // Initially visible (bottom > 0)
    mainLogo.getBoundingClientRect = vi.fn(() => ({
      bottom: 100,
    } as DOMRect));

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-0');

    // Scroll down so logo is past (bottom < 0)
    mainLogo.getBoundingClientRect = vi.fn(() => ({
      bottom: -10,
    } as DOMRect));

    // Trigger scroll
    fireEvent.scroll(window);

    // Header should be visible now
    expect(logoContainer).toHaveClass('opacity-100');

    document.body.removeChild(mainLogo);
  });
});
