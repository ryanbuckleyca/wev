import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderWithLocale } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import LocaleSwitcher from './LocaleSwitcher'

vi.mock('@/i18n/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

import { useRouter } from '@/i18n/navigation'

const mockRouter = () => ({ replace: vi.fn(), push: vi.fn() })

describe('LocaleSwitcher', () => {
  it('renders EN and FR toggle buttons', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never)

    render(<LocaleSwitcher />)

    expect(screen.getByRole('button', { name: /Switch to English/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /Switch to French|Passer au/i })).toBeVisible()
  })

  it('marks the EN button as pressed when the current locale is English', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never)

    render(<LocaleSwitcher />)

    const enButton = screen.getByRole('button', { name: /Switch to English/i })
    const frButton = screen.getByRole('button', { name: /Switch to French|Passer au/i })
    expect(enButton).toHaveAttribute('aria-pressed', 'true')
    expect(frButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the FR button as pressed when the current locale is French', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never)

    renderWithLocale(<LocaleSwitcher />, 'fr')

    const enButton = screen.getByRole('button', { name: /Switch to English|Passer à/i })
    const frButton = screen.getByRole('button', { name: /Passer au français|Switch to French/i })
    expect(enButton).toHaveAttribute('aria-pressed', 'false')
    expect(frButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('aria-labels are always in the target language regardless of current locale', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter() as never)

    // When on the French site, aria-labels should show the locale-specific translations
    renderWithLocale(<LocaleSwitcher />, 'fr')
    expect(screen.getByRole('button', { name: /Switch to English|Passer à/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /Passer au français|Switch to French/i })).toBeVisible()
  })

  it('calls router.replace with the French locale when clicking FR', async () => {
    const user = userEvent.setup()
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never)

    render(<LocaleSwitcher />)

    const frButton = screen.getByRole('button', { name: /Switch to French|Passer au/i })
    await user.click(frButton)

    expect(mockReplace).toHaveBeenCalledWith('/', { locale: 'fr' })
  })

  it('does not call router.replace when clicking the already-active locale', async () => {
    const user = userEvent.setup()
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never)

    render(<LocaleSwitcher />)

    const enButton = screen.getByRole('button', { name: /Switch to English/i })
    await user.click(enButton)

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('preserves query parameters when switching locales', async () => {
    const user = userEvent.setup()
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn() } as never)

    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('q=engineer&location=ottawa') as never)

    render(<LocaleSwitcher />)

    const frButton = screen.getByRole('button', { name: /Switch to French|Passer au/i })
    await user.click(frButton)

    expect(mockReplace).toHaveBeenCalledWith('/?q=engineer&location=ottawa', { locale: 'fr' })
  })
})
