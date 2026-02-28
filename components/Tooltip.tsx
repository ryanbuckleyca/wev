'use client'

import { useEffect, useRef, useState } from 'react'
import tippy, { Instance, Props } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light.css'

interface TooltipProps {
  children: React.ReactNode
  content: string
  className?: string
}

export default function Tooltip({ children, content, className = '' }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Instance<Props> | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

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

  useEffect(() => {
    if (ref.current && content) {
      instanceRef.current = tippy(ref.current, {
        content: `<div class="tippy-custom-content">${content}</div>`,
        allowHTML: true,
        theme: theme,
        placement: 'top',
        arrow: true,
        delay: 0,
        duration: [300, 300],
        maxWidth: 300,
        touch: ['hold', 500],
        hideOnClick: false,
        popperOptions: {
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                padding: 8,
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
    }

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy()
      }
    }
  }, [content, theme])

  return (
    <div ref={ref} className={`inline-flex cursor-help ${className}`}>
      {children}
    </div>
  )
}
