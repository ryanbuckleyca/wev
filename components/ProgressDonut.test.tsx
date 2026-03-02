import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ProgressDonut from './ProgressDonut'

describe('ProgressDonut', () => {
  it('renders an SVG element', () => {
    const { container } = render(<ProgressDonut percentage={50} />)
    expect(container.querySelector('svg')).toBeVisible()
  })

  it('renders two circles (background + progress)', () => {
    const { container } = render(<ProgressDonut percentage={75} />)
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(2)
  })

  it('clamps percentage to 0 minimum', () => {
    const { container } = render(<ProgressDonut percentage={-10} />)
    // The progress circle should have full dashoffset (no fill)
    const progressCircle = container.querySelectorAll('circle')[1]
    const dashoffset = parseFloat(progressCircle.getAttribute('stroke-dashoffset') || '0')
    const dasharray = parseFloat(progressCircle.getAttribute('stroke-dasharray') || '0')
    // At 0%, dashoffset should equal dasharray (full offset = no visible arc)
    expect(dashoffset).toBeCloseTo(dasharray, 1)
  })

  it('clamps percentage to 100 maximum', () => {
    const { container } = render(<ProgressDonut percentage={150} />)
    const progressCircle = container.querySelectorAll('circle')[1]
    const dashoffset = parseFloat(progressCircle.getAttribute('stroke-dashoffset') || '0')
    // At 100%, dashoffset should be 0 (full arc visible)
    expect(dashoffset).toBeCloseTo(0, 1)
  })

  it('applies the correct size for sm', () => {
    const { container } = render(<ProgressDonut percentage={50} size="sm" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
  })

  it('applies the correct size for lg', () => {
    const { container } = render(<ProgressDonut percentage={50} size="lg" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
  })

  it('applies custom className', () => {
    const { container } = render(<ProgressDonut percentage={50} className="my-donut" />)
    expect(container.firstElementChild!.className).toContain('my-donut')
  })
})
