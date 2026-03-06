import { renderHook } from '@testing-library/react'
import { useResponsiveMenuBreakpoints } from './useResponsiveMenuBreakpoints'

describe('useResponsiveMenuBreakpoints', () => {
  beforeEach(() => {
    // Reset window.matchMedia mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('returns false for both breakpoints by default', () => {
    const { result } = renderHook(() => useResponsiveMenuBreakpoints())
    
    expect(result.current.isUnder400).toBe(false)
    expect(result.current.isUnder365).toBe(false)
  })

  it('returns true for isUnder400 when viewport is 400px or less', () => {
    const mockMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(max-width: 400px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { result } = renderHook(() => useResponsiveMenuBreakpoints())
    
    expect(result.current.isUnder400).toBe(true)
    expect(result.current.isUnder365).toBe(false)
  })

  it('returns true for isUnder365 when viewport is 365px or less', () => {
    const mockMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: query === '(max-width: 365px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { result } = renderHook(() => useResponsiveMenuBreakpoints())
    
    expect(result.current.isUnder400).toBe(false)
    expect(result.current.isUnder365).toBe(true)
  })

  it('returns true for both when viewport is 365px or less', () => {
    const mockMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: true, // Both queries match at 365px or less
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { result } = renderHook(() => useResponsiveMenuBreakpoints())
    
    expect(result.current.isUnder400).toBe(true)
    expect(result.current.isUnder365).toBe(true)
  })
})
