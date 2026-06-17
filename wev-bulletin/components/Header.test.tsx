import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import Header from './Header';
import { NextIntlClientProvider } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { UnsavedChangesProvider, useUnsavedChanges } from '@/contexts/UnsavedChangesContext';

vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
    useLocale: () => 'en',
  };
});

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: any;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

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
    vi.unstubAllGlobals();
  });

  const renderHeader = (props = {}) => {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Header {...props} />
      </NextIntlClientProvider>,
    );
  };

  it('is initially hidden on home page', () => {
    vi.mocked(usePathname).mockReturnValue('/');

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-0');
  });

  it('is visible on non-home pages', () => {
    vi.mocked(usePathname).mockReturnValue('/profile');

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-100');
  });

  it('becomes visible when scrolling past the main logo', async () => {
    vi.mocked(usePathname).mockReturnValue('/');

    const mainLogo = document.createElement('div');
    mainLogo.className = 'main-logo';
    document.body.appendChild(mainLogo);

    mainLogo.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 100,
        }) as DOMRect,
    );

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-0');

    mainLogo.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: -10,
        }) as DOMRect,
    );

    fireEvent.scroll(window);

    expect(logoContainer).toHaveClass('opacity-100');

    document.body.removeChild(mainLogo);
  });

  it('becomes visible when scrolling down even if the main logo is not found', async () => {
    vi.mocked(usePathname).mockReturnValue('/');

    const mainLogo = document.querySelector('.main-logo');
    if (mainLogo) mainLogo.remove();

    renderHeader();

    const logoContainer = screen.getByLabelText('heading').parentElement;
    expect(logoContainer).toHaveClass('opacity-0');

    Object.defineProperty(window, 'scrollY', { value: 150, writable: true });

    fireEvent.scroll(window);

    expect(logoContainer).toHaveClass('opacity-100');

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('blocks logo navigation when there are unsaved changes', async () => {
    vi.mocked(usePathname).mockReturnValue('/profile');
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);

    function MarkDirty() {
      const { setHasUnsavedChanges } = useUnsavedChanges();
      useEffect(() => {
        setHasUnsavedChanges(true);
      }, [setHasUnsavedChanges]);
      return null;
    }

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <UnsavedChangesProvider>
          <MarkDirty />
          <Header />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('heading').parentElement).toHaveClass('opacity-100');
    });

    const clickEvent = new MouseEvent('click', { bubbles: true, button: 0, cancelable: true });
    expect(screen.getByLabelText('heading').dispatchEvent(clickEvent)).toBe(false);
    expect(confirmMock).toHaveBeenCalledWith('profile.unsavedChangesPrompt');
  });
});
