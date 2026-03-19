import { useState, useRef, useCallback, useEffect } from 'react'
import { Command } from 'cmdk'
import { Search, X, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useTouchDevice } from '@/hooks/useTouchDevice'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import InfoPopover from '@/components/InfoPopover'
import Pill from '@/components/Pill'
import { Checkbox } from '@/components/ui/Checkbox'
import Alert from '@/components/ui/Alert'

export interface EscoSkill {
  uri: string
  preferredLabel: { en: string; fr: string }
  description?: { en: string | null; fr: string | null }
  skillType: 'skill' | 'knowledge' | null
  reuseLevel: 'transversal' | 'cross-sector' | 'sector-specific' | 'occupation-specific' | null
  matchedAlias?: string | null
  aliases?: string[]
}

interface SkillsSelectorProps {
  skills: EscoSkill[]
  selected: EscoSkill[]
  onSelect: (skill: EscoSkill) => void
  onRemove: (uri: string) => void
  onSearch: (query: string) => void
  locale: 'en' | 'fr'
  isSearching?: boolean
  allItems?: EscoSkill[]
}

const SKILL_TYPE_COLOURS: Record<string, string> = {
  skill: 'bg-green-50 text-green-700 border-green-200',
  knowledge: 'bg-yellow-50 text-yellow-800 border-yellow-200',
}

const REUSE_LEVEL_COLOURS: Record<string, string> = {
  transversal: 'bg-green-50 text-green-700 border-green-200',
  'cross-sector': 'bg-blue-50 text-blue-700 border-blue-200',
  'sector-specific': 'bg-purple-50 text-purple-700 border-purple-200',
  'occupation-specific': 'bg-orange-50 text-orange-700 border-orange-200',
}

