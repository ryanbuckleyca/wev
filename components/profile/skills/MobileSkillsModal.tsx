import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { X } from 'lucide-react'
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
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 600
  )

  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const selectedUris = new Set(selected.map(s => s.uri))

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const handler = () => setViewportHeight(viewport.height)
    viewport.addEventListener("resize", handler)
    return () => viewport.removeEventListener("resize", handler)
  }, [])

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      
      inputRef.current?.focus()
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div 
      style={{ height: viewportHeight }} 
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-zinc-950"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-white dark:bg-zinc-900 dark:border-zinc-800">
        <button 
          onClick={onClose}
          className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          aria-label={t('skillsBack')}
        >
          <X className="h-5 w-5" />
        </button>
        <SkillSearchInput
          query={query}
          onQueryChange={onQueryChange}
          isSearching={isSearching}
          inputRef={inputRef}
          onClear={onClearQuery}
          placeholder={t('skillsPlaceholderShort')}
        />
        <button 
          onClick={onClose} 
          className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" 
          style={{ color: 'var(--info-solid)' }}
        >
          {t('skillsDone')}
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
        <div className="px-4 pt-3 pb-2">
          <Alert variant="warning">
            {t('skillsSoftLimitWarning', { count: selected.length })}
          </Alert>
        </div>
      )}
      
      {/* Selected Pills */}
      {selected.length > 0 && (
        <div className="px-3 pt-2">
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
