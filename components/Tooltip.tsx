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
  appendTo?: HTMLElement | ((reference: Element) => HTMLElement) | 'parent'
  boundary?: BoundaryOption
}

export default function Tooltip({ children, content, className = '', appendTo, boundary }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Instance<Props> | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const contentContainerRef = useRef<HTMLDivElement | null>(null)
  const contentRootRef = useRef<Root | null>(null)

  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
      setTheme(currentTheme)
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    contentContainerRef.current = document.createElement('div')
    contentRootRef.current = createRoot(contentContainerRef.current)
    return () => {
      const rootToUnmount = contentRootRef.current
      if (rootToUnmount) setTimeout(() => rootToUnmount.unmount(), 0)
    }
  }, [])

  useEffect(() => {
    if (contentRootRef.current && content) {
      contentRootRef.current.render(
        typeof content === 'string'
          ? <div className="tippy-custom-content" dangerouslySetInnerHTML={{ __html: content }} />
          : <div className="tippy-custom-content">{content}</div>
      )
    }
  }, [content])

  useEffect(() => {
    if (!ref.current || !content || !contentContainerRef.current) return

    const el = ref.current
    const resolvedAppendTo = appendTo || document.body
    const resolvedBoundary: BoundaryOption = boundary ?? 'viewport'

    const isTouchDevice = 'ontouchstart' in window

    const instance = tippy(el, {
      content: contentContainerRef.current,
      theme,
      placement: 'top',
      arrow: true,
      delay: 0,
      duration: [300, 300],
      maxWidth: 300,
      trigger: isTouchDevice ? 'click' : 'mouseenter focus',
      hideOnClick: isTouchDevice ? 'toggle' : false,
      interactive: true,
      appendTo: resolvedAppendTo,
      popperOptions: {
        strategy: 'fixed',
        modifiers: [
          { name: 'preventOverflow', options: { padding: 8, boundary: resolvedBoundary } },
          { name: 'offset', options: { offset: [0, 8] } },
        ],
      },
      // Add plugins for click-outside behavior on mobile
      plugins: isTouchDevice ? [{
        name: 'hideOnClickOutside',
        defaultValue: true,
        fn(instance) {
          return {
            onCreate() {
              const handleClickOutside = (event: MouseEvent) => {
                if (instance.state.isVisible) {
                  const target = event.target as Node
                  const { reference, popper } = instance
                  
                  // Hide if clicking outside both reference and popper
                  if (!reference.contains(target) && !popper.contains(target)) {
                    instance.hide()
                  }
                  // Also hide if clicking the popper itself (the tooltip bubble)
                  else if (popper.contains(target) && !reference.contains(target)) {
                    instance.hide()
                  }
                }
              }
              
              document.addEventListener('mousedown', handleClickOutside)
              
              return {
                onDestroy() {
                  document.removeEventListener('mousedown', handleClickOutside)
                }
              }
            }
          }
        }
      }] : [],
    })
    instanceRef.current = instance

    // ESC key to close
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && instance.state.isVisible) {
        instance.hide()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      instance.destroy()
      instanceRef.current = null
    }
  }, [content, theme])

  return (
    <div ref={ref} className={`inline-flex cursor-help ${className}`}>
      {children}
    </div>
  )
}