function formatEnumLabel(value: string | null | undefined): string {
  const clean = (value ?? '').trim()
  if (!clean) return ''
  return clean
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function SkillsSelector({
  skills,
  selected,
  onSelect,
  onRemove,
  onSearch,
  locale,
  isSearching = false,
  allItems = [],
}: SkillsSelectorProps) {
  const isTouch = useTouchDevice()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const selectedSet = new Set(selected.map((s) => s.uri))
  
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 600
  )

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handler = () => setViewportHeight(viewport.height);
    viewport.addEventListener("resize", handler);
    return () => viewport.removeEventListener("resize", handler);
  }, []);

  const isLibraryMode = allItems && allItems.length > 0

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (!isLibraryMode) {
        onSearch(value)
      }
    },
    [onSearch, isLibraryMode]
  )

  const handleToggle = (skill: EscoSkill) => {
    if (selectedSet.has(skill.uri)) {
      onRemove(skill.uri)
    } else {
      onSelect(skill)
    }
  }

  const handleDone = () => {
    setQuery('')
    onSearch('')
    setMobileOpen(false)
  }

  useEffect(() => {
    if (mobileOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = '0'
      document.body.style.left = '0'
      document.body.style.right = '0'
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`
      }
      const t = setTimeout(() => mobileInputRef.current?.focus(), 50)
      return () => {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.paddingRight = ''
        clearTimeout(t)
      }
    }
  }, [mobileOpen])

  return (
    <Command shouldFilter={false} className="bg-transparent h-auto overflow-visible">
      {!isTouch ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 transition-all focus-within:border-gray-200 focus-within:ring-2 focus-within:ring-gray-100/50 dark:bg-zinc-900/50 dark:border-zinc-800 dark:focus-within:border-zinc-700 dark:focus-within:ring-zinc-800/50">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <Command.Input
              ref={desktopInputRef}
              value={query}
              onValueChange={handleQueryChange}
              placeholder={locale === 'fr' ? 'Rechercher des compétences…' : 'Search skills...'}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-gray-400"
            />
            {isSearching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            {query && !isSearching && (
              <button 
                onClick={() => { setQuery(''); onSearch(''); desktopInputRef.current?.focus() }} 
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {selected.length > 0 && (
            query ? (
              <HorizontalScrollWithFades 
                containerClassName="shrink-0 border-b border-gray-100 md:border-0 pb-1 md:pb-0 pt-1"
                className="px-4 md:px-0 pb-3 pt-1"
                fadeBackground={isTouch && mobileOpen ? 'white' : 'var(--card)'}
              >
                {selected.map((skill) => (
                  <InfoPopover 
                    key={skill.uri} 
                    content={skill.description?.[locale] || skill.preferredLabel[locale]}
                    className="shrink-0"
                  >
                    <Pill
                      size="sm"
                      onRemove={() => onRemove(skill.uri)}
                      className="md:py-1 px-3"
                    >
                      {skill.preferredLabel[locale]}
                    </Pill>
                  </InfoPopover>
                ))}
              </HorizontalScrollWithFades>
            ) : (
              <div className="flex flex-wrap gap-2 pb-3 pt-1">
                {selected.map((skill) => (
                  <InfoPopover 
                    key={skill.uri} 
                    content={skill.description?.[locale] || skill.preferredLabel[locale]}
                  >
                    <Pill
                      size="sm"
                      onRemove={() => onRemove(skill.uri)}
                      className="md:py-1 px-3"
                    >
                      {skill.preferredLabel[locale]}
                    </Pill>
                  </InfoPopover>
                ))}
              </div>
            )
          )}

          <div className="-mx-2 px-2">
            {!query ? (
              <div className="py-8 text-center text-sm text-gray-400">
                {locale === 'fr' 
                  ? 'Tapez pour rechercher parmi 13 485 compétences ESCO' 
                  : 'Type to search 13,485 ESCO skills'}
              </div>
            ) : (() => {
              const lowerQuery = query.toLowerCase()
              const displayResults = isLibraryMode 
                ? allItems
                    .map(skill => {
                      const label = skill.preferredLabel[locale] || ''
                      const lowerLabel = label.toLowerCase()
                      
                      let score = -1
                      let foundAlias: string | undefined

                      if (lowerLabel.startsWith(lowerQuery)) {
                        score = 2 // Highest priority: starts with query
                      } else if (lowerLabel.includes(lowerQuery)) {
                        score = 1 // High priority: contains query
                      } else {
                        foundAlias = skill.aliases?.find(a => a.toLowerCase().includes(lowerQuery))
                        if (foundAlias) score = 0 // Lower priority: alias match
                      }
                      
                      if (score === -1) return null
                      return { 
                        ...skill, 
                        label, 
                        internalMatchedAlias: foundAlias,
                        _score: score
                      }
                    })
                    .filter((s): s is NonNullable<typeof s> => s !== null)
                    .sort((a, b) => b._score - a._score)
                    .slice(0, 100)
                : skills.map(skill => ({ 
                    ...skill, 
                    label: skill.preferredLabel[locale] || '',
                    internalMatchedAlias: skill.matchedAlias 
                  }))

              return (
                <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden scroll-smooth pb-4">
                  {displayResults.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      {isSearching 
                        ? (locale === 'fr' ? 'Recherche en cours...' : 'Searching...')
                        : (locale === 'fr' ? 'Aucune compétence trouvée.' : 'No skills found.')
                      }
                    </div>
                  )}

                  {displayResults.map((skill) => {
                    const isSelected = selectedSet.has(skill.uri)
                    const searchValue = isLibraryMode 
                      ? `${skill.label} ${(skill.aliases || []).join(' ')}`.toLowerCase()
                      : skill.uri

                    return (
                      <Command.Item
                        key={skill.uri}
                        value={searchValue}
                        onSelect={() => handleToggle(skill)}
                        className="flex cursor-pointer items-start gap-4 border-b border-gray-50 px-4 md:px-2 py-3.5 text-left transition-colors aria-selected:bg-gray-50 hover:bg-gray-50 dark:border-zinc-800/50 dark:aria-selected:bg-zinc-900/50 dark:hover:bg-zinc-900/50"
                      >
                        <Checkbox 
                          checked={isSelected}
                          readOnly
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-bold ${isSelected ? 'text-gray-900 dark:text-zinc-100' : 'text-gray-900 dark:text-zinc-100'}`}>
                            {skill.label}
                          </p>
                          {skill.description?.[locale] && (
                            <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 line-clamp-2">
                              {skill.description[locale]}
                            </p>
                          )}
                          {skill.internalMatchedAlias && (
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 inline-block px-2 py-0.5 rounded-md">
                              {locale === 'fr' ? 'Correspondance : ' : 'Matches: '} 
                              &quot;{skill.internalMatchedAlias}&quot;
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {skill.skillType && (
                              <Badge variant="outline" className={`text-[10px] ${SKILL_TYPE_COLOURS[skill.skillType] || ''}`}>
                                {formatEnumLabel(skill.skillType)}
                              </Badge>
                            )}
                            {skill.reuseLevel && (
                              <Badge variant="outline" className={`text-[10px] ${REUSE_LEVEL_COLOURS[skill.reuseLevel] || ''}`}>
                                {formatEnumLabel(skill.reuseLevel)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Command.Item>
                    )
                  })}
                </Command.List>
              )
            })()}
          </div>
        </div>
      ) : (
        <div>
          {/* Mobile search trigger - looks like search input but opens modal */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700 mb-3"
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400">
              {locale === 'fr' ? 'Rechercher des compétences…' : 'Search skills...'}
            </span>
          </button>

          {selected.length > 0 && (
            <div className="space-y-2">
              {selected.map((skill) => (
                <div key={skill.uri} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">{skill.preferredLabel[locale]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(skill.uri)}
                    className="mt-0.5 text-gray-400 hover:bg-gray-100 rounded-full p-1 dark:hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mobileOpen && (
            <div 
              style={{ height: viewportHeight }} 
              className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-zinc-950"
            >
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-white dark:bg-zinc-900 dark:border-zinc-800">
                <button 
                  onClick={handleDone}
                  className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  aria-label={locale === 'fr' ? 'Retour' : 'Back'}
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex flex-1 min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-zinc-900/50 dark:border dark:border-zinc-800">
                  <Search className="h-4 w-4 shrink-0 text-gray-400" />
                  <Command.Input
                    ref={mobileInputRef}
                    value={query}
                    onValueChange={handleQueryChange}
                    placeholder={locale === 'fr' ? 'Rechercher…' : 'Search...'}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-gray-400"
                  />
                  {isSearching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {query && !isSearching && (
                    <button 
                      onClick={() => { setQuery(''); onSearch(''); mobileInputRef.current?.focus() }} 
                      className="text-gray-400 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button onClick={handleDone} className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap" style={{ color: 'var(--info-solid)' }}>
                  {locale === 'fr' ? 'Terminé' : 'Done'}
                  {selected.length > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--info-solid)' }}>
                      {selected.length}
                    </span>
                  )}
                </button>
              </div>

              {selected.length > 15 && (
                <div className="px-4 pt-3 pb-2">
                  <Alert variant="warning">
                    {locale === 'fr' 
                      ? `Vous avez sélectionné ${selected.length} compétences. Nous recommandons de limiter à 15 pour de meilleurs résultats de correspondance.`
                      : `You've selected ${selected.length} skills. We recommend limiting to 15 for better matching results.`
                    }
                  </Alert>
                </div>
              )}
              
              {selected.length > 0 && (
                query ? (
                  <HorizontalScrollWithFades 
                    containerClassName="shrink-0 border-b border-gray-100 dark:border-zinc-800 pb-1 pt-2"
                    className="px-4 pb-3 pt-1"
                    fadeBackground={isTouch && mobileOpen ? 'white' : 'var(--card)'}
                  >
                    {selected.map((skill) => (
                      <InfoPopover 
                        key={skill.uri} 
                        content={skill.description?.[locale] || skill.preferredLabel[locale]}
                        className="shrink-0"
                      >
                        <Pill
                          size="sm"
                          onRemove={() => onRemove(skill.uri)}
                          className="md:py-1 px-3"
                        >
                          {skill.preferredLabel[locale]}
                        </Pill>
                      </InfoPopover>
                    ))}
                  </HorizontalScrollWithFades>
                ) : (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pt-2 border-b border-gray-100 dark:border-zinc-800">
                    {selected.map((skill) => (
                      <InfoPopover 
                        key={skill.uri} 
                        content={skill.description?.[locale] || skill.preferredLabel[locale]}
                      >
                        <Pill
                          size="sm"
                          onRemove={() => onRemove(skill.uri)}
                          className="md:py-1 px-3"
                        >
                          {skill.preferredLabel[locale]}
                        </Pill>
                      </InfoPopover>
                    ))}
                  </div>
                )
              )}
              
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="px-2">
                  {!query ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                      {locale === 'fr' 
                        ? 'Tapez pour rechercher parmi 13 485 compétences ESCO' 
                        : 'Type to search 13,485 ESCO skills'}
                    </div>
                  ) : (() => {
                    const lowerQuery = query.toLowerCase()
                    const displayResults = isLibraryMode 
                      ? allItems
                          .map(skill => {
                            const label = skill.preferredLabel[locale] || ''
                            const includesLabel = label.toLowerCase().includes(lowerQuery)
                            const foundAlias = !includesLabel 
                              ? skill.aliases?.find(a => a.toLowerCase().includes(lowerQuery))
                              : undefined
                            
                            if (!includesLabel && !foundAlias) return null
                            return { 
                              ...skill, 
                              label, 
                              internalMatchedAlias: foundAlias 
                            }
                          })
                          .filter((s): s is NonNullable<typeof s> => s !== null)
                          .slice(0, 100)
                      : skills.map(skill => ({ 
                          ...skill, 
                          label: skill.preferredLabel[locale] || '',
                          internalMatchedAlias: skill.matchedAlias 
                        }))

                    return (
                      <Command.List className="overflow-y-auto overflow-x-hidden scroll-smooth pb-4">
                        <Command.Empty className="px-4 py-8 text-center text-sm text-gray-400">
                          {isSearching 
                            ? (locale === 'fr' ? 'Recherche en cours...' : 'Searching...')
                            : (locale === 'fr' ? 'Aucune compétence trouvée.' : 'No skills found.')
                          }
                        </Command.Empty>

                        {displayResults.map((skill) => {
                          const isSelected = selectedSet.has(skill.uri)
                          const searchValue = isLibraryMode 
                            ? `${skill.label} ${(skill.aliases || []).join(' ')}`.toLowerCase()
                            : skill.uri

                          return (
                            <Command.Item
                              key={skill.uri}
                              value={searchValue}
                              onSelect={() => handleToggle(skill)}
                              className="flex cursor-pointer items-start gap-4 border-b border-gray-50 px-4 py-3.5 text-left transition-colors aria-selected:bg-gray-50 hover:bg-gray-50 dark:border-zinc-800/50 dark:aria-selected:bg-zinc-900/50 dark:hover:bg-zinc-900/50"
                            >
                              <Checkbox 
                                checked={isSelected}
                                readOnly
                                className="mt-0.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="text-[13px] font-bold text-gray-900 dark:text-zinc-100 break-words">
                                  {skill.label}
                                </p>
                                {skill.description?.[locale] && (
                                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-zinc-400 line-clamp-2 break-words">
                                    {skill.description[locale]}
                                  </p>
                                )}
                                {skill.internalMatchedAlias && (
                                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 inline-block px-2 py-0.5 rounded-md dark:bg-blue-900/40 dark:text-blue-300 break-words">
                                    {locale === 'fr' ? 'Correspondance : ' : 'Matches: '} 
                                    &quot;{skill.internalMatchedAlias}&quot;
                                  </p>
                                )}
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {skill.skillType && (
                                    <Badge variant="outline" className={`text-[10px] ${SKILL_TYPE_COLOURS[skill.skillType] || ''}`}>
                                      {formatEnumLabel(skill.skillType)}
                                    </Badge>
                                  )}
                                  {skill.reuseLevel && (
                                    <Badge variant="outline" className={`text-[10px] ${REUSE_LEVEL_COLOURS[skill.reuseLevel] || ''}`}>
                                      {formatEnumLabel(skill.reuseLevel)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Command.Item>
                          )
                        })}
                      </Command.List>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Command>
  )
}
