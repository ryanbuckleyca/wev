'use client'

import { useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/lib/hooks/useProfile'
import { type SkillOption } from '@/components/SkillsSelector'
import toast from 'react-hot-toast'

export const MAX_PROFILE_SKILLS = 5
export const MAX_PROFILE_VALUES = 10

function uniqueSkillOptions(skills: SkillOption[]): SkillOption[] {
  const seen = new Set<string>()
  const deduped: SkillOption[] = []
  for (const skill of skills) {
    if (seen.has(skill.value)) continue
    seen.add(skill.value)
    deduped.push(skill)
  }
  return deduped
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

export function useProfileForm(userId: string | undefined, locale: 'en' | 'fr') {
  const t = useTranslations()
  const { profile, loading: profileLoading, error: profileError, updateProfile, uploadPhoto } = useProfile(userId)

  const [isSaving, setIsSaving] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<SkillOption[]>([])
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    values: [] as string[],
    skills: [] as string[],
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) return

    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS)
    setFormData({
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      values: profile.values || [],
      skills: profileSkills,
    })

    if (profileSkills.length === 0) {
      setSelectedSkills([])
      return
    }

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
        const hydrated = uniqueSkillOptions(
          (body.skills || []).map((skill) => ({
            value: skill.concept_uri,
            label: skill.term,
            tooltip: (
              <div className="space-y-2 text-left">
                <div>
                  <div className="font-semibold text-[var(--foreground)]">{skill.term}</div>
                  {skill.definition && (
                    <div className="text-[var(--foreground)] mt-1">{skill.definition}</div>
                  )}
                </div>
                {skill.scope_note && (
                  <div className="text-xs text-[var(--muted-foreground)]">
                    <span className="font-medium">Scope:</span> {skill.scope_note}
                  </div>
                )}
                {(skill.skill_type || skill.reuse_level) && (
                  <div className="flex gap-1 flex-wrap">
                    {skill.skill_type && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted-foreground)]">
                        {formatEnumLabel(skill.skill_type)}
                      </span>
                    )}
                    {skill.reuse_level && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted-foreground)]">
                        {formatEnumLabel(skill.reuse_level)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ),
            definition: skill.definition,
            scopeNote: skill.scope_note,
            skillType: skill.skill_type,
            reuseLevel: skill.reuse_level,
          }))
        )
        setSelectedSkills(hydrated)
        setFormData((prev) => ({
          ...prev,
          skills: hydrated.map((s) => s.value),
        }))
      })
      .catch(() => setSelectedSkills([]))
  }, [profile, locale])

  const handleSkillsChange = (skills: SkillOption[]) => {
    const normalized = uniqueSkillOptions(skills)
    setSelectedSkills(normalized)
    setFormData((prev) => ({ ...prev, skills: normalized.map((s) => s.value) }))
  }

  const handleSaveProfile = async () => {
    if (formData.skills.length > MAX_PROFILE_SKILLS) {
      toast.error(t('profile.skillsMaxExceeded', {
        max: MAX_PROFILE_SKILLS,
        current: formData.skills.length - MAX_PROFILE_SKILLS,
      }))
      return
    }
    if (formData.values.length > MAX_PROFILE_VALUES) {
      toast.error(t('profile.valuesMaxExceeded', {
        max: MAX_PROFILE_VALUES,
        current: formData.values.length - MAX_PROFILE_VALUES,
      }))
      return
    }

    setIsSaving(true)
    try {
      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: Array.from(new Set(formData.values)).slice(0, MAX_PROFILE_VALUES),
        skills: Array.from(new Set(formData.skills)).slice(0, MAX_PROFILE_SKILLS),
      })
      if (updated) {
        toast.success(t('profile.updateSuccess'))
      } else {
        toast.error(profileError || t('profile.updateFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.updateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadPhoto(file)
      toast.success(t('profile.photoUploadSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.photoUploadFailed'))
    }
  }

  return {
    profile,
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills,
    handleSkillsChange,
    isSaving,
    fileInputRef,
    handleSaveProfile,
    handlePhotoUpload,
  }
}
