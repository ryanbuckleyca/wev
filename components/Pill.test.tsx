import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pill from './Pill'

describe('Pill', () => {
  it('renders children text', () => {
    render(<Pill>Community</Pill>)
    expect(screen.getByText('Community')).toBeVisible()
  })

  it('does not show a remove button by default', () => {
    render(<Pill>Tag</Pill>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a remove button when removable is true', () => {
    render(<Pill removable onRemove={() => undefined}>Tag</Pill>)
    expect(screen.getByRole('button', { name: /remove/i })).toBeVisible()
  })

  it('calls onRemove when the remove button is clicked', async () => {
    const user = userEvent.setup()
    const handleRemove = vi.fn()
    render(<Pill removable onRemove={handleRemove}>Tag</Pill>)

    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(handleRemove).toHaveBeenCalledOnce()
  })

  it('applies primary variant classes', () => {
    render(<Pill variant="primary">Val</Pill>)
    expect(screen.getByText('Val').className).toContain('bg-[var(--primary)]')
  })

  it('applies secondary variant classes', () => {
    render(<Pill variant="secondary">Val</Pill>)
    expect(screen.getByText('Val').className).toContain('bg-[var(--primary-tint)]')
  })

  it('applies sm size classes', () => {
    render(<Pill size="sm">Small</Pill>)
    expect(screen.getByText('Small').className).toContain('text-xs')
  })

  it('applies custom className', () => {
    render(<Pill className="my-custom">X</Pill>)
    expect(screen.getByText('X').className).toContain('my-custom')
  })
})
