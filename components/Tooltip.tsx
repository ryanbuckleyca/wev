'use client'

import { useEffect, useRef, useState } from 'react'
import { createRoot, Root } from 'react-dom/client'
import tippy, { Instance, Props } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light.css'

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
}

export default function Tooltip({ children, content, className = '' }: TooltipProps) {
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

  useEffect(() => {
    if (!contentContainerRef.current) {
      contentContainerRef.current = document.createElement('div')
      contentRootRef.current = createRoot(contentContainerRef.current)
    }
    if (contentRootRef.current) {
      contentRootRef.current.render(<div className="tippy-custom-content">{content}</div>)
    }
  }, [content])

  useEffect(() => {
    if (!ref.current || !content || !contentContainerRef.current) {
      return
    }

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

    return () => {
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [content, theme])

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy()
      contentRootRef.current?.unmount()
    }
  }, [])

  return (
    <div ref={ref} className={`inline-flex cursor-help ${className}`}>
      {children}
    </div>
  )
}
