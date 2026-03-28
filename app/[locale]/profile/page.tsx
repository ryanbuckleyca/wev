'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfileForm, MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES, MAX_PROFILE_WORK_ENV_CHARS } from '@/lib/hooks/useProfileForm';
import { WORK_TYPES, type WorkType } from '@/lib/work-types';
import FormTextarea from '@/components/FormTextarea';
import SkillsSelector from '@/components/profile/SkillsSelector';
import ValuesSelector from '@/components/profile/ValuesSelector';
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
import Alert from '@/components/ui/Alert';

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const { user, loading } = useRequireAuth();

  const {
    profile, profileLoading, profileError,
    formData, setFormData,
    selectedSkills, skillCutoff,
    skillResults, allSkills, isLibraryLoading, isSearchingSkills,
    handleSkillSearch, handleSkillToggle, handleSkillReorder, handleSkillRemove,
    workValues,
    selectedValues, valueCutoff,
    handleValueToggle, handleValueReorder, handleValueRemove,
    isSaving, handleSaveProfile,
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
              <FormTextarea
                htmlFor="bio"
                label={t('profile.bio')}
                value={formData.bio}
                onChange={(value) => setFormData({ ...formData, bio: value })}
                placeholder={t('profile.bioPlaceholder')}
                rows={4}
                showCount={false}
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
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-gray-50 text-gray-700 border border-gray-100 hover:bg-gray-100'
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

            {/* Skills */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-bold text-base">{t('profile.skills')}</h2>
                <span
                  className={`text-xs font-semibold tabular-nums rounded-full px-3 py-1 transition-colors ${
                    selectedSkills.length > MAX_PROFILE_SKILLS
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      : 'bg-muted text-muted-foreground dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                  aria-label={`${selectedSkills.length}/${MAX_PROFILE_SKILLS}`}
                >
                  {selectedSkills.length}/{MAX_PROFILE_SKILLS}
                </span>
              </div>

              {selectedSkills.length > MAX_PROFILE_SKILLS && (
                <Alert variant="warning">
                  {t('profile.skillsSoftLimitWarning', { max: MAX_PROFILE_SKILLS })}
                </Alert>
              )}

              <SkillsSelector
                skills={skillResults}
                allItems={allSkills}
                selectedSkills={selectedSkills}
                skillCutoff={skillCutoff}
                onToggle={handleSkillToggle}
                onReorder={handleSkillReorder}
                onRemove={handleSkillRemove}
                onSearch={handleSkillSearch}
                locale={locale}
                isSearching={isSearchingSkills || isLibraryLoading}
              />
            </div>

            {/* Work Values */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-bold text-base">{t('profile.workValues')}</h2>
                <span
                  className={`text-xs font-semibold tabular-nums rounded-full px-3 py-1 transition-colors ${
                    selectedValues.length > MAX_PROFILE_VALUES
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      : 'bg-muted text-muted-foreground dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                  aria-label={`${selectedValues.length}/${MAX_PROFILE_VALUES}`}
                >
                  {selectedValues.length}/{MAX_PROFILE_VALUES}
                </span>
              </div>

              {selectedValues.length > MAX_PROFILE_VALUES && (
                <Alert variant="warning">
                  {t('profile.valuesSoftLimitWarning', { max: MAX_PROFILE_VALUES })}
                </Alert>
              )}

              <ValuesSelector
                values={workValues}
                selectedValues={selectedValues}
                valueCutoff={valueCutoff}
                onToggle={handleValueToggle}
                onReorder={handleValueReorder}
                onRemove={handleValueRemove}
                locale={locale}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-gray-100 dark:border-zinc-800">
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
