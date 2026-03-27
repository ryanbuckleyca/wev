import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SkillSearchInput from './SkillSearchInput'
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
  onToggle,
  skills,
  allItems,
  isSearching,
  locale,
  isLibraryMode,
}: MobileSkillsModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const [maxHeight] = useState(() =>
    typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight)
  )
  const [viewportHeight, setViewportHeight] = useState(maxHeight)

  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const selectedUris = new Set(selected.map((s) => s.uri))

  useEffect(() => {
    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      setViewportHeight(h < maxHeight * 0.75 ? h : maxHeight)
    }
    update()
    const vp = window.visualViewport
    if (vp) {
      vp.addEventListener('resize', update)
      vp.addEventListener('scroll', update)
      return () => { vp.removeEventListener('resize', update); vp.removeEventListener('scroll', update) }
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [maxHeight])

  useEffect(() => {
    if (!isOpen) return
    window.scrollTo(0, 0)
    const scrollY = window.scrollY
    document.body.style.cssText = `position:fixed;top:-${scrollY}px;width:100%;overflow:hidden`
    document.documentElement.style.overflow = 'hidden'
    setTimeout(() => setViewportHeight(window.visualViewport?.height ?? window.innerHeight), 50)
    inputRef.current?.focus()
    return () => {
      document.body.style.cssText = ''
      document.documentElement.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      style={{ height: `${viewportHeight}px`, width: '100vw', maxWidth: '100%', position: 'fixed', left: 0, top: 0 }}
      className="z-[9999] flex flex-col bg-white dark:bg-zinc-950 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-white dark:bg-zinc-900 dark:border-zinc-800 shrink-0">
        <button onClick={onClose} className="shrink-0 text-gray-600 dark:text-gray-400" aria-label={t('skillsBack')}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <SkillSearchInput query={query} onQueryChange={onQueryChange} isSearching={isSearching} inputRef={inputRef} onClear={onClearQuery} placeholder={t('skillsPlaceholderShort')} />
        </div>
        <button onClick={onClose} className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: 'var(--info-solid)' }}>
          {t('skillsDone')}
          {selected.length > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--info-solid)' }}>
              {selected.length}
            </span>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-2">
          <SkillsList skills={filteredSkills} selectedUris={selectedUris} onToggle={onToggle} locale={locale} isSearching={isSearching} hasQuery={!!query} />
        </div>
      </div>
    </div>
  )
}
