'use client';

import { useEffect, useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfile } from '@/lib/hooks/useProfile';
import ValuesSelector from '@/components/ValuesSelector';
import SkillsSelector, { type SkillOption } from '@/components/SkillsSelector';
import LoadingState from '@/components/LoadingState';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import FormLabel from '@/components/FormLabel';
import ErrorBox from '@/components/ErrorBox';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import Button from '@/components/Button';
import LinkButton from '@/components/LinkButton';
import toast from 'react-hot-toast';

const MAX_PROFILE_SKILLS = 5;

function uniqueSkillOptions(skills: SkillOption[]): SkillOption[] {
  const seen = new Set<string>();
  const deduped: SkillOption[] = [];
  for (const skill of skills) {
    if (seen.has(skill.value)) {
      continue;
    }
    seen.add(skill.value);
    deduped.push(skill);
  }
  return deduped.slice(0, MAX_PROFILE_SKILLS);
}

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const { user, loading } = useRequireAuth();

  const { profile, loading: profileLoading, error: profileError, updateProfile, uploadPhoto } = useProfile(user?.id);

  const [isSaving, setIsSaving] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<SkillOption[]>([]);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    values: [] as string[],
    skills: [] as string[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form data when profile loads
  useEffect(() => {
    if (profile) {
      const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS);
      setFormData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        values: profile.values || [],
        skills: profileSkills,
      });

      // Explicit hydration step: resolve stored concept_uri[] into full option objects.
      if (profileSkills.length > 0) {
        const params = new URLSearchParams({
          uris: profileSkills.join(','),
          locale,
        });

        void fetch(`/api/skills/by-uri?${params.toString()}`)
          .then(async (res) => {
            if (!res.ok) {
              throw new Error('Failed to hydrate skills')
            }
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
            const hydrated = uniqueSkillOptions((body.skills || []).map((skill) => ({
              value: skill.concept_uri,
              label: skill.term,
              definition: skill.definition,
              scopeNote: skill.scope_note,
              skillType: skill.skill_type,
              reuseLevel: skill.reuse_level,
            })));
            setSelectedSkills(hydrated);
            setFormData((prev) => ({
              ...prev,
              skills: hydrated.map((skill) => skill.value).slice(0, MAX_PROFILE_SKILLS),
            }));
          })
          .catch(() => {
            setSelectedSkills([]);
          });
      } else {
        setSelectedSkills([]);
      }
    }
  }, [profile, locale]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const normalizedSkills = Array.from(new Set(formData.skills)).slice(0, MAX_PROFILE_SKILLS);
      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: formData.values,
        skills: normalizedSkills,
      });

      if (updated) {
        toast.success(t('profile.updateSuccess'));
      } else {
        toast.error(profileError || t('profile.updateFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadPhoto(file);
      toast.success(t('profile.photoUploadSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.photoUploadFailed'));
    }
  };

  if (loading || profileLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!user) {
    return null;
  }

  if (!profile) {
    return (
      <PageLayout maxWidth="md">
        <CardLayout>
          <Heading level={1} className="mb-4">{t('profile.noProfileFound')}</Heading>
          <p className="text-[var(--text-secondary)] mb-6">
            {t('profile.noProfileDescription')}
          </p>
          <LinkButton href="/">
            {t('profile.backToJobs')}
          </LinkButton>
        </CardLayout>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
        <Heading level={1} className="mb-6">{t('profile.title')}</Heading>

        {profileError && (
          <ErrorBox>{profileError}</ErrorBox>
        )}

        <FormContainer onSubmit={handleSaveProfile}>
          <div className="space-y-6">
            {/* Profile Photo Section */}
            <div>
              <FormLabel>{t('profile.profilePhoto')}</FormLabel>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-lg bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                  {profile.profile_photo_url ? (
                    <img
                      src={profile.profile_photo_url}
                      alt={t('profile.profilePhoto')}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-[var(--text-secondary)]">
                      {user.email?.[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="secondary"
                  type="button"
                >
                  {t('profile.uploadPhoto')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Full Name */}
            <FormField
              label={t('profile.fullName')}
              type="text"
              value={formData.full_name}
              onChange={(value) =>
                setFormData({ ...formData, full_name: value })
              }
              placeholder={t('profile.fullNamePlaceholder')}
              fullWidth
              htmlFor="full-name"
            />

            {/* Bio */}
            <div>
              <FormLabel htmlFor="bio">{t('profile.bio')}</FormLabel>
              <textarea
                id="bio"
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                placeholder={t('profile.bioPlaceholder')}
                rows={4}
                className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            {/* Work Values */}
            <div>
              <FormLabel>{t('profile.workValues')}</FormLabel>
              <ValuesSelector
                selectedValues={formData.values}
                onValuesChange={(values) =>
                  setFormData({ ...formData, values })
                }
                isEditing={true}
              />
            </div>

            {/* Skills */}
            <div>
              <FormLabel>{t('profile.skills')}</FormLabel>
              <SkillsSelector
                selectedSkills={selectedSkills}
                onSkillsChange={(skills) => {
                  const normalized = uniqueSkillOptions(skills);
                  setSelectedSkills(normalized);
                  setFormData((prev) => ({
                    ...prev,
                    skills: normalized.map((skill) => skill.value),
                  }));
                }}
                placeholder={t('profile.skillsPlaceholder')}
                minCharsText={t('profile.skillsMinChars')}
                noResultsText={t('profile.skillsNoResults')}
                loadingText={t('profile.skillsLoading')}
                maxSelections={MAX_PROFILE_SKILLS}
                maxSelectionsReachedText={t('profile.skillsMaxReached', { max: MAX_PROFILE_SKILLS })}
                locale={locale}
                matchedAliasLabel={t('profile.skillsMatchedAlias')}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-[var(--border)]">
            <div className="flex justify-between gap-3">
              <LinkButton href="/" variant="outline">
                {t('profile.backToJobs')}
              </LinkButton>
              <Button
                type="submit"
                disabled={isSaving}
                loading={isSaving}
              >
                {isSaving ? t('profile.saving') : t('profile.saveProfile')}
              </Button>
            </div>
          </div>
        </FormContainer>
        </CardLayout>
    </PageLayout>
  );
}
