import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from './Button'

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeVisible()
  })

  it('defaults to type="button"', () => {
    render(<Button>OK</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('accepts type="submit"', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Go</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Nope</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when loading is true', () => {
    render(<Button loading>Save</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Loading...')
  })

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button disabled onClick={handleClick}>Go</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('applies variant classes', () => {
    const { rerender } = render(<Button variant="primary">P</Button>)
    expect(screen.getByRole('button').className).toContain('bg-[var(--primary)]')

    rerender(<Button variant="outline">O</Button>)
    expect(screen.getByRole('button').className).toContain('border')
  })

  it('applies size classes', () => {
    render(<Button size="lg">Big</Button>)
    expect(screen.getByRole('button').className).toContain('py-3')
  })

  it('applies fullWidth class when true', () => {
    render(<Button fullWidth>Wide</Button>)
    expect(screen.getByRole('button').className).toContain('w-full')
  })
})
