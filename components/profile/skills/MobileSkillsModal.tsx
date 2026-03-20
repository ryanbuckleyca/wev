import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Alert from '@/components/ui/Alert'
import SkillSearchInput from './SkillSearchInput'
import SelectedSkillsPills from './SelectedSkillsPills'
import SkillsList from './SkillsList'
import { useSkillsFiltering } from './useSkillsFiltering'
import type { EscoSkill } from '../SkillsSelector'

interface MobileSkillsModalProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  selected: EscoSkill[]
  onRemove: (uri: string) => void
  onToggle: (skill: EscoSkill) => void
  skills: EscoSkill[]
  allItems: EscoSkill[]
  isSearching: boolean
  locale: 'en' | 'fr'
  isLibraryMode: boolean
}

export default function MobileSkillsModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  onClearQuery,
  selected,
  onRemove,
  onToggle,
  skills,
  allItems,
  isSearching,
  locale,
  isLibraryMode,
}: MobileSkillsModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const [maxHeight] = useState(() => {
    if (typeof window === "undefined") return 600
    // Get the maximum available viewport height when modal opens
    // This accounts for browser chrome automatically
    return window.visualViewport?.height ?? window.innerHeight
  })
  const [viewportHeight, setViewportHeight] = useState(maxHeight)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const selectedUris = new Set(selected.map(s => s.uri))

  useEffect(() => {
    const updateHeight = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight
      const keyboardIsOpen = visualHeight < maxHeight * 0.75
      
      if (keyboardIsOpen) {
        setViewportHeight(visualHeight)
        setIsKeyboardOpen(true)
      } else {
        setViewportHeight(maxHeight)
        setIsKeyboardOpen(false)
      }
    }
    
    updateHeight()
    
    if (window.visualViewport) {
      const viewport = window.visualViewport
      viewport.addEventListener("resize", updateHeight)
      viewport.addEventListener("scroll", updateHeight)
      
      return () => {
        viewport.removeEventListener("resize", updateHeight)
        viewport.removeEventListener("scroll", updateHeight)
      }
    } else {
      window.addEventListener("resize", updateHeight)
      return () => window.removeEventListener("resize", updateHeight)
    }
  }, [maxHeight])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const handleFocus = () => {
      setTimeout(() => {
        const visualHeight = window.visualViewport?.height ?? window.innerHeight
        setViewportHeight(visualHeight)
        setIsKeyboardOpen(true)
      }, 100)
    }

    const handleBlur = () => {
      setTimeout(() => {
        setViewportHeight(maxHeight)
        setIsKeyboardOpen(false)
      }, 100)
    }

    input.addEventListener('focus', handleFocus)
    input.addEventListener('blur', handleBlur)

    return () => {
      input.removeEventListener('focus', handleFocus)
      input.removeEventListener('blur', handleBlur)
    }
  }, [maxHeight])

  useEffect(() => {
    if (isOpen) {
      // Scroll to top to hide address bar and get true viewport height
      window.scrollTo(0, 0)
      
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      
      // After scroll, update to true max height
      setTimeout(() => {
        const trueMaxHeight = window.visualViewport?.height ?? window.innerHeight
        setViewportHeight(trueMaxHeight)
      }, 50)
      
      inputRef.current?.focus()
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        document.documentElement.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div 
      style={{ 
        height: `${viewportHeight}px`,
        width: '100vw',
        maxWidth: '100%',
        position: 'fixed',
        left: 0,
        top: 0
      }} 
      className="z-[9999] flex flex-col bg-white dark:bg-zinc-950 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-white dark:bg-zinc-900 dark:border-zinc-800 shrink-0">
        <button 
          onClick={onClose}
          className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          aria-label={t('skillsBack')}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <SkillSearchInput
            query={query}
            onQueryChange={onQueryChange}
            isSearching={isSearching}
            inputRef={inputRef}
            onClear={onClearQuery}
            placeholder={t('skillsPlaceholderShort')}
          />
        </div>
        <button 
          onClick={onClose} 
          className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" 
          style={{ color: 'var(--info-solid)' }}
        >
          <span className="hidden xs:inline">{t('skillsDone')}</span>
          <span className="xs:hidden">Done</span>
          {selected.length > 0 && (
            <span 
              className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" 
              style={{ backgroundColor: 'var(--info-solid)' }}
            >
              {selected.length}
            </span>
          )}
        </button>
      </div>

      {/* Warning */}
      {selected.length > 15 && (
        <div className="px-4 pt-3 pb-2 shrink-0">
          <Alert variant="warning">
            {t('skillsSoftLimitWarning', { count: selected.length })}
          </Alert>
        </div>
      )}
      
      {/* Selected Pills */}
      {selected.length > 0 && (
        <div className="px-3 pt-2 shrink-0">
          <SelectedSkillsPills
            skills={selected}
            onRemove={onRemove}
            locale={locale}
            useHorizontalScroll={!!query}
            fadeBackground="white"
          />
        </div>
      )}
      
      {/* Skills List */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-2">
          <SkillsList
            skills={filteredSkills}
            selectedUris={selectedUris}
            onToggle={onToggle}
            locale={locale}
            isSearching={isSearching}
            hasQuery={!!query}
          />
        </div>
      </div>
    </div>
  )
}
