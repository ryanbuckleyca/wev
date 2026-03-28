'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/lib/hooks/useProfile'
import { type EscoSkill } from '@/components/profile/skills/SkillsSelector'
import { type WorkValue, buildWorkValues, getValueDefinition } from '@/lib/values'
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types'
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings'
import toast from 'react-hot-toast'

/** Must match DB `profiles_skills_max_10_check` (see `202603061612_profiles_skills_max_10.sql`). */
export const MAX_PROFILE_SKILLS = 10
/** Must match product / DB limits for `profiles.values` (5). */
export const MAX_PROFILE_VALUES = 5
export const MAX_PROFILE_WORK_ENV_CHARS = 1500

export function useProfileForm(userId: string | undefined, locale: 'en' | 'fr') {
  const t = useTranslations('profile')
  const tValues = useTranslations('values')
  const { profile, loading: profileLoading, error: profileError, updateProfile } = useProfile(userId)

  const [isSaving, setIsSaving] = useState(false)

  // Single ordered array. Items 0..valueCutoff-1 are ranked (prioritised).
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [valueCutoff, setValueCutoff] = useState(0)

  // Single ordered array. Items 0..skillCutoff-1 are ranked.
  const [selectedSkills, setSelectedSkills] = useState<EscoSkill[]>([])
  const [skillCutoff, setSkillCutoff] = useState(0)

  const [allSkills, setAllSkills] = useState<EscoSkill[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    work_types: [] as WorkType[],
    ideal_work_environment: '',
  })
  const workValues: WorkValue[] = useMemo(() => {
    const tCurrent = (key: string, opts?: { defaultValue: string }) => tValues(key, opts ?? {})
    const tFallback = (key: string, opts?: { defaultValue: string }) => {
      const id = key.split('.')[0]; const field = key.split('.')[1]
      if (field === 'name') return opts?.defaultValue ?? id
      const def = getValueDefinition(id)
      if (field === 'description') return def.description
      return opts?.defaultValue ?? ''
    }
    return locale === 'en' ? buildWorkValues(tCurrent, tFallback) : buildWorkValues(tFallback, tCurrent)
  }, [tValues, locale])

  // ─── Hydrate ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return

    setFormData({
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      work_types: normalizeWorkTypes(profile.work_types),
      ideal_work_environment: profile.ideal_work_environment || '',
    })

    const pvr = profile.values_rated
    if (pvr && pvr.length > 0) {
      const ranked = [...pvr].filter(rv => rv.rank != null).sort((a, b) => a.rank! - b.rank!)
      const unranked = pvr.filter(rv => rv.rank == null)
      setSelectedValues([...ranked.map(rv => rv.value), ...unranked.map(rv => rv.value)])
      setValueCutoff(ranked.length)
    } else {
      setSelectedValues(profile.values || [])
      setValueCutoff(0)
    }

    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS)
    if (profileSkills.length === 0) { setSelectedSkills([]); setSkillCutoff(0); return }

    void fetch(`/api/skills/by-uri?${new URLSearchParams({ uris: profileSkills.join(','), locale })}`)
      .then(res => res.ok ? res.json() : { skills: [] })
      .then((body: { skills?: Array<{ concept_uri: string; term: string; definition: string | null; skill_type: string | null; reuse_level: string | null }> }) => {
        const hydrated: EscoSkill[] = (body.skills || []).map(s => ({
          uri: s.concept_uri,
          preferredLabel: { en: s.term, fr: s.term },
          description: { en: s.definition, fr: s.definition },
          skillType: s.skill_type as EscoSkill['skillType'],
          reuseLevel: s.reuse_level as EscoSkill['reuseLevel'],
        }))
        const seen = new Set<string>()
        const deduped = hydrated.filter(s => { if (seen.has(s.uri)) return false; seen.add(s.uri); return true })

        const psr = (profile as any).skills_rated as RatedSkill[] | null | undefined
        if (psr && psr.length > 0) {
          const rankMap = new Map(psr.map(sr => [sr.skill, sr.rank]))
          const ranked = deduped.filter(s => rankMap.get(s.uri) != null).sort((a, b) => rankMap.get(a.uri)! - rankMap.get(b.uri)!)
          const unranked = deduped.filter(s => rankMap.get(s.uri) == null)
          setSelectedSkills([...ranked, ...unranked])
          setSkillCutoff(ranked.length)
        } else {
          setSelectedSkills(deduped)
          setSkillCutoff(0)
        }
      })
      .catch(() => { setSelectedSkills([]); setSkillCutoff(0) })
  }, [profile, locale])

  // ─── Skills library ───────────────────────────────────────────────────

  useEffect(() => {
    setIsLibraryLoading(true)
    fetch(`/api/skills/all?locale=${locale}&cb=${Date.now()}`)
      .then(res => res.ok ? res.json() : { skills: [] })
      .then(data => setAllSkills((data.skills || []).map((s: any) => ({
        uri: s.uri, preferredLabel: { en: s.term, fr: s.term },
        description: { en: s.definition, fr: s.definition }, skillType: s.type, reuseLevel: s.level, aliases: s.aliases,
      }))))
      .catch(err => console.error('Failed to pre-fetch skills library:', err))
      .finally(() => setIsLibraryLoading(false))
  }, [locale])

  // Refs so event handlers can read the latest committed state without
  // needing to call setCutoff inside a setValue updater (React 19 can
  // split nested setState calls into separate renders).
  const selectedSkillsRef = useRef(selectedSkills)
  selectedSkillsRef.current = selectedSkills
  const selectedValuesRef = useRef(selectedValues)
  selectedValuesRef.current = selectedValues

  // ─── Skill handlers ───────────────────────────────────────────────────

  const handleSkillToggle = useCallback((skill: EscoSkill) => {
    const current = selectedSkillsRef.current
    const idx = current.findIndex(s => s.uri === skill.uri)
    if (idx !== -1) {
      setSelectedSkills(prev => prev.filter(s => s.uri !== skill.uri))
      setSkillCutoff(c => idx < c ? c - 1 : c)
    } else {
      setSelectedSkills(prev => [...prev.slice(0, skillCutoff), skill, ...prev.slice(skillCutoff)])
    }
  }, [skillCutoff])

  const handleSkillReorder = useCallback((from: number, to: number, explicitCutoff?: number) => {
    setSelectedSkills(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setSkillCutoff(cutoff => {
      if (explicitCutoff !== undefined) return explicitCutoff
      if (from >= cutoff && to <= cutoff) return cutoff + 1
      if (from < cutoff && to >= cutoff) return cutoff - 1
      return cutoff
    })
  }, [])

  const handleSkillRemove = useCallback((uri: string) => {
    const idx = selectedSkillsRef.current.findIndex(s => s.uri === uri)
    setSelectedSkills(prev => prev.filter(s => s.uri !== uri))
    if (idx !== -1) setSkillCutoff(c => idx < c ? c - 1 : c)
  }, [])

  // ─── Value handlers ───────────────────────────────────────────────────

  const handleValueToggle = useCallback((id: string) => {
    const current = selectedValuesRef.current
    const idx = current.indexOf(id)
    if (idx !== -1) {
      setSelectedValues(prev => prev.filter(v => v !== id))
      setValueCutoff(c => idx < c ? c - 1 : c)
    } else {
      setSelectedValues(prev => [...prev.slice(0, valueCutoff), id, ...prev.slice(valueCutoff)])
    }
  }, [valueCutoff])

  const handleValueReorder = useCallback((from: number, to: number, explicitCutoff?: number) => {
    setSelectedValues(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setValueCutoff(cutoff => {
      if (explicitCutoff !== undefined) return explicitCutoff
      if (from < cutoff && to >= cutoff) return cutoff - 1
      if (from >= cutoff && to <= cutoff) return cutoff + 1
      return cutoff
    })
  }, [])

  const handleValueRemove = useCallback((id: string) => {
    const idx = selectedValuesRef.current.indexOf(id)
    setSelectedValues(prev => prev.filter(v => v !== id))
    if (idx !== -1) setValueCutoff(c => idx < c ? c - 1 : c)
  }, [])

  // ─── Save ─────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (selectedValues.length > MAX_PROFILE_VALUES) { toast.error(t('valuesMaxExceeded', { max: MAX_PROFILE_VALUES, current: selectedValues.length - MAX_PROFILE_VALUES })); return }
    if (selectedSkills.length > MAX_PROFILE_SKILLS) { toast.error(t('skillsMaxExceeded', { max: MAX_PROFILE_SKILLS, current: selectedSkills.length - MAX_PROFILE_SKILLS })); return }
    if (formData.ideal_work_environment.length > MAX_PROFILE_WORK_ENV_CHARS) { toast.error(t('workEnvironmentMaxExceeded', { max: MAX_PROFILE_WORK_ENV_CHARS })); return }

    setIsSaving(true)
    try {
      const valuesRated: RatedValue[] = selectedValues.map((v, i) =>
        i < valueCutoff ? { value: v, rank: i + 1 } : { value: v }
      )
      const skillsRated: RatedSkill[] = selectedSkills.map((s, i) =>
        i < skillCutoff ? { skill: s.uri, rank: i + 1 } : { skill: s.uri }
      )

      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: selectedValues.slice(0, MAX_PROFILE_VALUES),
        values_rated: valuesRated,
        skills: selectedSkills.map(s => s.uri).slice(0, MAX_PROFILE_SKILLS),
        skills_rated: skillsRated,
        work_types: normalizeWorkTypes(formData.work_types),
        ideal_work_environment: formData.ideal_work_environment.trim() || null,
      })
      if (updated) toast.success(t('updateSuccess'))
      else toast.error(t('updateFailed'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateFailed'))
    } finally { setIsSaving(false) }
  }

  return {
    profile, profileLoading, profileError,
    formData, setFormData,
    selectedSkills, skillCutoff,
    allSkills, isLibraryLoading,
    handleSkillToggle, handleSkillReorder, handleSkillRemove,
    workValues,
    selectedValues, valueCutoff,
    handleValueToggle, handleValueReorder, handleValueRemove,
    isSaving, handleSaveProfile,
  }
}
