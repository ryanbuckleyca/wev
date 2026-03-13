'use client'

import { useEffect, useRef, useState } from 'react'
import { createRoot, Root } from 'react-dom/client'
import tippy, { Instance, Props } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light.css'

type BoundaryOption = HTMLElement | 'viewport' | 'clippingParents' | 'scrollParent'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
  appendTo?: HTMLElement | ((reference: Element) => HTMLElement | null) | 'parent'
  boundary?: BoundaryOption
}

export default function Tooltip({ children, content, className = '', appendTo, boundary }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Instance<Props> | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const contentContainerRef = useRef<HTMLDivElement | null>(null)
  const contentRootRef = useRef<Root | null>(null)

  // Listen for theme changes
  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
      setTheme(currentTheme)
    }

    // Initial theme
    updateTheme()

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  // Create content container and root once on mount
  useEffect(() => {
    contentContainerRef.current = document.createElement('div')
    contentRootRef.current = createRoot(contentContainerRef.current)

    return () => {
      // Cleanup on unmount
      const rootToUnmount = contentRootRef.current
      if (rootToUnmount) {
        setTimeout(() => {
          rootToUnmount.unmount()
        }, 0)
      }
    }
  }, [])

  // Update content when it changes
  useEffect(() => {
    if (contentRootRef.current && content) {
      contentRootRef.current.render(
        typeof content === 'string'
          ? <div className="tippy-custom-content" dangerouslySetInnerHTML={{ __html: content }} />
          : <div className="tippy-custom-content">{content}</div>
      )
    }
  }, [content])

  // Create/update tippy instance
  useEffect(() => {
    if (!ref.current || !content || !contentContainerRef.current) {
      return
    }

    const resolvedAppendTo: Props['appendTo'] = appendTo === 'parent'
      ? 'parent'
      : typeof appendTo === 'function'
        ? (reference) => appendTo(reference) ?? document.body
        : appendTo
          ? appendTo
          : () => document.body

    const resolvedBoundary: BoundaryOption = boundary ?? 'viewport'

    instanceRef.current = tippy(ref.current, {
      content: contentContainerRef.current,
      theme: theme,
      placement: 'top',
      arrow: true,
      delay: 0,
      duration: [300, 300],
      maxWidth: 300,
      touch: ['hold', 500],
      hideOnClick: false,
      appendTo: resolvedAppendTo,
      popperOptions: {
        strategy: 'fixed',
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              padding: 8,
              boundary: resolvedBoundary,
            },
          },
          {
            name: 'offset',
            options: {
              offset: [0, 8],
            },
          },
        ],
      },
    })

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy()
        instanceRef.current = null
      }
    }
  }, [content, theme])

  return (
    <div ref={ref} className={`inline-flex cursor-help ${className}`}>
      {children}
    </div>
  )
}
