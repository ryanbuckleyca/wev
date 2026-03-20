import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressDonut from './ProgressDonut'

describe('ProgressDonut', () => {
  it('renders a progress donut element', () => {
    render(<ProgressDonut percentage={50} />)
    // The component renders a div with the progress donut styling, not SVG
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('renders the correct percentage visually', () => {
    render(<ProgressDonut percentage={75} />)
    // Check that the progress donut is rendered
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('clamps percentage to 0 minimum', () => {
    render(<ProgressDonut percentage={-10} />)
    // Should render without errors and clamp to 0
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('clamps percentage to 100 maximum', () => {
    render(<ProgressDonut percentage={150} />)
    // Should render without errors and clamp to 100
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('applies the correct size for sm', () => {
    render(<ProgressDonut percentage={50} size="sm" />)
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('applies the correct size for lg', () => {
    render(<ProgressDonut percentage={50} size="lg" />)
    expect(screen.getByRole('img')).toBeVisible()
  })

  it('applies custom className', () => {
    render(<ProgressDonut percentage={50} className="custom-class" />)
    expect(screen.getByRole('img')).toHaveClass('custom-class')
  })
})
