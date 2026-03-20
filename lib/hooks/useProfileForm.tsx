'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/lib/hooks/useProfile'
import { type EscoSkill } from '@/components/profile/SkillsSelector'
import { type WorkValue, buildWorkValues, VALUES_LIST, getValueDefinition } from '@/lib/values'
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export const MAX_PROFILE_SKILLS = 5
export const MAX_PROFILE_VALUES = 10
export const MAX_PROFILE_WORK_ENV_CHARS = 1500

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
  }
  return debounced as ((...args: Parameters<T>) => void) & { cancel: () => void }
}

export function useProfileForm(userId: string | undefined, locale: 'en' | 'fr') {
  const t = useTranslations('profile')
  const tValues = useTranslations('values')
  const { profile, loading: profileLoading, error: profileError, updateProfile, uploadPhoto } = useProfile(userId)
  const supabase = useMemo(() => createClient(), [])

  const [isSaving, setIsSaving] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<EscoSkill[]>([])
  const [skillResults, setSkillResults] = useState<EscoSkill[]>([])
  const [isSearchingSkills, setIsSearchingSkills] = useState(false)
  const [allSkills, setAllSkills] = useState<EscoSkill[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    values: [] as string[],
    skills: [] as string[],
    work_types: [] as WorkType[],
    ideal_work_environment: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Build WorkValue list from translations (uses English labels from values namespace)
  const workValues: WorkValue[] = useMemo(() => {
    // We only have the current locale's translation function, so
    // use it for the current locale and fall back to English dictionary for the other.
    const tCurrent = (key: string, opts?: { defaultValue: string }) =>
      tValues(key, opts ?? {})
    const tFallback = (key: string, opts?: { defaultValue: string }) => {
      // For the non-current locale, fall back to the English dictionary value
      const id = key.split('.')[0]
      const field = key.split('.')[1]
      if (field === 'name') return opts?.defaultValue ?? id
      const def = getValueDefinition(id)
      if (field === 'description') return def.description
      return opts?.defaultValue ?? ''
    }

    if (locale === 'en') {
      return buildWorkValues(tCurrent, tFallback)
    }
    return buildWorkValues(tFallback, tCurrent)
  }, [tValues, locale])

  // ─── Hydrate form data from profile ──────────────────────────────────

  useEffect(() => {
    if (!profile) return

    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS)
    setFormData({
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      values: profile.values || [],
      skills: profileSkills,
      work_types: normalizeWorkTypes(profile.work_types),
      ideal_work_environment: profile.ideal_work_environment || '',
    })

    if (profileSkills.length === 0) {
      setSelectedSkills([])
      return
    }

    // Hydrate selected skills from URIs
    const params = new URLSearchParams({ uris: profileSkills.join(','), locale })
    void fetch(`/api/skills/by-uri?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to hydrate skills')
        return res.json() as Promise<{
          skills?: Array<{
            concept_uri: string
            term: string
            definition: string | null
            scope_note: string | null
            skill_type: string | null
            reuse_level: string | null
          }>
        }>
      })
      .then((body) => {
        const hydrated: EscoSkill[] = (body.skills || []).map((skill) => ({
          uri: skill.concept_uri,
          preferredLabel: { en: skill.term, fr: skill.term }, // API returns locale-specific term
          description: { en: skill.definition, fr: skill.definition },
          skillType: skill.skill_type as EscoSkill['skillType'],
          reuseLevel: skill.reuse_level as EscoSkill['reuseLevel'],
        }))
        // Dedupe by URI
        const seen = new Set<string>()
        const deduped = hydrated.filter((s) => {
          if (seen.has(s.uri)) return false
          seen.add(s.uri)
          return true
        })
        setSelectedSkills(deduped)
        setFormData((prev) => ({
          ...prev,
          skills: deduped.map((s) => s.uri),
        }))
      })
      .catch(() => setSelectedSkills([]))
  }, [profile, locale])

  // ─── Fetch entire skills library for client-side search ─────────────

  useEffect(() => {
    setIsLibraryLoading(true)
    fetch(`/api/skills/all?locale=${locale}`)
      .then(res => res.ok ? res.json() : { skills: [] })
      .then(data => {
        const skills: EscoSkill[] = (data.skills || []).map((s: any) => ({
          uri: s.uri,
          preferredLabel: { en: s.term, fr: s.term },
          description: { en: '', fr: '' }, // Compact library doesn't need descriptions
          skillType: s.type,
          reuseLevel: s.level,
          aliases: s.aliases,
        }))
        setAllSkills(skills)
      })
      .catch(err => console.error('Failed to pre-fetch skills library:', err))
      .finally(() => setIsLibraryLoading(false))
  }, [locale])

  // ─── Skill search ───────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSkillSearch = useCallback(
    debounce(async (query: string) => {
      if (!query || query.length < 1) {
        setSkillResults([])
        setIsSearchingSkills(false)
        return
      }
      
      // If library is loaded, the component will handle filtering client-side.
      // We only run the API search if the library is still loading or failed.
      if (allSkills.length > 0) {
        setIsSearchingSkills(false)
        return
      }

      setIsSearchingSkills(true)
      try {
        const params = new URLSearchParams({
          q: query,
          limit: '20',
          locale,
        })
        const res = await fetch(`/api/skills/search?${params.toString()}`)
        if (!res.ok) throw new Error('Failed to search skills')
        
        const data = await res.json() as {
          skills: Array<{
            concept_uri: string
            term: string
            definition: string | null
            skill_type: string | null
            reuse_level: string | null
          }>
        }
        
        setSkillResults(
          (data.skills || []).map((r) => ({
            uri: r.concept_uri,
            // API returns locale-specific strings, so we duplicate them for our generic EscoSkill interface
            preferredLabel: { en: r.term, fr: r.term },
            description: { en: r.definition, fr: r.definition },
            skillType: r.skill_type as EscoSkill['skillType'],
            reuseLevel: r.reuse_level as EscoSkill['reuseLevel'],
          }))
        )
      } catch (err) {
        console.error('Skill search error:', err)
        setSkillResults([])
      } finally {
        setIsSearchingSkills(false)
      }
    }, 400),
    [locale, allSkills.length]
  )

  const handleSkillSelect = useCallback(
    (skill: EscoSkill) => {
      setSelectedSkills((prev) => {
        if (prev.some((s) => s.uri === skill.uri)) return prev
        const next = [...prev, skill]
        setFormData((fd) => ({ ...fd, skills: next.map((s) => s.uri) }))
        return next
      })
    },
    []
  )

  const handleSkillRemove = useCallback(
    (uri: string) => {
      setSelectedSkills((prev) => {
        const next = prev.filter((s) => s.uri !== uri)
        setFormData((fd) => ({ ...fd, skills: next.map((s) => s.uri) }))
        return next
      })
    },
    []
  )

  const handleValueToggle = useCallback(
    (id: string) => {
      setFormData((prev) => {
        const isSelected = prev.values.includes(id)
        const nextValues = isSelected
          ? prev.values.filter((v) => v !== id)
          : [...prev.values, id]
        return { ...prev, values: nextValues }
      })
    },
    []
  )

  const handleValueToggleMultiple = useCallback(
    (ids: string[], shouldSelect: boolean) => {
      setFormData((prev) => {
        if (shouldSelect) {
          const currentValues = new Set(prev.values)
          const toAdd = ids.filter(id => !currentValues.has(id))
          return { ...prev, values: [...prev.values, ...toAdd] }
        } else {
          const toRemove = new Set(ids)
          return { ...prev, values: prev.values.filter(id => !toRemove.has(id)) }
        }
      })
    },
    []
  )

  // ─── Save ────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (formData.skills.length > MAX_PROFILE_SKILLS) {
      toast.error(t('skillsMaxExceeded', {
        max: MAX_PROFILE_SKILLS,
        current: formData.skills.length - MAX_PROFILE_SKILLS,
      }))
      return
    }
    if (formData.values.length > MAX_PROFILE_VALUES) {
      toast.error(t('valuesMaxExceeded', {
        max: MAX_PROFILE_VALUES,
        current: formData.values.length - MAX_PROFILE_VALUES,
      }))
      return
    }
    if (formData.ideal_work_environment.length > MAX_PROFILE_WORK_ENV_CHARS) {
      toast.error(t('workEnvironmentMaxExceeded', { max: MAX_PROFILE_WORK_ENV_CHARS }))
      return
    }

    setIsSaving(true)
    try {
      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: Array.from(new Set(formData.values)).slice(0, MAX_PROFILE_VALUES),
        skills: Array.from(new Set(formData.skills)).slice(0, MAX_PROFILE_SKILLS),
        work_types: normalizeWorkTypes(formData.work_types),
        ideal_work_environment: formData.ideal_work_environment.trim() || null,
      })
      if (updated) {
        toast.success(t('updateSuccess'))
      } else {
        toast.error(profileError || t('updateFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadPhoto(file)
      toast.success(t('photoUploadSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('photoUploadFailed'))
    }
  }

  return {
    profile,
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills,
    skillResults,
    allSkills,
    isLibraryLoading,
    isSearchingSkills,
    handleSkillSearch,
    handleSkillSelect,
    handleSkillRemove,
    workValues,
    handleValueToggle,
    handleValueToggleMultiple,
    isSaving,
    fileInputRef,
    handleSaveProfile,
    handlePhotoUpload,
  }
}
