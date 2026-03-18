import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@/test-utils'
import SignupPage from './page'
import { createClient } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string
    children: ReactNode
    prefetch?: boolean
  }) => (
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

vi.mock('@/hooks/usePasswordStrength', () => ({
  usePasswordStrength: () => ({
    score: 3,
    label: 'Good',
    color: 'var(--success-solid)',
    isAcceptable: true,
    feedback: '',
  }),
}))

const mockSignUp = vi.fn()

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignUp.mockResolvedValue({ error: null })
    vi.mocked(createClient).mockReturnValue({
      auth: {
        signUp: mockSignUp,
        resend: vi.fn(),
      },
    } as never)
  })

  it('shows the inline success state after signup', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('•••••••••••'), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /complete captcha/i }))
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'StrongPass123!',
        options: expect.objectContaining({
          emailRedirectTo: expect.any(String),
          captchaToken: 'turnstile-token',
        }),
      })
    })

    expect(screen.getByRole('heading', { name: /check your email/i })).toBeVisible()
    expect(screen.getByText(/we sent you an email with a link/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument()
  })
})
