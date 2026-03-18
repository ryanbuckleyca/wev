import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@/test-utils'
import ForgotPasswordPage from './page'
import { createClient } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/TurnstileWidget', () => ({
  default: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess('turnstile-token')}>
      Complete CAPTCHA
    </button>
  ),
}))

const mockResetPasswordForEmail = vi.fn()

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    vi.mocked(createClient).mockReturnValue({
      auth: {
        resetPasswordForEmail: mockResetPasswordForEmail,
      },
    } as never)
  })

  it('shows the shared check email state after requesting a reset link', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.click(screen.getByRole('button', { name: /complete captcha/i }))
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          redirectTo: expect.any(String),
          captchaToken: 'turnstile-token',
        })
      )
    })

    expect(screen.getByRole('heading', { name: /check your email/i })).toBeVisible()
    expect(screen.getByText(/we sent you an email with a link/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /try again in 30s/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: /log in/i })).toBeVisible()
  })
})
