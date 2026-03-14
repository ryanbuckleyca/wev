'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfileForm, MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES, MAX_PROFILE_WORK_ENV_CHARS } from '@/lib/hooks/useProfileForm';
import { WORK_TYPES, type WorkType } from '@/lib/work-types';
import FormTextarea from '@/components/FormTextarea';
import ValuesSelector from '@/components/ValuesSelector';
import SkillsSelector from '@/components/SkillsSelector';
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

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const { user, loading } = useRequireAuth();

  const {
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
  } = useProfileForm(user?.id, locale);

  const workEnvironmentCharCount = formData.ideal_work_environment.length;
  const isWorkEnvironmentOverLimit = workEnvironmentCharCount > MAX_PROFILE_WORK_ENV_CHARS;

  const getWorkTypeLabel = (workType: WorkType) => {
    if (workType === 'remote') return t('filters.workType.remote');
    if (workType === 'hybrid') return t('filters.workType.hybrid');
    return t('filters.workType.office');
  };

  if (loading || profileLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!user) return null;

  if (!profile) {
    return (
      <PageLayout maxWidth="md">
        <CardLayout>
          <Heading level={1} className="mb-4">{t('profile.noProfileFound')}</Heading>
          <p className="text-[var(--muted-foreground)] mb-6">{t('profile.noProfileDescription')}</p>
          <LinkButton href="/">{t('profile.backToJobs')}</LinkButton>
        </CardLayout>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
        <Heading level={1} className="mb-6">{t('profile.title')}</Heading>

        {profileError && <ErrorBox>{profileError}</ErrorBox>}

        <FormContainer onSubmit={handleSaveProfile}>
          <div className="space-y-6">
            {/* Profile Photo */}
            <div>
              <FormLabel>{t('profile.profilePhoto')}</FormLabel>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                  {profile.profile_photo_url ? (
                    <img
                      src={profile.profile_photo_url}
                      alt={t('profile.profilePhoto')}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-[var(--muted-foreground)]">
                      {user.email?.[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <Button onClick={() => fileInputRef.current?.click()} variant="secondary" type="button">
                  {t('profile.uploadPhoto')}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>
            </div>

            {/* Full Name */}
            <FormField
              label={t('profile.fullName')}
              type="text"
              value={formData.full_name}
              onChange={(value) => setFormData({ ...formData, full_name: value })}
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
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder={t('profile.bioPlaceholder')}
                rows={4}
                className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            {/* Work Type Preference */}
            <div>
              <FormLabel>{t('profile.workType')}</FormLabel>
              <p className="text-xs text-muted-foreground mb-2">
                {t('profile.workTypeHint')}
              </p>
              <div className="flex gap-2 flex-wrap">
                {WORK_TYPES.map((workType) => {
                  const isSelected = formData.work_types.includes(workType)
                  return (
                    <button
                      key={workType}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setFormData({
                            ...formData,
                            work_types: formData.work_types.filter((wt) => wt !== workType),
                          })
                        } else {
                          setFormData({
                            ...formData,
                            work_types: [...formData.work_types, workType],
                          })
                        }
                      }}
                      className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'bg-background text-foreground border border-border hover:bg-primary-tint'
                      }`}
                    >
                      {getWorkTypeLabel(workType)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Ideal Work Environment */}
            <div>
              <FormLabel htmlFor="ideal-work-environment">{t('profile.workEnvironment')}</FormLabel>
              <p className="text-xs text-muted-foreground mb-2">
                {t('profile.workEnvironmentHint', { max: MAX_PROFILE_WORK_ENV_CHARS })}
              </p>
              <FormTextarea
                htmlFor="ideal-work-environment"
                value={formData.ideal_work_environment}
                onChange={(value) => setFormData({ ...formData, ideal_work_environment: value })}
                placeholder={t('profile.workEnvironmentPlaceholder')}
                rows={6}
                charLimit={MAX_PROFILE_WORK_ENV_CHARS}
                countLabel={(current, max) => t('profile.workEnvironmentCount', { current, max })}
                className={isWorkEnvironmentOverLimit ? 'border-destructive-foreground focus:border-destructive-foreground' : ''}
              />
            </div>

            {/* Work Values */}
            <div>
              <FormLabel>{t('profile.workValues')}</FormLabel>
              <ValuesSelector
                selectedValues={formData.values}
                onValuesChange={(values) => setFormData({ ...formData, values })}
                isEditing={true}
                softLimit={MAX_PROFILE_VALUES}
                softLimitWarningText={t('profile.valuesSoftLimitWarning', { max: MAX_PROFILE_VALUES })}
              />
            </div>

            {/* Skills */}
            <div>
              <FormLabel>{t('profile.skills')}</FormLabel>
              <SkillsSelector
                selectedSkills={selectedSkills}
                onSkillsChange={handleSkillsChange}
                placeholder={t('profile.skillsPlaceholder')}
                minCharsText={t('profile.skillsMinChars')}
                noResultsText={t('profile.skillsNoResults')}
                loadingText={t('profile.skillsLoading')}
                softLimit={MAX_PROFILE_SKILLS}
                softLimitWarningText={t('profile.skillsSoftLimitWarning', { max: MAX_PROFILE_SKILLS })}
                locale={locale}
                matchedAliasLabel={t('profile.skillsMatchedAlias')}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-[var(--border)]">
            <div className="flex justify-between gap-3">
              <LinkButton href="/" variant="outline">{t('profile.backToJobs')}</LinkButton>
              <Button type="submit" disabled={isSaving} loading={isSaving}>
                {isSaving ? t('profile.saving') : t('profile.saveProfile')}
              </Button>
            </div>
          </div>
        </FormContainer>
      </CardLayout>
    </PageLayout>
  );
}
