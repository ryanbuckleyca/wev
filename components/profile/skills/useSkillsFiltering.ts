import { useMemo } from 'react'
import type { EscoSkill } from '../SkillsSelector'

interface FilteredSkill extends EscoSkill {
  label: string
  internalMatchedAlias?: string
  _score?: number
}

export function useSkillsFiltering(
  query: string,
  allItems: EscoSkill[],
  skills: EscoSkill[],
  locale: 'en' | 'fr',
  isLibraryMode: boolean
): FilteredSkill[] {
  return useMemo(() => {
    if (!query) return []

    const lowerQuery = query.toLowerCase()

    if (isLibraryMode) {
      return allItems
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
        .sort((a, b) => b._score! - a._score!)
        .slice(0, 100)
    }

    return skills.map(skill => ({ 
      ...skill, 
      label: skill.preferredLabel[locale] || '',
      internalMatchedAlias: skill.matchedAlias 
    }))
  }, [query, allItems, skills, locale, isLibraryMode])
}
