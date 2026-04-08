import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthCodeErrorPage from './page';

const { mockHeadersGet } = vi.hoisted(() => ({
  mockHeadersGet: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: mockHeadersGet,
  })),
}));

describe('AuthCodeErrorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links to English login when Accept-Language prefers English', async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === 'accept-language' ? 'en-US,en;q=0.9' : null,
    );

    const ui = await AuthCodeErrorPage();
    render(ui);

    expect(screen.getByRole('heading', { name: /authentication error/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/en/login');
  });

  it('links to French login when Accept-Language prefers French', async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === 'accept-language' ? 'fr-FR,fr;q=0.9,en;q=0.5' : null,
    );

    const ui = await AuthCodeErrorPage();
    render(ui);

    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/fr/login');
  });
});
